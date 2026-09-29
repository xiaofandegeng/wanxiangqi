# fixtures/ · 合成演示数据（v3 P0-B 封存区）

本目录封存原 `scripts/generate_real_dataset.mjs` 与 `scripts/sync_camp_official_matches.mjs`
的演示用途（两个原脚本已删除，历史见 git）。

## 红线（任务书 v3 §P0-B）

1. **只写 `fixtures/data/`**：绝不触碰 `tools/emulator-watcher/data/storage.json`（业务文件）。
2. **零数据库访问**：不连接任何 PostgreSQL，更不直写业务库。
3. **全部合成标记**：每条记录 `synthetic: true`，batchId 一律 `synthetic-` 前缀；
   正式统计口径（verified ∧ ACTIVE ∧ 非 synthetic）永远排除它们。
4. **显式门禁**：需 `WXQ_ALLOW_SYNTHETIC=true` 才能运行，默认拒绝（exit 1）。
5. 名次按剧本编排，仅服务 demo 演示，不代表任何真实历史，不得对外称为真实数据。

## 用法

```bash
WXQ_ALLOW_SYNTHETIC=true node fixtures/generate_demo_fixtures.mjs
```

产物：`fixtures/data/storage.json`（demo 模式 FileRepository 的数据源之一）。
