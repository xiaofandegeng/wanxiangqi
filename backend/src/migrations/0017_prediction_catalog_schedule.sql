-- Daily WANXIANG schedule in China time. Ordinals outside 1–8 have no known slot.
ALTER TABLE prediction_catalog_matches
 ADD COLUMN scheduled_at TIMESTAMPTZ GENERATED ALWAYS AS (
   CASE WHEN ordinal BETWEEN 1 AND 8
     THEN (day + make_time(15 + ordinal, 0, 0)) AT TIME ZONE 'Asia/Shanghai'
   END
 ) STORED;

COMMENT ON COLUMN prediction_catalog_matches.scheduled_at IS
 '万象大赛计划开赛时间：北京时间 16:00–23:00，第 1–8 场逐小时；实际开赛时间需另有证据。';
