import type { CSSProperties } from "react";

// ---------- Demo data (ported verbatim from the design prototype) ----------

export interface Opt {
  k: string;
  t: string;
}

export interface Analysis {
  explain: string;
  points: string[];
  pitfalls: string[];
  related: string[];
  ai: string;
}

export interface PracticeQuestion {
  id: string;
  type: string;
  diff: string;
  fav: boolean;
  tags: string[];
  q: string;
  multi: boolean;
  answer: string | string[];
  opts: Opt[];
  ana: Analysis;
}

export const practiceBank: PracticeQuestion[] = [
  {
    id: "p1",
    type: "单选题",
    diff: "中等",
    fav: true,
    tags: ["作用域", "闭包", "事件循环"],
    q: "关于 JavaScript 中的事件循环（Event Loop），以下说法错误的是？",
    multi: false,
    answer: "B",
    opts: [
      { k: "A", t: "JavaScript 是单线程的语言" },
      { k: "B", t: "宏任务（Macro Task）执行优先于微任务（Micro Task）" },
      { k: "C", t: "微任务会在当前宏任务执行完后立即执行" },
      { k: "D", t: "setTimeout(fn, 0) 的回调会在微任务之后执行" },
    ],
    ana: {
      explain:
        "在事件循环中，微任务（Micro Task）优先于宏任务（Macro Task）。执行顺序为：当前执行栈清空 → 微任务队列（全部）→ 宏任务队列（一个）。因此 setTimeout(fn, 0) 属于宏任务，会在微任务之后执行。",
      points: [
        "执行栈（Call Stack）执行同步任务",
        "微任务队列：Promise.then / MutationObserver / queueMicrotask",
        "宏任务队列：setTimeout / setInterval / I/O / UI 渲染等",
        "每次宏任务执行完后，会清空整个微任务队列",
      ],
      pitfalls: [
        "混淆微任务与宏任务的执行优先级",
        "以为 setTimeout(fn, 0) 会立即执行",
        "忽略微任务会在每一轮结束前全部清空",
      ],
      related: ["Promise.then 执行顺序", "async/await 原理", "浏览器渲染流程"],
      ai: "事件循环是 JS 异步机制的核心。理解宏任务与微任务的执行顺序，是高频且真实的考点，建议结合浏览器渲染流程一起理解。",
    },
  },
  {
    id: "p2",
    type: "单选题",
    diff: "简单",
    fav: false,
    tags: ["深拷贝", "引用类型"],
    q: "以下哪个方法可以用来深拷贝一个不含函数与循环引用的纯数据对象？",
    multi: false,
    answer: "C",
    opts: [
      { k: "A", t: "Object.assign({}, obj)" },
      { k: "B", t: "{ ...obj }" },
      { k: "C", t: "JSON.parse(JSON.stringify(obj))" },
      { k: "D", t: "obj.slice()" },
    ],
    ana: {
      explain:
        "JSON.parse(JSON.stringify(obj)) 会先序列化再反序列化，得到一个全新的对象，适用于不含函数、undefined、循环引用与特殊对象的纯数据。Object.assign 与展开运算符只能做浅拷贝。",
      points: [
        "浅拷贝只复制第一层，嵌套对象仍是同一引用",
        "JSON 方法会丢失函数、undefined、Symbol",
        "structuredClone 是更现代的深拷贝方案",
      ],
      pitfalls: ["以为展开运算符是深拷贝", "忽略 JSON 方法会丢失特殊类型"],
      related: ["浅拷贝 vs 深拷贝", "structuredClone API", "引用类型与值类型"],
      ai: "深浅拷贝是面试高频考点。记住“浅拷贝只复制一层”，并了解 JSON 方法的局限与 structuredClone 的优势。",
    },
  },
  {
    id: "p3",
    type: "多选题",
    diff: "中等",
    fav: false,
    tags: ["CSS", "重排", "性能"],
    q: "以下哪些操作会触发浏览器的重排（Reflow）？（多选）",
    multi: true,
    answer: ["A", "B", "D"],
    opts: [
      { k: "A", t: "修改元素的 width / height" },
      { k: "B", t: "读取 offsetTop / clientWidth" },
      { k: "C", t: "仅修改元素的 color" },
      { k: "D", t: "增加或删除 DOM 节点" },
    ],
    ana: {
      explain:
        "重排（Reflow）指几何属性变化导致浏览器重新计算布局。修改 width/height、增删 DOM、以及读取 offsetTop 等布局属性都会触发重排；而仅修改 color 只会触发重绘（Repaint），不涉及布局。",
      points: [
        "重排一定伴随重绘，重绘不一定重排",
        "读取布局属性会强制同步布局（Layout Thrashing）",
        "使用 transform / opacity 可只触发合成，性能更好",
      ],
      pitfalls: ["把重绘误当作重排", "在循环中反复读写布局属性"],
      related: ["重排与重绘", "合成层 Composite", "will-change 优化"],
      ai: "性能优化题的经典。核心是区分布局（Layout）、绘制（Paint）与合成（Composite）三个阶段各自的触发条件。",
    },
  },
];

