# ByteOffer 生产架构权威规范 (Production Architecture — Authoritative Spec, v1)

> 本文与 `docs/design/qbank-data-model.md` 是 ByteOffer 商业化落地的**两份唯一真相源**。本规范以 Proposal **B** 为主干（其"答案密钥剥离 + CHECK 约束 + IDOR/mass-assignment/enumeration 纪律 + env 启动校验"的安全姿态对一个公开付费刷题 SaaS 不可替代），嫁接 A 的数据层建模深度（去规范化 Entitlement 快照、级联/onDelete 决策、`recordFromRow` 惰性迁移、JSONB 存储决策表逐字保留、`defineAction` 包装器）与 C 的商业化/运营具体度（真实 Plan 配额表、webhook-only 授权、`ImportBatch` 持久评审队列、事务内 `DailyStat` + 夜间对账、`/api/health`）。所有评委列出的共有缺口在本文中被逐一关闭。

**贯穿性不变量（所有段落必须遵守）：**
1. `lib/qbank/*` 是**纯同构内核**（不 import `react`/`next`/`@prisma/client`/`node:*`），客户端与服务端共用同一 `grade()`/`validateEnvelope()`。
2. **服务端对客观判分是唯一权威**：客户端提交的只有 `UserAnswer`，从不提交分数；服务端从 DB `payload` 重算。
3. 非 admin 用户对**未作答**的题永远收不到答案密钥**也收不到 explanation**；提交后由 submit 响应回填。exam 密钥/解析扣留至 `submitExam`。
4. 自评分落在**独立 `selfScore` 列**，永不进入客观正确率分母（分母 = `objectiveAttempts` 计数器）。
5. DB 存 **ASCII 枚举**，UI 边界经 `TYPE_LABEL`/`DIFF_LABEL` 映射中文；中文永不入库。
6. `lib/qbank/selfcheck.ts`（部分给分数学自检）是 CI 硬门禁。
7. 迁移中 `lib/app-context.tsx` 与首个 `schema.prisma` 是**仅有的两个单一 owner 串行点**；`lib/qbank/*` 纯轨道第 0 天启动。

---

## 1. 系统架构总览

### 1.1 分层（自顶向下，单向依赖）

```
┌─ CLIENT (React 19 "use client") ─────────────────────────────────────────┐
│  components/screens/* 视觉零改动；useApp()/computeVals 保留为 UI 派生中枢。 │
│  从 hardcoded 数组 → RSC 注入的 props 取数。import 共享 grade() 仅用于       │
│  「提交后」的即时反馈重绘（未作答拿不到密钥，故无法提前自判）。              │
└──────────────┬──────────────────────────────────┬───────────────────────┘
               │ Server Actions（表单形变更/RSC取数） │ Route Handlers
               │                                    │ (webhook/文件/OAuth/cron/health)
┌──────────────▼────────────────────────────────────────────────────────┐
│  EDGE  middleware.ts：JWT 解码→粗粒度门（登录？admin 路由？）+ 安全头(CSP/HSTS) │
│         —— 是 UX 捷径，不是安全边界。                                     │
└──────────────┬──────────────────────────────────────────────────────────┘
┌──────────────▼──────────────────────────────────────────────────────────┐
│  APPLICATION SERVICES  lib/server/services/*  —— 唯一触碰 Prisma 的层。   │
│  每入口固定管线：auth()→requireX() 守卫→zod parse→entitlement→domain→audit │
│  question·attempt·session·import·stats·billing·entitlement·analytics·admin │
└──────┬──────────────────────────────────────────┬────────────────────────┘
       │ reuse（纯，无 I/O）                        │
┌──────▼───────────────────┐         ┌─────────────▼──────────────────────┐
│ SHARED KERNEL lib/qbank/* │         │ DATA ACCESS lib/server/db.ts        │
│ types·enums·normalize·    │         │ Prisma 单例 + tx 助手 + repositories │
│ grade·validate·migrate·   │         │ 无业务逻辑                          │
│ id·export （同构，零依赖） │         └─────────────┬──────────────────────┘
└───────────────────────────┘                       │
                                        ┌────────────▼──────────────────────┐
                                        │ PostgreSQL (Neon) —— Prisma schema │
                                        │ Question = 提升列 + JSONB payload   │
                                        └─────────────────────────────────────┘
```

### 1.2 请求流 —— 承重示例：提交作答（服务端权威判分）

```
practice.tsx → submitAttempt() Server Action
  0. 客户端此前拿到的题 payload 已被 stripAnswerKey 剥离密钥+解析 → 无法提前自判
  1. Server Action:
       auth() → requireUser()
       zod.parse({ questionId, userAnswer: UserAnswer, sessionId?, durationMs? })
       entitlementService.assertCanAttempt(userId)      // 原子配额门（见 §6.4）
       row  = questionService.getPublishedRow(questionId) // 读 JSONB payload（含密钥）
       rec  = recordFromRow(row)                          // migrate() 惰性升版
       res  = grade(rec, userAnswer)                      // ← 权威判分，同一纯函数
       $transaction:
         attempt = create({ score/selfScore/status/... })
         upsertProgress / upsertWrongbook（若 incorrect）
         upsertDailyStat（attempts++/correct/objectiveAttempts/studyMs）  // §7.2
         emit AnalyticsEvent("attempt.graded")
       return { result: res, revealed: revealKey(rec) }   // 回填密钥+解析供客户端重绘
```

**判分信任的单一权威声明（合并三家、最终版）：**
- 客观类（`auto_exact`/`auto_set`/`auto_normalized`/`auto_partial`）：服务端从 `payload` 重算，**从不读客户端分数**。
- 主观类（`self_assess`/`manual_reference`）：无客观真相可保护；客户端 `selfScore ∈ {0,0.5,1}` 仅经 `selfGradeAttempt` 接受，写入独立 `selfScore` 列，**排除在客观分母外**。
- `scenario`：`grade()` 整题聚合，客观 part 自动判、主观 part 留 `ungraded`；整题若无客观 part 则 `score=null`（不污染客观分母）。
- 未作答题：客户端 payload 经 `stripAnswerKey` 递归剥离，连 `explanation` 一并扣留；exam 扣留至交卷。

---

## 2. 数据库设计 (Prisma schema)

### 2.1 13 型存储决策 —— JSONB payload + 提升镜像列（A §2.1 逐字保留的理由）

**决策：单 `Question` 表，`type` 枚举判别式 + 单个 `payload Json`(JSONB) 承载完整 `QuestionRecord`，另加少量提升"镜像列"用于筛选/排序/连接。** 不做每型规范化。论证：

