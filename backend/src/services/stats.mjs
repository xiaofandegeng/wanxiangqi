// v3 P2-A · 统一统计服务（唯一统计出口）
// 职责：参数校验（400）→ 仓储原始计数 → 统一格式化（比率/coverageNote/smallSample）
// 两仓储（PG/File）共用同一格式化器 stats-core.formatStatsFromCounts，保证口径一致 (V18)

import {
  validateStatsParams,
  formatStatsFromCounts,
  InvalidStatsParamError
} from '../../../tools/emulator-watcher/stats-core.mjs'

export class StatsService {
  constructor(repo, { smallSampleThreshold = 20 } = {}) {
    this.repo = repo
    this.smallSampleThreshold = smallSampleThreshold
  }

  /**
   * 单选手统计。非法 cutoff/from/to/mode → InvalidStatsParamError (HTTP 400, V16)
   */
  async getPlayerStats(playerId, { cutoffTime = null, mode = null, from = null, to = null } = {}) {
    const params = validateStatsParams({ cutoffTime, mode, from, to })
    const raw = await this.repo.computePlayerStatsRaw(playerId, {
      cutoffTime, mode, from, to
    })
    const stats = formatStatsFromCounts(raw, { smallSampleThreshold: this.smallSampleThreshold })
    return {
      playerId,
      params: {
        cutoff: params.cutoffMs != null ? new Date(params.cutoffMs).toISOString() : null,
        mode: params.modeFilter,
        from: params.fromMs != null ? new Date(params.fromMs).toISOString() : null,
        to: params.toMs != null ? new Date(params.toMs).toISOString() : null
      },
      stats
    }
  }

  async getPlayersList({ query = '', sort = 'rankScore', mode = null, from = null, to = null } = {}) {
    validateStatsParams({ cutoffTime: null, mode, from, to })
    const sortWhitelist = ['rankScore', 'winRate', 'top3Rate', 'avgRank']
    if (!sortWhitelist.includes(sort)) {
      throw new InvalidStatsParamError(`参数 sort 必须为 ${sortWhitelist.join(' / ')} 之一`, 'sort')
    }
    return this.repo.getPlayersList({ query, sort, mode, from, to })
  }

  async getPlayerMatches(playerId, { recordStatus = null } = {}) {
    const allowed = [null, 'ACTIVE', 'PENDING', 'QUARANTINED', 'SUPERSEDED', 'REVOKED']
    if (!allowed.includes(recordStatus)) {
      throw new InvalidStatsParamError(
        `参数 recordStatus 必须为 ${allowed.filter(Boolean).join(' / ')} 之一或省略`, 'recordStatus'
      )
    }
    return this.repo.getPlayerMatches(playerId, { recordStatus })
  }
}
