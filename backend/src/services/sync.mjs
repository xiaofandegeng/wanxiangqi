// v3 P1-C/P2-B · 外部来源同步服务
//
// 铁律：
// - datatft：无 WXQ_ENABLE_DATATFT=1 → 409（契约与授权未核实前不开放，任务书 §3.2）
// - hokace：同步台账全记录（sync_jobs）+ 原始响应存证（raw_materials）；
//   失败保留旧快照、lastSuccessAt 不动 (V15)
// - 其余来源：400 UNCONFIGURED（状态只能由真实接入动作改变，禁止凭同步动作宣称 ACTIVE）

import crypto from 'node:crypto'

// v4 W4：页面级快照版本/窗口说明提取（eyebrow「v260924 · 7 日对局快照」注入全部条目）。
// 导出供测试 import 断言（版本号是存证契约的一部分，测试不得再硬编码字面量）。
// 注意：raw_materials.parser_version 列宽 VARCHAR(32)，版本串不得超长（超长会让同步整单失败）。
export const HOKACE_PARSER_VERSION = 'hokace-astro-v2609-pagelevel'
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
        // V15：失败保留旧快照，仅记错误与尝试时间，绝不更新 lastSuccessAt（台账与来源状态同事务）
        const error = result.error || '同步未返回有效快照'
        await this.repo.commitSyncFailure({ jobId: job.id, sourceId: 'src-hokace-wiki', finishedAt, error })
        return { ok: false, status: 'FAILED', message: `数据源同步未完成: ${error}`, result }
      }

      // 复验4：快照替换 / 原始正文存证 / 台账 SUCCESS / 来源推进 单事务落库 ——
      // 任一步失败整体回滚，不会出现“快照已更换却报告同步失败”的中间态
      await this.repo.commitSyncSuccess({
        sourceId: 'src-hokace-wiki',
        snapshots: result.data,
        rawMaterial: {
          sourceId: 'src-hokace-wiki',
          recordKey: 'lineups:all',
          fetchedAt: startedAt,
          contentSha256: crypto.createHash('sha256').update(result.rawBody || JSON.stringify(result.data)).digest('hex'),
          content: result.rawBody || JSON.stringify(result.data), // 原始正文入库，离线可复核
          parserVersion: HOKACE_PARSER_VERSION,
          // 按解析器实际识别的通道存证（JSON 正文 / HTML 页面），不凭 rawBody 是否存在猜测
          contentType: /^[\s[{]/.test(result.rawBody || '') ? 'application/json' : 'text/html',
          note: `hokace 阵容快照同步 ${result.data.length} 条`
        },
        jobPatch: {
          id: job.id, status: 'SUCCESS', finishedAt,
          fetchedCount: result.data.length, insertedCount: result.data.length
        },
        sourcePatch: { lastSuccessAt: finishedAt, lastError: null, status: 'READY' }
      })

      return {
        ok: true, status: 'SUCCESS',
        message: `数据源真实同步完成并已更新快照 (${result.data.length} 条)`,
        result: { count: result.data.length, startedAt, finishedAt, jobId: job.id }
      }
    } catch (err) {
      const finishedAt = new Date().toISOString()
      await this.repo.commitSyncFailure({ jobId: job.id, sourceId: 'src-hokace-wiki', finishedAt, error: err.message })
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

      const hasLineups = Array.isArray(lRes.lineups) && lRes.lineups.length > 0
      // 复验4：选手字段 / 快照 / 存证 / 台账 / 来源状态 单事务提交
      const playersRes = await this.repo.commitSyncSuccess({
        sourceId: 'src-datatft-platform',
        players: playersSafe,
        snapshots: hasLineups ? lRes.lineups : null,
        rawMaterial: hasLineups ? {
          sourceId: 'src-datatft-platform', recordKey: 'lineups:recent',
          fetchedAt: startedAt,
          contentSha256: crypto.createHash('sha256').update(JSON.stringify(lRes.lineups)).digest('hex'),
          content: JSON.stringify(lRes.lineups),
          parserVersion: DATATFT_PARSER_VERSION,
          contentType: 'application/json',
          note: `datatft 阵容快照 ${lRes.lineups.length} 条`
        } : null,
        jobPatch: {
          id: job.id, status: 'SUCCESS', finishedAt,
          fetchedCount: playersSafe.length + (hasLineups ? lRes.lineups.length : 0),
          duplicateCount: 0
        },
        // 状态仅推进到 READY（第三方聚合，非个人战绩来源；ACTIVE 保留给人工核验路径）
        sourcePatch: { lastSuccessAt: finishedAt, lastError: null, status: 'READY' }
      })
      const lineupsCount = playersRes.snapshots

      return {
        ok: true, status: 'SUCCESS',
        message: `datatft 同步完成: 选手 ${playersSafe.length}，阵容 ${lineupsCount} 条`,
        result: { tournament: tRes.name, playersCount: playersSafe.length, lineupsCount, jobId: job.id }
      }
    } catch (err) {
      const finishedAt = new Date().toISOString()
      await this.repo.commitSyncFailure({ jobId: job.id, sourceId: 'src-datatft-platform', finishedAt, error: err.message })
      return { ok: false, status: 'FAILED', message: `同步万象棋大数据平台失败: ${err.message}`, result: null }
    }
  }
}
