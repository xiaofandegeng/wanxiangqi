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
    verifiedAt: iso(r.verified_at)
  })

  async getPlayerMatches(playerId, { recordStatus = null } = {}) {
    const params = [playerId]
    let where = 'player_id = $1 AND (record_key IS NULL OR superseded_at IS NULL)'
    if (recordStatus) {
      params.push(recordStatus)
      where += ` AND record_status = $${params.length}`
    } else {
      where += ` AND record_status NOT IN ('QUARANTINED', 'REVOKED')`
    }
    params.push(200)
    const res = await this.pool.query(
      `SELECT * FROM matches WHERE ${where} ORDER BY match_time DESC LIMIT $${params.length}`, params
    )
    return res.rows.map(PgRepository.MATCH_WIRE)
  }

  async getAllMatches({ limit = 50, offset = 0, playerId = null, mode = null, recordStatus = 'ACTIVE' } = {}) {
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
    const where = conds.join(' AND ')
    const total = (await this.pool.query(`SELECT count(*)::int AS n FROM matches WHERE ${where}`, params)).rows[0].n
    const data = await this.pool.query(
      `SELECT * FROM matches WHERE ${where} ORDER BY match_time DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    )
    return { total, data: data.rows.map(PgRepository.MATCH_WIRE) }
  }

  // ---------------- 对决场次 ----------------

  async getEventsList(dateStr = '', mode = null) {
    const params = []
    const conds = [`status <> 'QUARANTINED'`]
    if (dateStr) {
      params.push(`${dateStr}%`)
      conds.push(`scheduled_at::text LIKE $${params.length}`)
    }
    if (mode && mode !== 'ALL') {
      params.push(mode)
      conds.push(`mode = $${params.length}`)
    }
    const res = await this.pool.query(
      `SELECT * FROM events WHERE ${conds.join(' AND ')} ORDER BY scheduled_at DESC LIMIT 200`, params
    )
    return Promise.all(res.rows.map(r => this.#eventWire(r)))
  }

  async getEventById(eventId) {
    const res = await this.pool.query(`SELECT * FROM events WHERE id = $1`, [eventId])
    if (res.rows.length === 0) return null
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
                            player_count, game_version, record_status, synthetic, operator)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,$11,$12,$13,$14,$15,$16,$17,$18,$19,'PENDING',$20,$21)`,
      [
        id, rec.playerId, rec.matchTime, rec.availableAt, rec.mode ?? null, rec.finalRank,
        rec.commander ?? null, rec.lineup ?? null, rec.roundsSurvived ?? null,
        JSON.stringify(rec.threeStars || []), rec.evidenceId ?? null, rec.batchId,
        rec.revision || 1, rec.recordKey, rec.sourceId ?? null, rec.externalMatchId ?? null,
        rec.externalPlayerId ?? null, rec.playerCount ?? null, rec.gameVersion ?? null,
        rec.synthetic === true, rec.operator ?? null
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

      // ① 存证（按 sha256 复用；无 sha 则拒绝——不得伪造证据指纹）
      if (!payload.evidenceSha256 || !/^[0-9a-f]{64}$/i.test(payload.evidenceSha256)) {
        throw new Error('人工核验必须提供材料 sha256 指纹（64 位十六进制），不得省略或伪造')
      }
      let evidenceId = payload.evidenceId || null
      if (evidenceId) {
        const exists = await client.query(`SELECT id, sha256 FROM evidences WHERE id = $1`, [evidenceId])
        if (exists.rows.length > 0 && exists.rows[0].sha256 !== payload.evidenceSha256) {
          throw new Error(`证据 ${evidenceId} 已存在且指纹不一致，禁止覆盖`)
        }
      }
      if (!evidenceId) {
        const bySha = await client.query(`SELECT id FROM evidences WHERE sha256 = $1`, [payload.evidenceSha256])
        evidenceId = bySha.rows.length > 0 ? bySha.rows[0].id : `ev-${Date.now()}`
      }
      await client.query(
        `INSERT INTO evidences (id, sha256, source_id, captured_at, verified_at, verified_by, status, note)
         VALUES ($1,$2,'src-manual-review',$3,$4,$5,'VERIFIED',$6)
         ON CONFLICT (id) DO NOTHING`,
        [evidenceId, payload.evidenceSha256, payload.capturedAt || matchTime, now.toISOString(), staff, payload.title || '工作台人工校对存证']
      )

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
                                  record_key, record_status, verified_by, verified_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12,1,$13,'ACTIVE',$14,$15)`,
            [`mh-${eventId}-s${slotNum}`, playerId, matchTime, now.toISOString(), payload.mode || null,
             rank, s.commander || null, s.lineup || null,
             Number.isInteger(Number(s.roundsSurvived)) ? Number(s.roundsSurvived) : null,
             JSON.stringify(s.threeStars || []), evidenceId, `audit-${eventId}`,
             recordKey, staff, now.toISOString()]
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
                                  record_key, record_status, verified_by, verified_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12,$13,$14,'ACTIVE',$15,$16)`,
            [`${existing.id}-r${newRev}`, playerId, matchTime, now.toISOString(), payload.mode || null,
             rank, s.commander || null, s.lineup || null,
             Number.isInteger(Number(s.roundsSurvived)) ? Number(s.roundsSurvived) : null,
             JSON.stringify(s.threeStars || []), evidenceId, `audit-${eventId}`,
             newRev, recordKey, staff, now.toISOString()]
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

    return this.getEventById(eventId)
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

      // —— 证据链校验（复验2）：无证据 → 拒绝；证据不存在/被隔离 → 拒绝 ——
      const effectiveEvidenceId = evidenceId || row.evidence_id
      if (!effectiveEvidenceId) {
        await client.query('ROLLBACK')
        const err = new Error('记录未关联任何证据材料，核验前必须提供 evidenceId（真实材料存证）——单独的核验动作不构成证据链')
        err.status = 422
        err.code = 'NO_EVIDENCE'
        throw err
      }
      const evd = await client.query(
        `SELECT id, status FROM evidences WHERE id = $1 FOR UPDATE`, [effectiveEvidenceId]
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
                              verified_by, verified_at, operator)
         SELECT id || '-r' || (revision + 1), player_id, match_time, $2, mode, final_rank, commander, lineup,
                rounds_survived, three_stars, TRUE, $3, batch_id, source_id,
                external_match_id, external_player_id, record_key, player_count, game_version,
                revision + 1, 'ACTIVE', NULL, synthetic, NULL,
                $4, $2, $5
         FROM matches WHERE id = $1
         RETURNING *`,
        [matchId, now, effectiveEvidenceId, verifiedBy, 'api:admin/verify']
      )
      await client.query('COMMIT')
      return PgRepository.MATCH_WIRE(inserted.rows[0])
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
      `SELECT * FROM matches WHERE batch_id = $1 ORDER BY match_time`, [batchId]
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
