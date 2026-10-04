// v6 · PgRepository — PostgreSQL 唯一权威仓储（阵容研习站）
//
// 铁律（延续 v3/v4 已验收部分）：
// 1. 写路径全部单事务；同步成功 = 快照替换 + 存证 + 台账 + 来源推进一致提交
// 2. 任何字段未知即为 NULL，禁止默认值造事实
// 3. 上传不等于核验：素材原件入库一律 PENDING，人工确认才 VERIFIED；
//    核验事务内强制原件可恢复（无原件不得标记有效）
// v6 M1-4：players/matches/events/import_batches 读写链路随赛事与玩家战绩
// 产品退役删除；对应表由 0007 迁移归档退出活动 schema（业务库执行需授权）。

import {
  resolveMaxUploadBytes,
  validateEvidenceUpload,
  generateEvidenceId,
  evidenceWire
} from '../evidence-core.mjs'

const LINEUP_STALE_MS = 7 * 24 * 3600 * 1000 // 第三方 7 日窗口快照过期阈值

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

  // ---------------- 健康与计数（真实组件状态与真实计数；v6 去掉旧业务计数） ----------------

  async healthCounts() {
    const res = await this.pool.query(`
      SELECT
        (SELECT count(*) FROM data_sources)::int AS sources,
        (SELECT count(*) FROM lineup_snapshots)::int AS lineups,
        (SELECT count(*) FROM lineup_snapshots WHERE record_status = 'ACTIVE')::int AS lineups_active,
        (SELECT count(*) FROM evidences)::int AS evidences,
        (SELECT count(*) FROM evidence_blobs)::int AS evidence_blobs,
        (SELECT count(*) FROM raw_materials)::int AS raw_materials,
        (SELECT count(*) FROM sync_jobs)::int AS sync_jobs,
        (SELECT count(*) FROM lineups WHERE status = 'PUBLISHED')::int AS published_lineups,
        (SELECT count(*) FROM lessons WHERE status = 'PUBLISHED')::int AS published_lessons,
        (SELECT count(*) FROM catalog_entities WHERE status = 'PUBLISHED')::int AS published_entities,
        (SELECT count(*) FROM mechanics WHERE status = 'PUBLISHED')::int AS published_mechanics
    `)
    const r = res.rows[0]
    return {
      sources: r.sources,
      lineups: r.lineups,
      lineupsActive: r.lineups_active,
      evidences: r.evidences,
      evidenceBlobs: r.evidence_blobs,
      rawMaterials: r.raw_materials,
      syncJobs: r.sync_jobs,
      publishedLineups: r.published_lineups,
      publishedLessons: r.published_lessons,
      publishedEntities: r.published_entities,
      publishedMechanics: r.published_mechanics
    }
  }

  // ---------------- 阵容快照（缺失字段 null + stale 标识，P2-B/V14） ----------------

  static LINEUP_WIRE = s => {
    const cutoffMs = s.data_cutoff_at ? new Date(s.data_cutoff_at).getTime() : null
    const updatedMs = s.updated_at ? new Date(s.updated_at).getTime() : null
    const basis = cutoffMs != null ? cutoffMs : updatedMs
    return {
      id: s.id,
      sourceId: s.source_id,
      sourceName: s.source_name ?? null,
      sourceStatus: s.source_status ?? null,
      sourceType: s.source_type ?? null,
      lineupName: s.lineup_name,
      tier: s.tier ?? null,
      commander: s.commander ?? null,
      coreHeroes: Array.isArray(s.core_heroes) ? s.core_heroes : [],
      sampleCount: s.sample_count,
      winRate: s.win_rate != null ? Number(s.win_rate) : null,
      top3Rate: s.top3_rate != null ? Number(s.top3_rate) : null,
      avgRank: s.avg_rank != null ? Number(s.avg_rank) : null,
      snapshotVersion: s.snapshot_version ?? null,
      windowText: s.window_text ?? null,
      scope: s.scope ?? null,
      structureKey: s.structure_key ?? null,
      windowStart: iso(s.window_start),
      windowEnd: iso(s.window_end),
      sampleUnit: s.sample_unit ?? null,
      rateUnit: s.rate_unit ?? null,
      dataCutoffAt: iso(s.data_cutoff_at),
      updatedAt: iso(s.updated_at),
      stale: basis != null ? (Date.now() - basis) > LINEUP_STALE_MS : null
    }
  }

  // 公开口径（复验3）：只展示 来源状态 READY/ACTIVE 且快照未被隔离 的行；
  // 未治理来源（UNCONFIGURED/UNAVAILABLE）的存量快照保留在库中可审计，但不公开混排
  // v6 M2-7：旧「快照即阵容」列表/详情契约退役（getLineupsList/getLineupById 删除）；
  // 快照作为稳定阵容的统计子对象，经 lineup_snapshot_links 显式映射后公开——
  // 公开口径 SQL 与本 wire 由 ContentRepository.listLinkedSnapshotRows 复用。

  // ---------------- 数据源状态与同步台账 ----------------

  async getDataStatus() {
    const sources = await this.pool.query(`SELECT * FROM data_sources ORDER BY source_id`)
    const jobs = await this.pool.query(
      `SELECT * FROM sync_jobs ORDER BY started_at DESC LIMIT 10`
    )
    const counts = await this.healthCounts()
    return {
      sources: sources.rows.map(s => ({
        id: s.source_id,
        sourceId: s.source_id,
        name: s.name,
        type: s.type,
        url: s.url,
        capabilities: s.capabilities,
        licenseNote: s.license_note,
        status: s.status,
        note: s.note,
        lastAttemptAt: iso(s.last_attempt_at),
        lastSuccessAt: iso(s.last_success_at),
        lastError: s.last_error
      })),
      recentSyncJobs: jobs.rows.map(j => ({
        id: j.id,
        sourceId: j.source_id,
        jobType: j.job_type,
        status: j.status,
        startedAt: iso(j.started_at),
        finishedAt: iso(j.finished_at),
        fetchedCount: j.fetched_count,
        insertedCount: j.inserted_count,
        duplicateCount: j.duplicate_count,
        failedCount: j.failed_count,
        errorSummary: j.error_summary
      })),
      counts
    }
  }

  async getSyncJobs(limit = 20) {
    const res = await this.pool.query(
      `SELECT * FROM sync_jobs ORDER BY started_at DESC LIMIT $1`, [limit]
    )
    return res.rows.map(j => ({
      id: j.id, sourceId: j.source_id, jobType: j.job_type, status: j.status,
      startedAt: iso(j.started_at), finishedAt: iso(j.finished_at),
      fetchedCount: j.fetched_count, insertedCount: j.inserted_count,
      duplicateCount: j.duplicate_count, failedCount: j.failed_count,
      errorSummary: j.error_summary
    }))
  }

  async recordSyncJob({ sourceId, jobType, scope = null, startedAt }) {
    const res = await this.pool.query(
      `INSERT INTO sync_jobs (source_id, job_type, scope, started_at, status)
       VALUES ($1, $2, $3, $4, 'RUNNING') RETURNING id`,
      [sourceId, jobType, scope, startedAt]
    )
    return { id: res.rows[0].id, sourceId, jobType, scope, status: 'RUNNING', startedAt }
  }

  async markSyncJob(id, { status, finishedAt, fetchedCount = 0, insertedCount = 0, duplicateCount = 0, failedCount = 0, errorSummary = null }) {
    await this.pool.query(
      `UPDATE sync_jobs SET status = $2, finished_at = $3, fetched_count = $4,
              inserted_count = $5, duplicate_count = $6, failed_count = $7, error_summary = $8
       WHERE id = $1`,
      [id, status, finishedAt, fetchedCount, insertedCount, duplicateCount, failedCount, errorSummary]
    )
  }

  async updateDataSource(sourceId, patch) {
    const sets = []
    const params = [sourceId]
    for (const [col, key] of [
      ['last_attempt_at', 'lastAttemptAt'], ['last_success_at', 'lastSuccessAt'],
      ['last_error', 'lastError'], ['status', 'status'], ['note', 'note']
    ]) {
      if (key in (patch || {})) {
        params.push(patch[key])
        sets.push(`${col} = $${params.length}`)
      }
    }
    if (sets.length === 0) return null
    sets.push('updated_at = CURRENT_TIMESTAMP')
    await this.pool.query(`UPDATE data_sources SET ${sets.join(', ')} WHERE source_id = $1`, params)
  }

  /**
   * 原始材料存证（复验4）：正文随台账入库（content 列），size_bytes 实测字节数，
   * storage_uri 内容寻址（pg:raw_materials:sha-<hash16>，指向库内可复原正文）。
   * 可传 client 以纳入外层事务。
   */
  async insertRawMaterial({ sourceId, recordKey, fetchedAt, contentSha256, content = null, storageUri = null, parserVersion = null, contentType = null, sizeBytes = null, note = null }, client = null) {
    const conn = client || this.pool
    const resolvedSize = sizeBytes ?? (content != null ? Buffer.byteLength(content, 'utf8') : null)
    const resolvedUri = storageUri ?? (content != null ? `pg:raw_materials:sha-${contentSha256.slice(0, 16)}` : null)
    const res = await conn.query(
      `INSERT INTO raw_materials (source_id, record_key, fetched_at, content_sha256, content, storage_uri, parser_version, content_type, size_bytes, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [sourceId, recordKey, fetchedAt, contentSha256, content, resolvedUri, parserVersion, contentType, resolvedSize, note]
    )
    return { id: res.rows[0].id }
  }

  async getRawMaterials({ sourceId = null, limit = 20 } = {}) {
    const res = await this.pool.query(
      `SELECT id, source_id, record_key, fetched_at, content_sha256, storage_uri, parser_version,
              content_type, size_bytes, note
       FROM raw_materials
       ${sourceId ? 'WHERE source_id = $1' : ''}
       ORDER BY fetched_at DESC LIMIT ${Number(limit) || 20}`,
      sourceId ? [sourceId] : []
    )
    return res.rows.map(r => ({
      id: r.id, sourceId: r.source_id, recordKey: r.record_key, fetchedAt: iso(r.fetched_at),
      contentSha256: r.content_sha256, storageUri: r.storage_uri, parserVersion: r.parser_version,
      contentType: r.content_type, sizeBytes: r.size_bytes, note: r.note
    }))
  }

  async getRawMaterialById(id) {
    const res = await this.pool.query(`SELECT * FROM raw_materials WHERE id = $1`, [id])
    if (!res.rows.length) return null
    const r = res.rows[0]
    return {
      id: r.id, sourceId: r.source_id, recordKey: r.record_key, fetchedAt: iso(r.fetched_at),
      contentSha256: r.content_sha256, storageUri: r.storage_uri, parserVersion: r.parser_version,
      contentType: r.content_type, sizeBytes: r.size_bytes, note: r.note, content: r.content
    }
  }

  // ---------------- 素材原件入库与证据生命周期（上传 ≠ 核验） ----------------
  //
  // uploadEvidence 只产生 PENDING 证据；有效与否由 verifyEvidence 人工确认动作流转。
  // 原件内容寻址入库（sha256 主键去重）。v6 承接内容素材资产（content_references 引用）。

  /** 证据行 + 原件元信息 JOIN（blob 缺失 → hasOriginal:false，即 pre-0005 哈希-only 存量） */
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

      // ② 按内容去重：同 sha 已有证据 → 幂等返回（真实状态如实回显，含 QUARANTINED）；
      //    usage_scope 授权范围不一致 → 显式 409，禁止静默覆盖
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

  /** 原件字节取回（服务端字节与上传一致）；证据存在但无原件 → 返回 'NO_ORIGINAL' */
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

  /**
   * 人工确认材料有效：PENDING → VERIFIED（幂等；QUARANTINED 拒绝）。
   * 复验P2：材料核验事务内强制原件可恢复——无 blob（pre-0005 哈希-only / 入库失败）
   * 保持原状态并抛 422 ORIGINAL_MISSING，不得产出「无原件的 VERIFIED」。
   * 不存在返回 null。
   */
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

  /**
   * 同步成功单事务提交（复验4）：快照替换 / 原始材料存证 / 台账 SUCCESS /
   * 来源状态推进 在同一事务内落库 —— 任一步失败整体回滚，绝不出现
   * “快照已更换但报告同步失败”或“台账成功但无存证”的中间态。
   * v6：players 写路径已随赛事/玩家战绩产品退役移除。
   */
  async commitSyncSuccess({ sourceId, snapshots = null, rawMaterial, rawMaterials = null, jobPatch = {}, sourcePatch = {} }) {
    const client = await this.client()
    try {
      await client.query('BEGIN')
      // A08 重复任务：同一来源的并发同步按来源串行化（事务级咨询锁）——
      // 后到者等先行者提交后再整体替换（幂等语义），而不是并发 DELETE+INSERT
      // 撞主键让其中一次无谓失败。锁随事务结束自动释放，无需显式解锁。
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sync:${sourceId}`])

      let snapshotsCount = 0
      if (Array.isArray(snapshots)) {
        await client.query(`DELETE FROM lineup_snapshots WHERE source_id = $1`, [sourceId])
        for (const s of snapshots) {
          await client.query(
            `INSERT INTO lineup_snapshots (id, source_id, lineup_name, tier, commander, core_heroes,
                  sample_count, win_rate, top3_rate, avg_rank, snapshot_version, window_text, scope,
                  structure_key, window_start, window_end, sample_unit, rate_unit, data_cutoff_at,
                  mode, raw_metrics, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,CURRENT_TIMESTAMP)`,
            [s.id, s.sourceId || sourceId, s.lineupName, s.tier ?? null, s.commander ?? null,
             JSON.stringify(s.coreHeroes || []), s.sampleCount ?? null,
             s.winRate ?? null, s.top3Rate ?? null, s.avgRank ?? null,
             s.snapshotVersion ?? null, s.windowText ?? null, s.scope ?? null,
             s.structureKey ?? null, s.windowStart ?? null, s.windowEnd ?? null,
             s.sampleUnit ?? null, s.rateUnit ?? null, s.dataCutoffAt ?? null,
             s.mode ?? null,
             s.rawMetrics ? JSON.stringify(s.rawMetrics) : null]
          )
          snapshotsCount++
        }
      }

      if (rawMaterial) {
        await this.insertRawMaterial(rawMaterial, client)
      }
      // M3-1 官网存证：一次同步动作的多目标原文，同一事务逐条入库（任一失败整体回滚）
      let rawMaterialsCount = 0
      if (Array.isArray(rawMaterials)) {
        for (const rm of rawMaterials) {
          await this.insertRawMaterial(rm, client)
          rawMaterialsCount++
        }
      }

      if (jobPatch.id) {
        await this.#markSyncJobTx(client, jobPatch.id, jobPatch)
      }
      if (Object.keys(sourcePatch).length > 0) {
        await this.#updateDataSourceTx(client, sourceId, sourcePatch)
      }

      await client.query('COMMIT')
      return { snapshots: snapshotsCount, rawMaterials: rawMaterialsCount }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /** 同步失败单事务提交：台账 FAILED 与来源 lastError 同生同灭 */
  async commitSyncFailure({ jobId, sourceId, finishedAt, error }) {
    const client = await this.client()
    try {
      await client.query('BEGIN')
      await this.#markSyncJobTx(client, jobId, { status: 'FAILED', finishedAt, failedCount: 1, errorSummary: error })
      await this.#updateDataSourceTx(client, sourceId, { lastError: error })
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  async #markSyncJobTx(client, id, { status, finishedAt, fetchedCount = 0, insertedCount = 0, duplicateCount = 0, failedCount = 0, errorSummary = null }) {
    await client.query(
      `UPDATE sync_jobs SET status = $2, finished_at = $3, fetched_count = $4,
              inserted_count = $5, duplicate_count = $6, failed_count = $7, error_summary = $8
       WHERE id = $1`,
      [id, status, finishedAt, fetchedCount, insertedCount, duplicateCount, failedCount, errorSummary]
    )
  }

  async #updateDataSourceTx(client, sourceId, patch) {
    const sets = []
    const params = [sourceId]
    for (const [col, key] of [
      ['last_attempt_at', 'lastAttemptAt'], ['last_success_at', 'lastSuccessAt'],
      ['last_error', 'lastError'], ['status', 'status'], ['note', 'note']
    ]) {
      if (key in (patch || {})) {
        params.push(patch[key])
        sets.push(`${col} = $${params.length}`)
      }
    }
    if (sets.length === 0) return
    sets.push('updated_at = CURRENT_TIMESTAMP')
    await client.query(`UPDATE data_sources SET ${sets.join(', ')} WHERE source_id = $1`, params)
  }

  // ---------------- 写路径：阵容快照（单事务替换该来源全部快照，V15） ----------------

  async upsertLineupSnapshots(snapshots, { sourceId = 'src-hokace-wiki' } = {}) {
    const client = await this.client()
    try {
      await client.query('BEGIN')
      await client.query(`DELETE FROM lineup_snapshots WHERE source_id = $1`, [sourceId])
      for (const s of snapshots) {
        await client.query(
          `INSERT INTO lineup_snapshots (id, source_id, lineup_name, tier, commander, core_heroes,
                sample_count, win_rate, top3_rate, avg_rank, snapshot_version, window_text, scope,
                structure_key, window_start, window_end, sample_unit, rate_unit, data_cutoff_at,
                mode, raw_metrics, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,CURRENT_TIMESTAMP)`,
          [s.id, s.sourceId || sourceId, s.lineupName, s.tier ?? null, s.commander ?? null,
           JSON.stringify(s.coreHeroes || []), s.sampleCount ?? null,
           s.winRate ?? null, s.top3Rate ?? null, s.avgRank ?? null,
           s.snapshotVersion ?? null, s.windowText ?? null, s.scope ?? null,
           s.structureKey ?? null, s.windowStart ?? null, s.windowEnd ?? null,
           s.sampleUnit ?? null, s.rateUnit ?? null, s.dataCutoffAt ?? null,
           s.mode ?? null,
           s.rawMetrics ? JSON.stringify(s.rawMetrics) : null]
        )
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
    return snapshots.length
  }
}

function iso(v) {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'string') return v
  return String(v)
}
