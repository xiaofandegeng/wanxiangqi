-- ============================================================
-- 0009 · v6 快照平均名次精度修正 (M4-4 / A07)
-- ============================================================
-- 问题：0001 基线 avg_rank NUMERIC(4,2) 只存 2 位小数，而 hokace 实测公布
-- 4 位小数（如 data-placement="2.2024"）。静默四舍五入等于篡改来源公布值
-- （raw_metrics 虽留档原文，但归一化列读回与来源逐字段核对不一致）。
-- 修正：放宽为 NUMERIC(5,4)（值域 1~6，4 位小数完整保留）。
-- win_rate/top3_rate 已是 NUMERIC(5,4)，来源 4 位小数无损，无需变更。
-- 纯列类型放宽：无数据删除、无语义变化，存量值原样保留。

ALTER TABLE lineup_snapshots ALTER COLUMN avg_rank TYPE NUMERIC(5,4);

COMMENT ON COLUMN lineup_snapshots.avg_rank IS '来源公布平均名次（实测 hokace 4 位小数，NUMERIC(5,4) 无损保留；缺失 NULL 不补默认值）';
