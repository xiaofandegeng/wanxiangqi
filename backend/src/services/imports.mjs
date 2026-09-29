// v3 P1-B · 导入与核验服务（事务边界与策略层）
//
// 策略（任务书 §6-2 / V17）：
// 1. importMatches：入参 verified 一律忽略 → verified=false + record_status=PENDING；
//    availableAt 缺省=导入时刻且必须 ≥ matchTime；record_key 由 deriveRecordKey 统一推导
// 2. confirmSlotAudit：单事务（存证→选手→场次→席位→战绩），sha256 必填不得伪造
// 3. verifyMatch：核验动作放行（verifiedBy + availableAt=now + →ACTIVE），被隔离/被取代记录拒绝

import { StorageEngine } from '../../../tools/emulator-watcher/storage.mjs'
import { deriveRecordKey } from '../../../tools/emulator-watcher/stats-core.mjs'

export class ImportsService {
  constructor(repo) {
    this.repo = repo
    // 校验器复用引擎的强校验（纯方法，不触状态）
    this.validator = new StorageEngine({ dataDir: '/nonexistent-validator-scratch' })
  }

  /**
   * 批量导入战绩。整批校验，任何一条非法 → 400（不部分入库）。
   * 返回 { batchId, inserted, superseded, duplicates, ... }
   */
  async importMatches(records, meta = {}) {
    if (!Array.isArray(records) || records.length === 0) {
      const err = new Error('导入记录列表不能为空数组')
      err.status = 400
      throw err
    }

    const normalized = []
    const errors = []
    const importAt = new Date().toISOString()

    records.forEach((rec, idx) => {
      try {
        const valid = this.validator.validateMatchRecord(rec, idx)
        // availableAt 语义收紧：缺省=导入时刻；显式早于 matchTime → 拒绝（收录不可能早于发生）
        if (valid.availableAt && valid.matchTime && new Date(valid.availableAt).getTime() < new Date(valid.matchTime).getTime()) {
          throw new Error(`第 ${idx + 1} 条记录 availableAt 早于 matchTime（收录时刻不可能早于对局发生时刻）`)
        }
        normalized.push({
          ...valid,
          availableAt: valid.availableAt || importAt,
          recordKey: deriveRecordKey({
            sourceId: rec.sourceId, externalMatchId: rec.externalMatchId,
            externalPlayerId: rec.externalPlayerId, evidenceId: rec.evidenceId,
            slot: rec.slot, playerId: valid.playerId, matchTime: valid.matchTime
          }),
          sourceId: rec.sourceId || null,
          externalMatchId: rec.externalMatchId || null,
          externalPlayerId: rec.externalPlayerId || null,
          playerCount: Number.isInteger(Number(rec.playerCount)) ? Number(rec.playerCount) : null,
          gameVersion: rec.gameVersion || null,
          nickname: rec.nickname || null,
          operator: 'api:admin/imports'
          // verified 已在校验器内按入参保留，仓储写路径统一强制 FALSE+PENDING
        })
      } catch (err) {
        errors.push({ index: idx, error: err.message })
      }
    })

    if (errors.length > 0) {
      const err = new Error(`导入数据校验失败 (共 ${errors.length} 处错误): ${errors[0].error}`)
      err.status = 400
      err.details = errors
      throw err
    }

    return this.repo.importMatches(normalized, { source: meta.source })
  }

  async confirmSlotAudit(payload, staff = 'AUDIT_STAFF') {
    return this.repo.confirmSlotAudit(payload, staff)
  }

  /**
   * 核验放行（复验1/2）：verifiedBy 必填；evidenceId 可选（记录自带证据时）。
   * 无任何证据关联 → 仓储层 422 NO_EVIDENCE；核验以 SCD-2 建新版本，availableAt=实际核验时刻。
   */
  async verifyMatch(matchId, { verifiedBy, evidenceId = null } = {}) {
    if (!verifiedBy || typeof verifiedBy !== 'string') {
      const err = new Error('核验动作必须提供 verifiedBy 操作人')
      err.status = 400
      throw err
    }
    if (evidenceId != null && typeof evidenceId !== 'string') {
      const err = new Error('evidenceId 必须是字符串（证据存证 ID）')
      err.status = 400
      throw err
    }
    const result = await this.repo.verifyMatch(matchId, { verifiedBy, evidenceId })
    if (!result) {
      const err = new Error(`记录 [${matchId}] 不存在`)
      err.status = 404
      throw err
    }
    return result
  }

  async getImportBatch(batchId) {
    return this.repo.getImportBatchById(batchId)
  }
}
