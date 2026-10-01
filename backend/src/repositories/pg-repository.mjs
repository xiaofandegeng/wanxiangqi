// v3 P1-A · PgRepository — PostgreSQL 唯一权威仓储（正式模式）
//
// 铁律（任务书 P1-A/P2-A）：
// 1. 正式统计查询恒带 WHERE verified AND record_status='ACTIVE' AND NOT synthetic
// 2. 统计语义与 tools/emulator-watcher/stats-core.mjs（JS 唯一事实源）等价，V18 锁死：
//    - 有效截点 eff = COALESCE(cutoff, now())
//    - 版本选择 (V13 SCD-2)：record_key 分组，available_at ≤ eff 且 (superseded_at IS NULL OR > eff) 的最高 revision
//    - match_time < eff；available_at ≤ eff；窗口 [from, to)；指定 mode 未知/不匹配一律排除
// 3. 写路径全部单事务；导入忽略入参 verified（PENDING 待核验，V17 由核验动作放行）
// 4. 任何字段未知即为 NULL，禁止默认值造事实

import {
  validateStatsParams,
  formatStatsFromCounts,
  deriveRecordKey
} from '../../../tools/emulator-watcher/stats-core.mjs'
import {
  resolveMaxUploadBytes,
  validateEvidenceUpload,
  generateEvidenceId,
  evidenceWire
} from '../../../tools/emulator-watcher/evidence-core.mjs'

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

  // ---------------- 健康与计数（F04：真实组件状态与真实计数） ----------------

  async healthCounts() {
    const res = await this.pool.query(`
      SELECT
        (SELECT count(*) FROM players)::int AS players,
        (SELECT count(*) FROM matches)::int AS matches,
        (SELECT count(*) FROM matches
          WHERE verified = TRUE AND record_status = 'ACTIVE' AND synthetic = FALSE)::int AS effective_matches,
        (SELECT count(*) FROM events)::int AS events,
        (SELECT count(*) FROM lineup_snapshots)::int AS lineups,
        (SELECT count(*) FROM lineup_snapshots WHERE record_status = 'ACTIVE')::int AS lineups_active,
        (SELECT count(*) FROM evidences)::int AS evidences
    `)
    const r = res.rows[0]
    return {
      players: r.players,
      matches: r.matches,
      effectiveMatches: r.effective_matches,
      events: r.events,
      lineups: r.lineups,
      lineupsActive: r.lineups_active,
      evidences: r.evidences
    }
  }

  // ---------------- 统计（SQL 实现，语义与 stats-core 等价） ----------------

  /**
   * 版本选择 CTE：截点时刻每个 record_key 可见的唯一版本 + 无键存量行
   * eff = COALESCE(cutoff, now())；位置参数固定为 $1=cutoff $2=from $3=to $4=mode，
   * 调用方追加参数须从 $5 起。
   */
  static VISIBLE_CTE = `
    WITH params AS (
      SELECT $1::timestamptz AS cutoff_t,
             $2::timestamptz AS from_t,
             $3::timestamptz AS to_t,
             COALESCE($1::timestamptz, now()) AS eff
    ),
    visible AS (
      (
        SELECT DISTINCT ON (m.record_key) m.*
        FROM matches m, params p
        WHERE m.record_key IS NOT NULL
          AND m.available_at IS NOT NULL
          AND m.available_at <= p.eff
          AND (m.superseded_at IS NULL OR m.superseded_at > p.eff)
        ORDER BY m.record_key, m.revision DESC
      )
      UNION ALL
      (
        SELECT m.*
        FROM matches m, params p
        WHERE m.record_key IS NULL
          AND m.available_at IS NOT NULL
          AND m.available_at <= p.eff
      )
    ),
    effective AS (
      SELECT v.*
      FROM visible v, params p
      WHERE v.verified = TRUE
        AND v.record_status = 'ACTIVE'
        AND v.synthetic = FALSE
        AND v.final_rank BETWEEN 1 AND 6
        AND v.match_time < p.eff
        AND (p.from_t IS NULL OR v.match_time >= p.from_t)
        AND (p.to_t IS NULL OR v.match_time < p.to_t)
      AND ($4::text IS NULL OR v.mode = $4)
      -- 复验P1：仅限内部使用（INTERNAL_ONLY）材料的记录不进公开统计；
      -- 无证据关联行（events 侧/存量）不受影响。统计端点只有公开口径，故在此统一排除。
      AND NOT EXISTS (
        SELECT 1 FROM evidences ie
        WHERE ie.id = v.evidence_id AND ie.usage_scope = 'INTERNAL_ONLY'
      )
    )`

  #statsParams({ cutoffTime = null, mode = null, from = null, to = null } = {}) {
    const p = validateStatsParams({ cutoffTime, mode, from, to })
    return {
      cutoff: p.cutoffMs != null ? new Date(p.cutoffMs).toISOString() : null,
      from: p.fromMs != null ? new Date(p.fromMs).toISOString() : null,
      to: p.toMs != null ? new Date(p.toMs).toISOString() : null,
      mode: p.modeFilter
    }
  }

  async computePlayerStatsRaw(playerId, options = {}) {
    const sp = this.#statsParams(options)
    const res = await this.pool.query(
      `${PgRepository.VISIBLE_CTE}
       SELECT count(*)::int AS n,
              count(*) FILTER (WHERE final_rank = 1)::int AS first_places,
              count(*) FILTER (WHERE final_rank <= 3)::int AS top3_places,
              COALESCE(sum(final_rank), 0)::int AS rank_sum
       FROM effective WHERE player_id = $5`,
      [sp.cutoff, sp.from, sp.to, sp.mode, playerId]
    )
    const r = res.rows[0]
    return { n: r.n, firstPlaces: r.first_places, top3Places: r.top3_places, rankSum: r.rank_sum }
  }

  async getPlayersList({ query = '', sort = 'rankScore', mode = null, from = null, to = null } = {}) {
    const sp = this.#statsParams({ mode, from, to })
    const res = await this.pool.query(
      `${PgRepository.VISIBLE_CTE}
       SELECT pl.id, pl.nickname, pl.platform, pl.server_zone, pl.rank_score, pl.rank_text,
              pl.title, pl.commander, pl.style,
              pl.ladder_score, pl.ladder_source, pl.ladder_at,
              pl.tournament_points, pl.tournament_rank, pl.tournament_name, pl.tournament_at,
              COALESCE(st.n, 0)::int AS n,
              COALESCE(st.first_places, 0)::int AS first_places,
              COALESCE(st.top3_places, 0)::int AS top3_places,
              COALESCE(st.rank_sum, 0)::int AS rank_sum
       FROM players pl
       LEFT JOIN (
         SELECT player_id, count(*) AS n,
                count(*) FILTER (WHERE final_rank = 1) AS first_places,
                count(*) FILTER (WHERE final_rank <= 3) AS top3_places,
                sum(final_rank) AS rank_sum
         FROM effective GROUP BY player_id
       ) st ON st.player_id = pl.id
       ORDER BY pl.id`,
      [sp.cutoff, sp.from, sp.to, sp.mode]
    )

    const list = res.rows.map(r => ({
      id: r.id,
      nickname: r.nickname,
      platform: r.platform,
      serverZone: r.server_zone,
      rankScore: r.rank_score,
      rankText: r.rank_text,
      title: r.title,
      commander: r.commander,
      style: r.style,
      ladderScore: r.ladder_score,
      ladderSource: r.ladder_source,
      ladderAt: iso(r.ladder_at),
      tournamentPoints: r.tournament_points,
      tournamentRank: r.tournament_rank,
      tournamentName: r.tournament_name,
      tournamentAt: iso(r.tournament_at),
      stats: formatStatsFromCounts({
        n: r.n, firstPlaces: r.first_places, top3Places: r.top3_places, rankSum: r.rank_sum
      })
    }))

    if (query) {
      const q = query.toLowerCase()
      const filtered = list.filter(p =>
        (p.nickname || '').toLowerCase().includes(q) || (p.title || '').toLowerCase().includes(q)
      )
      list.length = 0
      list.push(...filtered)
    }

    if (sort === 'winRate') list.sort((a, b) => (b.stats.winRate ?? -1) - (a.stats.winRate ?? -1))
    else if (sort === 'top3Rate') list.sort((a, b) => (b.stats.top3Rate ?? -1) - (a.stats.top3Rate ?? -1))
    else if (sort === 'avgRank') list.sort((a, b) => (a.stats.avgRank ?? 99) - (b.stats.avgRank ?? 99))
    else list.sort((a, b) => (b.rankScore ?? -1) - (a.rankScore ?? -1))

    return list
  }

  // ---------------- 对局流水 ----------------

  static MATCH_WIRE = r => ({
    id: r.id,
    playerId: r.player_id,
    matchTime: iso(r.match_time),
    availableAt: iso(r.available_at),
    mode: r.mode,
    finalRank: r.final_rank,
    commander: r.commander,
    lineup: r.lineup,
    roundsSurvived: r.rounds_survived,
    threeStars: r.three_stars,
    verified: r.verified,
    evidenceId: r.evidence_id,
    batchId: r.batch_id,
    revision: r.revision,
    recordKey: r.record_key,
    recordStatus: r.record_status,
    supersededAt: iso(r.superseded_at),
    synthetic: r.synthetic,
    sourceId: r.source_id,
    externalMatchId: r.external_match_id,
    verifiedBy: r.verified_by,
    verifiedAt: iso(r.verified_at),
    evidenceLocator: r.evidence_locator ?? null,
    // 复验P1：随行回传材料允许使用范围（管理端可见内部记录；公开查询直接整行排除）
    usageScope: r.usage_scope ?? null
  })

  /** 复验P1：内部材料排除谓词（m 为 matches 别名）。includeInternal=true（管理端）时不排除。 */
  static INTERNAL_SCOPE_EXCLUDED = mAlias => `NOT EXISTS (
    SELECT 1 FROM evidences ie WHERE ie.id = ${mAlias}.evidence_id AND ie.usage_scope = 'INTERNAL_ONLY'
  )`

  async getPlayerMatches(playerId, { recordStatus = null, includeInternal = false } = {}) {
    const params = [playerId]
    let where = 'm.player_id = $1 AND (m.record_key IS NULL OR m.superseded_at IS NULL)'
    if (recordStatus) {
      params.push(recordStatus)
      where += ` AND m.record_status = $${params.length}`
    } else {
      where += ` AND m.record_status NOT IN ('QUARANTINED', 'REVOKED')`
    }
    if (!includeInternal) where += ` AND ${PgRepository.INTERNAL_SCOPE_EXCLUDED('m')}`
    params.push(200)
    const res = await this.pool.query(
      `SELECT m.*, e.usage_scope FROM matches m
         LEFT JOIN evidences e ON e.id = m.evidence_id
       WHERE ${where} ORDER BY m.match_time DESC LIMIT $${params.length}`,
      params
    )
    return res.rows.map(PgRepository.MATCH_WIRE)
  }

  async getAllMatches({ limit = 50, offset = 0, playerId = null, mode = null, recordStatus = 'ACTIVE', includeInternal = false } = {}) {
    const params = []
    const conds = ['(record_key IS NULL OR superseded_at IS NULL)']
    if (recordStatus) {
      params.push(recordStatus)
      conds.push(`record_status = $${params.length}`)
      if (recordStatus === 'ACTIVE') conds.push('synthetic = FALSE') // 正式口径默认排除合成
    }
    if (playerId) {
      params.push(playerId)
      conds.push(`player_id = $${params.length}`)
    }
    if (mode && mode !== 'ALL') {
      params.push(mode)
      conds.push(`mode = $${params.length}`) // 指定模式：未知(null)一律排除
    }
    if (!includeInternal) conds.push(PgRepository.INTERNAL_SCOPE_EXCLUDED('matches'))
    const where = conds.join(' AND ')
    const total = (await this.pool.query(`SELECT count(*)::int AS n FROM matches WHERE ${where}`, params)).rows[0].n
    const data = await this.pool.query(
      `SELECT matches.*, e.usage_scope FROM matches
         LEFT JOIN evidences e ON e.id = matches.evidence_id
       WHERE ${where}
       ORDER BY matches.match_time DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )
    return { total, data: data.rows.map(PgRepository.MATCH_WIRE) }
  }

  // ---------------- 对决场次 ----------------

  // 复验P1（续）：INTERNAL_ONLY 材料生成的对决场次同属内部记录——
  // 公开列表排除、详情 404，仅授权管理端（includeInternal）可见。
  async getEventsList(dateStr = '', mode = null, { includeInternal = false } = {}) {
    const params = []
    // LEFT JOIN evidences 后列名必须全限定（两表均有 status，裸引用会歧义报错）
    const conds = [`events.status <> 'QUARANTINED'`]
    if (dateStr) {
      params.push(`${dateStr}%`)
      conds.push(`events.scheduled_at::text LIKE $${params.length}`)
    }
    if (mode && mode !== 'ALL') {
      params.push(mode)
      conds.push(`events.mode = $${params.length}`)
    }
    if (!includeInternal) {
      conds.push(PgRepository.INTERNAL_SCOPE_EXCLUDED('events'))
    }
    const res = await this.pool.query(
      `SELECT events.*, e.usage_scope FROM events
       LEFT JOIN evidences e ON e.id = events.evidence_id
       WHERE ${conds.join(' AND ')} ORDER BY scheduled_at DESC LIMIT 200`, params
    )
    return Promise.all(res.rows.map(r => this.#eventWire(r)))
  }

  async getEventById(eventId, { includeInternal = false } = {}) {
    const res = await this.pool.query(
      `SELECT events.*, e.usage_scope FROM events
       LEFT JOIN evidences e ON e.id = events.evidence_id
       WHERE events.id = $1`, [eventId]
    )
    if (res.rows.length === 0) return null
    if (!includeInternal && res.rows[0].usage_scope === 'INTERNAL_ONLY') return null
    return this.#eventWire(res.rows[0])
  }

  async #eventWire(evt) {
    const parts = await this.pool.query(
      `SELECT * FROM event_participants WHERE event_id = $1 ORDER BY slot`, [evt.id]
    )
    return {
      id: evt.id,
      mode: evt.mode,
      scheduledAt: iso(evt.scheduled_at),
      title: evt.title,
      status: evt.status,
      evidenceId: evt.evidence_id,
      verifiedAt: iso(evt.verified_at),
      verifiedBy: evt.verified_by,
      usageScope: evt.usage_scope ?? null,
      participants: parts.rows.map(p => ({
        slot: p.slot,
        playerId: p.player_id,
        nickname: p.nickname,
        rankScore: p.rank_score,
        odds: p.odds != null ? Number(p.odds) : null,
        supportCount: p.support_count,
        finalRank: p.final_rank,
        commander: p.commander,
        lineup: p.lineup
      }))
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
  static LINEUP_PUBLIC_JOIN = `
    FROM lineup_snapshots ls
    JOIN data_sources ds ON ds.source_id = ls.source_id
    WHERE ds.status IN ('ACTIVE', 'READY') AND ls.record_status = 'ACTIVE'`

  async getLineupsList() {
    const res = await this.pool.query(`
      SELECT ls.*, ds.name AS source_name, ds.status AS source_status, ds.type AS source_type
      ${PgRepository.LINEUP_PUBLIC_JOIN}
      ORDER BY ls.source_id, ls.updated_at DESC`)
    return res.rows.map(PgRepository.LINEUP_WIRE)
  }

  async getLineupById(lineupId) {
    const res = await this.pool.query(`
      SELECT ls.*, ds.name AS source_name, ds.status AS source_status, ds.type AS source_type
      ${PgRepository.LINEUP_PUBLIC_JOIN} AND ls.id = $1`, [lineupId])
    return res.rows.length ? PgRepository.LINEUP_WIRE(res.rows[0]) : null
  }

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

  // ---------------- v4 W1：材料原件入库与证据生命周期 ----------------
  //
  // 上传 ≠ 核验：uploadEvidence 只产生 PENDING 证据；有效与否由 verifyEvidence
  // 人工确认动作流转。原件内容寻址入库（sha256 主键去重，同一原图可关联多条逐局记录）。

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

  /** 原件字节取回（N01：服务端字节与上传一致）；证据存在但无原件 → 返回 'NO_ORIGINAL' */
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
   * 同步成功单事务提交（复验4）：快照替换 / 选手字段 / 原始材料存证 / 台账 SUCCESS /
   * 来源状态推进 在同一事务内落库 —— 任一步失败整体回滚，绝不出现
   * “快照已更换但报告同步失败”或“台账成功但无存证”的中间态。
   */
  async commitSyncSuccess({ sourceId, players = [], snapshots = null, rawMaterial, jobPatch = {}, sourcePatch = {} }) {
    const client = await this.client()
    try {
      await client.query('BEGIN')

      if (Array.isArray(players) && players.length > 0) {
        await this.#upsertPlayersTx(client, players)
      }
      let snapshotsCount = 0
      if (Array.isArray(snapshots)) {
        await client.query(`DELETE FROM lineup_snapshots WHERE source_id = $1`, [sourceId])
        for (const s of snapshots) {
          await client.query(
            `INSERT INTO lineup_snapshots (id, source_id, lineup_name, tier, commander, core_heroes,
                  sample_count, win_rate, top3_rate, avg_rank, snapshot_version, window_text, scope,
                  structure_key, window_start, window_end, sample_unit, rate_unit, data_cutoff_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,CURRENT_TIMESTAMP)`,
            [s.id, s.sourceId || sourceId, s.lineupName, s.tier ?? null, s.commander ?? null,
             JSON.stringify(s.coreHeroes || []), s.sampleCount ?? null,
             s.winRate ?? null, s.top3Rate ?? null, s.avgRank ?? null,
             s.snapshotVersion ?? null, s.windowText ?? null, s.scope ?? null,
             s.structureKey ?? null, s.windowStart ?? null, s.windowEnd ?? null,
             s.sampleUnit ?? null, s.rateUnit ?? null, s.dataCutoffAt ?? null]
          )
          snapshotsCount++
        }
      }

      if (rawMaterial) {
        await this.insertRawMaterial(rawMaterial, client)
      }

      if (jobPatch.id) {
        await this.#markSyncJobTx(client, jobPatch.id, jobPatch)
      }
      if (Object.keys(sourcePatch).length > 0) {
        await this.#updateDataSourceTx(client, sourceId, sourcePatch)
      }

      await client.query('COMMIT')
      return { players: players.length, snapshots: snapshotsCount }
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

  // ---------------- 写路径：导入（V13 版本化单事务） ----------------

  /**
   * @param {Array} records 服务层已校验/已剥离 verified 的记录（含 recordKey/availableAt/synthetic）
   * @param {{source?: string}} meta
   */
  async importMatches(records, meta = {}) {
    const client = await this.client()
    const batchId = `batch-${Date.now()}`
    let inserted = 0
    let duplicates = 0
    let superseded = 0

    try {
      await client.query('BEGIN')

      // 来源治理（P2-B）：记录级 sourceId 必须已在来源注册表登记；
      // 未登记 → 明确 400，不把外键内部细节泄漏给调用方
      const sourceIds = [...new Set(records.map(r => r.sourceId).filter(Boolean))]
      if (sourceIds.length > 0) {
        const known = await client.query(
          `SELECT source_id FROM data_sources WHERE source_id = ANY($1::varchar[])`, [sourceIds]
        )
        const knownSet = new Set(known.rows.map(r => r.source_id))
        const unknown = sourceIds.filter(s => !knownSet.has(s))
        if (unknown.length > 0) {
          const err = new Error(`记录引用了未登记的数据来源: ${unknown.join(', ')}（请先在 data_sources 注册该来源）`)
          err.status = 400
          err.code = 'UNKNOWN_SOURCE'
          throw err
        }
      }

      await client.query(
        `INSERT INTO import_batches (batch_id, source, total_records, inserted, updated, duplicates, created_at)
         VALUES ($1, $2, $3, 0, 0, 0, CURRENT_TIMESTAMP)`,
        [batchId, meta.source || 'MANUAL_IMPORT', records.length]
      )

      for (const rec of records) {
        // ① 选手身份登记（仅身份，属性全 NULL）
        await client.query(
          `INSERT INTO players (id, nickname) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
          [rec.playerId, rec.nickname || rec.playerId]
        )

        const recordKey = rec.recordKey || deriveRecordKey(rec)

        // ② 锁定该稳定键的当前版本行 (V13)
        const current = await client.query(
          `SELECT id, revision, record_status FROM matches
           WHERE record_key = $1 AND superseded_at IS NULL FOR UPDATE`,
          [recordKey]
        )

        // ③ 无键存量行兜底判重（playerId+matchTime，与 File 语义一致）
        if (current.rows.length === 0 && !rec.recordKey) {
          const legacy = await client.query(
            `SELECT id FROM matches WHERE record_key IS NULL AND player_id = $1 AND match_time = $2 LIMIT 1`,
            [rec.playerId, rec.matchTime]
          )
          if (legacy.rows.length > 0) {
            duplicates++
            continue
          }
        }

        if (current.rows.length === 0) {
          await this.#insertMatchRow(client, { ...rec, recordKey, batchId, revision: rec.revision || 1 })
          inserted++
        } else {
          const existing = current.rows[0]
          const newRevision = rec.revision || 1
          if (newRevision > existing.revision) {
            // 更正 = 旧版让位 + 新版本插入（SCD-2）
            await client.query(
              `UPDATE matches SET superseded_at = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
              [existing.id, rec.availableAt]
            )
            await this.#insertMatchRow(client, {
              ...rec, recordKey, batchId, revision: newRevision,
              id: rec.id && rec.id !== existing.id ? rec.id : `${existing.id}-r${newRevision}`
            })
            superseded++
          } else {
            duplicates++ // 同 revision 重复 / 过期 revision
          }
        }
      }

      await client.query(
        `UPDATE import_batches SET inserted = $2, updated = $3, duplicates = $4 WHERE batch_id = $1`,
        [batchId, inserted, superseded, duplicates]
      )

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    return {
      batchId,
      source: meta.source || 'MANUAL_IMPORT',
      totalRecords: records.length,
      inserted,
      superseded,
      duplicates
    }
  }

  async #insertMatchRow(client, rec) {
    const id = rec.id || `mh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    await client.query(
      `INSERT INTO matches (id, player_id, match_time, available_at, mode, final_rank, commander, lineup,
                            rounds_survived, three_stars, verified, evidence_id, batch_id, revision,
                            record_key, source_id, external_match_id, external_player_id,
                            player_count, game_version, record_status, synthetic, operator, evidence_locator)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11,$12,$13,$14,$15,$16,$17,$18,$19,'PENDING',$20,$21,$22)`,
      [
        id, rec.playerId, rec.matchTime, rec.availableAt, rec.mode ?? null, rec.finalRank,
        rec.commander ?? null, rec.lineup ?? null, rec.roundsSurvived ?? null,
        JSON.stringify(rec.threeStars || []), rec.evidenceId ?? null, rec.batchId,
        rec.revision || 1, rec.recordKey, rec.sourceId ?? null, rec.externalMatchId ?? null,
        rec.externalPlayerId ?? null, rec.playerCount ?? null, rec.gameVersion ?? null,
        rec.synthetic === true, rec.operator ?? null, rec.evidenceLocator ?? null
      ]
    )
    return id
  }

  // ---------------- 写路径：人工核验席位确认（单事务） ----------------

  async confirmSlotAudit(payload, staff = 'AUDIT_STAFF') {
    if (!payload || !Array.isArray(payload.slots) || payload.slots.length !== 6) {
      throw new Error('对局核验必须提供完整的 6 个席位选手数据')
    }
    const client = await this.client()
    const now = new Date()
    const eventId = payload.eventId || `evt-${Date.now()}`
    const matchTime = payload.scheduledAt || now.toISOString()

    try {
      await client.query('BEGIN')

      // ① 证据链（v4 W1/W2 统一要求）：必须引用已上传、人工确认有效、原件可恢复的证据。
      //    不得仅凭客户端 64 位哈希字符串创建"完整证据"——六席校对与单人逐局同一铁律。
      if (!payload.evidenceId || typeof payload.evidenceId !== 'string') {
        throw Object.assign(
          new Error('六席校对必须提供 evidenceId（先经 /api/v1/admin/evidences/upload 上传原件并人工确认有效）——客户端哈希不再构成证据'),
          { status: 422, code: 'NO_EVIDENCE' }
        )
      }
      const evidenceId = payload.evidenceId
      const evd = await client.query(
        `SELECT e.id, e.status, e.sha256, b.sha256 AS blob_sha
           FROM evidences e
           LEFT JOIN evidence_blobs b ON b.sha256 = e.sha256
          WHERE e.id = $1
          FOR UPDATE OF e`,
        [evidenceId]
      )
      if (evd.rows.length === 0) {
        throw Object.assign(
          new Error(`证据 [${evidenceId}] 不存在，无法以此完成校对`),
          { status: 422, code: 'EVIDENCE_NOT_FOUND' }
        )
      }
      if (payload.evidenceSha256 && payload.evidenceSha256.toLowerCase() !== evd.rows[0].sha256) {
        throw Object.assign(
          new Error(`提供的哈希与证据 [${evidenceId}] 指纹不一致`),
          { status: 422, code: 'SHA_MISMATCH' }
        )
      }
      if (evd.rows[0].status === 'QUARANTINED') {
        throw Object.assign(
          new Error(`证据 [${evidenceId}] 已被隔离，不得作为校对依据`),
          { status: 422, code: 'EVIDENCE_QUARANTINED' }
        )
      }
      if (evd.rows[0].status !== 'VERIFIED') {
        throw Object.assign(
          new Error(`证据 [${evidenceId}] 尚未人工确认有效（${evd.rows[0].status}）——请先在证据工作台确认材料`),
          { status: 422, code: 'EVIDENCE_PENDING' }
        )
      }
      if (!evd.rows[0].blob_sha) {
        throw Object.assign(
          new Error(`证据 [${evidenceId}] 只有哈希元信息、无可恢复原件，不得作为校对依据`),
          { status: 422, code: 'ORIGINAL_MISSING' }
        )
      }

      // ② 选手：仅按 playerId 稳定身份 upsert（V08 禁止按昵称归并）
      for (const [idx, s] of payload.slots.entries()) {
        const slotNum = s.slot || (idx + 1)
        const rank = Number(s.finalRank)
        if (!Number.isInteger(rank) || rank < 1 || rank > 6) {
          throw new Error(`第 ${slotNum} 席位 finalRank [${s.finalRank}] 无效，必须为 1 到 6 的整数（人工核验不得按席位号推定名次）`)
        }
        const playerId = s.playerId || `p-${s.nickname}`
        if (!playerId) throw new Error(`第 ${slotNum} 席位缺少 playerId 且无法由昵称推导`)
        await client.query(
          `INSERT INTO players (id, nickname, rank_score, rank_text, updated_at)
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             nickname = EXCLUDED.nickname,
             rank_score = COALESCE(EXCLUDED.rank_score, players.rank_score),
             rank_text = COALESCE(EXCLUDED.rank_text, players.rank_text),
             updated_at = CURRENT_TIMESTAMP`,
          [playerId, s.nickname || `选手-${slotNum}`,
           Number.isFinite(Number(s.rankScore)) ? Number(s.rankScore) : null,
           s.rankText || null]
        )
      }

      // ③ 对决场次
      await client.query(
        `INSERT INTO events (id, mode, scheduled_at, title, status, evidence_id, verified_at, verified_by)
         VALUES ($1,$2,$3,$4,'AUDITED',$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET
           mode = EXCLUDED.mode, title = EXCLUDED.title, status = 'AUDITED',
           evidence_id = EXCLUDED.evidence_id, verified_at = EXCLUDED.verified_at,
           verified_by = EXCLUDED.verified_by`,
        [eventId, payload.mode || null, matchTime, payload.title || '对战事实人工核验对决',
         evidenceId, now.toISOString(), staff]
      )

      // ④ 席位表
      for (const [idx, s] of payload.slots.entries()) {
        const slotNum = s.slot || (idx + 1)
        const rank = Number(s.finalRank)
        const playerId = s.playerId || `p-${s.nickname}`
        await client.query(
          `INSERT INTO event_participants (event_id, slot, player_id, nickname, rank_score, odds, support_count, final_rank, commander, lineup)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (event_id, slot) DO UPDATE SET
             player_id = EXCLUDED.player_id, nickname = EXCLUDED.nickname,
             rank_score = EXCLUDED.rank_score, odds = EXCLUDED.odds,
             support_count = EXCLUDED.support_count, final_rank = EXCLUDED.final_rank,
             commander = EXCLUDED.commander, lineup = EXCLUDED.lineup`,
          [eventId, slotNum, playerId, s.nickname || `选手-${slotNum}`,
           Number.isFinite(Number(s.rankScore)) ? Number(s.rankScore) : null,
           Number.isFinite(Number(s.odds)) ? Number(s.odds) : null,
           Number.isFinite(Number(s.supportCount)) ? Number(s.supportCount) : null,
           rank, s.commander || null, s.lineup || null]
        )
      }

      // ⑤ 战绩事实：受控证据键 ev:<evidenceId>:<slot>，核验动作即放行 (V17)
      for (const [idx, s] of payload.slots.entries()) {
        const slotNum = s.slot || (idx + 1)
        const rank = Number(s.finalRank)
        const playerId = s.playerId || `p-${s.nickname}`
        const recordKey = `ev:${evidenceId}:${slotNum}`

        const current = await client.query(
          `SELECT id, revision FROM matches WHERE record_key = $1 AND superseded_at IS NULL FOR UPDATE`,
          [recordKey]
        )
        if (current.rows.length === 0) {
          await client.query(
            `INSERT INTO matches (id, player_id, match_time, available_at, mode, final_rank, commander, lineup,
                                  rounds_survived, three_stars, verified, evidence_id, batch_id, revision,
                                  record_key, record_status, verified_by, verified_at, evidence_locator)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12,1,$13,'ACTIVE',$14,$15,$16)`,
            [`mh-${eventId}-s${slotNum}`, playerId, matchTime, now.toISOString(), payload.mode || null,
             rank, s.commander || null, s.lineup || null,
             Number.isInteger(Number(s.roundsSurvived)) ? Number(s.roundsSurvived) : null,
             JSON.stringify(s.threeStars || []), evidenceId, `audit-${eventId}`,
             recordKey, staff, now.toISOString(), s.evidenceLocator ?? null]
          )
        } else {
          const existing = current.rows[0]
          const newRev = existing.revision + 1
          await client.query(
            `UPDATE matches SET superseded_at = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [existing.id, now.toISOString()]
          )
          await client.query(
            `INSERT INTO matches (id, player_id, match_time, available_at, mode, final_rank, commander, lineup,
                                  rounds_survived, three_stars, verified, evidence_id, batch_id, revision,
                                  record_key, record_status, verified_by, verified_at, evidence_locator)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12,$13,$14,'ACTIVE',$15,$16,$17)`,
            [`${existing.id}-r${newRev}`, playerId, matchTime, now.toISOString(), payload.mode || null,
             rank, s.commander || null, s.lineup || null,
             Number.isInteger(Number(s.roundsSurvived)) ? Number(s.roundsSurvived) : null,
             JSON.stringify(s.threeStars || []), evidenceId, `audit-${eventId}`,
             newRev, recordKey, staff, now.toISOString(), s.evidenceLocator ?? null]
          )
        }
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // 校对动作由授权管理端发起，回传完整场次（含内部材料场次与 usageScope 标注）
    return this.getEventById(eventId, { includeInternal: true })
  }

  // ---------------- 写路径：核验放行动作 (V17 + 复验1/2) ----------------
  //
  // 复验整改（2026-09-30）：
  //   1. 证据链强制：记录本身或请求必须携带有效证据（evidences 存在且状态可用），
  //      仅凭 verifiedBy 不得放行 —— “核验按钮”不等于证据链完整
  //   2. SCD-2 放行：核验 = 建立可见新版本（available_at=实际核验时刻），旧版本原样封存。
  //      过去截点的统计永远取当时版本（旧版仍 PENDING → 不计入），核验动作不回写历史

  async verifyMatch(matchId, { verifiedBy = 'AUDIT_STAFF', evidenceId = null } = {}) {
    const client = await this.client()
    try {
      await client.query('BEGIN')
      const cur = await client.query(
        `SELECT id, record_key, revision, record_status, superseded_at, verified, evidence_id
         FROM matches WHERE id = $1 FOR UPDATE`, [matchId]
      )
      if (cur.rows.length === 0) {
        await client.query('ROLLBACK')
        return null
      }
      const row = cur.rows[0]
      if (row.superseded_at !== null) {
        await client.query('ROLLBACK')
        const err = new Error('该记录已被更高版本取代，请核验最新版本')
        err.status = 409
        throw err
      }
      if (row.record_status === 'QUARANTINED') {
        await client.query('ROLLBACK')
        const err = new Error('该记录已被隔离，核验前需先解除隔离')
        err.status = 409
        throw err
      }
      if (row.record_status === 'REVOKED') {
        await client.query('ROLLBACK')
        const err = new Error('该记录已撤销，如需恢复请走更正流程提交新版本')
        err.status = 409
        throw err
      }
      if (row.verified === true && row.record_status === 'ACTIVE') {
        await client.query('ROLLBACK')
        const err = new Error('该记录已核验放行，无需重复核验')
        err.status = 409
        throw err
      }

      // —— 证据链校验（复验2 + v4 W1 统一要求）：
      //    无证据 → 拒绝；证据不存在 → 拒绝；被隔离 → 拒绝；未人工确认（PENDING）→ 拒绝；
      //    无可恢复原件（哈希-only 存量）→ 拒绝。校验顺序固定：NOT_FOUND → QUARANTINED →
      //    PENDING → ORIGINAL_MISSING（隔离语义优先于原件检查，v31 复验2 依赖此顺序）——
      const effectiveEvidenceId = evidenceId || row.evidence_id
      if (!effectiveEvidenceId) {
        await client.query('ROLLBACK')
        const err = new Error('记录未关联任何证据材料，核验前必须提供 evidenceId（真实材料存证）——单独的核验动作不构成证据链')
        err.status = 422
        err.code = 'NO_EVIDENCE'
        throw err
      }
      const evd = await client.query(
        `SELECT id, status, sha256 FROM evidences WHERE id = $1 FOR UPDATE`, [effectiveEvidenceId]
      )
      if (evd.rows.length === 0) {
        await client.query('ROLLBACK')
        const err = new Error(`证据 [${effectiveEvidenceId}] 不存在，无法以此放行`)
        err.status = 422
        err.code = 'EVIDENCE_NOT_FOUND'
        throw err
      }
      if (evd.rows[0].status === 'QUARANTINED') {
        await client.query('ROLLBACK')
        const err = new Error(`证据 [${effectiveEvidenceId}] 已被隔离，不得作为放行依据`)
        err.status = 422
        err.code = 'EVIDENCE_QUARANTINED'
        throw err
      }
      if (evd.rows[0].status === 'PENDING') {
        await client.query('ROLLBACK')
        const err = new Error(`证据 [${effectiveEvidenceId}] 尚未人工确认有效（PENDING）——上传不等于核验，请先在证据工作台确认材料有效`)
        err.status = 422
        err.code = 'EVIDENCE_PENDING'
        throw err
      }
      const blob = await client.query(
        `SELECT 1 FROM evidence_blobs WHERE sha256 = $1`, [evd.rows[0].sha256]
      )
      if (blob.rows.length === 0) {
        await client.query('ROLLBACK')
        const err = new Error(`证据 [${effectiveEvidenceId}] 只有哈希元信息、无可恢复原件，不得作为放行依据（所有核验入口统一要求原件可恢复）`)
        err.status = 422
        err.code = 'ORIGINAL_MISSING'
        throw err
      }

      // —— SCD-2 放行（复验1）：旧版本先封存（腾出 record_key 当前唯一槽），再建新版本 ——
      // 顺序不可颠倒：uq_matches_record_key_current 部分唯一索引要求同键同时只有一行 superseded_at IS NULL
      const now = new Date().toISOString()
      await client.query(
        `UPDATE matches SET superseded_at = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [matchId, now]
      )
      const inserted = await client.query(
        `INSERT INTO matches (id, player_id, match_time, available_at, mode, final_rank, commander, lineup,
                              rounds_survived, three_stars, verified, evidence_id, batch_id, source_id,
                              external_match_id, external_player_id, record_key, player_count, game_version,
                              revision, record_status, superseded_at, synthetic, quarantine_reason,
                              verified_by, verified_at, operator, evidence_locator)
         SELECT id || '-r' || (revision + 1), player_id, match_time, $2, mode, final_rank, commander, lineup,
                rounds_survived, three_stars, TRUE, $3, batch_id, source_id,
                external_match_id, external_player_id, record_key, player_count, game_version,
                revision + 1, 'ACTIVE', NULL, synthetic, NULL,
                $4, $2, $5, evidence_locator
         FROM matches WHERE id = $1
         RETURNING *`,
        [matchId, now, effectiveEvidenceId, verifiedBy, 'api:admin/verify']
      )
      await client.query('COMMIT')
      // 复验P1：放行响应如实携带材料允许使用范围（单表 RETURNING 无此列，回查补充）
      const scope = await this.pool.query(
        `SELECT usage_scope FROM evidences WHERE id = $1`, [effectiveEvidenceId]
      )
      return PgRepository.MATCH_WIRE({ ...inserted.rows[0], usage_scope: scope.rows[0]?.usage_scope ?? null })
    } catch (err) {
      try { await client.query('ROLLBACK') } catch { /* 已回滚 */ }
      throw err
    } finally {
      client.release()
    }
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
                structure_key, window_start, window_end, sample_unit, rate_unit, data_cutoff_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,CURRENT_TIMESTAMP)`,
          [s.id, s.sourceId || sourceId, s.lineupName, s.tier ?? null, s.commander ?? null,
           JSON.stringify(s.coreHeroes || []), s.sampleCount ?? null,
           s.winRate ?? null, s.top3Rate ?? null, s.avgRank ?? null,
           s.snapshotVersion ?? null, s.windowText ?? null, s.scope ?? null,
           s.structureKey ?? null, s.windowStart ?? null, s.windowEnd ?? null,
           s.sampleUnit ?? null, s.rateUnit ?? null, s.dataCutoffAt ?? null]
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

  // ---------------- 写路径：datatft 赛事字段（仅安全字段，F06 推导字段一律不写） ----------------

  async upsertDatatftPlayers(players) {
    const client = await this.client()
    try {
      await client.query('BEGIN')
      const { added, updated } = await this.#upsertPlayersTx(client, players)
      await client.query('COMMIT')
      return { added, updated }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  async #upsertPlayersTx(client, players) {
    let added = 0
    let updated = 0
    for (const p of players) {
      const res = await client.query(
        `INSERT INTO players (id, nickname, tournament_points, tournament_rank, tournament_name, tournament_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
           nickname = EXCLUDED.nickname,
           tournament_points = COALESCE(EXCLUDED.tournament_points, players.tournament_points),
           tournament_rank = COALESCE(EXCLUDED.tournament_rank, players.tournament_rank),
           tournament_name = COALESCE(EXCLUDED.tournament_name, players.tournament_name),
           tournament_at = CURRENT_TIMESTAMP
         RETURNING (xmax = 0) AS inserted`,
        [p.id, p.nickname || p.id, p.tournamentPoints ?? null, p.tournamentRank ?? null, p.tournamentName ?? null]
      )
      if (res.rows[0].inserted) added++
      else updated++
    }
    return { added, updated }
  }

  async getImportBatchById(batchId) {
    const batch = await this.pool.query(`SELECT * FROM import_batches WHERE batch_id = $1`, [batchId])
    if (batch.rows.length === 0) return null
    const records = await this.pool.query(
      `SELECT m.*, e.usage_scope FROM matches m
         LEFT JOIN evidences e ON e.id = m.evidence_id
       WHERE m.batch_id = $1 ORDER BY m.match_time`,
      [batchId]
    )
    const b = batch.rows[0]
    return {
      batchId: b.batch_id,
      source: b.source,
      totalRecords: b.total_records,
      inserted: b.inserted,
      superseded: b.updated,
      duplicates: b.duplicates,
      createdAt: iso(b.created_at),
      records: records.rows.map(PgRepository.MATCH_WIRE)
    }
  }
}

function iso(v) {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'string') return v
  return String(v)
}
