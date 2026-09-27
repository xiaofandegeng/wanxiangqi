# 王者万象棋王牌对决数据站 - 数据库架构与防泄漏指南

> 适用版本：PostgreSQL 14+  
> 编码：UTF-8  
> 设计原则：**证据链追溯、时序防未来信息泄漏、唯一索引防重复建场、选手ID与昵称解耦**。

---

## 1. 核心表结构清单

| 表名 | 业务含义 | 关键唯一约束 / 索引 | 防泄漏与审计要点 |
| :--- | :--- | :--- | :--- |
| `evidence` | 原始截图与存证 | `uk_evidence_sha256 (sha256)` | 原图 SHA-256 去重，记录 `captured_at` 与 `verified_by` |
| `player` | 选手真实档案 | `uk_player_platform_official_uid` | 内部稳定 UUID，不使用游戏昵称作为主键 |
| `player_nickname_history` | 选手改名历史 | `(player_id, observed_at DESC)` | 记录玩家历次观测到的昵称更迭，防止身份混淆 |
| `event` | 对决场次主表 | `uk_event_mode_time_platform (mode, scheduled_at, platform)` | 防止重复创建场次；`status` 状态机严格约束生命周期 |
| `participant` | 单场席位记录 (1~6) | `uk_participant_event_slot (event_id, slot)` | 每场严格限定 6 个席位；关联赛前与赛后截图存证 |
| `match_history` | 历史对局大表 | `(player_id, match_time DESC)` | 赛前画像严禁取用 `>= event.scheduled_at` 的数据 |
| `support_snapshot` | 支持对比条快照 | `(event_id, observation_time)` | 记录赛前房间内的支持占比（未核实前仅存比例） |
| `forecast` | 赛前预测发布表 | `uk_forecast_event_model (event_id, model_version)` | 六人胜率总和归一化为 100%；记录 `as_of` 截点 |
| `wager_record` | 支持结算验证表 | `id` | 用于硬门槛 B 复算手算与实际到账的一致性 |

---

## 2. 核心防泄漏 (Anti-Leakage) 机制

1. **时序安全画像函数**：
   通过 `fn_get_pre_match_player_stats(p_player_id, p_cutoff_time)` 强制约束：
   ```sql
   WHERE mh.player_id = p_player_id
     AND mh.match_time < p_cutoff_time
   ```
   **严禁**在赛前画像、模型特征提取时使用赛后公布的阵容或胜负结果。

2. **状态机单向流转约束**：
   ```
   PENDING_COLLECTION (待收集)
          │
          ▼
   PENDING_VERIFY (待校验)
          │
          ▼
   PREDICTABLE (可预测)
          │
          ▼
   BET_CLOSED (比赛中/封盘)
          │
          ▼
   SETTLED (已结算)
          │
          ▼
   AUDITED (已复核入库)
   ```

---

## 3. 执行顺序

在 PostgreSQL 实例中执行初始化：

```bash
# 1. 创建枚举
psql -U postgres -d wanxiangqi -f enums.sql

# 2. 创建核心表与约束
psql -U postgres -d wanxiangqi -f schema.sql

# 3. 创建防泄漏视图与分析函数
psql -U postgres -d wanxiangqi -f views.sql

# 4. (可选) 导入测试种子数据
psql -U postgres -d wanxiangqi -f seed.sql
```
