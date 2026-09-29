# S3 证据存档 · P1-A/B：迁移版本化 + PG 唯一权威（仓储/服务层/HTTP 注入重构）

日期：2026-09-29 · 阶段：S3（任务书 P1-A、P1-B、§4 F04/F07）

## 1. 交付物清单

| 类别 | 文件 | 说明 |
|---|---|---|
| 迁移体系 | `backend/src/migrations/0001_baseline.sql` | 基线（原 schema.sql 全量 IF NOT EXISTS，幂等） |
| | `backend/src/migrations/0002_v3.sql` | v3 结构迁移（纯 DDL，与数据修正分离） |
| | `backend/src/migrate.mjs` | `schema_migrations`(filename+sha256) 记录、篡改拒绝、独立事务、CLI（`npm run migrate [-- --db <库>] [--list]`）+ `runMigrations(client)` 供 server.js 复用 |
| 环境层 | `backend/src/env.mjs` + `backend/.env.example` | `WXQ_APP_MODE=formal\|demo`；formal 下 PGDATABASE/PGUSER/ADMIN_TOKEN 缺失即拒绝启动（无默认值）；手写 .env 解析（已有环境变量不覆盖） |
| 仓储层 | `backend/src/repositories/pg-repository.mjs` | 正式模式唯一权威仓储：可见版本 CTE（SCD-2 截点取版）、有效记录过滤（verified ∧ ACTIVE ∧ 非 synthetic ∧ 名次 1–6）、importMatches 按 record_key FOR UPDATE 版本归并、confirmSlotAudit 五步事务（sha256 证据复用、players 仅按 id upsert、matches 以 `ev:<evidenceId>:<slot>` 为键更正=supersede+新版） |
| | `backend/src/repositories/file-repository.mjs` | demo 仓储：包装注入式 StorageEngine（复用 stats-core 语义） |
| 服务层 | `backend/src/services/{stats,imports,sync,index}.mjs` | 统计服务（非法参数 400）、导入服务（入参 verified 一律忽略→false+PENDING）、同步服务（sync_jobs 全记录 + raw_materials 快照哈希 + 失败保留旧快照） |
| 共享语义 | `tools/emulator-watcher/stats-core.mjs` | 纯函数统计口径唯一事实源（JS 侧）：双时间截点、[from,to)、SCD-2 版本选择、N=0→null、coverageNote/smallSample；PG 侧 SQL 以等价性测试锁死（V18，S5 交付） |
| HTTP 层 | `tools/emulator-watcher/index.mjs` | `createApiServer({ services, adminToken })` 注入；无参自建 demo 兜底（两套测试 import 兼容）；新增 `/api/v1/ready`、`/api/v1/admin/matches/:id/verify`（V17）、`/api/v1/admin/sync-jobs`；删除 `/api/v1/matches` 伪造 `src-kohcamp-official` 来源标签；`/admin/` 命名空间整体 Bearer 鉴权 |
| 入口 | `backend/src/server.js` | formal compose：env 断言 → pool（失败=process.exit(1)，拒绝降级）→ 迁移 → PgRepository → services → listen；SIGINT/SIGTERM 优雅关停 |
| 退役 | ~~`backend/src/db.js`~~、~~`backend/src/schema.sql`~~ | 双写同步层删除（F04/F07 根因）；F01 测试断言二者不得复活 |

## 2. 测试与构建

| 项 | 结果 |
|---|---|
| `backend npm test` | 8/8 通过（业务资产护栏前后一致） |
| `frontend npx vitest run` | 26/26 通过（F01 已随 v3 结构重写：断言 migrations/repositories/services 存在且 db.js/schema.sql 已删除） |
| `frontend npm run build`（vue-tsc） | 通过 |
| 业务 storage.json | 测试前后 sha256 不变（前端 business-assets-guard 输出确认） |

## 3. 业务库 DDL 应用（S4 前置硬依赖）

