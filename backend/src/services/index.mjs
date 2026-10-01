// v3 P1-A · 服务编排（compose 根）
// createServices({ repo, env }) → HTTP 层唯一依赖对象；
// HTTP 层不再直接触达任何存储引擎（demo 自建 FileRepository / 正式注入 PgRepository）。

import { StatsService } from './stats.mjs'
import { ImportsService } from './imports.mjs'
import { SyncService } from './sync.mjs'

export function createServices(repo, env = {}) {
  const stats = new StatsService(repo, { smallSampleThreshold: env.smallSampleThreshold || 20 })
  const imports = new ImportsService(repo)
  const sync = new SyncService(repo, { enableDatatft: env.enableDatatft === true })

  return {
    repo,
    stats,
    imports,
    sync,
    mode: env.appMode || 'demo',
    smallSampleThreshold: env.smallSampleThreshold || 20,

    /** 就绪探测（/api/v1/ready）：正式模式 PG ping，200/503 (F04) */
    async isReady() {
      return this.repo.ping()
    },

    /** 真实健康信息（/api/v1/health）：mode、库连接状态、真实计数，无凭证/内部错误 */
    async health() {
      const connected = await this.repo.ping()
      let counts = null
      if (connected) {
        try {
          counts = await this.repo.healthCounts()
        } catch {
          counts = null // 连接瞬断等：如实置空，不伪造
        }
      }
      return {
        status: 'UP',
        mode: this.mode,
        storage: this.repo.kind,
        db: { connected, kind: this.repo.kind },
        counts,
        time: new Date().toISOString()
      }
    },

    async getDataStatus() {
      return this.repo.getDataStatus()
    },

    async getLineupsList() {
      return this.repo.getLineupsList()
    },

    async getLineupById(id) {
      return this.repo.getLineupById(id)
    },

    async getEventsList(dateStr, mode, opts) {
      return this.repo.getEventsList(dateStr, mode, opts)
    },

    async getEventById(id, opts) {
      return this.repo.getEventById(id, opts)
    },

    async getAllMatches(params) {
      return this.repo.getAllMatches(params)
    }
  }
}
