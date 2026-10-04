# database · 结构说明

本目录**不再存放 DDL**。数据库结构的唯一权威来源是版本化迁移：

```
backend/src/migrations/         0001..0009（按 sha256 记入 schema_migrations，防篡改、幂等）
backend/src/migrations-rollback/  0007_rollback_v6_archive_legacy.sql（授权回滚专用，单事务）
```

v1 时代的静态 DDL（schema/enums/seed/views.sql）已随 v2–v5 退役归档至
`docs/archive/legacy-v2-v5/database/`，仅供历史追溯，**不得执行**。

## 迁移概览

| 段 | 迁移 | 内容 |
|---|---|---|
| v2–v4 旧模型 | 0001–0005 | 赛事/选手/对局/证据原件（业务库 `wanxiangqi` 当前停留在此段） |
| v6 内容模型 | 0006 | 课程/手册/资料库/版本/待复核等内容表 |
| v6 归档 | 0007 | 旧业务表**整表迁入** `archive_legacy` schema（不删除）；证据行拆分；两旧来源标 RETIRED |
| v6 来源 | 0008 | 登记官网内容来源 `src-wxq-official` |
| v6 精度 | 0009 | `lineup_snapshots.avg_rank` NUMERIC(4,2)→(5,4)（纯放宽，不随回滚撤销） |

执行方式：`node src/migrate.mjs`（后端启动亦自动执行同一 `runMigrations`）。

## 库与红线

- **业务库 `wanxiangqi`**：0001–0005 现状。向 0009 推进属业务库变更，需明确授权后按
  `docs/v6业务库归档迁移方案_M5-1.md` 执行（备份→隔离演练→前后记录→迁移→可回滚）；
  未授权前 v6 代码只连开发库。
- **开发库 `wanxiangqi_v6dev` / 验收库 `*_test`**：自由重建。验收套件经 `pg-test.mjs`
  强制 `/_test$/` 后缀，业务库零接触。
- `build-v6-content.mjs --recreate` 对业务库**永远拒绝**；业务库写入需
  `--business-db-authorized` 且 `WXQ_AUTHORIZE_BUSINESS_DB=1`（重建仍然拒绝）。
- 0006/0007 一经应用不可修改（sha256 防篡改）；修正走新迁移。
