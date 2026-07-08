# ByteOffer 题库内容格式规范（byteoffer.qbank）

本文件面向**题目作者 / 内容维护者**。按此规范编写题库文件后，可通过两种方式入库（见文末「如何导入」）。运行时权威校验器是 `lib/qbank/validate.ts` 的 `validateEnvelope`；`public/qbank.schema.json` 供编辑器补全，但**运行时校验更严**（下划线数量、order 排列、pair 存在性等 Schema 不检查，以本文为准）。

> 一句话心智模型：一个 **信封（envelope）** JSON 文件里装着一个 `questions` 数组，数组里每一项是一道 **题目记录（QuestionRecord）**。你只写「事实数据」，`gradingClass / stemText / tagsFlat` 等派生列由服务端自动计算——**切勿在文件里手写这些字段**。

---

## 1. 信封结构（QBankEnvelope）

```json
{
  "format": "byteoffer.qbank",
  "schemaVersion": 1,
  "exportedAt": "2026-07-07T00:00:00.000Z",
  "source": { "app": "byteoffer", "appVersion": "1.0", "author": "内容团队" },
  "meta": { "title": "前端高频面试题库", "locale": "zh-CN" },
  "counts": { "total": 2 },
  "questions": [ /* QuestionRecord... */ ]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `format` | ✅ | 魔术串，**必须**是 `"byteoffer.qbank"`。不符 → 整个文件被拒（不导入任何题）。 |
| `schemaVersion` | ✅ | 正整数，当前 = `1`。`>1`（版本过新）或非正整数 → 整个文件被拒。 |
| `exportedAt` | ⬜ | ISO-8601 时间串，导出时写入，导入时忽略。 |
| `source` | ⬜ | `{ app?, appVersion?, author? }`，仅溯源用。 |
| `meta` | ⬜ | `{ title?, locale? }`，`locale` 固定 `zh-CN`。 |
| `counts` | ⬜ | `{ total }` 冗余自检。与 `questions.length` 不符 **只告警**，不阻断。 |
| `questions` | ✅ | 题目记录数组。 |

**信封级致命错误**（任一发生 → `fileOk=false`，整包不导入）：`format` 不符、`schemaVersion` 非法/过新、`questions` 不是数组、图片总量超 3.5MB。

---

## 2. 每题公共字段（BaseRecord）

所有题型共享以下字段：

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `id` | 建议填 | 作者稳定 id，约定 `<domain>-<topic>-<seq>`，如 `js-eventloop-001`。**必须全库唯一**（`Question.id` 是全局主键）。省略 → 告警并按 `q_<hash>` 自动派生。**重复 = 数据丢失**（见 §5）。 |
| `type` | ✅ | 13 种题型之一（见 §3）。未知题型 → 该题被拒。 |
| `difficulty` | 建议填 | `"easy" \| "medium" \| "hard"`（显示为 简单 / 中等 / 困难）。非法/缺失 → 告警并回退 `medium`。 |
| `tags` | ✅ 强烈建议 | 字符串数组。**第一个 tag = 分类**（见 §2.1）。非字符串数组 → 告警并置空 `[]`。 |
| `chapter` | ⬜ 强烈建议 | **章节**（顶层主题），纯中文显示串，如 `JavaScript`。驱动「章节→小节」浏览树与练习/考试范围选择（见 §2.5）。缺省 → 该题归入「未分类」。非空、去空白后 ≤ 80 字，否则**仅告警并忽略**（不拒题）。 |
| `section` | ⬜ 强烈建议 | **小节**（子主题），如 `作用域与闭包`，浏览树第二层。规则同 `chapter`（见 §2.5）。 |
| `stem` | ✅ | 题干，纯文本（见 §6）。为空 → 该题被拒。 |
| `source` | ⬜ | `{ company?, year?:int, position? }` 出处。 |
| `explanation` | ⬜ | 解析，仅**作答提交后**展示（见 §2.2）。 |
| `media` | ⬜ | 媒体数组（见 §4）。 |
| `grading` | ⬜ | `{ partial?: boolean }`，是否按比例给分（见各题型）。 |
| `x` | ⬜ | 扩展袋 `Record<string, unknown>`，原样 round-trip 保留。 |

### 2.1 分类 = 第一个 tag（tagsFlat[0]）

交换格式**没有** `category` 字段；系统以 **`tags` 的第一个元素**作为该题的「分类」（`statsService` 的分类掌握、首页分类进度都取 `tagsFlat[0]`）。因此每题 `tags[0]` **必须**是下列 10 个固定分类之一（大小写与中文完全一致）：

```
HTML   CSS   JavaScript   TypeScript   React   Vue   浏览器   网络   工程化   算法
```

- `tags[0]` 之后的元素是**自由主题标签**（如 `事件循环`、`Promise`、`盒模型`），用于练习页「标签·可多选」过滤（按 `hasSome` 命中）。
- 示例：`"tags": ["JavaScript", "事件循环", "Promise"]` → 分类 = `JavaScript`，主题标签 = 事件循环 / Promise。

> ⚠️ 若第一个 tag 不在上述 10 类中，题目仍会导入，但会被归到一个「野生分类」，导致首页/统计的分类维度错乱。请务必让 `tags[0]` 落在固定集合内。

### 2.2 解析结构（explanation）

```json
"explanation": {
  "explain": "一段整体讲解（纯文本，\n 换行）",
  "points":   ["得分要点1", "得分要点2"],
  "pitfalls": ["易错点1", "易错点2"],
  "related":  ["相关知识点1", "相关知识点2"]
}
```

- 四个字段均可选、均为纯文本。**请勿写 `ai` 字段**——本期无 AI 功能，`ai` 不会被使用。
- 解析在用户**提交作答前对客户端不可见**（服务端脱敏），提交后才随判分结果返回。

### 2.3 本地化字符串（LocalizedString）

`stem`、选项 `opt.t`、`reference`、`rubric[].point` 等既可是纯字符串，也可是 `{ "zh-CN": "…", "en": "…" }` 形式。镜像列（用于列表/搜索）优先取 `zh-CN`。默认直接写中文字符串即可。

### 2.4 服务端派生字段——请勿手写

以下字段由 `questionRowFromRecord`（唯一写入映射，seed 与 admin 导入共用）在写库时计算，**写在文件里没有意义、也不会被信任**：

- `gradingClass` —— 由题型 + `grading.partial` + `blanks.length` + `selfAssess` 推导。
- `stemText` —— `stem` 的纯文本镜像。
- `tagsFlat` —— 即 `tags`。
- Tag / QuestionTag 表 —— 由 `syncTags` 按 `tags` 自动建立。

各题型最终 `gradingClass` 推导表（了解即可，无需填写）：

| 题型 | 基础判分类 | 升级条件 |
| --- | --- | --- |
| single_choice / true_false | `auto_exact` | — |
| multiple_choice | `auto_set` | `grading.partial:true` → `auto_partial` |
| fill_blank | `auto_normalized` | 多于 1 个空 **或** `grading.partial:true` → `auto_partial` |
| numeric / code_output | `auto_normalized` | — |
| ordering / matching | `auto_set` | `grading.partial:true` → `auto_partial` |
| short_answer | `self_assess` | — |
| essay / code_writing | `self_assess` | `selfAssess:false` → `manual_reference` |
| scenario | `composite` | — |
| cloze | `manual_reference` | v1 **不判分** |

### 2.5 章节 / 小节（chapter / section）——数据驱动的浏览树

`chapter`（章节，顶层）与 `section`（小节，二级）是**纯中文显示字符串**，用来在「题库中心」把题目组织成一棵 **章节 → 小节** 浏览树；用户据此勾选范围来发起**刷题**或**模拟面试**，错题本 / 收藏也携带章节小节并可按章节筛选。

- **强烈建议每题都写**：没有 `chapter` 的题会被归到 **「未分类」** 章节；有 `chapter` 但没有 `section` 的题，归到该章节下的「未分类」小节。
- **不是枚举、没有固定清单**：整棵树**完全由导入题目实际声明的 `chapter`/`section` 派生**——你写什么，树上就长出什么（代码从不硬编码章节名/数量）。因此**同一主题务必用词与大小写完全一致**：`JavaScript` 与 `Javascript` 会被当成两个不同章节。
- **约定**：`chapter` = 宽泛主题（如 `JavaScript`、`CSS`、`React`）；`section` = 其下子主题（如 `作用域与闭包`、`Flex 布局`、`Hooks`）。
- **校验（可选、宽容）**：若填，必须是**非空、去空白后 ≤ 80 字**的字符串；否则**仅告警并忽略**该字段（题目照常导入、落入未分类），**绝不因此拒题**。前后空白会被自动 `trim`。
- 它与 §2.1「分类 = `tags[0]`」是**两套并存**的维度：`tags[0]` 供统计 / 首页分类进度；`chapter`/`section` 供浏览树与范围选择。二者可以（也建议）保持语义一致。

**示例**（在任意题型上追加两字段即可）：

```json
{
  "id": "js-closure-003",
  "type": "single_choice",
  "difficulty": "medium",
  "tags": ["JavaScript", "闭包"],
  "chapter": "JavaScript",
  "section": "作用域与闭包",
  "stem": "以下关于闭包的说法正确的是？",
  "options": [
    { "k": "A", "t": "闭包会捕获变量的引用而非快照" },
    { "k": "B", "t": "闭包无法访问外层函数的参数" }
  ],
  "answer": "A"
}
```

---

## 3. 13 种题型详解（含完整示例）

每型下方给出：**必填字段**、**答案键位置**、**专有校验规则**，以及一个**完整可用的示例记录**。所有示例都是零错误的（cloze 仅告警）。

### 3.1 single_choice 单选题
- 必填：`options`（≥2，键 `k` ∈ A–H 且唯一）、`answer`（单个 OptionKey，必须在选项键集合内）。
- 答案键：`answer`。

```json
{
  "id": "js-scope-001",
  "type": "single_choice",
  "difficulty": "easy",
  "tags": ["JavaScript", "作用域"],
  "stem": "以下哪个关键字声明的变量存在块级作用域？",
  "options": [
    { "k": "A", "t": "var" },
    { "k": "B", "t": "let" },
    { "k": "C", "t": "function" },
    { "k": "D", "t": "with" }
  ],
  "answer": "B",
  "explanation": { "explain": "let/const 具块级作用域；var 是函数级作用域。", "pitfalls": ["var 存在变量提升"] }
}
```

### 3.2 multiple_choice 多选题
- 必填：`options`（≥2）、`answer`（OptionKey[]，≥1 个，不重复，全部在选项键集合内）。
- 答案键：`answer`。`grading.partial:true` → 部分正确按比例给分（`auto_partial`）。

```json
{
  "id": "css-position-001",
  "type": "multiple_choice",
  "difficulty": "medium",
  "tags": ["CSS", "定位"],
  "stem": "以下哪些 position 取值会使元素脱离普通文档流？",
  "options": [
    { "k": "A", "t": "static" },
    { "k": "B", "t": "absolute" },
    { "k": "C", "t": "fixed" },
    { "k": "D", "t": "relative" }
  ],
  "answer": ["B", "C"],
  "grading": { "partial": true }
}
```

### 3.3 true_false 判断题
- 必填：`answer`（布尔）。可从 `对/错/是/否/正确/错误/true/false` 强转（告警）。
- 答案键：`answer`。

```json
{
  "id": "browser-eventloop-002",
  "type": "true_false",
  "difficulty": "medium",
  "tags": ["浏览器", "事件循环"],
  "stem": "同一轮事件循环中，所有微任务会在下一个宏任务之前被清空。",
  "answer": true
}
```

### 3.4 fill_blank 填空题
- 必填：`mode`（`"ordered"|"unordered"`）、`blanks`（≥1，每个 `{ accept: Accept[], label? }`）。
- 答案键：`blanks[].accept`。
- **关键规则**：题干中每一处空用 **一段连续 ≥6 个下划线** `______` 表示；**下划线段数必须与 `blanks` 数量完全一致**（否则该题被拒）。多于 1 个空 → 自动 `auto_partial`。
- `Accept` 两种写法：`{ "text": "标准答案" }` 或 `{ "regex": "^\\d+$", "flags": "i" }`（导入期会编译校验正则，编不过则丢弃该候选）。某个空的 `accept` 为空 → 该题被拒。

```json
{
  "id": "net-status-001",
  "type": "fill_blank",
  "difficulty": "easy",
  "tags": ["网络", "HTTP"],
  "stem": "HTTP 状态码 ______ 表示资源永久重定向，______ 表示服务器内部错误。",
  "mode": "unordered",
  "blanks": [
    { "label": "重定向码", "accept": [{ "text": "301" }] },
    { "label": "服务器错误码", "accept": [{ "text": "500" }] }
  ]
}
```

### 3.5 numeric 数值题
- 必填：`value`（有限数）。可选 `unit`、`tolerance: { abs?≥0, rel?≥0 }`。
- 答案键：`value`。

```json
{
  "id": "algo-bigo-001",
  "type": "numeric",
  "difficulty": "medium",
  "tags": ["算法", "复杂度"],
  "stem": "长度为 6 的数组，选择排序在最坏情况下的比较次数 n(n-1)/2 = ?",
  "value": 15,
  "tolerance": { "abs": 0 }
}
```

### 3.6 code_output 输出预测题
- 必填：`expected`（字符串）。可选 `accept`（额外候选，`[]` 合法）、`normalize`（默认**大小写敏感、不折叠空白、保留多行**）。
- 答案键：`expected`（+ `accept`）。

```json
{
  "id": "js-coercion-002",
  "type": "code_output",
  "difficulty": "medium",
  "tags": ["JavaScript", "类型转换"],
  "stem": "预测输出：\nconsole.log([] + {});",
  "expected": "[object Object]"
}
```

### 3.7 ordering 排序题
- 必填：`items`（≥1，每个 `{ id, t }`，`id` 唯一）、`order`（`string[]`）。可选 `orderScoring`（`"position"|"kendall"`）。
- 答案键：`order`。
- **规则**：`order` 必须是 `items` 的 **id 的一个排列**（长度相等、集合相同、无缺漏无重复）。`grading.partial:true` → 部分给分。

```json
{
  "id": "eng-webpack-001",
  "type": "ordering",
  "difficulty": "medium",
  "tags": ["工程化", "构建"],
  "stem": "把 Webpack 的主要阶段按执行顺序排列。",
  "items": [
    { "id": "entry", "t": "确定入口" },
    { "id": "resolve", "t": "解析依赖" },
    { "id": "loader", "t": "loader 转换" },
    { "id": "emit", "t": "输出产物" }
  ],
  "order": ["entry", "resolve", "loader", "emit"]
}
```

### 3.8 matching 匹配题
- 必填：`left`、`right`（各 `{ id, t }[]`）、`pairs`（`[leftId, rightId][]`）。可选 `manyToOne`。
- 答案键：`pairs`。
- **规则**：`pairs` 中每个 `leftId`/`rightId` 都必须在对应侧存在；除非 `manyToOne:true`，否则必须 **1:1**（左右两侧都不得重复使用）。

```json
{
  "id": "react-hooks-002",
  "type": "matching",
  "difficulty": "medium",
  "tags": ["React", "Hooks"],
  "stem": "将 Hook 与其主要用途匹配。",
  "left":  [{ "id": "l1", "t": "useMemo" }, { "id": "l2", "t": "useRef" }, { "id": "l3", "t": "useContext" }],
  "right": [{ "id": "r1", "t": "跨层级取值" }, { "id": "r2", "t": "缓存计算结果" }, { "id": "r3", "t": "持有可变引用" }],
  "pairs": [["l1", "r2"], ["l2", "r3"], ["l3", "r1"]]
}
```

### 3.9 short_answer 简答题
- 必填：`reference`（参考答案；为空**仅告警**仍导入）。可选 `keywords`（命中提示，脱敏时对客户端隐藏）、`selfAssess`。
- 答案键：`reference`。属主观题，**不计入客观正确率**（`self_assess`）。

```json
{
  "id": "vue-diff-001",
  "type": "short_answer",
  "difficulty": "medium",
  "tags": ["Vue", "虚拟DOM"],
  "stem": "简述 Vue 的 diff 算法为何采用同层比较。",
  "reference": "同层比较把复杂度从 O(n^3) 降到 O(n)，配合 key 复用节点。",
  "keywords": ["同层", "key", "复用"]
}
```

### 3.10 essay 问答题
- 必填：`reference`。可选 `rubric`（`{ point, weight }[]` 评分点）、`selfAssess`。
- 答案键：`reference`（+ `rubric`）。`selfAssess:false` → `manual_reference`（需人工/参考对照，不自评）。

```json
{
  "id": "ts-variance-001",
  "type": "essay",
  "difficulty": "hard",
  "tags": ["TypeScript", "类型系统"],
  "stem": "谈谈 TypeScript 中协变与逆变，并举例说明函数参数为何是逆变的。",
  "reference": "协变保持子类型方向，逆变反转……函数参数位置逆变以保证调用安全。",
  "rubric": [
    { "point": "正确定义协变/逆变", "weight": 0.4 },
    { "point": "函数参数逆变举例", "weight": 0.6 }
  ]
}
```

### 3.11 code_writing 编程题
- 必填：`reference`（字符串参考实现）。可选 `lang`、`tests`（`{ desc }[]` 用例描述）、`selfAssess`。
- 答案键：`reference`。`selfAssess:false` → `manual_reference`。

```json
{
  "id": "algo-dedupe-001",
  "type": "code_writing",
  "difficulty": "medium",
  "tags": ["算法", "数组"],
  "stem": "实现一个函数 unique(arr)，返回去重后的新数组（保持首次出现顺序）。",
  "lang": "javascript",
  "reference": "function unique(arr){ return [...new Set(arr)]; }",
  "tests": [{ "desc": "unique([1,1,2,3,3]) => [1,2,3]" }]
}
```

### 3.12 scenario 情景多问题
- 必填：`parts`（≥1 个**叶子题**，每个按其自身题型完整校验）。可给每个 part 加 `points`（该问权重）。
- **规则**：`parts` 内**不得再嵌套 scenario**；每个 part 需带自己的 `type`/`stem` 及该题型必填字段（建议也带 `id`/`difficulty`，否则告警自动补）。整体判分类 = `composite`。

```json
{
  "id": "html-a11y-001",
  "type": "scenario",
  "difficulty": "medium",
  "tags": ["HTML", "可访问性"],
  "stem": "阅读以下表单片段，回答下列两问。",
  "parts": [
    {
      "id": "html-a11y-001-p1", "type": "single_choice", "difficulty": "easy", "tags": ["HTML"],
      "stem": "为输入框关联可点击文字，应使用哪个标签？",
      "options": [{ "k": "A", "t": "<label>" }, { "k": "B", "t": "<span>" }, { "k": "C", "t": "<b>" }],
      "answer": "A", "points": 1
    },
    {
      "id": "html-a11y-001-p2", "type": "true_false", "difficulty": "easy", "tags": ["HTML"],
      "stem": "aria-label 可以替代可见的 <label>。",
      "answer": false, "points": 1
    }
  ]
}
```

### 3.13 cloze 完形填空（v1 保留，不判分）
- 必填：`template`（字符串，占位符如 `[[1]]`）、`blanks`（每个 `{ accept }`）。
- **重要**：cloze 会**永远产生一条告警**「v1 暂不判分」，仅作展示导入，**不自动判分**。评测内容请勿使用 cloze。

```json
{
  "id": "browser-cache-002",
  "type": "cloze",
  "difficulty": "medium",
  "tags": ["浏览器", "缓存"],
  "stem": "根据模板补全缓存相关首部。",
  "template": "强缓存由 [[1]] 控制，协商缓存可用 [[2]] 配合 If-None-Match。",
  "blanks": [
    { "accept": [{ "text": "Cache-Control" }] },
    { "accept": [{ "text": "ETag" }] }
  ]
}
```

---

## 4. 媒体约束（media）

```json
"media": [{ "kind": "image", "src": "data:image/png;base64,iVBORw0KGgo...", "alt": "示意图" }]
```

- **`src` 必须以 `data:image/` 开头**——**内联 data URI，禁止外链**。此约束在 `validate.ts` 与 `mapping.ts`（写入边界不变式）**双重强制**：非 `data:image/*` 的 `src` 会导致导入 / seed **抛错中止**。
- **单张图片 ≤ 512KB**：超限 → 告警并**剥离该图**（题目仍导入）。
- **整个信封图片总量 ≤ 3.5MB**：超限 → 信封级错误，**整包不导入**。图文题多时请**拆分成多个信封**。
- **代码块不要用 media 承载**：由于写入边界要求所有 `media[].src` 均为 `data:image/*`，`kind:"code"` 无法承载纯文本代码 `src`（会抛错）。请把代码**直接写进 `stem`/`explanation` 纯文本**（用 `\n` 换行）；若确需图形化代码，用 `data:image` 截图。

---

## 5. 校验规则汇总 & 唯一性约束

**告警（不阻断，题目照常导入）**：缺 `id`（自动派生）、`difficulty` 非法（回退 medium）、`tags` 非法（置空）、`chapter`/`section` 非法（非空串且 ≤80 字，否则忽略、落入未分类）、单图超 512KB（剥离）、`true_false` 答案被强转、正则编不过（丢候选）、`counts.total` 不符、cloze 不判分、**文件内重复 id**。

**错误（该题被拒；seed/import 要求零拒绝，一旦出现即整批中止）**：`stem` 为空、未知题型、选项 < 2 / 选项键不在 A–H / 键重复、`answer` 不在选项内、多选答案空/重复、填空下划线段数与 blanks 不符 / 某空 accept 为空、numeric value 非有限数、ordering `order` 不是排列、matching pair 引用不存在 / 非 1:1、scenario 无 part / 嵌套 scenario、图片非 `data:image/*`。

**唯一性（最重要）**：
- `Question.id` 是**全局主键**。**同一 id 在文件内或跨文件重复 = 数据丢失**（会静默覆盖/串库）。`validateEnvelope` 只对文件内重复告警（last-wins），但 **seed 装载器与批量导入会把任何重复视为致命错误并中止**——请保证 id 全库唯一。
- 建议 id 命名：`<domain>-<topic>-<seq>`，如 `js-eventloop-001`、`css-flex-003`。
- 选项键仅 `A–H`（最多 8 个选项）。
- 填空每个空对应一段 ≥6 连续下划线，段数 = blanks 数量。

**体量建议**：单个信封 **建议 ≤ 300 题**。原因：(a) admin 导入向导走 Server Action，默认 body 上限约 1MB，题量大易超限——大文件请走 multipart 上传路由或放 `prisma/seed-data/`；(b) 导入落库按批分事务；(c) 图片有 3.5MB 预算。题多请按分类/主题拆成多个信封。

---

## 6. 纯文本渲染

题干、选项、解析等在 UI **按纯文本渲染，没有 Markdown 解析器**：

- 换行用 `\n`（JSON 字符串里写 `\\n`）。
- **不要依赖** `**加粗**`、表格、`#` 标题等 Markdown 语法——会原样显示。
- 代码片段直接用纯文本 + `\n` 换行放进 `stem`/`explanation`。

---

## 7. 如何导入

两条等价路径，最终都经**同一个** `validateEnvelope` 校验、`questionRowFromRecord` 写入映射（保证 seed 与 admin 导入产物一致）：

### A. 内容随发布上线（seed 文件）
把信封 JSON 放进 `prisma/seed-data/`（可放多个 `*.json`，装载器会全部加载），然后：

```bash
npm run db:seed
```

- 装载流程：读文件 → `JSON.parse` → `validateEnvelope` → 逐条 `questionRowFromRecord` → `upsert` 为 **status:published**（立即可练）→ `syncTags`，按每 ~25 条一个事务分批。
- **任一信封 `fileOk=false`、任一记录被拒、或出现重复 id → 立即报错、非零退出**（不会写半批）。告警会打印但不阻断。
- 幂等：可反复运行，按 `id` upsert。

### B. 上线后由管理员增量导入（`/admin/import`）
两阶段 + 审核发布：

```
准备(prepare) → 校验并落 ImportBatch(pending)，不写题
   ↓
确认(confirm) → 服务端重跑校验，upsert 为 in_review + syncTags
   ↓
审核(/admin/review) → 批量发布(bulkPublish) 后才对用户可见
```

- 题量大（数百题 / 含图）时，走 multipart 上传路由 `/api/admin/import/upload`，避免 Server Action body 上限。
- 导入落 `in_review`，**必须再发布**才可见（与 seed 的直接 published 不同）。

---

## 8. 一个完整信封示例（可直接放入 prisma/seed-data/ 试跑）

```json
{
  "format": "byteoffer.qbank",
  "schemaVersion": 1,
  "meta": { "title": "示例小信封", "locale": "zh-CN" },
  "counts": { "total": 2 },
  "questions": [
    {
      "id": "js-eventloop-001",
      "type": "single_choice",
      "difficulty": "medium",
      "tags": ["JavaScript", "事件循环"],
      "stem": "下列哪个 API 的回调属于微任务？",
      "options": [
        { "k": "A", "t": "setTimeout" },
        { "k": "B", "t": "queueMicrotask" },
        { "k": "C", "t": "setInterval" },
        { "k": "D", "t": "requestAnimationFrame" }
      ],
      "answer": "B",
      "explanation": {
        "explain": "queueMicrotask/Promise.then 回调进入微任务队列，早于宏任务。",
        "pitfalls": ["setTimeout(fn,0) 仍是宏任务"]
      }
    },
    {
      "id": "css-flex-001",
      "type": "multiple_choice",
      "difficulty": "easy",
      "tags": ["CSS", "Flex"],
      "stem": "以下哪些是合法的 justify-content 取值？",
      "options": [
        { "k": "A", "t": "flex-start" },
        { "k": "B", "t": "space-between" },
        { "k": "C", "t": "vertical-align" },
        { "k": "D", "t": "center" }
      ],
      "answer": ["A", "B", "D"],
      "grading": { "partial": true }
    }
  ]
}
```
