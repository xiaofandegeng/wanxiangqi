// v6 · 外部来源同步服务（阵容快照唯一同步面）
//
// 铁律：
// - hokace：同步台账全记录（sync_jobs）+ 原始响应存证（raw_materials）；
//   失败保留旧快照、lastSuccessAt 不动 (V15)；成功走单事务（快照替换 +
//   存证 + 台账 + 来源推进一致提交，中途失败整体回滚）
// - datatft：v6 起保持隔离（409 SOURCE_DISABLED）——原同步路径会写
//   players 赛事字段，随赛事/玩家战绩产品退役，适配器已删除
// - 其余来源：400 UNCONFIGURED（状态只能由真实接入动作改变，禁止凭同步动作宣称 ACTIVE）

import crypto from 'node:crypto'

// v4 W4：页面级快照版本/窗口说明提取（eyebrow「v260924 · 7 日对局快照」注入全部条目）。
// 导出供测试 import 断言（版本号是存证契约的一部分，测试不得再硬编码字面量）。
// 注意：raw_materials.parser_version 列宽 VARCHAR(32)，版本串不得超长（超长会让同步整单失败）。
export const HOKACE_PARSER_VERSION = 'hokace-astro-v2609-pagelevel'

export class SyncService {
  constructor(repo) {
    this.repo = repo
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
    if (sourceId === 'src-wxq-official') return this.#syncOfficialContent()
    if (sourceId === 'src-datatft-platform') {
      const err = new Error(
        'datatft 平台同步已随 v6 转型停用（原路径会写玩家/赛事数据）。' +
        '如需重新接入须先核实 API 契约与授权范围并重建适配器。'
      )
      err.status = 409
      err.code = 'SOURCE_DISABLED'
      throw err
    }
    const err = new Error(`数据源 [${sourceId}] 未配置自动同步（UNCONFIGURED/UNAVAILABLE）`)
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
      const { syncHokaceLineups } = await import('../adapters/hokace.mjs')
      const result = await syncHokaceLineups()
      const finishedAt = result.endTime || new Date().toISOString()

      if (result.status !== 'SUCCESS' || !Array.isArray(result.data) || result.data.length === 0) {
        // V15：失败保留旧快照，仅记错误与尝试时间，绝不更新 lastSuccessAt（台账与来源状态同事务）
        const error = result.error || '同步未返回有效快照'
        await this.repo.commitSyncFailure({ jobId: job.id, sourceId: 'src-hokace-wiki', finishedAt, error })
        return { ok: false, status: 'FAILED', message: `数据源同步未完成: ${error}`, result }
      }

      // 快照替换 / 原始正文存证 / 台账 SUCCESS / 来源推进 单事务落库 ——
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

  /**
   * M3-1 官网第一方内容抓取存证：只读 GET 官网公开页（首页/专题站/新手指引/
   * 官方资讯接口），原文+SHA-256+实测字节数入 raw_materials（同事务）。
   * 不写任何业务快照/统计——这是内容依据存证，不是数据同步。
   * 任一目标失败 → 整单 FAILED，不落部分存证（诚实原子）。
   */
  async #syncOfficialContent() {
    const startedAt = new Date().toISOString()
    const job = await this.repo.recordSyncJob({
      sourceId: 'src-wxq-official', jobType: 'OFFICIAL_CONTENT_CAPTURE',
      scope: 'official:pages', startedAt
    })
    await this.repo.updateDataSource('src-wxq-official', { lastAttemptAt: startedAt })

    try {
      const { fetchOfficialContent } = await import('../adapters/official-site.mjs')
      const result = await fetchOfficialContent()
      const finishedAt = result.endedAt || new Date().toISOString()

      if (result.status !== 'SUCCESS' || !Array.isArray(result.materials) || result.materials.length === 0) {
        const error = result.error || '官网抓取未返回任何存证'
        await this.repo.commitSyncFailure({ jobId: job.id, sourceId: 'src-wxq-official', finishedAt, error })
        return { ok: false, status: 'FAILED', message: `官网内容抓取未完成: ${error}`, result }
      }

      // 多目标原文存证 + 台账 SUCCESS + 来源推进（UNCONFIGURED → READY 由首次成功动作触发）
      // 单事务落库：任一目标入库失败整体回滚
      await this.repo.commitSyncSuccess({
        sourceId: 'src-wxq-official',
        rawMaterials: result.materials.map(m => ({
          sourceId: 'src-wxq-official',
          recordKey: m.recordKey,
          fetchedAt: startedAt,
          contentSha256: m.contentSha256,
          content: m.content,
          parserVersion: 'official-raw-v1',
          contentType: m.contentType,
          sizeBytes: m.sizeBytes,
          note: `官网公开页只读存证 ${m.url}`
        })),
        jobPatch: {
          id: job.id, status: 'SUCCESS', finishedAt,
          fetchedCount: result.materials.length, insertedCount: result.materials.length
        },
        sourcePatch: { lastSuccessAt: finishedAt, lastError: null, status: 'READY' }
      })

      return {
        ok: true, status: 'SUCCESS',
        message: `官网第一方资料抓取存证完成 (${result.materials.length} 个目标)`,
        result: {
          count: result.materials.length, startedAt, finishedAt, jobId: job.id,
          materials: result.materials.map(m => ({
            recordKey: m.recordKey, sha256: m.contentSha256, sizeBytes: m.sizeBytes
          }))
        }
      }
    } catch (err) {
      const finishedAt = new Date().toISOString()
      await this.repo.commitSyncFailure({ jobId: job.id, sourceId: 'src-wxq-official', finishedAt, error: err.message })
      return { ok: false, status: 'FAILED', message: `官网内容抓取未完成: ${err.message}`, result: null }
    }
  }
}
