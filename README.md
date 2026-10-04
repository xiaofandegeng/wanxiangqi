# 王者万象棋 · 阵容研习站

《王者万象棋》新手教学与阵容分析站：**阵容手册 + 阶段化课程 + 资料库 + 来源统计快照**。
不收录真实玩家个人战绩，不做赛事/预测/赔率（该产品方向已于 v6 转型终止，见
`docs/archive/legacy-v2-v5/INDEX.md`）。

- **新手学堂** `/learn`：A–F 六阶段课程路径（11 门，含进阶课），先修依赖、学习目标、情境练习
- **阵容手册库** `/lineups`：每套阵容一份手册（定阵条件→开局→过渡→稳血→成型→技能链→站位→变阵→复盘）；
  第三方来源（hokace.wiki）公布的聚合统计经**人工判据映射**后作为参考子对象：热度/表现分列、
  分离排序、无混合指数；版本一致性未经核实时只称「最新可用快照（适用 X 版本）」
- **资料库** `/library`：英雄/棋手/装备/效果牌/天赋稳定词条（525 实体，版本化事实，官方来源核查）
- **版本动态** `/updates`：官方更新公告与待复核内容追踪
- **管理端** `/admin/content`、`/admin/sources`：内容生命周期（草稿→审核→发布→回滚→退役）、
  来源同步台账、快照映射工作台（`ADMIN_TOKEN` 鉴权）

## 技术栈与结构

```
frontend/   Vue 3 + TypeScript + Vite + Pinia（公开面 + 管理面）
backend/    Node 22 + PostgreSQL（唯一权威存储，无 ORM，版本化迁移）
  src/migrations/        0001..0009（内容模型 0006–0009；业务库执行需授权，见 M5-1 方案）
  src/repositories/      PgRepository（快照/来源/台账）+ ContentRepository（内容模型）
  src/services/          content / sync / imports（素材）/ evidence-core
  src/adapters/          hokace.mjs（阵容快照）· official-site.mjs（官网内容存证）
  tests/acceptance/      隔离 *_test 库验收套件（业务库零接触，pg-test.mjs 强制后缀校验）
database/   仅 README（schema 说明；v1 静态 DDL 已归档）
tools/      browser-acceptance/（零安装 CDP 走查）· emulator-watcher（退役）· content-build/
docs/       现行文档（v6 任务书/执行清单/对照表/迁移方案/实施报告）+ v6_artifacts 验收产物
```

## 快速开始

```bash
# 1) PostgreSQL（14+），开发库一键构建（迁移 + 官方来源抓取 + 全量内容发布 + hokace 同步）
cd backend
createdb wanxiangqi_v6dev
node tools/content-build/build-v6-content.mjs --db wanxiangqi_v6dev

# 2) 后端（默认 127.0.0.1:8080；.env 参考 .env.example，ADMIN_TOKEN 必填）
cp .env.example .env   # 填 PGDATABASE=wanxiangqi_v6dev 与随机 ADMIN_TOKEN
npm install && npm run dev

# 3) 前端（Vite dev，代理 /api → 后端；WXQ_API_TARGET 可覆盖）
cd ../frontend && npm install && npm run dev
```

## 测试与验收

```bash
cd backend  && npm test          # node:test 验收套件（需本地 PG；自动创建 *_test 隔离库）
cd frontend && npm test          # vitest（52 用例）
cd frontend && npm run build     # vue-tsc + vite build
node tools/browser-acceptance/m4-5-stats-states.mjs   # 浏览器走查示例（真实栈 + CDP）
```

红线（延续 v3/v4/v6）：展示的每个数字可追溯；来源未给的字段如实为 null；上传≠核验；
同步失败保留上次快照并明确状态；统计不由本站生成、不跨来源平均；测试零接触业务库。

## 业务库迁移

业务库 `wanxiangqi`（旧赛事/玩家模型 0001–0005）向 v6 的归档迁移**方案就绪、未执行**——
需明确授权后按 `docs/v6业务库归档迁移方案_M5-1.md` 执行（备份→隔离演练→计数/FK/哈希记录→迁移→可回滚）。
在此之前，v6 代码只连接开发库 `wanxiangqi_v6dev` 与 `*_test` 库。

## 文档

- 任务依据（唯一）：`docs/王者万象棋项目转型任务书_v6_阵容分析与新手教学_2026-10-03.md`
- 进度清单（唯一）：`docs/v6执行清单.md`
- 旧功能删除与数据归档对照：`docs/v6旧功能删除与数据归档对照表.md`
- 实施报告：`docs/v6实施报告.md`
- 历史档案（已退役，不得继续执行）：`docs/archive/legacy-v2-v5/INDEX.md`
