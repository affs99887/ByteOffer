"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  practiceBank,
  examQ,
  wrongItems,
  favItems,
  recentItems,
  diffStyle,
  diffChip,
  typeChipStyle,
  fmtTime,
} from "@/lib/data";
import { computeThemeVars, type ThemeMode } from "@/lib/theme";

const css = (o: CSSProperties): CSSProperties => o;

export type ScreenKey =
  | "home"
  | "practice"
  | "interview"
  | "wrongbook"
  | "favorites"
  | "stats"
  | "settings";

export interface AppState {
  screen: ScreenKey;
  // practice
  pIndex: number;
  pNoBase: number;
  pSelected: Record<string, string | string[]>;
  pFav: Record<string, boolean>;
  pShowAnalysis: boolean;
  // exam
  examRemain: number | null;
  examIndex: number;
  examAns: Record<number, string[]>;
  examMarked: number[];
  examAnswered: number[];
  examSubmitted: boolean;
  // wrongbook
  wbTab: string;
  wbPage: number;
  wbFav: Record<string, boolean>;
  // settings
  setGoal: number;
  remind: boolean;
  // practice filters
  pfTypes: Record<string, boolean>;
  pfDiff: string;
  pfTags: Record<string, boolean>;
  pfCompany: boolean;
  // shell / theme
  layout: "sidebar" | "top";
  sbTheme: ThemeMode;
  appTheme: ThemeMode;
  primaryColor: string[];
  showArt: boolean;
  mobileNav: boolean;
  collapsed: boolean;
}

const INITIAL: AppState = {
  screen: "home",
  pIndex: 0,
  pNoBase: 12,
  pSelected: { p1: "D" },
  pFav: { p1: true },
  pShowAnalysis: false,
  examRemain: null,
  examIndex: 14,
  examAns: { 14: ["A", "B", "C", "E"] },
  examMarked: [4, 9, 17],
  examAnswered: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 19],
  examSubmitted: false,
  wbTab: "错题本",
  wbPage: 1,
  wbFav: {},
  setGoal: 30,
  remind: true,
  pfTypes: { 单选题: true, 多选题: true, 判断题: true, 填空题: true, 问答题: true },
  pfDiff: "中等",
  pfTags: {},
  pfCompany: false,
  layout: "sidebar",
  sbTheme: "dark",
  appTheme: "light",
  primaryColor: ["#2D5BFF", "#1E45E0", "#4E74FF", "#EAEEFF"],
  showArt: true,
  mobileNav: false,
  collapsed: false,
};

interface Actions {
  go(k: ScreenKey): void;
  toggleLayout(): void;
  toggleTheme(): void;
  toggleAppTheme(): void;
  toggleCollapse(): void;
  openNav(): void;
  closeNav(): void;
  pSelect(k: string, multi: boolean, id: string): void;
  pToggleFav(id: string): void;
  pNext(): void;
  pToggleAna(): void;
  examToggle(k: string): void;
  examGo(i: number): void;
  examStep(d: number): void;
  examMark(): void;
  examSubmit(): void;
  examReset(): void;
  wbSetTab(t: string): void;
  wbGo(n: number): void;
  toggleFav(id: string): void;
  toggleType(t: string): void;
  setDiff(d: string): void;
  toggleTag(t: string): void;
  toggleCompany(): void;
  resetFilters(): void;
}

function bubbleStyle(state: AppState, i: number): CSSProperties {
  const base: CSSProperties = {
    width: "34px",
    height: "34px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontFamily: "'JetBrains Mono',ui-monospace,monospace",
    fontWeight: 600,
    cursor: "pointer",
    boxSizing: "border-box",
    transition: "all .12s",
  };
  if (i === state.examIndex)
    return { ...base, background: "var(--pri)", color: "#fff", border: "1.5px solid var(--pri)", boxShadow: "0 0 0 3px var(--pri-w)" };
  if (state.examMarked.includes(i))
    return { ...base, background: "#FDF3E7", color: "#B7791F", border: "1.5px solid #F5B45A" };
  if (state.examAnswered.includes(i))
    return { ...base, background: "var(--pri-w)", color: "var(--pri-a)", border: "1.5px solid var(--pri-w2)" };
  return { ...base, background: "var(--surface)", color: "#98A2B3", border: "1px solid var(--line)" };
}

