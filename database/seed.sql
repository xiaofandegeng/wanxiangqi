-- 王者万象棋王牌对决数据站 - 标准初始化与测试种子数据 (Seed)
-- 包含：2026-09-27 今日 4 场对局、选手历史战绩、证据链与预测快照

-- 1. 插入证据记录
INSERT INTO evidence (id, sha256, file_path, file_size_bytes, evidence_type, captured_at, status, verified_at, verified_by, ocr_raw_text)
VALUES
('ev-101', '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', '/uploads/20260927/lobby_1200.png', 1048576, 'PRE_MATCH_LOBBY', '2026-09-27 11:55:00+08', 'CONFIRMED', '2026-09-27 11:57:00+08', 'AuditAdmin-01', '王牌对决 12:00 选手: 天元弈心, 落子无悔, 云梦小诸葛, 北冥有鱼, 绝影惊鸿, 孤勇破晓'),
('ev-102', '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8', '/uploads/20260927/post_1200.png', 1153433, 'POST_MATCH_SUMMARY', '2026-09-27 12:28:15+08', 'CONFIRMED', '2026-09-27 12:30:00+08', 'AuditAdmin-01', '对决结果: 第1名 天元弈心, 第2名 云梦小诸葛, 第3名 绝影惊鸿, 第4名 落子无悔, 第5名 北冥有鱼, 第6名 孤勇破晓')
ON CONFLICT (id) DO NOTHING;

-- 2. 插入玩家档案
INSERT INTO player (id, platform, server_zone, last_nickname)
VALUES
('p-1001', 'WECHAT', '微信1区', '天元弈心'),
('p-1002', 'WECHAT', '微信2区', '落子无悔'),
('p-1003', 'QQ', '手Q1区', '云梦小诸葛'),
('p-1004', 'QQ', '手Q3区', '北冥有鱼'),
('p-1005', 'WECHAT', '微信5区', '绝影惊鸿'),
('p-1006', 'QQ', '手Q2区', '孤勇破晓'),
('p-1008', 'QQ', '手Q1区', '枫华绝代')
ON CONFLICT (id) DO NOTHING;

-- 3. 插入历史比赛记录 (用于赛前画像与防泄漏测试)
INSERT INTO match_history (id, player_id, mode, match_time, final_rank, commander_name, lineup_summary)
VALUES
('mh-001', 'p-1001', 'DIAMOND', '2026-09-26 12:00:00+08', 1, '弈星', '九稷下长城射'),
('mh-002', 'p-1001', 'DIAMOND', '2026-09-26 13:00:00+08', 2, '弈星', '九稷下长城射'),
('mh-003', 'p-1001', 'DIAMOND', '2026-09-26 14:00:00+08', 1, '诸葛亮', '稷下群雄法'),
('mh-004', 'p-1001', 'DIAMOND', '2026-09-26 15:00:00+08', 3, '庄周', '坦射玄雍'),
('mh-005', 'p-1008', 'DIAMOND', '2026-09-26 12:00:00+08', 1, '弈星', '尧天男刺'),
('mh-006', 'p-1008', 'DIAMOND', '2026-09-26 13:00:00+08', 1, '公孙离', '尧天射手阵')
ON CONFLICT (id) DO NOTHING;

-- 4. 插入 12:00 场次记录
INSERT INTO event (id, mode, scheduled_at, platform, game_version, status, bet_closed_at, settled_at)
VALUES
('evt-20260927-1200', 'DIAMOND', '2026-09-27 12:00:00+08', 'DEFAULT', 'v1.12.3', 'AUDITED', '2026-09-27 12:00:00+08', '2026-09-27 12:30:00+08')
ON CONFLICT (id) DO NOTHING;

-- 5. 插入 12:00 场次的 6 个席位
INSERT INTO participant (id, event_id, slot, player_id, nickname_at_match, rank_text, rank_score, final_rank, commander_name, favorite_lineup, pre_evidence_id, post_evidence_id)
VALUES
('pt-1200-1', 'evt-20260927-1200', 1, 'p-1001', '天元弈心', '万象宗师 III', 88, 1, '弈星', '九稷下长城射', 'ev-101', 'ev-102'),
('pt-1200-2', 'evt-20260927-1200', 2, 'p-1002', '落子无悔', '无双王者 II', 54, 4, '司空震', '雷霆扶桑刺', 'ev-101', 'ev-102'),
('pt-1200-3', 'evt-20260927-1200', 3, 'p-1003', '云梦小诸葛', '万象宗师 I', 112, 2, '诸葛亮', '稷下群雄法', 'ev-101', 'ev-102'),
('pt-1200-4', 'evt-20260927-1200', 4, 'p-1004', '北冥有鱼', '最强王者 IV', 32, 5, '庄周', '坦射玄雍', 'ev-101', 'ev-102'),
('pt-1200-5', 'evt-20260927-1200', 5, 'p-1005', '绝影惊鸿', '万象宗师 II', 95, 3, '公孙离', '尧天射手阵', 'ev-101', 'ev-102'),
('pt-1200-6', 'evt-20260927-1200', 6, 'p-1006', '孤勇破晓', '无双王者 I', 68, 6, '铠', '长城守卫战士', 'ev-101', 'ev-102')
ON CONFLICT (id) DO NOTHING;

-- 6. 插入赛前预测记录 (归一化概率分布)
INSERT INTO forecast (id, event_id, model_version, as_of, sample_size, coverage_rate, probabilities, status)
VALUES
('fc-1200', 'evt-20260927-1200', 'plackett-luce-v1.2', '2026-09-27 11:58:30+08', 235, 0.940, '{"1": 0.32, "2": 0.14, "3": 0.25, "4": 0.08, "5": 0.15, "6": 0.06}'::jsonb, 'ACTIVE')
ON CONFLICT (id) DO NOTHING;