| 受力点 | JSONB payload（选中） | 完全规范化（否决） |
|---|---|---|
| **13 种异构形状**（options[]/blanks[]/pairs[]/scenario.parts[] 嵌套叶子联合） | 一列吸收 13 变体 + 保留 `cloze` + 未来类型，**零 schema 变更** | 需 ~13 子表 + 多态连接；`scenario.parts` 是联合之联合 → 规范化噩梦 |
| **与交换格式 1:1**（§3 envelope 1:1 映射 JSONB） | `payload` **就是** `QuestionRecord`。导入=`JSON.parse`→validate→写；导出=读→包 envelope。含 `x` 扩展袋的往返保真免费 | 导入导出变有损拆装；`x` 往返不变量几乎不可守 |
| **`grade()` 纯、形状驱动** | service 读 `payload`→`record`→`grade(record, answer)`，DB 形状与判分器输入是同一 TS 类型 | 判分器需每型 DB→record 重组器；一处不匹配即静默误判 |
| **查询/筛选** | 提升镜像列 + `tagsFlat` GIN 索引解决；从不查答案内部 | 过度服务于不存在的需求 |
| **完整性** | `validateEnvelope` 是写边界的 schema 权威 + Postgres `CHECK (payload->>'type'=type)` | DB 约束表达不了"order 是 items 的排列" |

**客观/主观边界在 DB 中的落地：** `gradingClass` **派生、绝不由作者写入**（遵从 spec 的 `GRADING_CLASS_OF` 裁决）。持久化的 `gradingClass` 镜像列仅作 stats/筛选读优化，由 service 经 `effectiveClass(record)` 在**每次写时重算**，永不来自输入 —— 故不可漂移、不可谎报。

### 2.2 完整 `schema.prisma`（compile-ready）

```prisma
// prisma/schema.prisma
generator client { provider = "prisma-client-js" }

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")   // 池化 (PgBouncer) 供应用
  directUrl = env("DIRECT_URL")     // 非池化供迁移
}

// ============================================================
//  ENUMS —— DB 存 ASCII；中文标签在 lib/qbank/enums.ts
// ============================================================
enum Role { user admin }

enum QuestionType {
  single_choice multiple_choice true_false
  fill_blank numeric code_output
  ordering matching
  short_answer essay code_writing
  scenario cloze
}

enum Difficulty { easy medium hard }

enum GradingClass {
  auto_exact auto_set auto_normalized auto_partial
  self_assess manual_reference composite
}

enum QuestionStatus { draft in_review published archived }

enum AttemptStatus { correct incorrect partial ungraded }

enum SessionMode { practice exam }
enum SessionStatus { active submitted abandoned expired }

enum PlanTier { free plus }

enum SubStatus { active trialing past_due canceled incomplete incomplete_expired unpaid }

enum ImportStatus { pending applied rejected }

// ============================================================
//  AUTH.JS 适配器表 (+ role/passwordHash/billing)
// ============================================================
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  role          Role      @default(user)
  passwordHash  String?                       // OAuth-only 账号为 null；argon2id
  stripeCustomerId String? @unique

  accounts         Account[]
  sessions         Session[]
  attempts         Attempt[]
  studySessions    StudySession[]
  progress         Progress[]
  favorites        Favorite[]
  wrongEntries     WrongbookEntry[]
  subscription     Subscription?
  entitlement      Entitlement?
  events           AnalyticsEvent[]
  dailyStats       DailyUserStat[]
  authoredQuestions Question[] @relation("AuthoredBy")
  importBatches    ImportBatch[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([role])
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
  @@index([userId])
}

// JWT 策略下不承载会话，但适配器契约 + 未来可切 database 策略保留此表。
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

// ============================================================
//  题库
// ============================================================
model QuestionBank {
  id          String   @id @default(cuid())
  slug        String   @unique
  title       String
  description String?
  isPremium   Boolean  @default(false)   // 门控到 Plus
  sortOrder   Int      @default(0)
  questions   Question[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([isPremium])
}

model Category {
  id       String     @id @default(cuid())
  slug     String     @unique
  name     String                                   // 中文展示名属内容，非枚举
  parentId String?
  parent   Category?  @relation("CatTree", fields: [parentId], references: [id], onDelete: SetNull)
  children Category[] @relation("CatTree")
  questions Question[]
  @@index([parentId])
}

model Tag {
  id   String @id @default(cuid())
  slug String @unique                                // ASCII 安全键
  name String                                        // 展示（中文 ok）
  questions QuestionTag[]
}

model QuestionTag {
  questionId String
  tagId      String
  question Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  tag      Tag      @relation(fields: [tagId], references: [id], onDelete: Cascade)
  @@id([questionId, tagId])
  @@index([tagId])
}

/// 一行一个 QuestionRecord。payload 是交换记录 1:1 JSONB 镜像；镜像列是查询面。
model Question {
  id           String         @id                    // 作者稳定 id（导入提供）
  bankId       String
  categoryId   String?

  // ---- 提升镜像列（筛选/排序/搜索面）----
  type         QuestionType
  difficulty   Difficulty     @default(medium)
  gradingClass GradingClass                          // = effectiveClass(record)，每次写重算
  status       QuestionStatus @default(draft)
  stemText     String         @db.Text               // 列表/搜索用纯文本；权威 stem 在 payload
  tagsFlat     String[]       @default([])           // 去规范化 tag slug，供 GIN 快筛

  // ---- 权威记录 ----
  payload      Json                                  // JSONB：完整 QuestionRecord
  schemaVersion Int           @default(1)

  authorId     String?

  bank      QuestionBank @relation(fields: [bankId], references: [id], onDelete: Restrict)
  category  Category?    @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  author    User?        @relation("AuthoredBy", fields: [authorId], references: [id], onDelete: SetNull)
  tags      QuestionTag[]
  attempts  Attempt[]
  progress  Progress[]
  favorites Favorite[]
  wrongEntries WrongbookEntry[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  publishedAt DateTime?

  @@index([bankId, status])
  @@index([type])
  @@index([difficulty])
  @@index([status, difficulty, type])                // 覆盖练习筛选
  @@index([gradingClass])
  @@index([tagsFlat], type: Gin)
  // 迁移 SQL 追加：CHECK (payload->>'type' = type::text)
  //               GIN (payload jsonb_path_ops)
}

// ============================================================
//  练习/考试会话（拆分 practice/exam；命名规避 Auth.js Session 冲突）
// ============================================================
model StudySession {
  id          String        @id @default(cuid())
  userId      String
  mode        SessionMode
  status      SessionStatus @default(active)

  bankId      String?
  filters     Json?                                 // 冻结筛选快照（ASCII 键）
  questionIds String[]      @default([])            // exam：冻结的有序题集
  remainingSec Int?                                 // exam 倒计时，替代 localStorage fe_exam_remain
  durationSec  Int?                                 // exam 总时长（服务端截止判定依据）
  totalScore   Float?
  maxScore     Float?

  startedAt   DateTime      @default(now())
  submittedAt DateTime?

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  attempts Attempt[]
  @@index([userId, mode, status])
  @@map("study_session")
}

// ============================================================
//  作答（每题一次提交 + 服务端判分结果）
// ============================================================
model Attempt {
  id           String        @id @default(cuid())
  userId       String
  questionId   String
  sessionId    String?

  userAnswer   Json                                 // UserAnswer 判别联合（§4 qbank）
  status       AttemptStatus
  score        Float?                               // 客观机器分 [0,1]｜null(manual_reference/ungraded)
  selfScore    Float?                               // 主观自评，排除在客观分母外
  maxScore     Float         @default(1)
  gradingClass GradingClass                         // 判分时快照
  durationMs   Int?

  createdAt    DateTime      @default(now())

  user     User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  question Question      @relation(fields: [questionId], references: [id], onDelete: Cascade)
  session  StudySession? @relation(fields: [sessionId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt])                       // stats 时间序
  @@index([userId, questionId])
  @@index([questionId, status])
  @@index([sessionId])
}

/// (user, question) 滚动汇总：wrongbook/favorites/recent/stats 的单一来源，作答事务内 upsert。
model Progress {
  userId       String
  questionId   String
  attempts     Int       @default(0)
  correctCount Int       @default(0)
  wrongCount   Int       @default(0)
  lastScore    Float?
  lastStatus   AttemptStatus?
  lastAnswer   Json?                                 // 断点续答 rehydrate（UserAnswer）
  lastAt       DateTime?

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  question Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  @@id([userId, questionId])
  @@index([userId, lastAt])
  @@index([userId, wrongCount])
}

model Favorite {
  userId     String
  questionId String
  createdAt  DateTime @default(now())
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  question Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  @@id([userId, questionId])
  @@index([userId, createdAt])
}

/// 物化错题本成员（可由 Progress.wrongCount>0 派生，但独立行支持 note/mastered/快分页）。
model WrongbookEntry {
  userId      String
  questionId  String
  wrongCount  Int      @default(1)
  mastered    Boolean  @default(false)
  note        String?  @db.Text
  lastWrongAt DateTime @default(now())
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  question Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  @@id([userId, questionId])
  @@index([userId, mastered, lastWrongAt])
}

// ============================================================
//  商业化 (Stripe)
// ============================================================
model Plan {
  id                   String   @id @default(cuid())
  tier                 PlanTier @unique
  name                 String                        // "免费版" / "Plus 会员"
  stripePriceIdMonthly String?
  stripePriceIdYearly  String?
  dailyQuota           Int?                           // free=30；plus=null(无限)
  premiumBanks         Boolean  @default(false)
  examMode             Boolean  @default(true)
  aiExplain            Boolean  @default(false)
  createdAt            DateTime @default(now())
}

model Subscription {
  id                   String    @id @default(cuid())
  userId               String    @unique
  tier                 PlanTier  @default(free)
  status               SubStatus @default(active)
  stripeSubscriptionId String?   @unique
  stripePriceId        String?
  currentPeriodEnd     DateTime?
  cancelAtPeriodEnd    Boolean   @default(false)
  updatedAt            DateTime  @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([status])
}

/// 去规范化 entitlement 快照 —— O(1) 门控读，webhook 事件重建。
model Entitlement {
  userId       String    @id
  tier         PlanTier  @default(free)
  dailyQuota   Int?                                  // null = 无限
  premiumBanks Boolean   @default(false)
  examMode     Boolean   @default(true)
  aiExplain    Boolean   @default(false)
  validUntil   DateTime?
  updatedAt    DateTime  @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

/// Stripe webhook 幂等账本 —— 与 entitlement 变更同一事务插入，重投 event.id 即 no-op。
model ProcessedStripeEvent {
  id          String   @id                           // Stripe event.id
  type        String
  processedAt DateTime @default(now())
}

// ============================================================
//  导入评审队列（两阶段）
// ============================================================
model ImportBatch {
  id         String       @id @default(cuid())
  adminId    String
  bankId     String
  status     ImportStatus @default(pending)
  mergeMode  String       @default("merge")          // merge | replace
  report     Json                                     // validateEnvelope → ImportReport
  rawPayload Json                                      // 待确认的 envelope
  createdAt  DateTime     @default(now())
  appliedAt  DateTime?
  admin User @relation(fields: [adminId], references: [id], onDelete: Cascade)
  @@index([status, createdAt])
}

// ============================================================
//  分析/运营
// ============================================================
model AnalyticsEvent {
  id         String   @id @default(cuid())
  userId     String?
  name       String                                   // "attempt.graded" | ...
  props      Json?
  occurredAt DateTime @default(now())
  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)
  @@index([name, occurredAt])
  @@index([userId, occurredAt])
}

/// 每用户每日物化汇总 —— 作答事务内增量 upsert，供 stats/home 免扫描。
model DailyUserStat {
  userId            String
  day               DateTime @db.Date
  attempts          Int      @default(0)
  correct           Int      @default(0)
  objectiveAttempts Int      @default(0)              // 客观分母：排除 selfGraded/null-score
  studyMs           Int      @default(0)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([userId, day])
  @@index([userId, day])
}
```

