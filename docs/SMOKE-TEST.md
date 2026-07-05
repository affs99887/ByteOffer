# ByteOffer — 真库上线冒烟清单 (Live-DB Smoke Test)

> 本清单覆盖**所有需要真实 Postgres 才能验证**的链路——这些代码已完成且通过了 `tsc`/`build`/自检/逻辑测试，但从未在真库上端到端跑过。部署到带 Postgres 的环境后，逐项跑一遍并打勾，才算「可对真实用户收费」。
>
> 配套：[`DEPLOYMENT.md`](DEPLOYMENT.md)（部署步骤）、[`design/launch-review.md`](design/launch-review.md)（终审 5 项修复，其中 #2/#3/#4/#5 尤其需要下面第 4/6 步验证）。

## 0. 前置

- [ ] Neon（或任意 Postgres）已建库，拿到 **pooled** + **direct** 两个连接串
- [ ] `.env` 按 [`.env.example`](../.env.example) 填好：`DATABASE_URL`/`DIRECT_URL`、`AUTH_SECRET`(`openssl rand -base64 33`)、`AUTH_URL`、`ADMIN_EMAIL`/`ADMIN_PASSWORD`、`CRON_SECRET`；Stripe/Resend/OAuth 按需
- [ ] `npm ci`（会触发 `postinstall: prisma generate`）

## 1. 迁移 + 种子

```bash
npm run db:migrate     # prisma migrate deploy → 建 22 张表（含 RateLimit + CHECK/GIN）
npm run db:seed        # free/plus 套餐 + 管理员 + 样例题库（幂等）
```
- [ ] 两条命令 exit 0，无报错
- [ ] （可选）在 Neon 控制台确认 22 张表 + `Question` 有样例数据 + `Plan` 有 free/plus + `User` 有 admin

## 2. 启动 + 健康检查

```bash
npm run build && npm start     # 或 npm run dev
curl -s localhost:3000/api/health
```
- [ ] `/api/health` 返回 `{"ok":true,"db":"up"}`（200）；停掉库时应 `db:"down"`（503）

## 3. 认证闭环

- [ ] `/register` 注册新用户 → 提示「验证邮件已发送」（无 Resend 时，验证链接**打在服务器日志**里，从日志复制）
- [ ] 打开验证链接 `/verify?token=…` → 显示验证成功
- [ ] `/login` 用该账号登录 → 跳转到 `/app`
- [ ] 未验证邮箱登录 → 提示需验证（若开启该策略）；错密码 → 「邮箱或密码错误」
- [ ] `/reset` 找回密码：请求 → 日志/邮件拿链接 → 设新密码 → 用新密码登录
- [ ] 退出登录 → 回 `/login`；未登录访问 `/app` → 跳 `/login`

## 4. 练习 · 服务端权威判分（核心）

逐题型作答并核对（题库来自 seed 的样例，覆盖全部题型）：
- [ ] 单选/判断：选对→绿✓，选错→红✗
- [ ] 多选：全对→满分；部分对（开了 partial）→橙色部分分
- [ ] 填空：多空逐空判定；**（回归）打开填空题不崩溃**
- [ ] 数值：容差内算对；**答案值不在客户端**（见第 8 步）
- [ ] 输出预测/排序/匹配：按规则判分
- [ ] 简答/问答/编程：看参考答案 → 三档自评（或 rubric 勾选）→ 记为自评分，**不进客观正确率**
- [ ] 情景多问：客观小问自动判、主观小问自评，整题混合徽标
- [ ] 提交后「查看解析」显示正确答案 + 考点（**提交前拿不到**）

## 5. 模拟面试 · 考试模式（终审 #2/#3 重点）

- [ ] 进入 `/app` 模拟面试 → 自动 `startExam`，生成题目 + 倒计时（不是假的 5316 秒，是服务端 `remainingSec`）
- [ ] 作答若干题 → 刷新页面 → 已答保留（服务端 `saveExamAnswer` 持久化）
- [ ] 交卷 → **显示真实分数（不是恒 0/100）**，答对/答错数正确
- [ ] （#3）人为改系统时间或等超时后再 `saveExamAnswer` → **被拒（EXAM_EXPIRED）**；超时后交卷 → 超时后的答案**不给分**

## 6. 付费会员 Stripe（终审 #4/#5 重点，需 Stripe 测试模式）

- [ ] 配好 Stripe 测试密钥 + `stripe listen --forward-to localhost:3000/api/stripe/webhook`
- [ ] `/pricing` → 升级 Plus → Checkout 用测试卡 `4242 4242 4242 4242` → 成功
- [ ] webhook 收到 `checkout.session.completed` → `Entitlement` 变 Plus（**只经 webhook 授权**，成功回跳本身不给权限）
- [ ] Plus 用户：每日题量限制解除；免费用户刷够 `dailyQuota`（默认 30）→ **被门控（QUOTA_EXCEEDED）**
- [ ] `/billing` 管理订阅（portal）；取消订阅 → webhook → 回 free
- [ ] （#5）在 Stripe 后台手动用**非配置价格**建订阅 → **不授予 Plus**（tier 校验价格）
- [ ] （#4）把某订阅置 `past_due` 且 `validUntil` 设过去 → 门控**按 free 处理**（读时过期校验）

## 7. 管理后台

- [ ] 用 `ADMIN_EMAIL` 登录 → `/admin` 可进（非管理员访问 `/admin` → **404**，不是 403）
- [ ] 题库管理：新建/编辑（JSON）/删除/上下架
- [ ] 批量导入：粘贴或上传样例题库 JSON → 校验报告（✅/⚠️/❌）→ 确认导入 → 落 `in_review`
- [ ] 审核队列：勾选 → 批量发布 → 前台可见
- [ ] 导出：`/api/admin/export?bankId=…` 下载 JSON → 与导入**往返一致**
- [ ] 用户管理：改角色；尝试降级**最后一个 admin** → 被拒

## 8. 安全抽查

- [ ] 打开浏览器 Network，在练习页看某题的请求负载/初始数据：**不含 `answer`/`accept`/`expected`/`value` 等答案字段**（提交后才在响应里出现）
- [ ] 连续快速提交作答 > 60 次/分 → 触发限流（429/友好提示）；连续登录失败 > 5 次/15 分 → 限流
- [ ] 用别人的 `attemptId`/`sessionId` 调 action（改请求）→ 被所有权作用域挡住（找不到）
- [ ] `/api/cron/reconcile` 不带 secret → 404；带正确 `Authorization: Bearer $CRON_SECRET` → `{reconciled:…}`

## 9. 数据分析

- [ ] 刷若干题后，`/app` 首页 KPI（刷题量/正确率/今日/连续打卡）+ 统计页趋势/分类掌握度 = **真实数据**（非样例假数）
- [ ] 跑一次 `/api/cron/reconcile` → `DailyUserStat` 自愈无漂移

---

## 签收标准

第 2–8 步全部打勾 = **可对真实用户开放并收费**。第 9 步是体验完善项。
任何一项失败 → 记录现象（含请求/日志）反馈，定位修复后重跑该项。
