// 王牌对决研究台 · PgRepository — PostgreSQL 唯一权威仓储
import {
  resolveMaxUploadBytes,
  validateEvidenceUpload,
  generateEvidenceId,
  evidenceWire
} from '../evidence-core.mjs'

export class PgRepository {
  /** @param {import('pg').Pool} pool */
  constructor(pool) {
    this.pool = pool
    this.kind = 'pg'
  }

  client() {
    return this.pool.connect()
  }

  async ping() {
    try {
      await this.pool.query('SELECT 1')
      return true
    } catch {
      return false
    }
  }

  // ---------------- 健康与计数 ----------------

  async healthCounts() {
    const res = await this.pool.query(`
      SELECT
        (SELECT count(*) FROM evidences)::int AS evidences,
        (SELECT count(*) FROM evidence_blobs)::int AS evidence_blobs,
        (SELECT count(*) FROM prediction_matches)::int AS prediction_matches,
        (SELECT count(*) FROM prediction_runs)::int AS prediction_runs,
        (SELECT count(*) FROM prediction_catalog_matches)::int AS catalog_matches
    `)
    const r = res.rows[0]
    return {
      evidences: r.evidences,
      evidenceBlobs: r.evidence_blobs,
      predictionMatches: r.prediction_matches,
      predictionRuns: r.prediction_runs,
      catalogMatches: r.catalog_matches
    }
  }

  // ---------------- 素材原件入库与证据生命周期 ----------------

  static #EVIDENCE_WITH_BLOB = `
    SELECT e.*, b.mime_type, b.size_bytes, b.storage_uri, b.sha256 AS blob_sha
      FROM evidences e
      LEFT JOIN evidence_blobs b ON b.sha256 = e.sha256`

  async uploadEvidence({ content, declaredMime = null, capturedAt = null, providedBy = null, usageScope = null, kind = null, note = null, clientSha256 = null } = {}) {
    if (!capturedAt) {
      throw Object.assign(new Error('必须提供材料采集时间 capturedAt（最小元信息之一，不得省略）'), { status: 400 })
    }
    if (providedBy && String(providedBy).length > 128) {
      throw Object.assign(new Error('providedBy 长度不得超过 128 字符'), { status: 400 })
    }
    if (note && String(note).length > 500) {
      throw Object.assign(new Error('note 长度不得超过 500 字符'), { status: 400 })
    }
    const v = validateEvidenceUpload({
      content, declaredMime, capturedAt, kind, usageScope, clientSha256,
      maxBytes: resolveMaxUploadBytes('pg')
    })

    const client = await this.client()
    try {
      await client.query('BEGIN')

      // ① 原件内容寻址入库（同内容只存一份字节）
      await client.query(
        `INSERT INTO evidence_blobs (sha256, content, mime_type, size_bytes, storage_uri)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (sha256) DO NOTHING`,
        [v.sha256, content, v.mimeType, content.length, `pg:evidence_blobs:sha-${v.sha256.slice(0, 16)}`]
      )

      // ② 按内容去重
      const existing = await client.query(
        `SELECT * FROM evidences WHERE sha256 = $1 FOR UPDATE`, [v.sha256]
      )
      if (existing.rows.length > 0) {
        const row = existing.rows[0]
        if (row.usage_scope && row.usage_scope !== v.usageScope) {
          await client.query('ROLLBACK')
          throw Object.assign(
            new Error(`该原件已入库为证据 [${row.id}]，usage_scope 为 [${row.usage_scope}]，与本次 [${v.usageScope}] 冲突；授权范围变更须走人工治理，不得静默改写`),
            { status: 409, code: 'METADATA_CONFLICT' }
          )
        }
        await client.query('COMMIT')
        const wire = await this.getEvidenceById(row.id)
        return { evidenceId: row.id, deduplicated: true, evidence: wire }
      }

      // ③ 新证据：PENDING（上传不等于核验）
      const id = generateEvidenceId()
      await client.query(
        `INSERT INTO evidences (id, sha256, source_id, captured_at, status, note, kind, provided_by, usage_scope)
         VALUES ($1,$2,'src-manual-review',$3,'PENDING',$4,$5,$6,$7)`,
        [id, v.sha256, v.capturedAt, note ? String(note).slice(0, 500) : null, v.kind,
         providedBy ? String(providedBy).slice(0, 128) : null, v.usageScope]
      )
      await client.query('COMMIT')
      const wire = await this.getEvidenceById(id)
      return { evidenceId: id, deduplicated: false, evidence: wire }
    } catch (err) {
      try { await client.query('ROLLBACK') } catch { /* 已回滚 */ }
      throw err
    } finally {
      client.release()
    }
  }

  async listEvidences({ status = null, limit = 50 } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200)
    const res = await this.pool.query(
      `${PgRepository.#EVIDENCE_WITH_BLOB}
       ${status ? 'WHERE e.status = $1' : ''}
       ORDER BY e.created_at DESC LIMIT ${lim}`,
      status ? [status] : []
    )
    return res.rows.map(r => evidenceWire(r, r.blob_sha ? r : null))
  }

  async getEvidenceById(id) {
    const res = await this.pool.query(`${PgRepository.#EVIDENCE_WITH_BLOB} WHERE e.id = $1`, [id])
    if (!res.rows.length) return null
    const r = res.rows[0]
    return evidenceWire(r, r.blob_sha ? r : null)
  }

  async getEvidenceContentBytes(id) {
    const evd = await this.pool.query(`SELECT id FROM evidences WHERE id = $1`, [id])
    if (!evd.rows.length) return null
    const res = await this.pool.query(
      `SELECT b.content, b.mime_type, b.size_bytes
         FROM evidence_blobs b WHERE b.sha256 = (SELECT sha256 FROM evidences WHERE id = $1)`,
      [id]
    )
    if (!res.rows.length) return { missingOriginal: true }
    const r = res.rows[0]
    return {
      content: Buffer.from(r.content),
      mimeType: r.mime_type,
      sizeBytes: Number(r.size_bytes)
    }
  }

  async verifyEvidence(id, { verifiedBy = 'AUDIT_STAFF' } = {}) {
    const client = await this.client()
    try {
      await client.query('BEGIN')
      const cur = await client.query(`SELECT id, status FROM evidences WHERE id = $1 FOR UPDATE`, [id])
      if (!cur.rows.length) {
        await client.query('ROLLBACK')
        return null
      }
      if (cur.rows[0].status === 'QUARANTINED') {
        await client.query('ROLLBACK')
        throw Object.assign(new Error(`证据 [${id}] 已被隔离，不得确认为有效材料`), { status: 409 })
      }
      const blob = await client.query(
        `SELECT 1 FROM evidence_blobs b
          WHERE b.sha256 = (SELECT sha256 FROM evidences WHERE id = $1)`,
        [id]
      )
      if (!blob.rows.length) {
        await client.query('ROLLBACK')
        throw Object.assign(
          new Error(`材料 [${id}] 无可恢复原件（哈希-only 存量或原件入库失败），不得标记为有效：状态保持不变`),
          { status: 422, code: 'ORIGINAL_MISSING' }
        )
      }
      if (cur.rows[0].status !== 'VERIFIED') {
        await client.query(
          `UPDATE evidences SET status = 'VERIFIED', verified_at = CURRENT_TIMESTAMP, verified_by = $2 WHERE id = $1`,
          [id, verifiedBy]
        )
      }
      await client.query('COMMIT')
      return await this.getEvidenceById(id)
    } catch (err) {
      try { await client.query('ROLLBACK') } catch { /* 已回滚 */ }
      throw err
    } finally {
      client.release()
    }
  }
}
