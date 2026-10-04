-- 王者万象棋王牌对决数据站 - 核心视图与防泄漏计算逻辑 (Views & Analytics)
-- 字符集编码: UTF-8
-- 适用数据库: PostgreSQL 14+

-- ========================================================
-- 1. 今日钻石狂潮赛程看板视图 (v_event_dashboard)
-- 汇总场次、状态、各席位选手摘要以及是否已具备有效预测
-- ========================================================
CREATE OR REPLACE VIEW v_event_dashboard AS
SELECT 
    e.id AS event_id,
    e.mode,
    e.scheduled_at,
    e.game_version,
    e.status,
    f.model_version,
    f.as_of AS forecast_cutoff,
    f.coverage_rate,
    COALESCE(jsonb_agg(
        jsonb_build_object(
            'slot', p.slot,
            'playerId', p.player_id,
            'nickname', p.nickname_at_match,
            'rankText', p.rank_text,
            'rankScore', p.rank_score,
            'finalRank', p.final_rank,
            'prob', (f.probabilities ->> p.slot::text)::numeric
        ) ORDER BY p.slot
    ) FILTER (WHERE p.id IS NOT NULL), '[]'::jsonb) AS participants
FROM event e
LEFT JOIN participant p ON e.id = p.event_id
LEFT JOIN forecast f ON e.id = f.event_id AND f.status = 'ACTIVE'
GROUP BY e.id, e.mode, e.scheduled_at, e.game_version, e.status, f.model_version, f.as_of, f.coverage_rate
ORDER BY e.scheduled_at ASC;

-- ========================================================
-- 2. 时序安全防泄漏画像统计函数 (fn_get_pre_match_player_stats)
-- 强制条件：match_time < p_cutoff_time 杜绝赛后特征泄漏
-- ========================================================
CREATE OR REPLACE FUNCTION fn_get_pre_match_player_stats(
    p_player_id VARCHAR(64),
    p_cutoff_time TIMESTAMPTZ,
    p_mode event_mode_enum DEFAULT 'DIAMOND'
)
RETURNS TABLE (
    player_id VARCHAR(64),
    total_valid_matches BIGINT,
    win_count BIGINT,
    top3_count BIGINT,
    win_rate NUMERIC(5, 4),
    top3_rate NUMERIC(5, 4)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mh.player_id,
        COUNT(*)::BIGINT AS total_valid_matches,
        COUNT(*) FILTER (WHERE mh.final_rank = 1)::BIGINT AS win_count,
        COUNT(*) FILTER (WHERE mh.final_rank <= 3)::BIGINT AS top3_count,
        ROUND((COUNT(*) FILTER (WHERE mh.final_rank = 1)::numeric / NULLIF(COUNT(*), 0)), 4) AS win_rate,
        ROUND((COUNT(*) FILTER (WHERE mh.final_rank <= 3)::numeric / NULLIF(COUNT(*), 0)), 4) AS top3_rate
    FROM match_history mh
    WHERE mh.player_id = p_player_id
      AND mh.mode = p_mode
      AND mh.match_time < p_cutoff_time -- 关键防泄漏切片约束
    GROUP BY mh.player_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ========================================================
-- 3. 预测回测评分与基线对比视图 (v_model_evaluation)
-- 评估实际登顶选手与模型概率匹配度 (Brier Score 贡献度)
-- ========================================================
CREATE OR REPLACE VIEW v_model_evaluation AS
SELECT 
    e.id AS event_id,
    e.scheduled_at,
    f.model_version,
    f.sample_size,
    win_p.slot AS winner_slot,
    win_p.nickname_at_match AS winner_nickname,
    (f.probabilities ->> win_p.slot::text)::numeric AS winner_prob,
    -- 简易 Brier 评分分量: (prob - 1)^2
    ROUND(POWER((f.probabilities ->> win_p.slot::text)::numeric - 1.0, 2), 4) AS winner_brier_penalty,
    -- 均匀基准 1/6 (0.1667)
    ROUND(POWER(0.1667 - 1.0, 2), 4) AS baseline_brier_penalty
FROM event e
JOIN forecast f ON e.id = f.event_id
JOIN participant win_p ON e.id = win_p.event_id AND win_p.final_rank = 1
WHERE e.status IN ('SETTLED', 'AUDITED');
