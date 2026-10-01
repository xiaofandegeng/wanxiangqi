# W5 浏览器验收产物 · 2026-10-01T07-04-00

运行：`node tools/browser-acceptance/harness.mjs`（Chromium 1234 headless，Node v22，本地 PG）
结果：**PASSED** —— 五态 × 9 路由 × 双视口 = 90 张走查截图，0 条非预期控制台错误，
0 缺失标题，0 缺失错误态（失败态），演练 9/9 步通过，演练后统计 API 复核一致。

## 权威记录

- `run-manifest.json` —— 全部检查结果与逐路由清单（本目录的索引，勿删）。
- 所有数据均为 FIXTURE 种子或演练产生，写入 `wanxiangqi_w5_*_test` 临时库；
  **与业务库/业务 storage.json 零接触，绝不计入 V07**。

## 入库说明（体积取舍）

本目录共 103 个文件约 11MB。按 `.gitignore` 规则，仓库只保留：

- `run-manifest.json`、本 README；
- `drill__01..09` 全流程演练截图（上传→确认材料→身份→候选→提交→放行→统计复核）；
- `filter__*` 筛选交互截图、`fixture-personal.png`（FIXTURE 水印材料）；
- 各态代表性走查截图（empty/normal 的 home 桌面、stale 的 lineups、fail 的 home）。

其余 70+ 张走查截图保留在运行机本目录，不入库（内容为同一批 FIXTURE 数据的不同路由/视口组合，
其检查结果已全部记录于 manifest 的 `scenarios[].routes[]`）。
