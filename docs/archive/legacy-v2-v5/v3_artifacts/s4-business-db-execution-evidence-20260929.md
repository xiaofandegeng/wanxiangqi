# S4 证据存档 · 业务库隔离执行 + 正式模式重启 8080（P0-B 执行 / F04 闭环）

日期：2026-09-29 · 阶段：S4（任务书 §P0-B、§6-2、F04；数据隔离业务库执行已获用户授权）

## 1. 执行前基线

| 资产 | 状态 |
|---|---|
| 业务库 wanxiangqi | 79 玩家 / 212 对局 / 3 events / 36 lineups / 3 evidences / 18 participants / 1 import_batch |
| 0002_v3 迁移 | 已应用（S3，sha256 已入 schema_migrations） |
| 旧 8080 进程 | PID 1519（9/28 09:51 启动，旧版 server.js），health 自报 `67 players / 1337 matches / 1 event`（`storageMode=EMPTY_COLD_START`） |
| 磁盘 storage.json | 6/6 测试残留（S1 前遗留；不覆盖不删除，正式模式不读取） |

## 2. F04 根因记录（三态分叉，如实记录）

**现象**：同一“事实库”在三个位置给出三组互不相等的数字——

| 位置 | players | matches | 数据去向 |
|---|---|---|---|
| 旧 8080 进程内存 | 67 | 1337 | **永久丢失**（仅存在于进程内存，9/28 启动后积累，从未落库；进程停止即消失，不找回） |
| 磁盘 storage.json | 6 | 6 | 测试污染残留（audit-evt-audit-test-01），留档不使用 |
| PostgreSQL | 79 | 212 | 唯一权威（本轮隔离后有效 0） |

**根因**（旧架构）：① 服务进程写 JSON 文件、脚本直写文件+PG、测试重写文件——三条互不同步写路径；② `triggerSync` fire-and-forget 且 async rejection 被吞；③ `hydrateFromPostgres` 空表不覆盖旧数组；④ 启动无环境断言、PG 失败静默降级文件引擎。

**修复**（S3 已交付）：仓储/服务层单一写路径（PgRepository 唯一权威）；HTTP 层注入式服务；formal 模式环境断言 + PG 失败 `process.exit(1)` 拒绝降级；测试全部绑定临时目录。旧进程内存数据按任务书要求如实记录丢失，不伪造找回。

## 3. 隔离执行（备份表 `quarantine_backup_20260929140453`）

dry-run 清单：`docs/v3_artifacts/quarantine-dryrun-wanxiangqi-20260929140437.json`（先审阅后执行）
执行报告：`docs/v3_artifacts/quarantine-execute-wanxiangqi-20260929140453.json`

| 类别 | 表 | 行数 | 动作 |
|---|---|---|---|
| quarantineSeed（batch-datatft-s1-seed） | matches | 196 | QUARANTINED + synthetic=TRUE |
| quarantineCamp | matches | 0 | （业务库无 camp 批次） |
| quarantineTestAudits（audit-evt-%） | matches | 12 | QUARANTINED + synthetic=TRUE |
| quarantineTestEvents | events | 2 | status=QUARANTINED |
| quarantineTestEvidences | evidences | 3 | status=QUARANTINED |
| pendingNoEvidence | matches | 4 | verified=FALSE + PENDING（不认定虚假，待补证据链） |
| nullFabricatedPlayerRank | players | 79 | rank_score/rank_text → NULL（F06） |
| nullLineupAvgRankFallback | lineups | 0 | （业务库无 3.5 兜底行） |

单事务提交；备份 296 行（含行级 sha256）；执行中各类别 rowCount 与事务内快照逐一断言通过。

## 4. 执行后核验（psql 直查）

| 检查 | 结果 |
|---|---|
| matches 状态分布 | 208 QUARANTINED(synthetic=t) + 4 PENDING(verified=f) = 212 ✓ |
| 有效对局（verified∧ACTIVE∧非synthetic） | **0** ✓ |
| players rank_score/rank_text 残留 | 0 行 ✓ |
| events 状态 | 1 COMPLETED（真实赛事场次保留）+ 2 QUARANTINED ✓ |
| evidences 状态 | 3 QUARANTINED ✓ |
| 备份表 | 296 行 / 4 表 ✓ |

## 5. 正式模式重启 8080（PID 48664）

- `backend/.env`（gitignore:26 覆盖，mode 600）：WXQ_APP_MODE=formal、PGDATABASE=wanxiangqi、ADMIN_TOKEN=随机生成 32 字符（未入仓库/日志/本档）、WXQ_ENABLE_DATATFT=0
- 启动链：env 断言 → PG 连接 → 迁移（全部最新）→ PgRepository → services → listen 8080

### F04 闭环：health = SQL 直查

| 指标 | /api/v1/health | SQL 直查 |
|---|---|---|
| players | 79 | 79 ✓ |
| matches | 212 | 212 ✓ |
| effectiveMatches | 0 | 0 ✓ |
| events | 3 | 3（其中 1 非 QUARANTINED）✓ |
| lineups | 36 | 36 ✓ |
| evidences | 3 | 3（其中 0 非 QUARANTINED）✓ |

### 全站真实空态

- `GET /api/v1/players`：79 行全部 sampleCount=0、winRate/top3Rate/avgRank=null、coverageNote=“已收录 0 局”、qualityStatus=ZERO_SAMPLE_NULL
- `GET /api/v1/matches`（默认 ACTIVE）：total=0
- `GET /api/v1/events`：仅 1 场真实 COMPLETED 场次
- 阵容快照 36 条保留（真实第三方同步所得，未受隔离影响）

### 同步诚实性实测（V15 现场）

授权触发 `POST /admin/sources/src-hokace-wiki/sync` → **真实网络请求**（2.4s）→ 页面解析失败（“非阵容页面或结构已变更”）→ 如实 FAILED：
- sync_jobs 落库 1 行 FAILED（fetched 0 / failed 1 / errorSummary 全文）
- 旧 36 条快照完整保留（失败不清空）
- 响应 code=1 + 明确错误信息，不伪装成功
- **实测发现**：hokace 源页面结构与解析器不匹配（S6 适配器治理输入；V14 验收受阻点）

## 6. 回滚待命

`node scripts/rollback_quarantine.mjs --db wanxiangqi --backup-table quarantine_backup_20260929140453 --yes`
（流程已在测试库 S2 演练通过：296 行全量还原 + 行级 sha256 校验 296/296；业务库保留待命，未执行）

## 7. 交付物与状态

- 本档：`docs/v3_artifacts/s4-business-db-execution-evidence-20260929.md`
- 旧进程 health 快照：`docs/v3_artifacts/s4-old-8080-health-before-restart-20260929.json`
- dry-run / execute JSON：见 §3
- 后续：S5 双实现等价性测试 → S6 适配器治理（含 hokace 结构变更排查）→ S7 前端去虚构 → S8 验收