**原始 SQL 迁移追加**（写入迁移文件）：

```sql
ALTER TABLE "Question" ADD CONSTRAINT payload_type_match
  CHECK (payload->>'type' = type::text);
CREATE INDEX question_payload_gin ON "Question" USING GIN (payload jsonb_path_ops);
```

**级联/onDelete 决策（A §2.3 保留）：** `User` 删除级联所有用户自有行（attempts/progress/favorites/wrongEntries/studySessions/subscription/entitlement）。`Question` 删除级联 attempts/progress/favorites/wrong（历史失去意义），但 `bank=Restrict`（有题的库不可删）、`category/author=SetNull`（软引用）。Auth.js `Account/Session` 按适配器契约随 User 级联。`gradingClass` 镜像列每次写由 `effectiveClass(record)` 重算，永不来自作者。

**枚举桥：** DB 存 ASCII；`Question.tagsFlat`+`stemText` 是 payload 字段的去规范化副本，每次 upsert 写入，故筛选从不破解 JSONB。

---

## 3. 认证与权限 (Auth.js + RBAC)

### 3.1 Auth.js 配置 —— `lib/server/auth.ts`

- **适配器：** `PrismaAdapter(prisma)`（用于 OAuth 账号连接 + User 行；`createUser` 对 OAuth 仍会跑）。
- **会话策略：JWT。** 理由：Credentials provider 与 database 会话策略不兼容，且 JWT 让 middleware 在边缘门控无需每请求 DB 往返，`role` 内嵌 token 供廉价粗授权。**明确说明：JWT 策略下 DB `Session` 表是死重**（保留供未来可切策略/适配器契约），会话不落库；OAuth 账号连接仍走 `Account` 表。代价：role 变更下个 token 刷新生效 —— admin 提权时强制重登。

```ts
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt", maxAge: 30 * 24 * 3600 },
  pages: { signIn: "/login" },
  providers: [
    GitHub({ allowDangerousEmailAccountLinking: false }),
    Google({ allowDangerousEmailAccountLinking: false }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const { email, password } = credentialsSchema.parse(raw);
        const u = await prisma.user.findUnique({ where: { email } });
        if (!u?.passwordHash) return null;                       // OAuth-only
        if (!u.emailVerified) throw new Error("EMAIL_NOT_VERIFIED"); // 凭证登录需验证邮箱
        if (!(await argon2.verify(u.passwordHash, password))) return null;
        return { id: u.id, email: u.email, name: u.name, role: u.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) { if (user) token.role = (user as any).role ?? "user"; return token; },
    async session({ session, token }) {
      if (session.user) { session.user.id = token.sub!; (session.user as any).role = token.role ?? "user"; }
      return session;
    },
  },
});
```

### 3.2 RBAC 三层纵深防御

