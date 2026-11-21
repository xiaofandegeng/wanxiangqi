import {readFile} from 'node:fs/promises'
import pg from 'pg'
import {GAME_VERSIONS_TIMELINE} from '../src/prediction/ace-context.mjs'
import {TALENT_RULES} from '../../shared/talent-impact.mjs'

const database = process.env.PGDATABASE ?? 'wanxiangqi_prediction_dev'
if (database !== 'wanxiangqi_prediction_dev' && !database.endsWith('_test')) {
  throw new Error('仅可向独立预测开发库或测试库导入天赋材料')
}
const input = process.argv[2] ?? new URL('../data/talent-settlement-observations.json', import.meta.url)
const evidence = JSON.parse(await readFile(input, 'utf8'))
const observations = [evidence, ...(evidence.additions ?? [])].flatMap(batch =>
  batch.matches.map(match => {
    if (!match.matchId || !/^[a-f0-9]{64}$/.test(match.materialSha256) ||
        !Number.isFinite(Date.parse(batch.reviewedAt)) || match.seats?.length !== 6 ||
        !match.seats.every(icons => Array.isArray(icons) && icons.every(([, talent]) => Object.hasOwn(TALENT_RULES, talent)))) {
      throw new Error(`天赋材料格式无效 ${match.matchId}`)
    }
    return {
      matchId: match.matchId, sha: match.materialSha256, reviewedAt: batch.reviewedAt,
      seats: match.seats.map(icons => [...new Set(icons.map(([, talent]) => talent))])
    }
  })
)
const pool = new pg.Pool({database})
try {
  const client = await pool.connect()
  try {
    let inserted = 0
    const pending = new Set()
    await client.query('BEGIN')
    for (const observation of observations) {
      const {rows: [match]} = await client.query(
        `SELECT day::text, material_sha256 FROM prediction_catalog_matches WHERE id=$1 AND status='TRANSCRIBED'`,
        [observation.matchId]
      )
      if (!match || match.material_sha256 !== observation.sha) {
        pending.add(observation.matchId)
        continue
      }
      const version = GAME_VERSIONS_TIMELINE.find(release => match.day >= release.effectiveDate)?.version
      if (!version) throw new Error(`缺少天赋证据对应版本 ${observation.matchId}`)
      const result = await client.query(`INSERT INTO prediction_catalog_talent_evidence
        (match_id,material_sha256,game_version,reviewed_at,seat_talents) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT DO NOTHING`, [
        observation.matchId, observation.sha, version, observation.reviewedAt, JSON.stringify(observation.seats)
      ])
      if (!result.rowCount) {
        const {rows: [existing]} = await client.query(`SELECT
          game_version=$4 AND seat_talents=$5::jsonb AS unchanged
          FROM prediction_catalog_talent_evidence WHERE match_id=$1 AND material_sha256=$2 AND reviewed_at=$3`, [
          observation.matchId, observation.sha, observation.reviewedAt, version, JSON.stringify(observation.seats)
        ])
        if (!existing?.unchanged) throw new Error(`已有天赋证据内容冲突 ${observation.matchId}`)
      }
      inserted += result.rowCount
    }
    await client.query('COMMIT')
    console.log(JSON.stringify({database, submitted: observations.length, inserted, pending: [...pending]}))
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
} finally {
  await pool.end()
}
