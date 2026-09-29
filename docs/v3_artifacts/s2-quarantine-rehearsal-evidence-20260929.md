# S2 · P0-B 脚本封存与隔离/回滚工具 — 测试库演练证据

日期：2026-09-29 · 任务书：`docs/真实数据与统计链路整改任务书_v3_2026-09-29.md` §P0-B
结论：**测试库 `wanxiangqi_test` 全流程演练通过（dry-run → execute → 统计对比 → rollback → 计数复原），具备碰业务库（S4）的条件。**

## 一、交付物

| 文件 | 作用 |
|---|---|
| `backend/src/migrations/0001_baseline.sql` | 现 schema.sql 原样基线（`IF NOT EXISTS` 幂等） |
| `backend/src/migrations/0002_v3.sql` | v3 纯 DDL：record_status/synthetic/quarantine_reason 列、版本化唯一约束、data_sources 等 4 新表、去造默认值 |
| `backend/src/migrate.mjs` | `npm run migrate -- --db <库>`：schema_migrations(filename+sha256) 版本化，幂等，篡改（哈希漂移）拒绝 |
| `backend/scripts/quarantine_records.mjs` | 隔离/修正工具：默认 dry-run 出 JSON 清单；`--execute --db X --yes` 单事务（备份→打标→事务内复核）|
| `backend/scripts/rollback_quarantine.mjs` | 按备份表整行还原 + 逐行 sha256 校验，任何不一致中止 |
| `tools/emulator-watcher/fixtures/` | 原两生成脚本封存（原文件已删，历史见 git）：`WXQ_ALLOW_SYNTHETIC=true` 硬门禁、只写 fixtures/data、全量 `synthetic:true`、零 PG 访问 |

## 二、演练过程（发现并修复 3 个缺陷）

演练本身就是工具验收。三次失败→修复，第四次全绿：

1. **备份表名含小数点**：`toISOString().replace(/[-:T]/g,'').slice(0,15)` 残留毫秒点号 →
   `CREATE TABLE quarantine_backup_20260929133232. (` 语法错误。修复：`replace(/[^\d]/g,'').slice(0,14)`。
2. **参数类型推导冲突**：备份 INSERT 里 `$2` 同时被推导为 `row_pk`(varchar) 与 `t.id`(各表类型) →
   `inconsistent types deduced for parameter $2`。修复：拆独立参数 `$2::text` / `$5`。
3. **类别间状态联动扩面（最关键）**：`quarantineTestEvidences` 判据引用 `events.status='QUARANTINED'`——
   该状态由同事务内更早的 UPDATE 设置，导致 dry-run 预测 2 行、execute 实际打标 3 行，第 3 条证据
   **未备份即被修改**（回滚将无法复原）。修复：
   - 判据改为状态无关（`EXISTS (SELECT 1 FROM matches m WHERE m.batch_id = 'audit-' || e.id)`）；
   - execute 增加事务内统一快照 + 逐类别断言 `UPDATE 行数 === 快照行数`，任何漂移即回滚。
   - 事故记录：`quarantine-execute-wanxiangqi_test-20260929133532.json`（保留存档）。

## 三、最终演练结果（修复后）

### dry-run（`quarantine-dryrun-wanxiangqi_test-20260929133951.json`）

| 类别 | 表 | 行数 |
|---|---|---|
| quarantineSeed（F01/F02 合成种子） | matches | 196 |
| quarantineCamp（F03 伪官方同步，未入 PG） | matches | 0 |
| quarantineTestAudits（测试审核记录） | matches | 12 |
| quarantineTestEvents（测试对决连带） | events | 2 |
| quarantineTestEvidences（测试证据连带） | evidences | 3 |
| pendingNoEvidence（无证据→待核验，不认定虚假） | matches | 4 |
| nullFabricatedPlayerRank（F06 造段位清 NULL） | players | 79 |
| nullLineupAvgRankFallback（F09 兜底值清 NULL） | lineup_snapshots | 0 |

有效对局（verified ∧ ACTIVE ∧ 非 synthetic）：**212 → 0（模拟）**

### execute（`quarantine-execute-wanxiangqi_test-20260929134009.json`）

- 单事务提交：备份 **296 行** → `quarantine_backup_20260929134009`（=196+12+4+2+3+79，逐类别快照断言全部一致）
- 打标后实测：matches 208 QUARANTINED+synthetic / 4 PENDING(verified=f) / 有效 0；players 带段位 0；
  events 2 QUARANTINED（1 COMPLETED 未动）；evidences 3 QUARANTINED
- 事务内有效对局复核与 dry-run 预期一致（0=0）方才 COMMIT

### rollback

- 296 行整行还原，**逐行 sha256 校验 296/296 通过**，单事务提交
- 复原后：七表计数回到基线 79/212/3/18/36/3/1；有效对局回 212；players 段位回 79（演练库，
  业务库的清 NULL 在 S4 正式执行）；events 回 `2×AUDITED + 1×COMPLETED`；evidences 回 `3×VERIFIED`；
  QUARANTINED/synthetic 残留 0

## 四、迁移与业务资产核验

- `wanxiangqi_test` 重建自业务库全量 dump（`--no-owner --no-privileges`）→ `npm run migrate` 应用
  0001+0002 → 幂等重跑确认；基线形状与业务库完全一致
- 业务库 `wanxiangqi` 七表计数 79/212/3/18/36/3/1 **未变**；业务 `storage.json`
  sha256 `35a0624425fb19c9cb35f301925318f3744589072f6febf2edc7c9518efe16b9` **未变**
- backend `npm test` 8/8 通过（business-guard ✔）；frontend vitest 26/26 通过（guard ✔）
- fixtures 门禁：无 `WXQ_ALLOW_SYNTHETIC=true` 运行即 exit 1 拒绝；带门禁运行产出 1533 条全
  synthetic 记录且业务文件/库零触碰

## 五、S4 前置状态

- 业务库尚未应用 0002（DDL 纯增量，S3 完成后先上业务库，再执行 S4 隔离）
- 8080 旧进程（内存 67/1337 三态分叉活证据）仍在运行，S4 重启窗口处理
- 隔离工具对业务库执行前置条件全部满足：dry-run 清单可复算、备份可逐行哈希校验、回滚已在测试库演练通过
