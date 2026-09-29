# S1 · P0-A 测试隔离整改证据 (2026-09-29)

任务书依据：`docs/真实数据与统计链路整改任务书_v3_2026-09-29.md` §P0-A（V01 雏形）

## 改造内容

### 1. `tools/emulator-watcher/storage.mjs`（核心重构）

| 改动 | 说明 |
|---|---|
| 构造器显式注入 | `StorageEngine({ dataDir, demo })`，`dataDir` 必填，缺失即抛错——从构造上杜绝隐式指向业务文件 |
| 模块导入零副作用 | 删除模块顶层 `mkdirSync`、`export const storage` 单例、import 即读写业务文件的行为；冷启动仅构造内存态不落盘 |
| 原子落盘 | `saveState` 改为 tmp 文件 + `renameSync`，杜绝半写损坏 |
| 删除 fire-and-forget 同步 | 移除 `triggerSync`/`setSyncHandler`（F07 根源之一：异步拒绝被吞） |
| 统计语义收紧（V12 前置） | `availableAt` 缺失且指定 cutoff → 排除（禁回退 matchTime）；指定 mode 时 mode 未知记录排除；窗口改 `[from, to)` |
| 未知属性 NULL 化（F06 前置） | 选手自动注册/核验落库不再造 `rankScore=10000`、`'最强王者'`、`'通用'`、odds=5.0 等默认值 |
| 惰性业务实例 | 新增 `getBusinessStorage()`（`WXQ_DATA_DIR` 可覆盖），仅供服务入口使用 |
| 数据源状态诚实化 | `importRealDatatftData` 不再自行把 src-datatft-platform 标为 ACTIVE |

### 2. 引用方适配

- `tools/emulator-watcher/index.mjs`：`import { storage }` 单例 → `getBusinessStorage()`（S3 将改为 services 注入）
- `backend/src/db.js`：同上；移除 `setSyncHandler` 注册（JSON→PG 自动同步停用，等待 S3 单事务写路径）
- `tools/emulator-watcher/scripts/generate_real_dataset.mjs`（F01 合成源）：加 `WXQ_ALLOW_SYNTHETIC=true` 硬门禁，默认拒绝执行（exit 1）；S2 将封存至 fixtures/

### 3. 测试基建

- `backend/tests/helpers/tmp-store.mjs`：mkdtemp 临时目录 + `createStorageEngine({ dataDir })` 工厂
- `backend/tests/helpers/business-guard.mjs`：套件前后断言业务 storage.json sha256 + 业务 PG 七表计数不变
- `backend/tests/helpers/pg-test.mjs`：测试库强制 `/_test$/` 后缀校验（防误连业务库）
- `frontend/tests/guards/business-assets-guard.setup.mts`：vitest `globalSetup` 业务文件哈希护栏 + `WXQ_DATA_DIR` 沙箱重定向
- 两套 v2 测试全部改为注入临时目录实例（各 5 处 `new StorageEngine()` + `resetToEmpty()` 业务路径调用清零）
- 新增 V12 边界专项测试（availableAt=cutoff 纳入 / matchTime=cutoff 排除 / [from,to) 窗口 / availableAt 缺失不回退）

## 验证记录（2026-09-29 实测）

```
业务 storage.json sha256（S0 基线）: 35a0624425fb19c9cb35f301925318f3744589072f6febf2edc7c9518efe16b9
backend  npm test  → 8/8 pass（含业务护栏通过：文件哈希与业务库七表计数不变）
frontend npx vitest run → 26/26 pass（globalSetup 护栏通过）
frontend npm run build  → vue-tsc + vite build 成功
生成脚本无 env 直跑 → ⛔ 拒绝执行 exit=1，业务文件/库零变更
全部完成后业务 storage.json sha256: 35a0624425fb19c9cb35f301925318f3744589072f6febf2edc7c9518efe16b9 （与基线一致）
```

## 残留说明

- `backend/tests/v2-acceptance-audit.test.mjs` 与前端套件中 F01 用例仍断言 `db.js`/`schema.sql` 存在 —— S3 删除这两个文件时会同步更新该用例（改为断言 migrations/repositories 结构）。
- `index.mjs` 模块级仍持有 `getBusinessStorage()` 读实例（测试只触发 401 拦截，不产生写路径）—— S3 services 注入重构后彻底移除。
