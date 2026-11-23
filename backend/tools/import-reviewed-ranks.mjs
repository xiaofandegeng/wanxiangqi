import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import pg from 'pg'
import { generateRankReplays } from '../src/prediction/rank-replay.mjs'

const database = process.env.PGDATABASE ?? 'wanxiangqi_prediction_dev'
if (database !== 'wanxiangqi_prediction_dev' && !database.endsWith('_test')) {
  throw new Error('只允许写入预测开发库或测试库')
}

const files = process.argv.slice(2)
assert.ok(files.length, '请指定已核对的逐场赛果 JSON 文件')
const matches = (await Promise.all(files.map(async file => {
  const data = JSON.parse(await readFile(file, 'utf8'))
  return data.matches ?? [data]
}))).flat()
const normalize = value => value?.normalize('NFKC').trim().toLowerCase()
const pool = new pg.Pool({database})
const skipped = []
let inserted = 0

try {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const entry of matches) {
      const {matchId, day, evidenceSha256, seats} = entry
      assert.ok(matchId && /^CATALOG_MATCH_RESULT/.test(entry.status) && /^[a-f0-9]{64}$/.test(evidenceSha256 ?? ''),
        `缺少有效的赛果证据 ${matchId}`)
      assert.ok(seats.length === 6 && [1,2,3,4,5,6].every(rank => seats.some(seat => seat.rank === rank)),
        `名次须完整且唯一 ${matchId}`)
      const {rows} = await client.query(`
        SELECT m.day::text, m.material_sha256, p.slot, p.player_id, p.winner, a.nickname,
          canonical.id AS linked_id, canonical.nickname AS linked_nickname
        FROM prediction_catalog_matches m
        JOIN prediction_catalog_plays p ON p.match_id=m.id
        JOIN prediction_catalog_players a ON a.id=p.player_id
        LEFT JOIN prediction_catalog_player_links l ON l.alias_id=a.id AND l.available_at<=clock_timestamp()
        LEFT JOIN prediction_catalog_players canonical ON canonical.id=l.canonical_id
        WHERE m.id=$1 AND m.status='TRANSCRIBED' ORDER BY p.slot FOR SHARE OF m,p`, [matchId])
      if (rows.length !== 6 || rows.some(row => row.day !== day || row.material_sha256 !== evidenceSha256)) {
        skipped.push(matchId)
        continue
      }
      const ranks = rows.map(row => {
        const seat = seats.find(item => (item.slot ?? item.rank) === row.slot)
        assert.ok(seat && row.winner === (seat.rank === 1), `名次与冠军标记不一致 ${matchId}/${row.slot}`)
        const names = [row.nickname, row.linked_nickname].map(normalize)
        assert.ok(seat.playerId && [row.player_id, row.linked_id].includes(seat.playerId) ||
          [seat.nickname, seat.catalogNickname].some(name => name && names.includes(normalize(name))),
        `名次的选手与目录席位不一致 ${matchId}/${row.slot}`)
        return seat.rank
      })
      const result = await client.query(`
        INSERT INTO prediction_catalog_rank_evidence(match_id,material_sha256,ranks)
        VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, [matchId,evidenceSha256,ranks])
      if (!result.rowCount) {
        const existing = await client.query(`
          SELECT ranks=$3::smallint[] AS identical FROM prediction_catalog_rank_evidence
          WHERE match_id=$1 AND material_sha256=$2`, [matchId,evidenceSha256,ranks])
        assert.ok(existing.rows[0]?.identical,`同一张原图已有不同名次 ${matchId}`)
      }
      inserted += result.rowCount
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
  const rankFeedback = await generateRankReplays(pool)
  console.log(JSON.stringify({database,submitted:matches.length,inserted,skipped,rankFeedback},null,2))
} finally { await pool.end() }
