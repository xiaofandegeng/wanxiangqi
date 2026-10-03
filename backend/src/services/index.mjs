// v6 · 服务编排（compose 根）
// createServices({ repo, env }) → HTTP 层唯一依赖对象；
// HTTP 层不直接触达存储引擎（正式注入 PgRepository；测试注入隔离测试库栈）。
// v6 M1-4：stats/imports 服务随赛事与玩家战绩产品退役删除。
// v6 M2：新增内容服务（§7.2 生命周期与发布校验）；阵容公开读取切换为
// 「稳定阵容为根 + 来源快照子对象」新契约（M2-7），旧快照页契约退役。

import { SyncService } from './sync.mjs'
import { ContentService } from './content.mjs'

export function createServices(repo, env = {}) {
  const sync = new SyncService(repo)
  const content = new ContentService(repo)

  return {
    repo,
    sync,
    content,
    mode: env.appMode || 'formal',

    /** 就绪探测（/api/v1/ready）：权威存储 ping，200/503 (F04) */
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
    }
  }
}
