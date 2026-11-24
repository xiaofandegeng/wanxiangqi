import pg from 'pg'
import { runMigrations } from '../src/migrate.mjs'
import { syncVerifiedPlayerIdentities } from '../src/prediction/account-identity.mjs'
import { generateRankReplays } from '../src/prediction/rank-replay.mjs'

const database = process.env.PGDATABASE ?? 'wanxiangqi_prediction_dev'
if (database !== 'wanxiangqi_prediction_dev' && !database.endsWith('_test')) {
  throw new Error('只允许写入预测开发库或测试库')
}

const pool = new pg.Pool({ database })
try {
  const client = await pool.connect()
  try {
    await runMigrations(client)
  } finally {
    client.release()
  }
  const syncResult = await syncVerifiedPlayerIdentities(pool)
  const replayResult = syncResult.linkedAliases > 0 ? await generateRankReplays(pool) : null
  console.log(JSON.stringify({ database, syncResult, replayResult }, null, 2))
} finally {
  await pool.end()
}
