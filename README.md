# ByteOffer · 前端面试刷题系统

ByteOffer 是一套面向前端工程师的面试刷题系统（Interview · OS）。本仓库是根据 Claude Design 中的
`前端面试刷题系统.dc.html` 设计稿，逐像素还原实现的 **Next.js (App Router) + React 19 + TypeScript** 应用。

## 功能模块

| 模块 | 说明 |
| --- | --- |
| 首页 / 仪表盘 | KPI 概览、分类进度、活跃度折线图、连续打卡 |
| 刷题练习 | 单选 / 多选作答、即时解析（考点 / 易错点 / 关联知识 / AI 点评）、题型·难度·标签筛选 |
| 模拟面试 | 考试模式：倒计时、答题卡、标记、交卷与成绩结算 |
| 错题本 / 收藏夹 | 错题、收藏、最近练习三个标签页，分页浏览 |
| 数据统计 | 刷题量、正确率、趋势图与分类掌握度 |
| 设置 | 布局、主题、目标与提醒等偏好 |

## 设计还原

- **双布局**：侧边栏 / 顶部导航，可在头部一键切换。
- **三套主题维度**：侧边栏深浅色、整体深浅色、主色（均由 `lib/theme.ts` 以 CSS 变量驱动）。
- **可折叠侧边栏 + 移动端抽屉**，与设计稿一致的动效（`app/globals.css`）。
- 字体：Space Grotesk / JetBrains Mono / Noto Sans SC。

所有视觉均使用设计稿中的内联样式与 CSS 变量还原，未引入 UI 框架，保证与原型一致。

## 技术栈

- Next.js 16 (App Router) · React 19 · TypeScript（strict）
- 纯 CSS 变量主题系统（无 Tailwind），单页客户端渲染的应用外壳

## 目录结构

```
app/
  layout.tsx        # 根布局、字体、全局样式
  globals.css       # 设计稿 <style> 还原（动画 / 响应式 / 滚动条 / 主题过渡）
  page.tsx          # 应用入口：AppProvider + Sidebar + MainArea + MobileDrawer
components/
  sidebar.tsx       # 侧边栏（深/浅色）
  headers.tsx       # 侧边栏布局头部 & 顶部导航头部
  mobile-drawer.tsx # 移动端抽屉
  main-area.tsx     # 主区域：头部切换 + 屏幕路由
  count-up.tsx      # 数字滚动动画组件
  screens/          # 六个屏幕：home / practice / exam / wrongbook / stats / settings
lib/
  app-context.tsx   # 全局状态机 + 派生值（renderVals 移植）
  theme.ts          # 主题 CSS 变量计算（applyTheme 移植）
  data.ts           # 演示数据与纯函数辅助
```

## 本地运行

```bash
npm install
npm run dev      # http://localhost:3000
```

生产构建：

```bash
npm run build && npm start
```
