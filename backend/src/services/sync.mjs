// v3 P1-C/P2-B · 外部来源同步服务
//
// 铁律：
// - datatft：无 WXQ_ENABLE_DATATFT=1 → 409（契约与授权未核实前不开放，任务书 §3.2）
// - hokace：同步台账全记录（sync_jobs）+ 原始响应存证（raw_materials）；
//   失败保留旧快照、lastSuccessAt 不动 (V15)
// - 其余来源：400 UNCONFIGURED（状态只能由真实接入动作改变，禁止凭同步动作宣称 ACTIVE）

import crypto from 'node:crypto'

const HOKACE_PARSER_VERSION = 'hokace-html-v2609-astro' // 2026-09 页面改版 Astro 结构（data-first/top3/placement/count，比率即 [0,1]）
const DATATFT_PARSER_VERSION = 'datatft-json-v1'

export class SyncService {
  constructor(repo, { enableDatatft = false } = {}) {
    this.repo = repo
    this.enableDatatft = enableDatatft
  }

  async getSyncJobs(limit = 20) {
    return this.repo.getSyncJobs(limit)
  }

  /**
   * 触发来源同步。返回 { ok, status, message, result }；
   * HTTP 层依据 serviceError.status 映射 400/409。
   */
  async syncSource(sourceId) {
    if (sourceId === 'src-hokace-wiki') return this.#syncHokace()
    if (sourceId === 'src-datatft-platform') return this.#syncDatatft()
    const err = new Error(`数据源 [${sourceId}] 未配置自动同步（UNCONFIGURED/UNAVAILABLE），或需本人授权材料`)
    err.status = 400
    err.code = 'UNCONFIGURED'
    throw err
  }

  async #syncHokace() {
    const startedAt = new Date().toISOString()
    const job = await this.repo.recordSyncJob({
      sourceId: 'src-hokace-wiki', jobType: 'LINEUP_SNAPSHOT_SYNC',
      scope: 'lineups:all', startedAt
    })
    await this.repo.updateDataSource('src-hokace-wiki', { lastAttemptAt: startedAt })

