# S6 证据存档 · 来源语义与适配器治理（P2-B）+ 来源注册表

日期：2026-09-29 · 阶段：S6（任务书 §3、§P2-B、F06、F09、A11）

## 1. 适配器治理清单

| 适配器 | 治理项 | 实现 |
|---|---|---|
| `hokace.mjs` | 停止默认 tier='T1'/windowText='近 7 日实战聚合'/scope='全服王者段位'/commander='通用'/snapshotVersion='v2609' | 全部 `→ null`（来源给什么存什么） |
| | 比率契约显式化 | JSON 通道按 [0,1] 小数严格校验（越界报错不静默换算）；HTML `data-*` 通道按百分比契约（`"44.1%"`/`44.1`）显式 ÷100 后校验；归一后统一 `rateUnit='RATIO_0_1'` |
| | avgRank/sampleCount 缺失 | `→ null`（禁 3.5/0 兜底）；配套迁移 0003 `sample_count DROP NOT NULL` |
| | 采集时间 ≠ 数据截止时间 | `updatedAt`=采集时刻；`dataCutoffAt`=来源公布的数据截止（未给 → null） |
| | 窗口语义字段 | `windowStart/windowEnd/sampleUnit/structureKey` 透传，缺失 null |
| | 快照 id 稳定化 | 同名阵容跨同步同 id（sha256 前 16 位），详情引用不漂移 |
| `datatft.mjs` | **删除赛事积分→天梯分推导**（`10000+积分×120+排名加成`，F06） | 不再产出 rankScore/rankText/title |
| | **删除按列表序号赋 tier**（`idx<6?'T0':idx<18?'T1':'T2'`） | tier 恒 null（来源未公布分级） |
| | 删除编造字段 | `commander:'通用'`/`style:'实战运营'`/`serverZone:'官方赛事统一服'`/平台昵称猜测/`'S1-202609'` 版本号/“全服近 7 日实战大数据(113万局)”窗口文案 → 全部移除或 null |
| | 指标缺失 | `firstRate/count/avgPlacement` 等缺失 → null（原 `\|\| 0` / `\|\| 3.5` 兜底移除）；`toFixed` 空值崩溃路径修复 |
| | **签名密钥出库** | `SIGN_SECRET` 硬编码删除 → `WXQ_DATATFT_SIGN_SECRET` 环境变量（缺失即拒绝调用；`.env.example` 已有占位） |
| | 字段对齐 | 产出 `tournamentPoints/tournamentRank/tournamentName`（与 sync 服务 F06 写边界字段名一致，修复原 `points` 字段错位导致积分静默丢弃） |
| `camp-adapter.mjs` | **适配器不得授予 verified** | `verified: true` → `false` + `recordStatus:'PENDING'`（核验只能由 V17 人工核验动作授予） |
| | 删除编造默认值 | mode='RANKED_DIAMOND'/commander='通用'/lineup='自适应常规流'/roundsSurvived 钳制 25 → null 透传 |
| | available_at 伪造移除 | 原 `matchTime+15s` 兜底 → null（来源给出才采用，且校验 ≥ matchTime 防时间穿越）；缺失由导入层以导入时刻兜底 |
| | 来源状态 | 元数据恒标 `UNCONFIGURED`（服务层 400，未获官方 API 确认与本人授权材料前不开放） |
| `analyzer.mjs` | 话术治理（A11） | 定位改为“存证材料哈希核对器”；状态 `MATCHED_FIXTURE`→`MATCHED_KNOWN_EVIDENCE`（前端 image-analyzer.ts / LiveRadarModal.vue 同步）；提示语“识别”→“匹配到已存证材料/待人工录入” |

## 2. 业务库数据修正（隔离工具新类别，已授权路径）

- 新迁移 `0003_s6_lineup_semantics.sql`：`lineup_snapshots.sample_count DROP NOT NULL`（缺失可存 NULL）
- 隔离工具新类别 `nullFabricatedLineupMeta`：datatft 36 条快照的 tier（按序号编造 T0/T1/T2）、window_text/scope（编造窗口文案）、snapshot_version → NULL；**winRate/sampleCount 等来源真实公布字段保留**
- 演练（wanxiangqi_test，从业务库 dump 重建）：dry-run 36 行 → execute（备份 249 行 `quarantine_backup_20260929141745`）→ rollback 36|36|36 完整还原（行级 sha256 通过）
- 业务库执行：`quarantine_backup_20260929141834`（249 行备份，回滚脚本待命）；线上 `/api/v1/lineups` 即时生效（tier/windowText=null、winRate=0.12 等真实值保留）

## 3. 来源注册表（最后实测：2026-09-29）

| sourceId | 名称 | 能力 | 许可依据 | 已验证字段 | 限制 | 状态 | 最后实测 |
|---|---|---|---|---|---|---|---|
| `src-manual-review` | 人工核验工作台 | 个人逐局战绩录入（六席位+证据 SHA-256） | 内部运营 + 材料存证 | 全字段（经 confirmSlotAudit 事务） | 需人工材料 | **ACTIVE** | 持续（V17 核验端点在线） |
| `src-hokace-wiki` | hokace.wiki 阵容快照 | 第三方阵容聚合（名称/登顶率/前三率/样本量） | CC-BY-NC 4.0 公开页面 | 2026-09-29 前曾成功同步（36 条中另有 datatft 来源）；解析器 hokace-html-v2609 | **当前页面结构与解析器不匹配**（2026-09-29 实测 FAILED：非阵容页面或结构已变更） | READY（可同步，当前失败如实记录） | 2026-09-29 FAILED（sync_jobs 落库） |
| `src-datatft-platform` | 万象棋大数据平台 | 赛事积分榜/聚合阵容/棋手英雄榜 | **API 契约与授权范围未核实** | 历史同步 36 条快照（winRate/sampleCount 真实；tier/窗口文案系我方编造已清） | 需 `WXQ_ENABLE_DATATFT=1` + `WXQ_DATATFT_SIGN_SECRET`；默认 409 | UNCONFIGURED（默认关闭） | 历史成功（v2 期间）；v3 未再实测 |
| `src-kohcamp-official` | 王者营地官方战绩 | 个人逐局战绩（理论） | 腾讯服务协议；**未确认开放 API** | 无（适配器仅契约测试） | 无公开批量查询接口确认；需本人授权材料 | UNCONFIGURED（服务层 400） | 2026-09-29 服务层 400 实测 |
| `src-official-helper` | 官方个人战绩工具 | 个人战绩查询（理论） | 官方工具存在性已确认；自动化路径未确认 | 无 | 无开放 API 证据 | UNAVAILABLE | 未实测（无接入路径） |

### hokace 结构变更受阻记录（V14 关联）

2026-09-29 授权实测：真实网络请求成功（~2.4s 响应），HTML 解析失败 —— 页面不再包含解析器预期的阵容数据结构。V14（≥5 条真实阵容实测验收）当前受阻于解析器适配；sync_jobs 已如实记录 FAILED，旧 36 条快照保留不受影响。修复路径：抓取当前页面结构样本 → 新增解析分支 → 契约测试（网络门控）。

## 4. 测试与构建

- backend 12/12（含 V18 等价性）、frontend 26/26、`npm run build` 通过
- 业务资产护栏全程通过（业务库变更仅经授权隔离工具路径）

## 5. 后续

- S7 前端去虚构（LiveRadarModal 材料录入化、event-today 重建、mock 退役）
- S8 验收：V14 以本注册表“受阻记录”如实呈现