1. **边缘 middleware.ts（粗、廉价）：** 解码 JWT，拦匿名于 `/(app)/**`（重定向 `/login`），拦非 admin 于 `/admin/**` 与 `/api/admin/**`（**返回 404 非 403**，不泄露存在性）。
2. **Server-action/handler 守卫（权威）：** middleware 可被误配，故**每个** service 入口再查。`requireUser()`/`requireAdmin()`（`lib/server/guards.ts`）在任何逻辑前抛。**规则：middleware 是 UX 捷径，`requireX()` 才是安全边界。**
3. **所有权检查：** 任何按用户行的读写在**查询本身**带 `where:{ userId: session.user.id }` —— 绝不信客户端 body 里的 id（关闭 IDOR）。

### 3.3 流程与安全（B §3.3 保留 + 关闭 OAuth 冲突缺口）

- **注册**（`registerAction`）：zod 校验 email + password（≥10 位 + zxcvbn 强度），`argon2id` 哈希，建 `User{role:user}` + `Subscription{tier:free}` + `Entitlement{tier:free,dailyQuota:30}`，发邮箱验证令牌。**账号枚举防护：** register/reset 无论账号是否存在都返回**同一响应**。
- **OAuth 邮箱冲突策略（关闭缺口）：** `allowDangerousEmailAccountLinking:false`。当用户先用凭证注册、后用同邮箱 Google 登录时 Auth.js 抛 `OAuthAccountNotLinked` —— 我们在 `/login` 捕获该错误码，展示"该邮箱已用密码注册，请先用密码登录后在设置中连接 Google"的显式引导，并在 `/settings` 提供受保护的 link 流程（已登录态下发起 OAuth link）。禁止静默自动连接（防账号劫持）。
- **Mass-assignment 防护：** 所有 zod schema 白名单字段；`role`/`score`/`status`/`selfScore` 永不可由客户端 body 设置。
- **自提权守卫（关闭缺口）：** `setUserRoleAction` 除 `requireAdmin` 外，禁止将**最后一个 admin** 降级（`count(role=admin)>1` 前置断言），且首个 admin 只由 `seed.ts`（`ADMIN_EMAIL`）引导，不经任何客户端路径。
- 密码 `argon2id`；`passwordHash` 除 `authorize` 外一律 `select` 排除；Auth.js 端点自带 CSRF；Server Actions 由 Next Origin 校验保护；cookie httpOnly/Secure/SameSite=Lax；auth 端点限流（§10）。

---

## 4. API / Server Actions 面

### 4.1 Route-Handler vs Server-Action 裁决

**Server Action** = 本 React 树发起、会话认证的应用内变更/RSC 取数（作答、收藏、admin CRUD、开始/交考、创建 checkout）—— 类型安全 + 渐进增强 + RSC revalidation。**Route Handler** 仅用于非 React 消费者需要 URL 处：Auth.js、Stripe webhook（需原始 body 验签）、文件上传/下载（import/export）、cron、`/api/health`。列表/详情读取在 **Server Component** 直调 service。

每入口固定管线：`requireX()` → `zod.parse` → entitlement → service → 类型化结果 `{ok:true,data} | {ok:false,error:{code,fields?}}`，由 `defineAction(schema, guard, fn)`（`lib/server/action.ts`）包裹。

### 4.2 具体面

| 域 | 类型 | 名称 / Method+Path | Auth+Role | 输入 (zod) | 响应 |
|---|---|---|---|---|---|
| Auth | SA | `registerAction` | public | `{email,password,name}` | `{ok}`（存在与否同响应） |
| Auth | RH | `/api/auth/[...nextauth]` | public | — | Auth.js |
| Auth | SA | `requestPasswordResetAction` | public | `{email}` | `{ok}`（恒定，防枚举） |
| Auth | SA | `resetPasswordAction` | public+token | `{token,password}` | `{ok}` |
| Profile | SA | `updateProfileAction` | user | `{name?,image?}` | `{ok}` |
| Questions | RSC | `questionService.list()` | user | `{bankId?,types[],difficulty?,tags[],cursor,take}`（仅 published） | `QuestionCard[]`（密钥剥离） |
| Questions | SA | `getQuestionForPracticeAction` | user | `{questionId}` | `QuestionPublic`（stripAnswerKey，未答无密钥/解析） |
| Questions | SA | `createQuestionAction` | admin | `{bankId, record}`（**经 validateEnvelope 单记录路径**） | `{id}` |
| Questions | SA | `updateQuestionAction` | admin | `{id, record}`（同一 validateEnvelope 路径） | `{ok}` |
| Questions | SA | `deleteQuestionAction` | admin | `{id}` | `{ok}` |
| Questions | SA | `setQuestionStatusAction` | admin | `{id, status}` | `{ok}` |
| Import | SA | `adminPrepareImportAction` | admin | raw JSON envelope | `{report, batchId}`（写 ImportBatch pending，不写题） |
| Import | SA | `adminConfirmImportAction` | admin | `{batchId, mode}` | `{applied,rejected,warned}` |
| Import | RH | `POST /api/admin/import/upload` | admin | multipart 文件 | `{report, batchId}` |
| Export | RH | `GET /api/admin/export?bankId=` | admin | query | `application/json` 附件 (QBankEnvelope) |
| Attempts | SA | `submitAttemptAction` | user + 配额 | `{questionId,sessionId?,userAnswer,durationMs?}` | `{result: GradeResult, revealed}` |
| Attempts | SA | `selfGradeAttemptAction` | user（所有权） | `{attemptId, selfScore:0\|0.5\|1, rubricTicks?}` | `{result}`（写 selfScore） |
| Sessions | SA | `startPracticeSessionAction` | user + 配额 | `{filters}` | `{sessionId, firstQuestion}` |
| Sessions | SA | `startExamSessionAction` | user + entitlement(examMode) | `{bankId?, count}` | `{sessionId, questionIds}`（冻结集） |
| Sessions | SA | `saveExamAnswerAction` | user（所有权） | `{sessionId,questionId,userAnswer,remainingSec}` | `{ok}`（不泄露判分；remainingSec 只减不增） |
| Sessions | SA | `submitExamAction` | user（所有权） | `{sessionId}` | `{totalScore, perQuestion: GradeResult[]}`（服务端截止校验） |
| Sessions | SA | `getExamStateAction` | user（所有权） | `{sessionId}` | 可续答态含 `remainingSec` |
| Wrongbook | RSC/SA | `listWrongbookAction` / `masterWrongAction` | user（所有权） | `{cursor,mastered?}` / `{questionId}` | `ListItem[]` / `{ok}` |
| Favorites | SA | `toggleFavoriteAction` / `listFavoritesAction` | user（所有权） | `{questionId}` / `{cursor}` | `{fav}` / `ListItem[]` |
| Stats | RSC | `statsService.dashboard()` / `.report(range)` | user | `{range?}` | `{streak,accuracyTrend[],categoryMastery[],...}` |
| Admin | SA | `listReviewQueueAction` / `bulkPublishAction` / `listUsersAction` / `setUserRoleAction` | admin | 各自 | 各自 |
| Stripe | SA | `createCheckoutSessionAction` | user | `{priceId}` | `{url}` |
| Stripe | SA | `createBillingPortalAction` | user | — | `{url}` |
| Stripe | RH | `POST /api/stripe/webhook` | Stripe 验签 | raw body | `200`（幂等） |
| Analytics | SA | `trackAction` | user? | `{name, props}` | `202` |
| Ops | RH | `GET /api/health` | public | — | `{ok, db}` |

