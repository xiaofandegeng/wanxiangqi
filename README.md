# 王者万象棋 · 真实数据收录与统计工作台 (Wanxiangqi Analytics Platform)

[![Vue 3](https://img.shields.io/badge/Vue-3.5-brightgreen.svg)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-blue.svg)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://typescriptlang.org/)
[![Backend](https://img.shields.io/badge/Backend%20Tests-101%20pass%20%2F%201%20gated%20skip-success.svg)](./docs/v4实施报告_2026-09-30.md)
[![Frontend](https://img.shields.io/badge/Frontend%20Tests-Passing%20(13%2F13)-success.svg)](https://vitest.dev/)
[![Architecture](https://img.shields.io/badge/Architecture-v4%20Delivered-green.svg)](./docs/v4实施报告_2026-09-30.md)

本项目收录《王者万象棋》"王牌对决"模式的**真实对局战绩与第三方阵容汇总**，提供可独立复算的个人统计。v3 整改（2026-09-29）后确立的铁律：

- **PostgreSQL 是唯一权威存储**：版本化迁移、SCD-2 记录版本模型、一切统计从 SQL 直查复算；
- **展示的每一个数字都可追溯**：正式统计只含 `已核验 ∧ ACTIVE ∧ 非合成` 的记录；来源未给的字段如实为 `null`（禁 3.5 兜底、禁"近 7 日"式固定文案）；
- **不做预测、不做下注建议**：v2 的 EV/凯利/胜率推演话术与 mock 历史已全部移除；未知玩家如实显示"未找到该选手"，零样本玩家如实显示 N=0；
- **无真实来源就如实说没有**：官方个人战绩 API 未确认前相关来源标 `UNAVAILABLE`；同步失败保留旧快照并如实报告 FAILED。

v4（2026-10-01）追加：**上传不等于核验**——材料入库一律 PENDING，人工确认才 VERIFIED；所有核验入口统一要求"材料已确认有效 ∧ 原件可恢复"，不得仅凭哈希字符串造证；单人逐局材料与六席赛事校对是两个独立入口，互不冒充。

当前数据状态（业务库实查，2026-10-01，0005 迁移后）：79 位玩家 / 212 条对局（208 条合成/测试批次已隔离、4 条待核验、**0 条有效**）/ 71 条第三方阵容快照（hokace.wiki 2026-10-01 复测 35 条公开，快照版本 v2609/7 日窗口文本如实分列 + datatft 遗留 36 条已隔离）/ 3 条历史哈希-only 材料已标记原件缺失。有效对局为 0 是**如实空态**，不是故障；V07（≥5 条真实个人逐局）因无获准材料仍受阻，见 v4 报告。

---

## 目录

- [系统架构与目录结构](#-系统架构与目录结构)
- [快速上手与运行指南](#-快速上手与运行指南)
- [数据红线与防伪机制](#-数据红线与防伪机制)
- [数据来源注册表](#-数据来源注册表)
- [页面路由一览](#-页面路由一览)
- [验收报告与整改证据](#-验收报告与整改证据)

---

## 🏗 系统架构与目录结构

```
wanxiangqi/
├── backend/                        # 业务后端（formal 模式，PG 唯一权威）
│   ├── src/
│   │   ├── server.js              # 启动 compose：pool → migrate → repository → services
│   │   ├── env.mjs                # 环境装配（formal 下关键变量无默认值，必须显式）
│   │   ├── migrate.mjs            # 版本化迁移执行器（schema_migrations，幂等）
│   │   ├── migrations/            # 0001_baseline … 0005_evidence_originals（原件入库）
│   │   ├── repositories/          # pg-repository（正式）/ file-repository（仅 demo）
│   │   └── services/              # imports（事务导入）/ stats（统一口径）/ sync（来源同步）
│   ├── scripts/
│   │   ├── quarantine_records.mjs # 合成数据隔离（默认 dry-run，--execute 建备份表后打标）
│   │   └── rollback_quarantine.mjs# 隔离回滚（备份表整行还原）
│   └── tests/
│       ├── acceptance/            # v3 验收 V01–V18（测试库 *_test，业务资产零接触）
│       ├── network/               # 联网实测 V14（WXQ_NETWORK_TESTS=1 门控，默认 skip）
│       └── v2-acceptance-audit.test.mjs
│
├── tools/emulator-watcher/         # HTTP 层与外部来源适配器
│   ├── adapters/
│   │   ├── hokace.mjs             # hokace.wiki 阵容快照（Astro 结构，比率 [0,1] + 页面级版本/窗口）
│   │   └── datatft.mjs            # 事件/阵容适配（默认关闭，需显式开启）
│   ├── fixtures/                  # 已封存的合成数据生成脚本（WXQ_ALLOW_SYNTHETIC 硬门禁）
│   └── index.mjs                  # createApiServer({ services, adminToken }) 注入式路由
│
├── tools/browser-acceptance/       # W5 浏览器验收（零安装 CDP，纯 Node stdlib）
│   ├── cdp.mjs                    #   手写 CDP 客户端（缓存 Chromium，无 npm 依赖）
│   └── harness.mjs / scenarios.mjs#   五态×路由×双视口走查 + 上传核验全流程演练
│
├── frontend/                       # Vue 3 + TypeScript 前端
│   ├── src/
│   │   ├── api/                   # REST 客户端（无 mock 回退；AbortController 取消过期请求）
│   │   ├── views/                 # event-today / player-profile / roster / lineups / archive …
│   │   └── stores/                # API 加载（mock 底座已随 v3 退役）
│   └── tests/                     # vitest（含 v16 未知玩家无默认数值断言）
│
└── docs/
    ├── 下一阶段任务书_v4_真实个人战绩与浏览器验收_2026-09-30.md  # v4 依据
    ├── v4实施报告_2026-09-30.md   # N01–N11 证据 + 五项独立状态（V07 如实受阻）
    ├── v3整改实施报告_2026-09-29.md                   # F01–F09 对照 + V01–V18 逐项证据
    ├── v3_artifacts/              # 隔离 dry-run/备份、来源实测、终态 health 等全部证据
    └── v4_artifacts/              # 浏览器五态截图/演练、联网实测、业务库迁移存证
```

---

## 🚀 快速上手与运行指南

### 1. 后端（formal 模式）

`backend/.env`（不入库；`cp .env.example .env` 后填写）：

```
WXQ_APP_MODE=formal
PGHOST=127.0.0.1 PGPORT=5432 PGDATABASE=wanxiangqi PGUSER=… PGPASSWORD=…
ADMIN_TOKEN=<随机长串>        # 管理写接口 Bearer 鉴权
```

```bash
cd backend
npm run migrate   # 执行版本化迁移（幂等）
npm start         # http://127.0.0.1:8080（formal 下 PG 不可用即拒绝启动）
```

测试（零联网、零业务资产接触）：

```bash
npm test                          # 101 项：v3 验收 V01–V18 + v4 W1/W2 套件 + v2 回归；业务文件哈希与业务库计数前后不变
WXQ_NETWORK_TESTS=1 npm test      # 额外执行 V14 联网实测（hokace.wiki 真实页面，失败即 FAILED 不掩饰）
```

### 2. 前端

```bash
cd frontend
npm run dev       # http://localhost:5173（代理 /api → 127.0.0.1:8080，可用 WXQ_API_TARGET 覆盖）
npm test          # 13 项（含 v16 未知玩家无默认数值、v19 单人导入页）
npm run build     # vue-tsc 类型检查 + 生产构建
```

### 3. 浏览器验收（W5）

```bash
node tools/browser-acceptance/harness.mjs   # 五态×9 路由×双视口 + 上传核验全流程演练（零安装 CDP）
```

---

## 🔒 数据红线与防伪机制

1. **有效记录口径（统计唯一入口）**：
   `verified ∧ record_status='ACTIVE' ∧ 非synthetic ∧ final_rank∈[1,6] ∧ match_time < cutoff ∧ available_at ≤ cutoff`。
   N=0 时比率/均名一律 `null`（禁 `||` 兜底）；`coverageNote` 如实写"已收录 N 局"。
2. **双时间截点防未来泄漏**：比赛早但录入晚（`available_at > cutoff`）的记录在截点时刻统计中剔除；更正/撤销走 SCD-2 版本区间，过去截点永远取当时版本（V13）。
3. **核验是唯一提真路径，且要求原件可恢复**：导入接口忽略入参 `verified`（一律 PENDING）；`POST /api/v1/admin/matches/:id/verify` 强制证据链四段校验（证据不存在 → 已隔离 → 未确认(PENDING) → 原件缺失均 422/409 拒绝），并以**实际核验时刻**建立新可见版本（SCD-2）——旧版本原样封存，过去截点统计不被回写。
4. **上传不等于核验（v4）**：`POST /api/v1/admin/evidences/upload` 原件入库返回 PENDING（服务端 SHA256 + 魔数嗅探 + 双重限额）；人工 `POST /:id/verify` 才 VERIFIED，且**材料核验事务内检查原件可恢复**——缺失即 422 `ORIGINAL_MISSING`、状态保持不变（无原件的材料不可能被标记有效）；`GET /:id/content` 鉴权回原件字节。旧哈希-only 材料标记 `[ORIGINAL_MISSING]`，不伪造原件。
5. **管理写接口 Bearer 鉴权**：`/api/v1/admin/*` 未授权 401；token 只走环境变量，不落仓库。
6. **同步失败不撒谎**：上游结构变化/断网 → sync_jobs 记 FAILED、旧快照逐字节保留、lastSuccessAt 不动（V15）；同步成功走**单事务**（快照替换 + 存证 + 成功台账 + 来源推进一致提交，中途失败整体回滚）；原始响应全文落 `raw_materials`（正文 + 实测字节数 + 内容寻址 storage_uri，`GET /api/v1/admin/raw-materials(/:id)` 可离线复核）；hokace 页面公布的快照版本/窗口文本如实提取，精确时间边界未知保持 null。
7. **来源登记制**：记录引用未登记来源 → 400 拒绝，零写入（杜绝再造 `batch-datatft-s1-seed` 式无主数据）。
8. **允许使用范围强制执行（v4 复验整改）**：`INTERNAL_ONLY` 材料关联的对局在公开统计、公开流水、选手详情统一排除，仅授权管理端可见（`GET /api/v1/admin/matches`）；单人导入页范围是显式选择项（默认最保守的仅内部验收），放行记录的 `usageScope` 对外如实标注。

---

## 📡 数据来源注册表（data_sources）

| 来源 | 类型 | 状态 | 说明 |
|---|---|---|---|
| src-manual-review | MANUAL_REVIEW | ACTIVE | 截图/材料人工核验录入（唯一提真路径） |
| src-hokace-wiki | THIRD_PARTY_AGGREGATE | READY | 阵容汇总快照，2026-10-01 复测同步 35 条（比率 [0,1] 原样入库；快照版本/窗口文本如实分列，采集时间≠数据更新时间） |
| src-datatft-platform | BIG_DATA_AGGREGATE | UNCONFIGURED | API 契约/授权未核实，同步默认 409 |
| src-kohcamp-official | OFFICIAL_MATCH_FEED | UNCONFIGURED | 无真实战绩请求路径，禁止宣称官方同步 |
| src-official-helper | OFFICIAL_API | UNAVAILABLE | 官方个人战绩工具存在，但批量开放 API 未确认 |

---

## 📑 页面路由一览

* `/`：王牌对决赛程（日期/模式筛选 + 已收录场次表格，数据仅来自真实 stats）
* `/events/:id`：赛事详情（席位与已核验流水）
* `/players/:id`：选手档案（已核验统计、天梯/赛事积分分列、未知字段如实 '—'/未采集）
* `/roster`：选手榜（基于已核验战绩复算登顶率/前三率，支持下钻流水）
* `/lineups` `/lineups/:id`：阵容环境大盘（仅公开 READY/ACTIVE 来源的 ACTIVE 快照，**按来源分组陈列、组内独立排序**——不同来源样本口径互不可比；缺失字段 null）
* `/archive`：历史对战记录档案（增量巡检，无新增如实提示）
* `/admin/verify`：证据存证与人工核验工作台（原件上传入库 PENDING→VERIFIED、SHA-256 存证、6 席位赛事校对）
* `/admin/personal-import`：单人真实战绩逐局导入（上传原件→身份核对→候选 PENDING→逐条放行；不要求补齐六席；允许使用范围显式选择，仅内部材料不进公开面）
* `/models/backtest`：回测基线（暂无正式验证结果，展示真实空态）

---

## 📄 验收报告与整改证据

- 👉 **[v4 实施报告 (2026-09-30)](./docs/v4实施报告_2026-09-30.md)**：N01–N11 逐项证据、五项独立状态（人工材料工程完成 / V07 如实受阻 0 条 / 自动同步未实现 / hokace 联网实测 SUCCESS / 浏览器五态 PASSED）、V07 核对表模板、业务库 0005 迁移存证
- [v3 整改实施报告 (2026-09-29)](./docs/v3整改实施报告_2026-09-29.md)：F01–F09 逐项对照、隔离 dry-run/备份/回滚证据、来源接入报告、V01–V18 逐项状态、独立复算 SQL
- [v4 任务书 (2026-09-30)](./docs/下一阶段任务书_v4_真实个人战绩与浏览器验收_2026-09-30.md) · [v3 整改任务书 (2026-09-29)](./docs/真实数据与统计链路整改任务书_v3_2026-09-29.md)
- 历史文档：[v2 验收报告](./docs/王者万象棋数据站_v2验收报告_2026-09-27.md) · [v2 返工关闭报告](./docs/王者万象棋数据站_v2返工关闭与重新验收报告_2026-09-27.md)