function computeVals(state: AppState, a: Actions) {
  const cur = state.screen;
  const layout = state.layout;
  const sbTheme = state.sbTheme;
  const activeKey =
    cur === "wrongbook" || cur === "favorites"
      ? state.wbTab === "收藏夹"
        ? "favorites"
        : "wrongbook"
      : cur;
  const mk = (k: ScreenKey) => ({
    active: activeKey === k,
    inactive: activeKey !== k,
    go: () => a.go(k),
  });
  const nav = {
    home: mk("home"),
    practice: mk("practice"),
    interview: mk("interview"),
    wrongbook: mk("wrongbook"),
    favorites: mk("favorites"),
    stats: mk("stats"),
    settings: mk("settings"),
  };
  const meta = (
    {
      home: { n: "01", t: "首页 · 仪表盘" },
      practice: { n: "02", t: "刷题练习" },
      interview: { n: "03", t: "模拟面试 · 考试模式" },
      wrongbook: { n: "04", t: "错题本 · 收藏夹" },
      favorites: { n: "05", t: "错题本 · 收藏夹" },
      stats: { n: "07", t: "数据统计" },
      settings: { n: "08", t: "设置" },
    } as Record<ScreenKey, { n: string; t: string }>
  )[cur];

  // ---------- practice ----------
  const bank = practiceBank;
  const q = bank[state.pIndex % bank.length];
  const sel = state.pSelected[q.id];
  const selRow = (s: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "13px",
    padding: "15px 17px",
    borderRadius: "10px",
    cursor: "pointer",
    border: s ? "1.5px solid var(--pri)" : "1.5px solid var(--line)",
    background: s ? "var(--pri-w)" : "var(--surface)",
    transition: "all .12s",
  });
  const markSty = (s: boolean): CSSProperties =>
    q.multi
      ? {
          width: "20px",
          height: "20px",
          borderRadius: "6px",
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: s ? "none" : "2px solid #C7CEDA",
          background: s ? "var(--pri)" : "var(--surface)",
          transition: "all .1s",
        }
      : {
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          flex: "none",
          boxSizing: "border-box",
          border: s ? "6px solid var(--pri)" : "2px solid #C7CEDA",
          transition: "all .1s",
        };
  const pOpts = q.opts.map((o) => {
    const s = q.multi
      ? Array.isArray(sel) && sel.includes(o.k)
      : sel === o.k;
    return {
      k: o.k,
      t: o.t,
      sel: s,
      onClick: () => a.pSelect(o.k, q.multi, q.id),
      rowStyle: selRow(s),
      markStyle: markSty(s),
      showCheck: q.multi && s,
    };
  });
  const yourAns = q.multi
    ? Array.isArray(sel) && sel.length
      ? sel.join("、")
      : "未作答"
    : (sel as string) || "未作答";
  const correctAns = Array.isArray(q.answer) ? q.answer.join("、") : q.answer;
  const pAnsRight = q.multi
    ? Array.isArray(sel) &&
      sel.slice().sort().join("") ===
        (q.answer as string[]).slice().sort().join("")
    : sel === q.answer;

  const pPct = Math.round(((state.pNoBase + state.pIndex) / 30) * 100);

  // ---------- exam ----------
  const idx = state.examIndex;
  const esel = state.examAns[idx] || [];
  const eRow = (s: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "13px",
    padding: "14px 16px",
    borderRadius: "10px",
    cursor: "pointer",
    border: s ? "1.5px solid var(--pri)" : "1.5px solid var(--line)",
    background: s ? "var(--pri-w)" : "var(--surface)",
    transition: "all .12s",
  });
  const eMark = (s: boolean): CSSProperties => ({
    width: "20px",
    height: "20px",
    borderRadius: "6px",
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: s ? "none" : "2px solid #C7CEDA",
    background: s ? "var(--pri)" : "var(--surface)",
    transition: "all .1s",
  });
  const eOpts = examQ.opts.map((o) => {
    const s = esel.includes(o.k);
    return {
      k: o.k,
      t: o.t,
      sel: s,
      onClick: () => a.examToggle(o.k),
      rowStyle: eRow(s),
      markStyle: eMark(s),
    };
  });
  const bub = (arr: number[]) =>
    arr.map((n) => ({ n, st: bubbleStyle(state, n - 1), go: () => a.examGo(n - 1) }));

  // ---------- wrongbook / favorites ----------
  const list =
    state.wbTab === "收藏夹"
      ? favItems
      : state.wbTab === "最近练习"
        ? recentItems
        : wrongItems;
  const wbList = list.map((it) => ({
    ...it,
    diffS: diffStyle(it.diff),
    diffChip: diffChip(it.diff),
    typeChip: typeChipStyle(),
    fav: !!state.wbFav[it.id],
    favInv: !state.wbFav[it.id],
    onFav: () => a.toggleFav(it.id),
    meta:
      state.wbTab === "错题本"
        ? "错误 " + it.wrong + " 次 · 上次错误 " + it.last
        : it.last,
  }));
  const wbTabGo = (t: string) => () => a.wbSetTab(t);
  const pgBase: CSSProperties = {
    minWidth: "34px",
    height: "34px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: "13px",
    cursor: "pointer",
    transition: "all .1s",
  };
  const pages = [1, 2, 3, 4, 5].map((n) => ({
    n,
    active: state.wbPage === n,
    go: () => a.wbGo(n),
    style:
      state.wbPage === n
        ? {
            ...pgBase,
            background: "var(--pri)",
            color: "#fff",
            border: "1px solid var(--pri)",
            fontWeight: 700,
          }
        : {
            ...pgBase,
            background: "var(--surface)",
            color: "var(--ink2)",
            border: "1px solid var(--line)",
            fontWeight: 600,
          },
  }));

  return {
    showArt: state.showArt,
    nav,
    topNo: meta.n,
    topTitle: meta.t,
    layoutSidebar: layout === "sidebar",
    layoutTop: layout === "top",
    themeDark: sbTheme === "dark",
    themeLight: sbTheme === "light",
    toggleLayout: a.toggleLayout,
    toggleTheme: a.toggleTheme,
    appThemeDark: state.appTheme === "dark",
    appThemeLight: state.appTheme === "light",
    toggleAppTheme: a.toggleAppTheme,
    asideMod:
      layout === "top"
        ? "bo-aside-hidden"
        : state.collapsed
          ? "bo-aside-collapsed"
          : "",
    toggleCollapse: a.toggleCollapse,
    mobileNav: state.mobileNav,
    openNav: a.openNav,
    closeNav: a.closeNav,
    drawerOpenCls: state.mobileNav ? "bo-drawer open" : "bo-drawer",
    layoutLabel: layout === "sidebar" ? "侧边栏" : "顶部导航",
    sbLabel: sbTheme === "dark" ? "深色" : "浅色",
    appLabel: state.appTheme === "dark" ? "深色" : "浅色",
    mobileItems: (
      [
        ["home", "首页"],
        ["practice", "刷题"],
        ["interview", "模拟面试"],
        ["wrongbook", "错题本"],
        ["favorites", "收藏夹"],
        ["stats", "数据统计"],
        ["settings", "设置"],
      ] as [ScreenKey, string][]
    ).map(([k, label]) => {
      const on = activeKey === k;
      return {
        label,
        go: () => {
          a.go(k);
          a.closeNav();
        },
        rowStyle: css({
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "11px 12px",
          borderRadius: "9px",
          cursor: "pointer",
          fontSize: "14.5px",
          fontWeight: on ? 700 : 500,
          color: on ? "var(--pri)" : "var(--ink)",
          background: on ? "var(--pri-w)" : "transparent",
        }),
        bar: css({
          width: "3px",
          height: "16px",
          borderRadius: "2px",
          background: on ? "var(--pri)" : "transparent",
          flex: "none",
        }),
      };
    }),
    isHome: cur === "home",
    isPractice: cur === "practice",
    isExam: cur === "interview",
    isWrong: cur === "wrongbook" || cur === "favorites",
    isStats: cur === "stats",
    isSettings: cur === "settings",

    // practice
    pQ: q,
    pOpts,
    pIsMulti: q.multi,
    pNo: state.pNoBase + state.pIndex,
    pTotal: 30,
    pProgress: pPct + "%",
    pBarStyle: css({
      width: pPct + "%",
      height: "100%",
      background: "var(--pri)",
      borderRadius: "6px",
      transition: "width .3s",
    }),
    pFav: !!state.pFav[q.id],
    pFavInv: !state.pFav[q.id],
    pShowAna: state.pShowAnalysis,
    pAnaPoints: q.ana.points.map((t, i) => ({ i: i + 1, t })),
    pAna: q.ana,
    pYourAns: yourAns,
    pCorrect: correctAns,
    pDiffS: diffStyle(q.diff),
    pDiffChip: diffChip(q.diff),
    pTypeChip: typeChipStyle(),
    pToggleFav: () => a.pToggleFav(q.id),
    pNext: a.pNext,
    pToggleAna: a.pToggleAna,
    pShowAnaInv: !state.pShowAnalysis,
    pIsMultiInv: !q.multi,
    pAnsRight,
    pAnsWrong: !pAnsRight,
    pfTypeList: ["单选题", "多选题", "判断题", "填空题", "问答题"].map((t) => {
      const on = !!state.pfTypes[t];
      return {
        k: t,
        on,
        go: () => a.toggleType(t),
        box: css({
          width: "17px",
          height: "17px",
          borderRadius: "5px",
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: on ? "none" : "1.6px solid #CAD1DE",
          background: on ? "var(--pri)" : "var(--surface)",
          transition: "all .1s",
        }),
      };
    }),
    pfDiffs: [
      { k: "简单", dot: "#12B76A" },
      { k: "中等", dot: "#F79009" },
      { k: "困难", dot: "#F04438" },
    ].map((d) => {
      const on = state.pfDiff === d.k;
      return {
        k: d.k,
        dot: d.dot,
        on,
        go: () => a.setDiff(d.k),
        dotStyle: css({
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: d.dot,
          flex: "none",
        }),
        style: css({
          display: "flex",
          alignItems: "center",
          gap: "9px",
          padding: "9px 11px",
          borderRadius: "8px",
          cursor: "pointer",
          border: on ? "1.5px solid var(--pri)" : "1.5px solid var(--line)",
          background: on ? "var(--pri-w)" : "var(--surface)",
          transition: "all .1s",
        }),
      };
    }),
    pfTagList: ["作用域", "闭包", "原型链", "事件循环", "异步"].map((t) => {
      const on = !!state.pfTags[t];
      return {
        k: t,
        on,
        go: () => a.toggleTag(t),
        style: css({
          fontSize: "12.5px",
          fontWeight: 500,
          padding: "6px 12px",
          borderRadius: "7px",
          cursor: "pointer",
          border: on ? "1px solid var(--pri)" : "1px solid var(--line)",
          background: on ? "var(--pri-w)" : "var(--surface)",
          color: on ? "var(--pri)" : "#5A6172",
          transition: "all .1s",
        }),
      };
    }),
    pfCompanyOn: state.pfCompany,
    pfCompanyGo: () => a.toggleCompany(),
    pfCompanyBox: css({
      width: "17px",
      height: "17px",
      borderRadius: "50%",
      flex: "none",
      boxSizing: "border-box",
      border: state.pfCompany ? "5px solid var(--pri)" : "1.6px solid #CAD1DE",
      transition: "all .1s",
    }),
    resetFiltersDo: () => a.resetFilters(),

    // exam
    examTime: fmtTime(state.examRemain == null ? 5316 : state.examRemain),
    examLow: state.examRemain != null && state.examRemain < 600,
    examNo: idx + 1,
    examTotal: 30,
    examQ,
    eOpts,
    examDiffS: diffStyle(examQ.diff),
    examDiffChip: diffChip(examQ.diff),
    examTypeChip: typeChipStyle(),
    examMarkedCur: state.examMarked.includes(idx),
    examAnsweredCount: state.examAnswered.length,
    examSubmitted: state.examSubmitted,
    examSubmittedInv: !state.examSubmitted,
    examMarkedCurInv: !state.examMarked.includes(idx),
    bubbles1: bub([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
    bubbles2: bub([16, 17, 18, 19, 20]),
    bubbles3: bub([21, 22, 23, 24, 25]),
    bubbles4: bub([26, 27, 28, 29, 30]),
    examMark: a.examMark,
    examPrev: () => a.examStep(-1),
    examNext: () => a.examStep(1),
    examSubmitDo: a.examSubmit,
    examResetDo: a.examReset,

    // wrongbook
    wbTab: state.wbTab,
    wbList,
    wbPage: state.wbPage,
    pages,
    wbGo错题本: wbTabGo("错题本"),
    wbGo收藏夹: wbTabGo("收藏夹"),
    wbGo最近: wbTabGo("最近练习"),
    wbIsWrong: state.wbTab === "错题本",
    wbIsFav: state.wbTab === "收藏夹",
    wbIsRecent: state.wbTab === "最近练习",
    wbIsWrongInv: state.wbTab !== "错题本",
    wbIsFavInv: state.wbTab !== "收藏夹",
    wbIsRecentInv: state.wbTab !== "最近练习",
  };
}

export type Vals = ReturnType<typeof computeVals>;

const Ctx = createContext<Vals | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const patch = useCallback(
    (p: Partial<AppState> | ((s: AppState) => Partial<AppState>)) =>
      setState((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) })),
    [],
  );

  // exam countdown timer (ports componentDidMount interval + localStorage)
  useEffect(() => {
    let r = 5316;
    try {
      const s = localStorage.getItem("fe_exam_remain");
      if (s != null) r = Math.max(0, parseInt(s, 10) || 0);
    } catch {}
    setState((st) => ({ ...st, examRemain: r }));
    const timer = setInterval(() => {
      const st = stateRef.current;
      if (st.screen === "interview" && !st.examSubmitted) {
        setState((s) => {
          const nr = Math.max(0, (s.examRemain == null ? 5316 : s.examRemain) - 1);
          try {
            localStorage.setItem("fe_exam_remain", String(nr));
          } catch {}
          return { ...s, examRemain: nr };
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const actions = useMemo<Actions>(
    () => ({
      go: (k) =>
        patch(() => {
          const st: Partial<AppState> = { screen: k };
          if (k === "wrongbook") st.wbTab = "错题本";
          if (k === "favorites") st.wbTab = "收藏夹";
          return st;
        }),
      toggleLayout: () =>
        patch((s) => ({ layout: s.layout === "sidebar" ? "top" : "sidebar" })),
      toggleTheme: () =>
        patch((s) => ({ sbTheme: s.sbTheme === "dark" ? "light" : "dark" })),
      toggleAppTheme: () =>
        patch((s) => ({ appTheme: s.appTheme === "dark" ? "light" : "dark" })),
      toggleCollapse: () => patch((s) => ({ collapsed: !s.collapsed })),
      openNav: () => patch({ mobileNav: true }),
      closeNav: () => patch({ mobileNav: false }),
      pSelect: (k, multi, id) =>
        patch((s) => {
          const curSel = s.pSelected[id];
          let v: string | string[];
          if (multi) {
            const arr = Array.isArray(curSel) ? curSel.slice() : [];
            const i = arr.indexOf(k);
            if (i >= 0) arr.splice(i, 1);
            else arr.push(k);
            v = arr;
          } else {
            v = k;
          }
          return { pSelected: { ...s.pSelected, [id]: v } };
        }),
      pToggleFav: (id) =>
        patch((s) => ({ pFav: { ...s.pFav, [id]: !s.pFav[id] } })),
      pNext: () =>
        patch((s) => ({ pIndex: s.pIndex + 1, pShowAnalysis: false })),
      pToggleAna: () => patch((s) => ({ pShowAnalysis: !s.pShowAnalysis })),
      examToggle: (k) =>
        patch((s) => {
          const i2 = s.examIndex;
          const curA = s.examAns[i2];
          const arr = Array.isArray(curA) ? curA.slice() : [];
          const i = arr.indexOf(k);
          if (i >= 0) arr.splice(i, 1);
          else arr.push(k);
          const ans = { ...s.examAns, [i2]: arr };
          const answered = s.examAnswered.includes(i2)
            ? s.examAnswered
            : [...s.examAnswered, i2];
          return { examAns: ans, examAnswered: answered };
        }),
      examGo: (i) => patch({ examIndex: i }),
      examStep: (d) =>
        patch((s) => ({ examIndex: Math.min(29, Math.max(0, s.examIndex + d)) })),
      examMark: () =>
        patch((s) => {
          const i2 = s.examIndex;
          const m = s.examMarked.slice();
          const i = m.indexOf(i2);
          if (i >= 0) m.splice(i, 1);
          else m.push(i2);
          return { examMarked: m };
        }),
      examSubmit: () => patch({ examSubmitted: true }),
      examReset: () => {
        const r = 5316;
        try {
          localStorage.setItem("fe_exam_remain", String(r));
        } catch {}
        patch({ examSubmitted: false, examRemain: r, examIndex: 0 });
      },
      wbSetTab: (t) => patch({ wbTab: t, wbPage: 1 }),
      wbGo: (n) => patch({ wbPage: n }),
      toggleFav: (id) =>
        patch((s) => ({ wbFav: { ...s.wbFav, [id]: !s.wbFav[id] } })),
      toggleType: (t) =>
        patch((s) => ({ pfTypes: { ...s.pfTypes, [t]: !s.pfTypes[t] } })),
      setDiff: (d) => patch({ pfDiff: d }),
      toggleTag: (t) =>
        patch((s) => ({ pfTags: { ...s.pfTags, [t]: !s.pfTags[t] } })),
      toggleCompany: () => patch((s) => ({ pfCompany: !s.pfCompany })),
      resetFilters: () =>
        patch({
          pfTypes: { 单选题: true, 多选题: true, 判断题: true, 填空题: true, 问答题: true },
          pfDiff: "中等",
          pfTags: {},
          pfCompany: false,
        }),
    }),
    [patch],
  );

  const vals = useMemo(() => computeVals(state, actions), [state, actions]);

  const themeVars = useMemo(
    () => computeThemeVars(state.primaryColor, state.sbTheme, state.appTheme),
    [state.primaryColor, state.sbTheme, state.appTheme],
  );

  return (
    <Ctx.Provider value={vals}>
      <div
        className="bo-th"
        style={{
          ...(themeVars as unknown as CSSProperties),
          display: "flex",
          height: "100vh",
          width: "100%",
          overflow: "hidden",
          color: "var(--ink)",
          fontSize: "14px",
        }}
      >
        {children}
      </div>
    </Ctx.Provider>
  );
}

export function useApp(): Vals {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}
