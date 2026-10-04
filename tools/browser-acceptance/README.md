# 浏览器验收工具（v6 · 零安装 CDP 方案）

任务书：`docs/王者万象棋项目转型任务书_v6_阵容分析与新手教学_2026-10-03.md`（A11 等）。
组件测试不能替代浏览器验收；本工具用**纯 Node stdlib 手写 CDP 客户端**驱动真实 Chromium，
不引入 playwright/puppeteer 等任何 npm 依赖。

## 脚本清单（v6 现行）

| 脚本 | 里程碑 | 覆盖 | 产物目录 |
|---|---|---|---|
| `m3-newbie-walkthrough.mjs` | M3-6 | 最小教学闭环走查（首课/首套手册/目录） | `docs/v6_artifacts/m3-*` |
| `m4-newbie-walkthrough.mjs` | M4 | 全量内容集走查（11 课/5 手册/525 实体/12 情境·复盘） | `docs/v6_artifacts/m4-newbie-walkthrough-*` |
| `m4-4-snapshot-stats.mjs` | M4-4 | hokace 真实快照接入后的热度/表现呈现 | `docs/v6_artifacts/m4-4-*` |
| `m4-5-stats-states.mjs` | M4-5 | 统计三态（失败横幅/过期旧版本/小样本）+ A09 列表联动 | `docs/v6_artifacts/m4-5-*` |
| `m5-3-deletion-audit.mjs` | M5-3 | 删除审计 8 维（fs/路由/HTTP 实访/env/包脚本/文档/库表/build） | `docs/v6_artifacts/m5-3-*` |
| `m5-4-browser-acceptance.mjs` | M5-4 | A11 双视口走查（加载/空态/无统计/错误/历史版本/搜索/筛选/收藏/练习/返回） | `docs/v6_artifacts/m5-4-*` |

用法：`node tools/browser-acceptance/<脚本>.mjs`；退出码非 0 = 有断言失败。

前提：

- Node ≥ 22（全局 `WebSocket`）。
- 本地 PG 可用（走查 boot `wanxiangqi_v6dev` 或 `*_test` 隔离库；不可用时如实记 SKIPPED/受阻）。
- Chromium 解析链：`WXQ_CHROME_BIN` → ms-playwright 缓存 `chromium-1234` → `chromium-1208`。
  只使用已缓存的浏览器，绝不触发下载；浏览器 profile 放临时目录，用后清理。

## 栈构造（全部真实后端，不 mock 响应）

- **内容集栈**：`node backend/src/server.js`（`PGDATABASE=wanxiangqi_v6dev`）+ vite dev（`WXQ_API_TARGET` 代理）。
- **空库/种子栈**：`bootAcceptanceStack('<名>_test')`（自 `backend/tests/acceptance/_helpers.mjs`，重建+迁移）。
- **错误栈**：boot 后杀掉后端进程 → `/api` 经 vite 代理必然失败 → 检验 UI 错误态与「重新加载」入口。

## 红线（不可退让）

- **绝不触碰业务库 `wanxiangqi`**：只 boot `wanxiangqi_v6dev` 开发库或 `*_test` 隔离库。
- 任何断言失败都如实进走查记录（非 0 退出码），不静默跳过、不降低断言。
- 种子数据仅用于隔离库走查，绝不写入业务库；内容断言只针对真实构建的内容集。

## 代码结构

- `cdp.mjs` —— CDP 客户端：Chromium 启动（stderr 解析 DevTools ws 端点）、JSON-RPC over WebSocket、
  事件订阅、页面会话（goto/eval/screenshot/setViewport/typeIn/clickText/tabWalk/控制台捕获）。
- 各 `m*-*.mjs` —— 自包含走查编排：起栈 → 步进断言（截图+记录）→ 汇总 JSON + Markdown 留档。

（v2–v5 时期的 harness/scenarios 五态脚本与个人战绩演练已随项目转型退役删除；
本目录现行脚本全部面向 v6 信息架构，见 `docs/v6旧功能删除与数据归档对照表.md`。）
