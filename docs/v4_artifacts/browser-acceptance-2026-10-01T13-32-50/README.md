# W5 浏览器验收产物 · 2026-10-01T13-32-50（赛事路径补齐后复跑）

运行：`node tools/browser-acceptance/harness.mjs`（Chromium 1234 headless，Node v22，本地 PG）
结果：**PASSED** —— 五态 × 9 路由 × 双视口 = 90 张走查截图，0 条非预期控制台错误，
0 缺失标题，0 缺失错误态（失败态），演练 9/9 步通过，演练后统计 API 复核一致
（`sampleCount=4` = 3 种子 + 1 演练局，演练上传显式选择"允许公开展示（PUBLIC）"）。

## 与 07-52-40 复跑的差异（本次为当前代码的权威记录）

复验续轮（赛事公开路径）后的复跑：公开 `/events` 列表与详情现在排除
INTERNAL_ONLY 材料生成的场次（本目录的 FIXTURE 种子赛事无证据关联，保持公开，
路由渲染不受影响）；新增管理端 `GET /api/v1/admin/events(/:id)`（浏览器演练不经过，
语义由后端 W1-9/W1-10 验收覆盖）。

## 权威记录

- `run-manifest.json` —— 全部检查结果与逐路由清单（本目录的索引，勿删）。
- 所有数据均为 FIXTURE 种子或演练产生，写入 `wanxiangqi_w5_*_test` 临时库；
  **与业务库/业务 storage.json 零接触，绝不计入 V07**。

## 入库说明（体积取舍）

按 `.gitignore` 规则（与既往一致），仓库只保留：`run-manifest.json`、本 README、
`drill__01..09`、`filter__*`、`fixture-personal.png`、各态代表性走查截图
（empty/normal 的 home 桌面、stale 的 lineups、fail 的 home）。
其余走查截图保留在运行机本目录，其检查结果已全部记录于 manifest 的 `scenarios[].routes[]`。
