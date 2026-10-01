# W5 · 浏览器验收（零安装 CDP 方案）

任务书：`docs/下一阶段任务书_v4_真实个人战绩与浏览器验收_2026-09-30.md` §W5。
组件测试不能替代浏览器验收；本工具用**纯 Node stdlib 手写 CDP 客户端**驱动真实 Chromium，
不引入 playwright/puppeteer 等任何 npm 依赖。

## 用法

```bash
node tools/browser-acceptance/harness.mjs                       # 全量：五态 × 9 路由 × 双视口 + 全流程演练
node tools/browser-acceptance/harness.mjs --only normal,stale   # 只跑指定场景
node tools/browser-acceptance/harness.mjs --manual              # 无可用 Chromium 时输出手工清单（如实标注未执行）
WXQ_CHROME_BIN=/path/to/chrome node tools/browser-acceptance/harness.mjs  # 显式指定浏览器
```

前提：

- Node ≥ 22（全局 `WebSocket`）；harness 启动时校验，低版本可用 `--experimental-websocket`。
- 本地 PG 可用（与后端验收套件同口径；不可用时场景记 SKIPPED，不假装通过）。
- Chromium 解析链：`WXQ_CHROME_BIN` → ms-playwright 缓存 `chromium-1234` → `chromium-1208` → 手工清单降级。
  只使用已缓存的浏览器，绝不触发下载；浏览器 profile 放临时目录，用后清理，不碰开发者浏览器配置。

## 五态构造（全部真实后端，不 mock 响应）

| 场景 | 构造 | 断言要点 |
|---|---|---|
| empty | 全新 `*_test` 库零种子 | 空态呈现「暂无」，null 不变 0；「资源不存在」类报错按预期归类 |
| normal | FIXTURE 种子（6 选手×3 局 + 赛事 + 阵容快照） | 指标/来源/详情跳转；附全流程演练 |
| filter | 复用正常栈，走真实 UI 筛选 | 搜索过滤行数下降、无匹配空态 ≠ 失败、archive 口径切换 |
| stale | 9 天前 `updated_at` 快照 + FAILED sync_job + 来源 last_error | 「已过期」标识、快照版本 v2609/窗口文本分列 |
| fail | 栈启动后杀掉后端 → vite 代理 500 | 公开页明确错误呈现；管理页无凭证呈 token 面板（未发起请求） |

每个场景独立临时库 `wanxiangqi_w5_<场景>_test`，boot 自 `backend/tests/acceptance/_helpers.mjs`。

## 全流程演练（normal 场景内）

token 配置 → UI 真实上传 FIXTURE 水印 PNG（`DOM.setFileInputFiles` + change 事件，非伪造 XHR）→
确认材料有效（PENDING→VERIFIED）→ 身份核对 → 填候选（datetime-local/名次）→ 提交 PENDING →
确认核验放行 → `GET /api/v1/players/:id/stats` 复核 sampleCount=4（3 种子 + 1 演练，小样本警示如实展示）。
每步截图 `drill__NN-*.png`，结果逐步进 manifest。

## 产物

`docs/v4_artifacts/browser-acceptance-<ts>/`：

- `run-manifest.json` —— 权威记录：逐路由截图清单、控制台异常（区分 expected）、
  heading/错误态/横向溢出/对比度检查、演练逐步结果、汇总状态（PASSED / COMPLETED_WITH_ISSUES / FAILED）。
- `<场景>__<路由>__<视口>.png` —— 90 张走查截图（5 态 × 9 路由 × 桌面 1440×900/移动 390×844）。
- `drill__NN-*.png` —— 演练逐步截图。
- `fixture-personal.png` —— 演练用 FIXTURE 水印图（纯 stdlib 编码 PNG）。

入库策略：manifest + 演练截图 + 各态代表性截图提交；其余 PNG 由 `.gitignore` 排除（体积），
完整产物保留在运行机。见产物目录内 README。

## 红线（不可退让）

- **绝不触碰业务 storage.json / 业务库**：只 boot `*_test` 库（V01 同口径）。
- **fixtures 一律 FIXTURE 标注，绝不计入 V07**：演练数字（sampleCount=4 等）是工程验证，不是真实战绩。
- 任何场景失败都如实进 manifest（COMPLETED_WITH_ISSUES / FAILED），不静默跳过、不降低断言。
- 截图只含 FIXTURE 数据与 UI 文案，不含任何真实个人材料（公开报告只放脱敏截图）。

## 代码结构

- `cdp.mjs` —— CDP 客户端：Chromium 启动（stderr 解析 DevTools ws 端点）、JSON-RPC over WebSocket、
  事件订阅、页面会话（navigate/eval/screenshot/viewport/file 注入/Tab 键走查/控制台捕获）。
- `scenarios.mjs` —— FIXTURE PNG 编码（CRC32+IHDR+IDAT，5×7 点阵水印）、种子数据、
  路由定义与单路由健康检查（heading/错误态/横向溢出/对比度抽查）、走查与交互检查。
- `harness.mjs` —— 编排：boot 栈 → vite dev（`WXQ_API_TARGET` 代理）→ 五态执行 → 演练 → 汇总落盘。