---

## 5. 题库领域服务端化 (import/export + 权威判分)

### 5.1 导入 —— 两阶段 admin 端点复用 `validateEnvelope` + 持久评审队列

镜像 UI 向导：`adminPrepareImportAction`（或 `/api/admin/import/upload`）跑**同一纯** `validateEnvelope(raw)` → 持久化 `ImportBatch{status:pending, report, rawPayload}` 并返回 `ImportReport`（`✅N ⚠️K ❌M` + 逐行 chip，reuse 设计 §7.1）——**不写题**。admin 评审后 `adminConfirmImportAction({batchId, mode})` 在 `prisma.$transaction` 内：

```ts
const report = validateEnvelope(batch.rawPayload);   // 服务端再校验，弃客户端报告
if (!report.fileOk) return reject(batch);
if (mode === "replace")
  await tx.question.updateMany({ where:{ bankId, id:{ notIn: acceptedIds } }, data:{ status:"archived" }});
for (const rec of report.accepted) {
  const row = questionRowFromRecord(rec, bankId);
  await tx.question.upsert({
    where:{ id: rec.id },
    create:{ ...row, status:"in_review" },   // 导入落 in_review，未发布不可见
    update:{ ...row },                        // last-wins（spec §6.2）
  });
  await syncTags(tx, rec.id, rec.tagsFlat);
}
await tx.importBatch.update({ where:{id:batch.id}, data:{ status:"applied", appliedAt:new Date() }});
```

- `replace` 只 `archived` 缺席 id，**从不硬删** —— 保留 attempt/progress FK。
- `cloze` 记录带 `cloze_unsupported` warning 导入，存但不服务判分。
- 媒体预算（512KB/记录、3.5MB/envelope）由 `validateEnvelope` 在服务端强制；超限媒体写前剥离（spec §3.4）。

### 5.2 导出复用 envelope
`GET /api/admin/export?bankId=` 读该库 `payload` → `records = rows.map(recordFromRow)` → `exportBank(records)` → 流式附件 `byteoffer-qbank-YYYYMMDD.json`。因 `payload` **就是** 记录，往返不变量 `normalize(export(import(f)))===normalize(f)`（spec §6.5）按构造成立，`x` 扩展袋原样存活。

### 5.3 JSONB payload 读写映射 + 惰性迁移 + 坏行隔离（关闭缺口）

```ts
// lib/server/qbank/mapping.ts
export function questionRowFromRecord(rec: QuestionRecord, bankId: string) {
  return {
    id: rec.id, bankId,
    type: rec.type, difficulty: rec.difficulty,
    gradingClass: effectiveClass(rec),                 // 重算，绝不信输入
    stemText: plainStem(rec.stem),
    tagsFlat: rec.tags,
    payload: rec as unknown as Prisma.JsonObject,       // 1:1
    schemaVersion: SCHEMA_VERSION,
  };
}
// 读路径 try/catch 隔离：一坏行不炸列表查询
export function recordFromRow(row: Question): QuestionRecord | null {
  try { return migrate(row.payload as any) as QuestionRecord; }
  catch (e) { logger.error("payload_migrate_failed", { id: row.id, e }); return null; }
}
```

读时经 `migrate()` 惰性升版（spec §6.4），升级后形状在下次 update 惰性写回；镜像列每次写从记录重算，永不与 payload 冲突。**列表查询用 `recordFromRow` 并过滤 `null`**，把 `migrate()/validate` 失败的行隔离（quarantine），记日志待人工处理，不让单坏 payload 炸掉整个 list。

### 5.4 服务端权威 `grade()` + 密钥/解析递归剥离（承重安全元件）

```ts
// services/attempts.submit
const row = await questionService.getPublishedRow(questionId);
const rec = recordFromRow(row); if (!rec) throw new NotFoundError();
const res = grade(rec, userAnswer);                    // 权威，同一纯函数
await prisma.$transaction(async (tx) => {
  await tx.attempt.create({ data:{ userId, questionId, sessionId, userAnswer,
    status: res.status, score: res.score, selfScore: null,
    maxScore: res.max, gradingClass: res.gradingClass, durationMs }});
  await upsertProgress(tx, userId, questionId, res, userAnswer);
  if (res.status === "incorrect") await upsertWrongbook(tx, userId, questionId);
  await upsertDailyStat(tx, userId, res);              // §7.2
  await emitEvent(tx, userId, "attempt.graded", { questionId, type: rec.type, status: res.status });
});
return { result: res, revealed: revealKey(rec) };      // 回填密钥+解析
```

**`stripAnswerKey` 必须递归（关闭缺口）：** 剥离 `answer/accept/expected/order/pairs/reference/rubric/blanks[].accept` **以及 `explanation`**（含 `points`/`pitfalls`）——且**递归进 `scenario.parts[]`**，逐 part 剥离其自有 `answer/expected/reference`。多选/排序/匹配的 option/item **集合**必然随题下发（不可避免且无害）；被保护的是每题的**正确密钥 + 解析**。提交后 `revealKey` 反向投影回填。exam 模式下 `saveExamAnswerAction` 不回任何判分，密钥/解析扣留至 `submitExamAction`。

**媒体 XSS 写边界不变量（关闭缺口）：** `media.src` 的 `^data:image/` 白名单在**每条写路径**强制（import **与** admin CRUD **与** 迁移），非仅导入端点 —— 表达为写边界不变量，`questionRowFromRecord` 前统一校验。

**Admin CRUD 走同一 validateEnvelope 路径（关闭缺口）：** `createQuestionAction`/`updateQuestionAction` **不得**用平行 zod schema，必须走 `validateEnvelope` 的单记录校验路径（含 stem 空格数 === blanks.length、order 是排列、regex 可编译等每型一致性），否则两套校验器漂移会放进判分器误处理的题。

### 5.5 发布工作流
`draft → in_review → published → archived`，经 `setQuestionStatusAction`（admin）。用户读一律 `where:{status:"published"}`（`@@index([bankId,status])` 廉价）；批量导入落 `in_review`，`bulkPublishAction` 批准转 `published`（写 `publishedAt`）；下架转 `archived`，从不硬删（attempt/progress 靠级联保完整性）。

---

## 6. 商业化 Stripe (订阅+entitlement+门控)

### 6.1 产品与 Plan 表（C §6 真实数字保留）

一个 Stripe Product "ByteOffer Plus"，两个 recurring Price（月/年）。本地 `Plan` 表为门控唯一真相，改配额无需部署：

| tier | dailyQuota | premiumBanks | examMode | aiExplain | 价格 |
|---|---|---|---|---|---|
| `free` | **30/天** | ✗ | ✓ | ✗ | ¥0 |
| `plus` | `null`(无限) | ✓ | ✓ | ✓ | **¥29/月 · ¥199/年** |

### 6.2 Checkout / Portal
`createCheckoutSessionAction`：`requireUser` → 惰性建/取 `User.stripeCustomerId` → `stripe.checkout.sessions.create({ mode:"subscription", customer, line_items:[{price:priceId}], client_reference_id:userId, success_url, cancel_url })` → 返 `{url}`。`createBillingPortalAction` → Billing Portal 供自助取消/换卡。

