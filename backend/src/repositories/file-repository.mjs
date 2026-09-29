// v3 P1-A · FileRepository — 包装重构后的 StorageEngine（仅 demo 模式与测试沙箱）
// 正式模式以 PgRepository 为准；本仓储保证同一套读接口语义（stats-core 唯一事实源）。
//
// 写路径策略（与 PgRepository 一致）：
// - importMatches：入参 verified 一律忽略 → verified=false + recordStatus=PENDING（V17 由核验动作放行）
// - confirmSlotAudit：委托引擎（人工核验 = 证据链放行动作 → ACTIVE）
// - verifyMatch：按记录 id 将 PENDING 记录核验放行

import { StorageEngine, getBusinessStorage } from '../../../tools/emulator-watcher/storage.mjs'
import { deriveRecordKey } from '../../../tools/emulator-watcher/stats-core.mjs'

export class FileRepository {
  /** @param {StorageEngine|{dataDir: string}} engineOrOpts 注入引擎实例，或 { dataDir } 自建 */
  constructor(engineOrOpts = {}) {
    if (engineOrOpts instanceof StorageEngine) {
      this.engine = engineOrOpts
    } else if (typeof engineOrOpts.dataDir === 'string') {
      this.engine = new StorageEngine({ dataDir: engineOrOpts.dataDir })
    } else {
      // 惰性业务实例（进程内唯一；WXQ_DATA_DIR 优先 → 测试沙箱可用）
      this.engine = getBusinessStorage()
    }
    this.kind = 'file'
  }

  async ping() {
    return true
  }

  async healthCounts() {
    const s = this.engine.state
    return {
      players: s.players.length,
      matches: s.matches.length,
      events: s.events.length,
      lineups: s.lineupSnapshots.length,
      evidences: s.evidences.length,
      // 有效口径与 stats-core 一致（verified ∧ ACTIVE ∧ 非 synthetic）
      effectiveMatches: s.matches.filter(m =>
        m.verified === true && (m.recordStatus == null || m.recordStatus === 'ACTIVE') && m.synthetic !== true
      ).length
    }
  }

  async getPlayersList({ query = '', sort = 'rankScore', mode = null, from = null, to = null } = {}) {
    // 复用引擎的列表/排序逻辑（内部已走 stats-core 统一语义）
    return this.engine.getPlayersList({ query, sort, mode, from, to })
  }

  async computePlayerStatsRaw(playerId, { cutoffTime = null, mode = null, from = null, to = null } = {}) {
    const stats = this.engine.computePlayerStats(playerId, { cutoffTime, mode, from, to })
    return {
      n: stats.sampleCount,
      firstPlaces: stats.firstPlaces,
      top3Places: stats.top3Places,
      rankSum: stats.sampleCount > 0 && stats.avgRank != null
        ? Math.round(stats.avgRank * stats.sampleCount)
        : 0
    }
  }

  async getPlayerMatches(playerId, { recordStatus = null } = {}) {
    let list = this.engine.state.matches.filter(m => m.playerId === playerId)
    if (recordStatus) list = list.filter(m => (m.recordStatus || 'PENDING') === recordStatus)
    else list = list.filter(m => m.recordStatus !== 'QUARANTINED' && m.recordStatus !== 'REVOKED')
    return list.slice().sort((a, b) => new Date(b.matchTime).getTime() - new Date(a.matchTime).getTime())
  }

  async getAllMatches({ limit = 50, offset = 0, playerId = null, mode = null, recordStatus = 'ACTIVE' } = {}) {
    let list = this.engine.state.matches.slice()
    if (recordStatus) list = list.filter(m => (m.recordStatus == null ? 'ACTIVE' : m.recordStatus) === recordStatus)
    if (recordStatus === 'ACTIVE') list = list.filter(m => m.synthetic !== true) // 正式口径默认排除合成
    if (playerId) list = list.filter(m => m.playerId === playerId)
    if (mode && mode !== 'ALL') list = list.filter(m => m.mode === mode)
    list.sort((a, b) => new Date(b.matchTime).getTime() - new Date(a.matchTime).getTime())
    return { total: list.length, data: list.slice(offset, offset + limit) }
  }

  async getEventsList(dateStr = '', mode = null) {
    return this.engine.getEventsList(dateStr, mode)
  }

  async getEventById(eventId) {
    return this.engine.getEventById(eventId)
  }

  async getLineupsList() {
    return this.engine.getLineupsList().map(decorateLineup)
  }

  async getLineupById(lineupId) {
    const l = this.engine.getLineupById(lineupId)
    return l ? decorateLineup(l) : null
  }

  async getDataStatus() {
    const s = this.engine.state
    return {
      sources: s.dataSources || [],
      recentSyncJobs: (s.syncJobs || []).slice(-10).reverse(),
      counts: await this.healthCounts()
    }
  }

