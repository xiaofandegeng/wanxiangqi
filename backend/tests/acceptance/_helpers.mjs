// v3 S8 · 验收套件公共设施（仅测试库 + 临时端口 HTTP，业务资产零接触）
//
// bootAcceptanceStack(dbName)：
//   重建独立命名测试库（/​_test$/ 强制校验）→ 应用全部迁移 → PgRepository + services
//   + createApiServer 注入临时端口的 HTTP 实例。返回 { pool, repo, services, server,
//   baseUrl, api(token), cleanup }。node --test 并行执行时各文件用不同 dbName 互不干扰。

import { createHash } from 'node:crypto'
import { runMigrations } from '../../src/migrate.mjs'
import { PgRepository } from '../../src/repositories/pg-repository.mjs'
import { createServices } from '../../src/services/index.mjs'
import { createApiServer } from '../../../tools/emulator-watcher/index.mjs'
import {
  connectNamedTestDb,
  recreateNamedTestDb,
  isLocalPgAvailable
} from '../helpers/pg-test.mjs'

export const pgAvailable = await isLocalPgAvailable()

/**
 * 启动一套完整验收栈（独立测试库 + 临时端口 HTTP 服务）
 * @param {string} dbName 必须以 _test 结尾
 * @param {{adminToken?: string}} opts
 */
export async function bootAcceptanceStack(dbName, { adminToken = 'v3-acceptance-admin-token' } = {}) {
  await recreateNamedTestDb(dbName)
  const pool = await connectNamedTestDb(dbName)
  const client = await pool.connect()
  try {
    await runMigrations(client, { logger: { log() {} } })
  } finally {
    client.release()
  }

  const repo = new PgRepository(pool)
  const services = createServices(repo, { appMode: 'formal', smallSampleThreshold: 20 })
  const server = createApiServer({ services, adminToken })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`

  /** fetch 封装：返回 { status, json }，不吞非 2xx */
  const api = async (path, { method = 'GET', token = null, body = null } = {}) => {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== null) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== null ? JSON.stringify(body) : undefined
    })
    const json = await res.json().catch(() => null)
    return { status: res.status, json }
  }

  const cleanup = async () => {
    await new Promise(resolve => server.close(resolve))
    await pool.end().catch(() => {})
  }

  return { pool, repo, services, server, baseUrl, api, adminToken, cleanup }
}

/**
 * 只重连不重建：模拟进程重启（全新 pool/services/server，内存零继承，库内数据保留）。
 * 与 bootAcceptanceStack 返回结构一致（api 使用同一 adminToken）。
 */
export async function reconnectStack(dbName, { adminToken = 'v3-acceptance-admin-token' } = {}) {
  const pool = await connectNamedTestDb(dbName)
  const repo = new PgRepository(pool)
  const services = createServices(repo, { appMode: 'formal', smallSampleThreshold: 20 })
  const server = createApiServer({ services, adminToken })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  const api = async (path, { method = 'GET', token = null, body = null } = {}) => {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== null) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${baseUrl}${path}`, {
      method, headers, body: body !== null ? JSON.stringify(body) : undefined
    })
    const json = await res.json().catch(() => null)
    return { status: res.status, json }
  }
  return {
    pool, repo, services, server, baseUrl, api, adminToken,
    cleanup: async () => {
      await new Promise(resolve => server.close(resolve))
      await pool.end().catch(() => {})
    }
  }
}

// ---------------------------------------------------------------------------
// SQL 直插工具：验收 fixtures 需要绕过服务层直接构造库内事实（如已隔离行、版本链、
// 遗留无键行），这些工具只写测试库。
// ---------------------------------------------------------------------------

export async function insertPlayerRow(pool, { id, nickname = id, rankScore = null, rankText = null }) {
  await pool.query(
    `INSERT INTO players (id, nickname, rank_score, rank_text) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [id, nickname, rankScore, rankText]
  )
}

export async function insertMatchRow(pool, {
  id, playerId, matchTime, availableAt, finalRank,
  mode = 'RANKED_DIAMOND', verified = true, recordStatus = 'ACTIVE', synthetic = false,
  recordKey = null, revision = 1, supersededAt = null, batchId = null, evidenceId = null
}) {
  await pool.query(
    `INSERT INTO matches (id, player_id, match_time, available_at, final_rank, mode, verified,
                          record_status, synthetic, record_key, revision, superseded_at,
                          batch_id, evidence_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [id, playerId, matchTime, availableAt, finalRank, mode, verified, recordStatus, synthetic,
      recordKey, revision, supersededAt, batchId, evidenceId]
  )
}

export async function countRows(pool, table, where = 'TRUE', params = []) {
  const res = await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params)
  return res.rows[0].n
}

/**
 * SQL 直插：带原件的证据（v4 W1）。evidences 行 + evidence_blobs 原件一次就位，
 * 供需要"已核验 + 原件可恢复"前置条件的套件复用（verifyMatch 收紧后的事实底座）。
 */
export async function insertEvidenceWithBlob(pool, {
  id, sha256, status = 'VERIFIED', capturedAt = '2026-09-01T00:00:00Z',
  kind = null, providedBy = null, usageScope = null, note = null,
  bytes = null, mimeType = 'image/png'
}) {
  const content = bytes ?? Buffer.from(`evidence-original:${id}`)
  const finalSha = sha256 ?? createHash('sha256').update(content).digest('hex')
  await pool.query(
    `INSERT INTO evidence_blobs (sha256, content, mime_type, size_bytes, storage_uri)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (sha256) DO NOTHING`,
    [finalSha, content, mimeType, content.length, `pg:evidence_blobs:sha-${finalSha.slice(0, 16)}`]
  )
  await pool.query(
    `INSERT INTO evidences (id, sha256, source_id, captured_at, status, note, kind, provided_by, usage_scope)
     VALUES ($1,$2,'src-manual-review',$3,$4,$5,$6,$7,$8)`,
    [id, finalSha, capturedAt, status, note, kind, providedBy, usageScope]
  )
  return finalSha
}

/**
 * SQL 直查有效统计（与 healthCounts 同谓词的逐选手版本，作 API/统计服务的独立对照 oracle）
 */
export async function effectiveSqlStats(pool, playerId) {
  const res = await pool.query(
    `SELECT count(*)::int AS n,
            count(*) FILTER (WHERE final_rank = 1)::int AS first_places,
            count(*) FILTER (WHERE final_rank <= 3)::int AS top3_places,
            COALESCE(sum(final_rank), 0)::int AS rank_sum
     FROM matches
     WHERE player_id = $1 AND verified = TRUE AND record_status = 'ACTIVE' AND synthetic = FALSE`,
    [playerId]
  )
  const r = res.rows[0]
  return { n: r.n, firstPlaces: r.first_places, top3Places: r.top3_places, rankSum: r.rank_sum }
}