### 6.3 Webhook（唯一 entitlement 变更源）+ 持久幂等账本（关闭缺口）

`POST /api/stripe/webhook`（`runtime='nodejs'`，`req.text()` 原始 body，`stripe.webhooks.constructEvent` 验签）。**幂等靠持久 `ProcessedStripeEvent` 表**：在与 entitlement 变更**同一事务**内 `INSERT event.id`（主键冲突 = 已处理 → 直接 200 no-op），杜绝重投/并发重放导致的双重授权。

| event | 动作 |
|---|---|
| `checkout.session.completed` | 由 `client_reference_id` 解析 userId，upsert `Subscription{tier:plus,status,...,currentPeriodEnd}` |
| `customer.subscription.updated` | 同步 `status/currentPeriodEnd/cancelAtPeriodEnd/stripePriceId` |
| `customer.subscription.deleted` | `tier:free, status:canceled` |
| `invoice.payment_failed` | `status:past_due`（**宽限：保留访问至 currentPeriodEnd**） |
| `invoice.paid` | 确认 `status:active`，延展 `currentPeriodEnd` |

每 event 处理末尾 **重建 `Entitlement` 快照**（从 `Plan` 配置 + `Subscription` 状态解析）。**绝不从客户端成功跳转授权** —— 成功页只读 DB 态（可能短暂显示"开通中…"）。

### 6.4 Entitlement 映射与服务端门控 + 原子配额（关闭 TOCTOU 缺口）

门控读**去规范化 `Entitlement` 行**（一次索引查，近零延迟）。`status ∈ {active,trialing}` 或 `past_due 且 now<currentPeriodEnd` → Plus 权益；否则 free。

- **每日配额（原子，杀 TOCTOU）：** `assertCanAttempt` 不用"count 后 insert"的 check-then-act。改用**条件原子递增**：`DailyUserStat` 今日行的 `attempts` 通过 `UPDATE ... SET attempts=attempts+1 WHERE userId=? AND day=? AND (attempts < :quota)` 返回受影响行数；0 行 = 超额，抛 `QUOTA_EXCEEDED`（UI 出 Plus 升级）。Plus（quota=null）跳过条件。该原子写与 `submitAttempt` 事务合一，并发提交不可越额。
- **付费墙访问态窗口：** checkout 完成到 webhook 落地间，用户仍是 free（门控保守）；成功页轮询 DB，webhook 落地后升级 —— 不存在"未付费即 Plus"的窗口。
- **Premium 库：** `isPremium && !entitlement.premiumBanks` → 列表过滤 + 直接访问拒绝。
- **Exam/AI：** 由 `entitlement.examMode`/`aiExplain` 门控。
客户端 flag 仅装饰付费墙；所有门在 service 重查。

### 6.5 账号删除取消订阅（关闭缺口）
`deleteAccountAction`：删本地 User 前，若存活 `stripeSubscriptionId` 先 `stripe.subscriptions.cancel(...)`，再走本地级联删除 —— 杜绝"注销后仍被扣费"。

---

## 7. 数据分析/运营 (埋点+真实统计)

### 7.1 事件模型
`analyticsService.track(name, props, userId?)` → 一条 `AnalyticsEvent`（fire-and-forget，try/catch 包裹永不炸请求）。核心事件：`auth.registered`、`auth.login`、`attempt.graded`(`{questionId,type,difficulty,status,score,durationMs}`)、`exam.started`、`exam.submitted`、`favorite.added`、`wrongbook.mastered`、`import.applied`、`checkout.started`、`subscription.activated`、`subscription.canceled`、`quota.blocked`、`premium.upsell_viewed`。支撑漏斗（注册→首答→checkout）与产品统计。

### 7.2 真实统计（清除 `lib/data.ts` 全部假数）—— 事务内物化 + 夜间对账
- **`DailyUserStat` 增量物化**：`submitAttemptAction` 事务内 `upsert` 今日行：`attempts++`、`correct += status==="correct"?1:0`、`objectiveAttempts += (!selfGraded && score!=null)?1:0`、`studyMs += durationMs`。**correctness 不依赖 cron**；夜间对账 job（§11 cron）自愈漂移。
- **派生视图（从 DailyUserStat + Attempt 即时算）：**
  - **正确率趋势**：`SELECT day, correct, objectiveAttempts FROM DailyUserStat WHERE userId AND day>=range`，每日 = `correct/objectiveAttempts`。
  - **分类掌握度**：`Attempt` join `Question.categoryId`/`tagsFlat`，`avg(score) where !selfGraded && score!=null`（缓存 5min）。
  - **连续天数 streak**：`DailyUserStat.attempts>0` 的连续 `day`（替代 sidebar 硬编码"18 天"）。
  - **学习报告**：组合 `{accuracyTrend, weakestCategories, streak, totalAttempts, todayVsGoal}` 供 home/stats 屏，替代 `wrongItems/favItems/recentItems` 假数组。

**客观分母铁律：** 客观正确率 = `correct / objectiveAttempts`；`selfGraded` 与 `null`-score(manual_reference) 由 **`objectiveAttempts` 计数器**排除，**绝不当错算**。分母靠计数器强制，非临时过滤。

---

## 8. 从原型迁移 (computeVals 屏幕接真实数据, 保留视觉)

**原则：保留视图层，替换数据源。** `components/screens/*`、内联样式、`lib/theme.ts`/`computeThemeVars`、`lib/data.ts` **样式助手**（`diffStyle/diffChip/typeChipStyle/fmtTime` + `ListItem` 类型）**逐字保留**；`computeVals`/`useApp` 派生中枢结构**不动**，只改其输入来源。

### 8.1 取数模式（决定性）
**RSC 取初值 + 客户端 action 交互。** 每路由是 **Server Component**（`app/(app)/practice/page.tsx`）server 端 `auth()`+service 取首页/首题，作为 prop 注入**既有** client `<AppProvider initialData={...}>`（当前 client 树原样）。`computeVals` 从 `state.bank`/`state.progress`（由 `initialData` seed）派生，替代 module import。交互（提交、下一题、筛选、收藏）走 Server Actions，结果 `patch()` 折回 state，`computeVals` 重派生。**屏幕不改，仅 `state.bank`/`state.progress` 来源从 module import 变 prop。**

### 8.2 KEEP vs REPLACE
| 保留（逐字） | 替换 |
|---|---|
| 全部 `components/screens/*` JSX + 内联样式 | `lib/data.ts` 数组 `practiceBank/examQ/wrongItems/favItems/recentItems` → DB 读 |
| `lib/theme.ts`/`computeThemeVars`/presets | `localStorage fe_exam_remain` → `StudySession.remainingSec`（服务端权威，跨设备） |
| `lib/data.ts` 样式助手 + `ListItem`/`DiffStyle`/`Chip` 类型 | `pfTypes` 中文键 → ASCII 键 + 渲染时 `TYPE_LABEL`/`DIFF_LABEL`（spec §7.3） |
| `useApp()`/`computeVals` 派生结构 | `pAnsRight` 布尔猜测 → 真实 `GradeResult`（`v.pGrade.status`） |
| `main-area.tsx` 布尔 flag 路由（加 `isQbank`） | `pSelected: Record<string,string\|string[]>` → `Record<string, UserAnswer>` |