- 应用前快照：`docs/v3_artifacts/s3-business-db-schema-before-0002-20260929.sql`（pg_dump --schema-only，350 行）
- 执行：`PGDATABASE=wanxiangqi npm run migrate` → 0001 + 0002 均新应用（sha256 已入 schema_migrations）
- 应用后核验（psql 直查）：
  - `uq_player_match_time` 已删除；`uq_matches_record_key_revision` / `uq_matches_record_key_current`（partial unique index）已建立；
  - matches 212 行全量携带 DDL 默认（record_status='ACTIVE'、synthetic=FALSE、record_key 全 NULL——数据修正属 S4 隔离工具，DDL 与数据修正分离）；
  - players 造默认值（rank_score=10000/'最强王者' 等 column_default）全部清除；
  - data_sources 5 行种子就位（manual-review=ACTIVE、hokace=READY、datatft/kohcamp=UNCONFIGURED、official-helper=UNAVAILABLE）。

## 4. 正式模式端到端冒烟（测试库 wanxiangqi_test，端口 18080）

`WXQ_APP_MODE=formal PGDATABASE=wanxiangqi_test ADMIN_TOKEN=<冒烟专用> node src/server.js`

| 端点 | 结果 |
|---|---|
| `GET /api/v1/ready` | 200 `READY`（mode=formal） |
| `GET /api/v1/health` | 200，storage=pg，counts=79/212/212/3/36/3 与 SQL 直查一致 |
| `GET /api/v1/players` | 200；ladder/tournament 字段如实 null（推导已移除） |
| `GET /api/v1/players/:id/stats?cutoff=not-a-date` | **400** `参数 cutoff [not-a-date] 不是有效的 ISO 日期格式`（field=cutoff） |
| `?from>to` | **400** `参数 from 不得晚于 to` |
| `?cutoff=2020-01-01` | 200，sampleCount=0、winRate=null、coverageNote=“已收录 0 局” |
| `POST /api/v1/admin/imports`（无 token） | 401 |
| `GET /api/v1/admin/sync-jobs`（无 token） | 401（见 §5 缺陷修复） |
| `POST /api/v1/admin/sources/src-kohcamp-official/sync`（带 token） | 400 UNCONFIGURED（不伪装成功） |

## 5. 冒烟发现缺陷与修复（本阶段 1 项）

| # | 缺陷 | 修复 |
|---|---|---|
| 1 | 管理鉴权中间件仅覆盖非 GET：`GET /api/v1/admin/sync-jobs`、`GET /api/v1/admin/imports/:id` 无 token 可读——同步任务历史/导入批次含内部运营细节（错误消息、游标），违反“公开接口不暴露内部错误详情” | `index.mjs` 鉴权改为 `/api/v1/admin/` 命名空间整体覆盖（含 GET）；前端 `requestApi` 本就对全部请求附 Bearer，无破坏；复测无 token 401 / 带 token 200 |

## 6. S4 前置条件核对

- [x] 业务库已具备 record_status/synthetic/quarantine_reason 列（隔离工具依赖）
- [x] quarantine 工具已在测试库完成 dry-run → execute → rollback 全流程演练（S2 存档）
- [x] 新 server.js 正式模式已在异端口（18080）对测试库冒烟通过
- [x] 迁移幂等可重跑（server.js 启动即跑，0001/0002 已记录 sha256）
- [ ] 业务库数据隔离执行（196 合成 + 12 假证据审核 + 4 无证据导入 → QUARANTINED/PENDING）
- [ ] 8080 旧进程替换重启（先异端口对照，再切换）

## 7. 遗留到后续阶段

- V18 双实现等价性 fixtures 测试（S5 统一统计口径阶段交付，SQL 与 stats-core JS 逐条对拍）
- 适配器治理（hokace 百分比契约/null 语义、datatft 推导移除+SIGN_SECRET 入 env、来源注册表报告）→ S6
- 前端去虚构（mock 退役、预测话术关闭）→ S7