  async getImportBatchById(batchId) {
    return this.engine.getImportBatchById(batchId)
  }

  /**
   * 导入战绩（服务层已完成校验与 verified 剥离，此处补充 recordKey 与 PENDING 状态）
   */
  async importMatches(records, meta = {}) {
    const enriched = records.map(rec => ({
      ...rec,
      recordKey: rec.recordKey || deriveRecordKey(rec),
      recordStatus: 'PENDING',
      verified: false // 服务层策略：入参 verified 一律忽略，待核验动作放行
    }))
    const run = this.engine.importMatchRecords(enriched, meta)
    return {
      batchId: run.batchId,
      source: run.source,
      totalRecords: run.totalRecords,
      inserted: run.inserted,
      superseded: run.updated,
      duplicates: run.duplicates
    }
  }

  async confirmSlotAudit(payload, staff = 'AUDIT_STAFF') {
    return this.engine.confirmSlotAudit(payload, staff)
  }

  async verifyMatch(matchId, { verifiedBy = 'AUDIT_STAFF' } = {}) {
    const now = new Date().toISOString()
    const m = this.engine.state.matches.find(x => x.id === matchId)
    if (!m) return null
    if (m.recordStatus === 'SUPERSEDED') {
      const err = new Error('该记录已被更高版本取代，请核验最新版本')
      err.status = 409
      throw err
    }
    m.verified = true
    m.verifiedBy = verifiedBy
    m.verifiedAt = now
    m.availableAt = m.availableAt || now
    m.recordStatus = 'ACTIVE'
    m.updatedAt = now
    this.engine.saveState()
    return m
  }

  async getSyncJobs(limit = 20) {
    return (this.engine.state.syncJobs || []).slice(-limit).reverse()
  }

  // ---- 同步台账（demo 侧持久化到 state，字段与 sync_jobs 表对齐）----

  async recordSyncJob(job) {
    const s = this.engine.state
    if (!Array.isArray(s.syncJobs)) s.syncJobs = []
    const row = { id: (s.syncJobs.length + 1), ...job }
    s.syncJobs.push(row)
    this.engine.saveState()
    return row
  }

  async markSyncJob(id, patch) {
    const s = this.engine.state
    const job = (s.syncJobs || []).find(j => j.id === id)
    if (!job) return null
    Object.assign(job, patch)
    this.engine.saveState()
    return job
  }

  async updateDataSource(sourceId, patch) {
    const src = (this.engine.state.dataSources || []).find(x => x.id === sourceId)
    if (!src) return null
    Object.assign(src, patch)
    this.engine.saveState()
    return src
  }

  async insertRawMaterial(material) {
    const s = this.engine.state
    if (!Array.isArray(s.rawMaterials)) s.rawMaterials = []
    const row = { id: s.rawMaterials.length + 1, ...material }
    s.rawMaterials.push(row)
    this.engine.saveState()
    return row
  }

  async upsertLineupSnapshots(snapshots) {
    // 仅在快照数组非空时整体替换（V15：失败绝不动旧快照由服务层保证）
    if (Array.isArray(snapshots) && snapshots.length > 0) {
      this.engine.state.lineupSnapshots = snapshots
      this.engine.saveState()
    }
    return this.engine.state.lineupSnapshots.length
  }

  async upsertDatatftPlayers(players) {
    let added = 0
    let updated = 0
    for (const p of players) {
      const existing = this.engine.state.players.find(x => x.id === p.id)
      if (existing) {
        // 仅更新赛事分列字段，天梯/段位推导字段一律不写 (F06)
        Object.assign(existing, {
          tournamentPoints: p.tournamentPoints ?? existing.tournamentPoints,
          tournamentRank: p.tournamentRank ?? existing.tournamentRank,
          tournamentName: p.tournamentName ?? existing.tournamentName,
          nickname: p.nickname || existing.nickname
        })
        updated++
      } else {
        this.engine.state.players.push(p)
        added++
      }
    }
    this.engine.saveState()
    return { added, updated }
  }
}

/**
 * 阵容快照装饰：缺失字段保持 null（禁 3.5/0 兜底），补 stale 标识（P2-B/V14）
 */
function decorateLineup(l) {
  const cutoffMs = l.dataCutoffAt ? new Date(l.dataCutoffAt).getTime() : null
  const updatedMs = l.updatedAt ? new Date(l.updatedAt).getTime() : null
  const basis = cutoffMs != null ? cutoffMs : updatedMs
  // 第三方 7 日窗口快照：数据截止超过 7 天即标记过期
  const stale = basis != null ? (Date.now() - basis) > 7 * 24 * 3600 * 1000 : null
  return {
    ...l,
    winRate: l.winRate ?? null,
    top3Rate: l.top3Rate ?? null,
    avgRank: l.avgRank ?? null,
    tier: l.tier ?? null,
    stale
  }
}
