# frontend · 王牌对决研究台前端

Vue 3（`<script setup>` SFC）+ TypeScript + Vite。专注王牌对决真实对局赛果核验、选手登顶数据统计与赛前研究推演。

## 命令

```bash
npm install
npm run dev        # Vite dev server（/api 代理到后端，见下）
npm test           # vitest 组件/单元测试
npm run build      # vue-tsc -b && vite build（类型检查是构建的一部分）
npm run preview    # 预览构建产物
```

dev 代理目标：`WXQ_API_TARGET`（默认 `http://127.0.0.1:8080`）——只影响 dev server，不影响测试。

```bash
WXQ_API_TARGET=http://127.0.0.1:8082 npm run dev
```

## 路由（src/router/index.ts）

| 路径 | 视图 | 说明 |
|---|---|---|
| `/` | 总览 | 核心指标、TOP 8 登顶冠军榜、最近赛况速览与口径说明 |
| `/research/matches` | 场次赛果 | 25 日全量 160 场王牌对决真实对局（支持日期与关键词筛选） |
| `/research/players` | 选手统计 | 148 位实战选手排行榜（出场数、登顶胜场、胜率、常用阵容） |
| `/research/roster` | 玩法档案 | 选手历史流派声称与对局出处详情 |
| `/research/predict` | 赛前研究 | 赛前截屏 OCR 与选手战力实时推演工作台 |
| `/:pathMatch(.*)*` | 404 | 页面不存在兜底 |

## 约定

- 数据由 `/api/v1/admin/prediction/catalog` 提供，已核验 160 场真实对局，148 位选手 100% 绑定专属头像。
- 历史草稿、测试表单与临时页面统一清理，保持导航清晰精简。