### 8.3 逐屏接线
- **practice**：`bank=props.bank`；`q=bank[pIndex]`；按 `q.type` 分发 `AnswerFieldByType`；`pAnsRight = v.pGrade.status==="correct"`（别名保留，`practice.tsx` 分析块不动）；`pNext` 调 `getQuestionForPracticeAction`；提交先客户端 `grade()` 即时重绘、`submitAttemptAction` 回来 reconcile。
- **exam**：`examQ` 硬编码删除；`startExamSessionAction` 冻结题集入 `StudySession`；`saveExamAnswerAction` 逐答持久（`remainingSec` 只减不增）；`submitExamAction` 服务端整卷判分并做截止校验。`fe_exam_remain` 客户端 interval 仅作 UX，`remainingSec` 服务端权威（防作弊）。
- **wrongbook/favorites/recent/stats/home**：由 `listWrongbookAction`/`listFavoritesAction`/`statsService` 结果投影到既有 `ListItem`（`toListItem(q, entry)` 经 `TYPE_LABEL`/`DIFF_LABEL` 桥），屏幕不改。
- **新 qbank/admin 屏**（`isQbank` flag + `NavItem` ⌘6，admin-only）。

---

## 9. 目录结构 (完整目标树)

```
byteoffer/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/                  # 含 CHECK + GIN 原始 SQL
│  └─ seed.ts                      # Plan(free/plus) + admin 用户 + adaptSeed()→published 题
├─ middleware.ts                   # 边缘 auth + admin 门 + 安全头(CSP/HSTS)
├─ app/
│  ├─ layout.tsx  globals.css
│  ├─ (marketing)/ page.tsx  pricing/page.tsx
│  ├─ (auth)/ login/page.tsx  register/page.tsx  reset/page.tsx
│  ├─ (app)/                       # 认证壳（Sidebar + MainArea）
│  │  ├─ layout.tsx                # requireUser(); 渲染 AppProvider(initialData)
│  │  ├─ home/page.tsx  practice/page.tsx  interview/page.tsx
│  │  ├─ wrongbook/page.tsx  favorites/page.tsx  stats/page.tsx
│  │  ├─ qbank/page.tsx
│  │  └─ settings/ page.tsx  billing/page.tsx
│  ├─ (admin)/admin/               # requireAdmin()
│  │  ├─ layout.tsx  dashboard/page.tsx  questions/page.tsx
│  │  ├─ import/page.tsx           # validate/commit 向导（ImportBatch 评审）
│  │  ├─ review/page.tsx  users/page.tsx
│  └─ api/
│     ├─ auth/[...nextauth]/route.ts
│     ├─ admin/import/upload/route.ts   admin/export/route.ts
│     ├─ stripe/{checkout,portal,webhook}/route.ts
│     └─ health/route.ts
├─ lib/
│  ├─ qbank/                       # 共享纯内核（同构、零依赖，spec §8a）
│  │  ├─ types.ts enums.ts id.ts normalize.ts grade.ts
│  │  ├─ validate.ts migrate.ts export.ts seed.ts adaptSeed.ts format.ts selfcheck.ts
│  ├─ server/
│  │  ├─ db.ts auth.ts guards.ts action.ts env.ts ratelimit.ts stripe.ts logger.ts
│  │  ├─ qbank/mapping.ts          # record<->row + stripAnswerKey/revealKey
│  │  └─ services/                 # 唯一触碰 Prisma 的层
│  │     ├─ questionService.ts attemptService.ts sessionService.ts importService.ts
│  │     ├─ statsService.ts entitlementService.ts billingService.ts analyticsService.ts adminService.ts
│  ├─ actions/                     # "use server" 薄：guard+zod+service
│  │  ├─ auth.ts attempts.ts exam.ts library.ts stats.ts billing.ts admin.ts profile.ts qbank.ts
│  ├─ validation/                  # zod：auth/questions/attempts/billing（UserAnswerSchema 判别联合）
│  ├─ app-context.tsx              # 保留 —— computeVals 中枢，输入变真实
│  ├─ theme.ts                     # 保留
│  └─ data.ts                      # 样式助手保留；数组 @deprecated（仅 seed 用）
├─ components/                     # sidebar/main-area/headers/screens/* 保留（加 isQbank）
│  ├─ qbank/answer-field.tsx       # AnswerFieldByType（per-type 控件）
│  ├─ billing/upsell.tsx  admin/*
├─ public/qbank.schema.json
├─ .env.example  .github/workflows/ci.yml  Dockerfile
└─ package.json
```

---

## 10. 安全与生产加固

- **输入校验：** zod 在每个 SA/RH 边界、在 **service 内**（非仅 UI）parse；payload 写路径额外过 `validateEnvelope` —— 无未校验 JSON 入库。
- **AuthZ：** `requireUser`/`requireAdmin` + 所有权作用域查询（`where:{userId:session.user.id}` 杀 IDOR）；admin 路由三重门（middleware 404 + `requireAdmin` + 读带 status 过滤）。
- **判分完整性：** 客观分服务端派生绝不信客户端；密钥/解析未答/未交卷前扣留（§5.4）—— 刷题 SaaS 最重要的滥用面。
- **限流（`lib/server/ratelimit.ts`）—— 默认 Postgres 令牌桶（保"单可部署"）：** 为守"单一可部署 + 无重依赖"，**默认用 Postgres 令牌桶**（原子 `UPDATE` 计数行），Upstash Redis 为可选升级项（非 v1 必需）。覆盖：auth（5/15min/IP+email）、`submitAttemptAction`（60/min/user 防脚本刷）、**问题读取面 `listQuestions`/`getQuestionForPractice`（每用户读限流，防题库爬取 —— 关闭缺口）**、import commit、checkout、reset。配合 cuid（非顺序 id）+ published-only 过滤 + cursor 分页，抬高爬库成本。
- **Secrets/env：** `lib/server/env.ts` 用 zod 在**启动时**解析 `process.env`（缺失 fail-fast）；机密绝不 `NEXT_PUBLIC_`；`DIRECT_URL` 仅迁移用。
- **错误处理：** service 抛类型化错误（`AuthError/PaymentRequiredError/ValidationError/NotFoundError`），边界映射为安全形（`{error:{code,fields?}}`）—— 绝不泄露 stack/Prisma/SQL；webhook 内部错先 ack 200 + dead-letter，避免 Stripe 重试风暴。
- **可观测性：** 结构化日志（requestId/userId/action/latency）+ `AnalyticsEvent` + `/api/health`（DB ping）+ Sentry（可选）。
- **公开 SaaS 滥用面清单：** 配额刷（服务端原子配额）、答案爬取（未答无密钥 + 读限流）、导入 XSS/DoS（`data:image/` 白名单 + 尺寸预算，写边界不变量，admin-only）、账号枚举（register/reset 恒定响应）、CSRF（Origin + Auth.js）、内容注入（stem/tag 纯文本渲染，绝不 `dangerouslySetInnerHTML`）、webhook 伪造（验签 + `ProcessedStripeEvent` 幂等）、mass-assignment（zod 白名单，role/score/status/selfScore 不可客户端设）、SQL 注入（Prisma 参数化，raw SQL 仅迁移）。