export const examQ = {
  type: "多选题",
  diff: "中等",
  q: "以下哪些属于 HTTP/2 相比 HTTP/1.1 的改进？（多选）",
  multi: true,
  answer: ["A", "B", "C", "E"],
  opts: [
    { k: "A", t: "多路复用（Multiplexing）" },
    { k: "B", t: "头部压缩（HPACK）" },
    { k: "C", t: "服务器推送（Server Push）" },
    { k: "D", t: "明文传输" },
    { k: "E", t: "请求优先级" },
  ],
};

export interface ListItem {
  id: string;
  type: string;
  diff: string;
  q: string;
  tags: string[];
  wrong: number;
  last: string;
}

export const wrongItems: ListItem[] = [
  { id: "w1", type: "多选题", diff: "中等", q: "关于 Event Loop 的执行顺序，以下说法正确的是？", tags: ["事件循环", "宏任务", "微任务"], wrong: 2, last: "2025-05-19" },
  { id: "w2", type: "单选题", diff: "困难", q: "以下哪个选项会导致 React 组件重复渲染？", tags: ["React", "性能优化", "useEffect"], wrong: 3, last: "2025-05-18" },
  { id: "w3", type: "判断题", diff: "简单", q: "CSS 中的 transform 属性不会触发重排（Reflow）。", tags: ["CSS", "性能", "渲染"], wrong: 1, last: "2025-05-17" },
  { id: "w4", type: "单选题", diff: "中等", q: "HTTP 缓存中，强缓存与协商缓存的核心区别是什么？", tags: ["网络", "HTTP", "缓存"], wrong: 2, last: "2025-05-16" },
  { id: "w5", type: "填空题", diff: "中等", q: "CSS 选择器 .a > .b 表示 ______ 选择器。", tags: ["CSS", "选择器"], wrong: 1, last: "2025-05-15" },
];

export const favItems: ListItem[] = [
  { id: "f1", type: "问答题", diff: "困难", q: "请说明 Vue3 中 ref 与 reactive 的区别及各自的使用场景。", tags: ["Vue", "响应式", "Composition API"], wrong: 0, last: "收藏于 05-19" },
  { id: "f2", type: "单选题", diff: "中等", q: "关于 Promise.all 与 Promise.allSettled 的区别，以下正确的是？", tags: ["异步", "Promise"], wrong: 0, last: "收藏于 05-18" },
  { id: "f3", type: "多选题", diff: "中等", q: "以下哪些方式可以实现元素的水平垂直居中？", tags: ["CSS", "布局", "Flex"], wrong: 0, last: "收藏于 05-17" },
];

export const recentItems: ListItem[] = [
  { id: "r1", type: "多选题", diff: "中等", q: "JavaScript 作用域链与闭包的形成机制", tags: ["作用域", "闭包"], wrong: 0, last: "正确率 80% · 今天 10:23" },
  { id: "r2", type: "单选题", diff: "简单", q: "CSS 盒模型的宽度计算（box-sizing）", tags: ["CSS", "盒模型"], wrong: 0, last: "正确率 100% · 今天 09:41" },
  { id: "r3", type: "判断题", diff: "中等", q: "TypeScript 中 interface 与 type 的差异", tags: ["TypeScript"], wrong: 0, last: "正确率 67% · 昨天 21:15" },
  { id: "r4", type: "单选题", diff: "困难", q: "浏览器从输入 URL 到页面渲染的完整过程", tags: ["浏览器", "网络"], wrong: 0, last: "正确率 50% · 昨天 20:02" },
];

// ---------- Pure helpers (ported from the design's logic) ----------

export interface DiffStyle {
  bg: string;
  c: string;
  dot: string;
}

export function diffStyle(d: string): DiffStyle {
  return (
    (
      {
        简单: { bg: "#EAF7F0", c: "#0E9F6E", dot: "#12B76A" },
        中等: { bg: "#FDF3E7", c: "#B7791F", dot: "#F79009" },
        困难: { bg: "#FCEDEC", c: "#D63C31", dot: "#F04438" },
        回滚: { bg: "#FCEDEC", c: "#D63C31", dot: "#F04438" },
      } as Record<string, DiffStyle>
    )[d] || { bg: "#F1F2F5", c: "#5A6172", dot: "#8A92A2" }
  );
}

export interface Chip {
  label: string;
  style: CSSProperties;
  dot: CSSProperties;
}

export function diffChip(d: string): Chip {
  const s = diffStyle(d);
  return {
    label: d,
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      border: "1px solid var(--line)",
      borderRadius: "7px",
      padding: "4px 9px",
      fontSize: "12px",
      fontWeight: 600,
      color: s.c,
      whiteSpace: "nowrap",
    },
    dot: {
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      background: s.dot,
      flex: "none",
    },
  };
}

export function typeChipStyle(): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid var(--pri-w2)",
    background: "var(--pri-w)",
    color: "var(--pri)",
    borderRadius: "7px",
    padding: "4px 10px",
    fontSize: "12px",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

/** seconds → HH:MM:SS */
export function fmtTime(sec: number): string {
  sec = Math.max(0, sec || 0);
  const h = Math.floor(sec / 3600),
    m = Math.floor((sec % 3600) / 60),
    s = sec % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return p(h) + ":" + p(m) + ":" + p(s);
}