    try {
      const { syncHokaceLineups } = await import('../../../tools/emulator-watcher/adapters/hokace.mjs')
      const result = await syncHokaceLineups()
      const finishedAt = result.endTime || new Date().toISOString()

      if (result.status !== 'SUCCESS' || !Array.isArray(result.data) || result.data.length === 0) {
        // V15：失败保留旧快照，仅记错误与尝试时间，绝不更新 lastSuccessAt
        const error = result.error || '同步未返回有效快照'
        await this.repo.markSyncJob(job.id, {
          status: 'FAILED', finishedAt, fetchedCount: 0, failedCount: 1, errorSummary: error
        })
        await this.repo.updateDataSource('src-hokace-wiki', { lastError: error })
        return { ok: false, status: 'FAILED', message: `数据源同步未完成: ${error}`, result }
      }

      // 单事务替换该来源全部快照（失败即整体回滚，旧快照保留）
      await this.repo.upsertLineupSnapshots(result.data, { sourceId: 'src-hokace-wiki' })

      // 原始材料存证：响应快照 + 内容哈希 + 解析器版本
      await this.repo.insertRawMaterial({
        sourceId: 'src-hokace-wiki',
        recordKey: 'lineups:all',
        fetchedAt: startedAt,
        contentSha256: crypto.createHash('sha256').update(result.rawBody || JSON.stringify(result.data)).digest('hex'),
        parserVersion: HOKACE_PARSER_VERSION,
        // 按解析器实际识别的通道存证（JSON 正文 / HTML 页面），不凭 rawBody 是否存在猜测
        contentType: /^[\s[{]/.test(result.rawBody || '') ? 'application/json' : 'text/html',
        note: `hokace 阵容快照同步 ${result.data.length} 条`
      })

      await this.repo.markSyncJob(job.id, {
        status: 'SUCCESS', finishedAt,
        fetchedCount: result.data.length, insertedCount: result.data.length
      })
      await this.repo.updateDataSource('src-hokace-wiki', {
        lastSuccessAt: finishedAt, lastError: null, status: 'READY'
      })

      return {
        ok: true, status: 'SUCCESS',
        message: `数据源真实同步完成并已更新快照 (${result.data.length} 条)`,
        result: { count: result.data.length, startedAt, finishedAt, jobId: job.id }
      }
    } catch (err) {
      const finishedAt = new Date().toISOString()
      await this.repo.markSyncJob(job.id, {
        status: 'FAILED', finishedAt, failedCount: 1, errorSummary: err.message
      })
      await this.repo.updateDataSource('src-hokace-wiki', { lastError: err.message })
      return { ok: false, status: 'FAILED', message: `数据源同步未完成: ${err.message}`, result: null }
    }
  }

  async #syncDatatft() {
    if (!this.enableDatatft) {
      const err = new Error(
        'datatft 平台同步默认关闭：API 契约与授权范围未核实 (任务书 §3.2)。' +
        '确需启用请设置 WXQ_ENABLE_DATATFT=1 并先完成适配器治理。'
      )
      err.status = 409
      err.code = 'SOURCE_DISABLED'
      throw err
    }

    const startedAt = new Date().toISOString()
    const job = await this.repo.recordSyncJob({
      sourceId: 'src-datatft-platform', jobType: 'TOURNAMENT_LINEUP_SYNC',
      scope: 'tournaments:current', startedAt
    })
    await this.repo.updateDataSource('src-datatft-platform', { lastAttemptAt: startedAt })

    try {
      const { fetchRealTournaments, fetchRealLineups } =
        await import('../../../tools/emulator-watcher/adapters/datatft.mjs')
      const [tRes, lRes] = await Promise.all([fetchRealTournaments(), fetchRealLineups(50)])
      const finishedAt = new Date().toISOString()

      // F06 写边界：仅赛事分列字段（tournament*），天梯分/段位推导字段一律不写
      const playersSafe = (tRes.players || []).map(p => ({
        id: p.id,
        nickname: p.nickname || p.id,
        tournamentPoints: Number.isFinite(Number(p.tournamentPoints)) ? Number(p.tournamentPoints) : null,
        tournamentRank: Number.isFinite(Number(p.tournamentRank)) ? Number(p.tournamentRank) : null,
        tournamentName: p.tournamentName || null
      }))
      const playersRes = await this.repo.upsertDatatftPlayers(playersSafe)

      let lineupsCount = 0
      if (Array.isArray(lRes.lineups) && lRes.lineups.length > 0) {
        lineupsCount = await this.repo.upsertLineupSnapshots(lRes.lineups, { sourceId: 'src-datatft-platform' })
        await this.repo.insertRawMaterial({
          sourceId: 'src-datatft-platform', recordKey: 'lineups:recent',
          fetchedAt: startedAt,
          contentSha256: crypto.createHash('sha256').update(JSON.stringify(lRes.lineups)).digest('hex'),
          parserVersion: DATATFT_PARSER_VERSION,
          contentType: 'application/json',
          note: `datatft 阵容快照 ${lRes.lineups.length} 条`
        })
      }

      await this.repo.markSyncJob(job.id, {
        status: 'SUCCESS', finishedAt,
        fetchedCount: playersSafe.length + lineupsCount,
        insertedCount: playersRes.added + lineupsCount,
        duplicateCount: playersRes.updated
      })
      // 状态仅推进到 READY（第三方聚合，非个人战绩来源；ACTIVE 保留给人工核验路径）
      await this.repo.updateDataSource('src-datatft-platform', {
        lastSuccessAt: finishedAt, lastError: null, status: 'READY'
      })

      return {
        ok: true, status: 'SUCCESS',
        message: `datatft 同步完成: 选手 ${playersSafe.length}（新增 ${playersRes.added}/更新 ${playersRes.updated}），阵容 ${lineupsCount} 条`,
        result: { tournament: tRes.name, playersCount: playersSafe.length, lineupsCount, jobId: job.id }
      }
    } catch (err) {
      const finishedAt = new Date().toISOString()
      await this.repo.markSyncJob(job.id, {
        status: 'FAILED', finishedAt, failedCount: 1, errorSummary: err.message
      })
      await this.repo.updateDataSource('src-datatft-platform', { lastError: err.message })
      return { ok: false, status: 'FAILED', message: `同步万象棋大数据平台失败: ${err.message}`, result: null }
    }
  }
}
