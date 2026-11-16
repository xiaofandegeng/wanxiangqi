-- Keep raw source identities and reconcile only explicitly reviewed directory IDs.
CREATE TABLE prediction_catalog_player_links (
 alias_id TEXT PRIMARY KEY REFERENCES prediction_catalog_players(id),
 canonical_id TEXT NOT NULL REFERENCES prediction_catalog_players(id),
 review_note TEXT NOT NULL,
 available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 CHECK(alias_id <> canonical_id)
);

DROP MATERIALIZED VIEW prediction_player_build_profiles;

-- Stored summaries of ACE catalog samples. Descriptive only.
CREATE MATERIALIZED VIEW prediction_player_build_profiles AS
WITH complete_matches AS (
 SELECT m.id,m.day,m.material_sha256
 FROM prediction_catalog_matches m
 JOIN prediction_catalog_materials b ON b.sha256=m.material_sha256
 JOIN prediction_catalog_plays p ON p.match_id=m.id
 WHERE m.status='TRANSCRIBED' AND m.available_at<=statement_timestamp()
   AND octet_length(b.content)=b.size_bytes AND b.size_bytes>0
 GROUP BY m.id
 HAVING count(*)=6 AND count(DISTINCT p.player_id)=6 AND count(*) FILTER (WHERE p.winner)=1
), seats AS (
 SELECT COALESCE(link.canonical_id,p.player_id) AS player_id,p.match_id,m.day,p.winner,
        CASE trim(p.build_label) WHEN '逐鹿赢政' THEN '逐鹿嬴政' ELSE trim(p.build_label) END AS build,
        ce.commander
 FROM complete_matches m JOIN prediction_catalog_plays p ON p.match_id=m.id
 LEFT JOIN prediction_catalog_player_links link ON link.alias_id=p.player_id
   AND link.available_at<=statement_timestamp()
 LEFT JOIN prediction_catalog_commander_evidence ce ON ce.match_id=p.match_id AND ce.slot=p.slot
   AND ce.material_sha256=m.material_sha256 AND ce.available_at<=statement_timestamp()
), valid AS (
 SELECT * FROM seats WHERE build<>'' AND upper(build)<>'UNKNOWN'
), totals AS (
 SELECT player_id,count(*)::int AS known_play_count FROM valid GROUP BY player_id
), commander_counts AS (
 SELECT player_id,build,commander,count(*)::int AS appearances,count(*) FILTER (WHERE winner)::int AS wins
 FROM valid WHERE commander IS NOT NULL GROUP BY player_id,build,commander
), commanders AS (
 SELECT player_id,build,jsonb_agg(jsonb_build_object('commander',commander,'appearances',appearances,'wins',wins)
 ORDER BY appearances DESC,wins DESC,commander) AS breakdown
 FROM commander_counts GROUP BY player_id,build
), builds AS (
 SELECT player_id,build,count(*)::int AS appearances,count(*) FILTER (WHERE winner)::int AS wins,
        min(day) AS first_day,max(day) AS last_day,array_agg(match_id ORDER BY day,match_id) AS match_ids
 FROM valid GROUP BY player_id,build
)
SELECT b.*,t.known_play_count,
       b.wins::numeric/b.appearances AS observed_win_rate,
       b.appearances::numeric/t.known_play_count AS usage_share,
       b.appearances>=2 AND b.appearances::numeric/t.known_play_count>=0.30 AS common,
       b.appearances>=3 AND b.wins>=2 AS repeated_title_results,
       COALESCE(c.breakdown,'[]'::jsonb) AS commanders,
       statement_timestamp() AS refreshed_at
FROM builds b JOIN totals t USING(player_id) LEFT JOIN commanders c USING(player_id,build);

CREATE UNIQUE INDEX prediction_player_build_profiles_key ON prediction_player_build_profiles(player_id,build);
