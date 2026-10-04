# frontend · 阵容研习站前端

Vue 3（`<script setup>` SFC）+ TypeScript + Vite + Pinia。公开面（学堂/阵容/资料库/动态）与管理面（内容工作台/来源台账）同仓，管理面经 `ADMIN_TOKEN` 走后端鉴权。

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
WXQ_API_TARGET=http://127.0.0.1:18082 npm run dev
```

## 路由（src/router/index.ts）

| 路径 | 视图 | 说明 |
|---|---|---|
| `/` | 首页 | 产品入口与导览 |
| `/learn`、`/learn/:slug` | 新手学堂 | A–F 阶段课程路径与课程详情（含情境练习） |
| `/lineups`、`/lineups/:id` | 阵容手册库 | 手册列表（热度/表现分离排序）与手册详情（含来源统计子对象、三态横幅） |
| `/library`、`/library/:kind/:slug` | 资料库 | 英雄/棋手/装备/效果牌/天赋词条 |
| `/updates`、`/updates/:slug` | 版本动态 | 官方公告与待复核追踪 |
| `/admin/content` | 管理端 | 内容生命周期（草稿→审核→发布→回滚→退役） |
| `/admin/sources` | 管理端 | 来源台账、同步触发、快照映射 |
| `/:pathMatch(.*)*` | 404 | 兜底 |

API 封装在 `src/api/index.ts`（含 `LineupSnapshot` 等公开契约类型，与后端 wire 字段一一对应）。

## 约定

- 展示层数据全部来自 `/api/v1/*`，不在前端伪造或推算统计；来源未提供的字段如实渲染为空/「暂无统计」。
- 组件测试（vitest, happy-dom）不替代浏览器验收——端到端走查在 `tools/browser-acceptance/`（真实后端 + vite dev + CDP）。

项目总览见根目录 `README.md`；任务依据与进度见 `docs/王者万象棋项目转型任务书_v6_*.md` 与 `docs/v6执行清单.md`。
