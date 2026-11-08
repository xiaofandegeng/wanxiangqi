// 王牌对决研究台 · 服务编排
import { PredictionService } from '../prediction/service.mjs'

export function createServices(repo, env = {}) {
  return {
    repo,
    prediction: new PredictionService(repo.pool),
    mode: env.appMode || 'formal',

    /** 就绪探测（/api/v1/ready）：权威存储 ping，200/503 */
    async isReady() {
      return this.repo.ping()
    },

    /** 真实健康信息（/api/v1/health）：mode、库连接状态、真实计数 */
    async health() {
      const connected = await this.repo.ping()
      let counts = null
      if (connected) {
        try {
          counts = await this.repo.healthCounts()
        } catch {
          counts = null
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
    }
  }
}