**媒体存储 note（fit/perf，关闭缺口）：** 媒体以 `data:image` base64 内联 JSONB 会撑大行且拖累下发。**v1：列表投影排除 base64 媒体**（`QuestionCard` 不含 `media`，仅详情/作答时取）；**v2 路径：媒体迁至对象存储（S3/R2），payload 只存 URL**。

---

## 11. 部署 (Vercel + 托管 Postgres, env, 迁移, CI)

**目标：Vercel + Neon Postgres**（App Router/Server Actions 原生，Neon 池化 `DATABASE_URL`(PgBouncer) + `DIRECT_URL` 迁移，可分支 DB 供 CI）。**Docker 备选：** 多阶段 `Dockerfile`（`next build` standalone + `next start`）+ 托管 Postgres，供自托管。**限流默认 Postgres 令牌桶**（无强制外部 Redis，守单可部署）。

**env（`.env.example`）：** `DATABASE_URL`、`DIRECT_URL`、`AUTH_SECRET`、`AUTH_URL`、`AUTH_GITHUB_ID/SECRET`、`AUTH_GOOGLE_ID/SECRET`、`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、`NEXT_PUBLIC_STRIPE_PK`、`STRIPE_PRICE_PLUS_MONTHLY/YEARLY`、`RESEND_API_KEY`、`ADMIN_EMAIL/ADMIN_PASSWORD`、`SENTRY_DSN`(可选)、`UPSTASH_REDIS_*`(可选)。全部经 `env.ts` zod 校验。

**迁移/seed：** 本地 `prisma migrate dev`；部署 `prisma generate && prisma migrate deploy`（用 `DIRECT_URL`）为构建/发布步；`prisma db seed`（幂等 upsert）每环境一次，植入 Plans + admin(`ADMIN_EMAIL`) + `adaptSeed()`→`commitImport`→publish 的样例库。

**CI（`.github/workflows/ci.yml`）：** PR → `pnpm install` → `prisma generate` → `tsc --noEmit` → `next lint` → **`npx tsx lib/qbank/selfcheck.ts`（部分给分数学自检，最高 correctness 风险，硬门禁）** → `next build`（对临时 Neon 分支跑 `migrate deploy`）。merge main → Vercel 自动部署跑 `migrate deploy`。**夜间 Vercel Cron** 命中内部路由对账 `DailyUserStat` 漂移。

**Stripe 本地：** test 模式先行；`stripe listen --forward-to localhost:3000/api/stripe/webhook`；生产注册 webhook 端点并复制 `STRIPE_WEBHOOK_SECRET`。

---

## 12. 分阶段实现任务图

**Phase 1 —— 后端地基**（串行根，解锁一切）。产出：`prisma/schema.prisma`（含 CHECK+GIN 原始 SQL 迁移）、首迁移、`lib/server/{db,env,auth,guards,action}.ts`、`middleware.ts`、`app/api/auth/*`、`prisma/seed.ts`。**单一 owner 串行点：`schema.prisma`。** 阶段内可并行：env/guards 与 schema 并行起草，首迁移合并。

**Phase 2 —— 题库域 + 导入导出 + CRUD**（P1 后内部高度并行）。
- **纯轨道 A（无 P1 依赖，第 0 天启动）：** 整个 `lib/qbank/*`（`types→enums` 先，其余 normalize/grade/validate/migrate/id/export/seed/adaptSeed/format 各自文件并行）+ `selfcheck.ts`。**门禁：接线前跑 `selfcheck.ts`。**
- **轨道 B（需 P1）：** `lib/server/qbank/mapping.ts`（record↔row + `stripAnswerKey`/`revealKey` 递归）、`questionService`、`importService`（`ImportBatch` 两阶段）、`actions/{qbank,attempts,admin}`、`/api/admin/{import/upload,export}`。产出：导入→DB→导出服务端往返。

**Phase 3 —— 前端集成 + auth UI**（需 P1+P2）。产出：`(auth)` 页、`(app)/layout.tsx`（AppProvider 注入）、逐屏 RSC `page.tsx`、`attemptService`+`actions/{attempts,exam,library}`、`computeVals` 迁移（ASCII 筛选键/`UserAnswer`/`pGrade`/真实 bank）、`components/qbank/answer-field.tsx`。**单一 owner 串行点：`lib/app-context.tsx`**（原子合并，spec §8b）；屏幕 JSX 不动，context 落地后各屏并行接线。

**Phase 4 —— admin 后台**（与 P3 尾并行）。产出：`(admin)/admin/*`（CRUD、import 向导、review/publish 队列）、`setUserRoleAction`（含最后 admin 守卫）。仅依赖 P2 services，独立文件。

**Phase 5 —— Stripe**（独立切片并行）。产出：`lib/server/stripe.ts`、`billingService`/`entitlementService`、`actions/billing`、`/api/stripe/{checkout,portal,webhook}`、`ProcessedStripeEvent` 幂等、pricing/settings-billing 页、`submitAttempt`/`startExam` 门控注入、premium 过滤、`deleteAccountAction` 取消订阅。仅碰 entitlement 路径，与 P4 并行。

**Phase 6 —— 分析**（需 P3 作答落地）。产出：`analyticsService.track` 埋点、`DailyUserStat` 事务内增量、`statsService`（趋势/掌握度/streak/报告）、home/stats/sidebar 接真实数据、夜间对账路由。与 P4/P5 并行。

**Phase 7 —— 加固 + 部署**（终局串行）。产出：`ratelimit.ts`（Postgres 令牌桶，覆盖 auth/attempt/**问题读取面**/import/checkout）、zod 与所有权审计、`logger.ts`+Sentry、CSP 头、CI 流水线、Vercel+Neon 供给、`migrate deploy`+seed、Stripe 生产 webhook、`/api/health`、冒烟测试。

**并行度总结：** P1 是串行根。P2 纯轨道 A 第 0 天启动。P1 解锁 P2-B/P3/P4/P5。**仅两个强制单一 owner 串行点：首迁移 `schema.prisma`（P1）与 `lib/app-context.tsx` 原子合并（P3）**；P4/P5/P6 依赖落地后于互不相交文件并行 fan-out，P7 收敛。

---

**承重优先构建物：** `prisma/schema.prisma`（§2.2）、`lib/qbank/*`（纯内核，spec 定义）、`lib/server/qbank/mapping.ts`（`recordFromRow`/`questionRowFromRecord`/`stripAnswerKey` 递归，§5.3-5.4）、`services/attemptService.ts`（服务端权威判分 + 原子配额，§5.4/§6.4）。**两份真相源：** 本文 + `/Users/laidexin/IdeaProjects/ByteOffer/docs/design/qbank-data-model.md`。**关键既有文件：** `/Users/laidexin/IdeaProjects/ByteOffer/lib/app-context.tsx`（单一 computeVals 合并点，原子改）、`/Users/laidexin/IdeaProjects/ByteOffer/lib/data.ts`（保留助手，弃用数组）、`/Users/laidexin/IdeaProjects/ByteOffer/lib/theme.ts`（保留）。