// lib/qbank/seed.ts
// Built-in sample envelope: one question of each of the 13 types (§3.3 real JSON examples).
// Doubles as the downloadable author template.

import { buildEnvelope } from "./serialize";
import type {
  ClozeQ,
  CodeOutputQ,
  CodeWritingQ,
  EssayQ,
  FillBlankQ,
  MatchingQ,
  MultipleChoiceQ,
  NumericQ,
  OrderingQ,
  QBankEnvelope,
  QuestionRecord,
  ScenarioQ,
  ShortAnswerQ,
  SingleChoiceQ,
  TrueFalseQ,
} from "./types";

const singleChoice: SingleChoiceQ = {
  id: "js-eventloop-001",
  type: "single_choice",
  difficulty: "medium",
  tags: ["事件循环"],
  stem: "关于事件循环，以下说法错误的是？",
  options: [
    { k: "A", t: "JS 是单线程" },
    { k: "B", t: "宏任务优先于微任务" },
    { k: "C", t: "微任务在当前宏任务后执行" },
  ],
  answer: "B",
};

const multipleChoice: MultipleChoiceQ = {
  id: "http2-001",
  type: "multiple_choice",
  difficulty: "medium",
  tags: ["HTTP"],
  stem: "HTTP/2 相比 1.1 的改进有哪些？",
  options: [
    { k: "A", t: "多路复用" },
    { k: "B", t: "头部压缩" },
    { k: "C", t: "服务器推送" },
    { k: "D", t: "明文传输" },
    { k: "E", t: "请求优先级" },
  ],
  answer: ["A", "B", "C", "E"],
  grading: { partial: true },
};

const trueFalse: TrueFalseQ = {
  id: "css-transform-tf",
  type: "true_false",
  difficulty: "easy",
  tags: ["CSS"],
  stem: "CSS 的 transform 属性不会触发重排。",
  answer: true,
};

const fillBlank: FillBlankQ = {
  id: "css-combinator-fill",
  type: "fill_blank",
  difficulty: "medium",
  tags: ["CSS选择器"],
  stem: "选择器 .a > .b 表示 ______ 选择器；.a .b 表示 ______ 选择器。",
  mode: "ordered",
  normalize: { synonyms: [["子", "子元素", "直接子代"]] },
  blanks: [
    { accept: [{ text: "子" }, { text: "子元素" }, { regex: "^直接子(元素|代)?$" }] },
    { accept: [{ text: "后代" }, { text: "后代元素" }] },
  ],
};

const numeric: NumericQ = {
  id: "byte-kb",
  type: "numeric",
  difficulty: "easy",
  tags: ["计算机基础"],
  stem: "1 KiB 等于多少字节？",
  value: 1024,
  unit: "字节",
  tolerance: { abs: 0 },
};

const codeOutput: CodeOutputQ = {
  id: "js-hoisting-out",
  type: "code_output",
  difficulty: "medium",
  tags: ["作用域"],
  stem: "console.log(typeof null) 输出？",
  expected: "object",
  normalize: { caseInsensitive: false },
  accept: [],
};

const ordering: OrderingQ = {
  id: "render-pipeline-order",
  type: "ordering",
  difficulty: "hard",
  tags: ["浏览器渲染"],
  stem: "将浏览器渲染流水线阶段按执行顺序排列：",
  items: [
    { id: "style", t: "样式计算" },
    { id: "layout", t: "布局" },
    { id: "paint", t: "绘制" },
    { id: "composite", t: "合成" },
  ],
  order: ["style", "layout", "paint", "composite"],
  grading: { partial: true },
  orderScoring: "kendall",
};

const matching: MatchingQ = {
  id: "http-status-match",
  type: "matching",
  difficulty: "medium",
  tags: ["HTTP"],
  stem: "将状态码与含义配对：",
  left: [
    { id: "l1", t: "301" },
    { id: "l2", t: "304" },
    { id: "l3", t: "404" },
  ],
  right: [
    { id: "r1", t: "永久重定向" },
    { id: "r2", t: "未修改" },
    { id: "r3", t: "未找到" },
  ],
  pairs: [
    ["l1", "r1"],
    ["l2", "r2"],
    ["l3", "r3"],
  ],
  grading: { partial: true },
};

const shortAnswer: ShortAnswerQ = {
  id: "debounce-throttle-sa",
  type: "short_answer",
  difficulty: "medium",
  tags: ["性能"],
  stem: "简述防抖与节流的区别。",
  reference:
    "防抖：事件触发后延迟执行，期间再次触发则重新计时；节流：固定窗口内最多执行一次。",
  keywords: ["防抖重新计时", "节流固定频率"],
  selfAssess: true,
};

const essay: EssayQ = {
  id: "vue3-ref-reactive",
  type: "essay",
  difficulty: "hard",
  tags: ["Vue"],
  stem: "阐述 Vue3 中 ref 与 reactive 的区别及使用场景。",
  reference: "ref 包裹任意值（含原始类型），通过 .value 访问……",
  rubric: [
    { point: "ref 适用原始类型", weight: 2 },
    { point: "reactive 适用对象", weight: 2 },
    { point: "给出选型建议", weight: 1 },
  ],
  selfAssess: true,
};

const codeWriting: CodeWritingQ = {
  id: "deepclone-coding",
  type: "code_writing",
  difficulty: "hard",
  tags: ["JS"],
  stem: "手写 deepClone，支持循环引用。",
  lang: "javascript",
  reference: "function deepClone(o, map = new WeakMap()) { /* … */ }",
  tests: [{ desc: "循环引用不栈溢出" }],
  selfAssess: true,
};

const scenario: ScenarioQ = {
  id: "closure-scenario",
  type: "scenario",
  difficulty: "hard",
  tags: ["闭包"],
  stem: "阅读代码：for(var i=0;i<3;i++) setTimeout(()=>console.log(i))",
  parts: [
    {
      id: "closure-scenario.1",
      type: "code_output",
      difficulty: "hard",
      tags: [],
      stem: "输出什么？",
      expected: "3 3 3",
      points: 1,
    },
    {
      id: "closure-scenario.2",
      type: "short_answer",
      difficulty: "hard",
      tags: [],
      stem: "为什么？如何修正？",
      reference: "var 无块级作用域……用 let 或 IIFE。",
      keywords: ["let 块级作用域"],
      selfAssess: true,
      points: 1,
    },
  ],
};

const cloze: ClozeQ = {
  id: "promise-states-cloze",
  type: "cloze",
  difficulty: "easy",
  tags: ["Promise"],
  stem: "Promise 有 [[1]]、[[2]]、[[3]] 三种状态。",
  template: "Promise 有 [[1]]、[[2]]、[[3]] 三种状态。",
  blanks: [
    { accept: [{ text: "pending" }] },
    { accept: [{ text: "fulfilled" }] },
    { accept: [{ text: "rejected" }] },
  ],
};

export const sampleQuestions: QuestionRecord[] = [
  singleChoice,
  multipleChoice,
  trueFalse,
  fillBlank,
  numeric,
  codeOutput,
  ordering,
  matching,
  shortAnswer,
  essay,
  codeWriting,
  scenario,
  cloze,
];

export const sampleEnvelope: QBankEnvelope = buildEnvelope(
  sampleQuestions,
  { title: "ByteOffer 样例题库（13 类型模板）", locale: "zh-CN", author: "ByteOffer" },
  "2026-07-05T09:12:00.000Z",
);
