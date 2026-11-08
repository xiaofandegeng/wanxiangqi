import { randomUUID } from 'node:crypto'
import { fail, payloadHash } from './domain.mjs'

function text(value, label, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw fail(`${label}必填且最多${max}字`, 'INVALID_OBSERVATION')
  }
  return value.trim()
}
function optional(value, label) {
  return value == null || value === '' ? null : text(value, label, 160)
}
function date(value, label) {
  const result = text(value, label, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result)) ||
      new Date(result).toISOString().slice(0, 10) !== result) {
    throw fail(`${label}必须为有效的YYYY-MM-DD日期`, 'INVALID_OBSERVATION')
  }
  return result
}
function player(row) {
  if (!row || typeof row !== 'object') throw fail('选手行必须为对象', 'INVALID_OBSERVATION')
  return { nickname: text(row.nickname, '原始昵称', 160), uid: optional(row.uid, 'UID') }
}
function uniquePlayers(rows) {
  // 仅检查本件资料的明显重复，不据昵称建立跨资料身份。
  const ids = rows.map(row => row.uid).filter(Boolean)
  const ambiguous = rows.some((row, i) => rows.some((other, j) => j < i && row.nickname === other.nickname && (!row.uid || !other.uid)))
  if (ambiguous || new Set(ids).size !== ids.length) {
    throw fail('资料内存在重复昵称或UID，请人工复核', 'INVALID_OBSERVATION')
  }
}

export function normalizeObservation(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') throw fail('需要资料对象', 'INVALID_OBSERVATION')
  if (!['ROSTER_WINNER', 'PLAYER_AGGREGATE'].includes(raw.kind)) {
    throw fail('不支持的资料类型', 'INVALID_OBSERVATION')
  }
  let sourceUrl
  try {
    const url = new URL(raw.sourceUrl)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error()
    sourceUrl = url.href
  } catch { throw fail('来源链接必须为不含凭证的HTTP(S)地址', 'INVALID_OBSERVATION') }
  const windowStart = date(raw.windowStart, '窗口开始日期')
  const windowEnd = date(raw.windowEnd, '窗口结束日期')
  // 这里比较中国日历日期，不将汇总窗口冒充精确比赛时间。
  const today = new Date(now + 8 * 3600 * 1000).toISOString().slice(0, 10)
  if (windowEnd < windowStart || windowEnd > today) {
    throw fail('日期窗口顺序错误或位于未来', 'INVALID_OBSERVATION')
  }
  if (!['WANXIANG', 'DIAMOND'].includes(raw.mode)) throw fail('请明确比赛模式', 'INVALID_OBSERVATION')
  const common = {
    sourceKey: text(raw.sourceKey, '来源唯一键', 160), kind: raw.kind,
    sourceUrl, sourceName: text(raw.sourceName, '来源名称', 160),
    evidenceId: text(raw.evidenceId, '原件证据编号', 160),
    evidenceLocator: text(raw.evidenceLocator, '原件定位'),
    mode: raw.mode, windowStart, windowEnd,
    version: optional(raw.version, '版本'), platform: optional(raw.platform, '平台'),
    region: optional(raw.region, '区服'), note: optional(raw.note, '说明')
  }
  if (raw.kind === 'ROSTER_WINNER') {
    if (!Array.isArray(raw.participants) || raw.participants.length !== 6) {
      throw fail('参赛名单须完整六人；编号是名单位置，不是最终名次', 'INVALID_OBSERVATION')
    }
    if (raw.participants.some(row => row && ('rank' in row))) {
      throw fail('名单资料不得附带推测的最终名次，请用完整赛果入口录入', 'INVALID_OBSERVATION')
    }
    const participants = raw.participants.map(player)
    uniquePlayers(participants)
    if (!Number.isInteger(raw.winnerSlot) || raw.winnerSlot < 1 || raw.winnerSlot > 6) {
      throw fail('请从六名参赛者中明确冠军', 'INVALID_OBSERVATION')
    }
    return { ...common, participants, winnerSlot: raw.winnerSlot }
  }
  if (!Array.isArray(raw.rows) || raw.rows.length < 1 || raw.rows.length > 200) {
    throw fail('汇总资料须有1至200行', 'INVALID_OBSERVATION')
  }
  const rows = raw.rows.map(row => {
    const identity = player(row)
    const { appearances, wins, top3, avgRank } = row
    if (![appearances, wins, top3].every(Number.isSafeInteger) || appearances < 1 ||
        appearances > 1000000 || wins < 0 || top3 < wins || appearances < top3) {
      throw fail('须满足0≤登顶数≤前三数≤出场数，且均为整数', 'INVALID_OBSERVATION')
    }
    if (avgRank != null) {
      if (!Number.isFinite(avgRank) || avgRank < 1 || avgRank > 6) {
        throw fail('平均名次须在1至6之间，未提供则留空', 'INVALID_OBSERVATION')
      }
      const minimum = wins + (top3 - wins) * 2 + (appearances - top3) * 4
      const maximum = wins + (top3 - wins) * 3 + (appearances - top3) * 6
      // 允许原图保留一至两位小数产生的舍入误差；不据均值反推逐局名次。
      const margin = appearances * 0.05 + 1e-8
      if (avgRank * appearances < minimum - margin || avgRank * appearances > maximum + margin) {
        throw fail('平均名次与登顶/前三次数矛盾，请复核原图', 'INVALID_OBSERVATION')
      }
    }
    return { ...identity, appearances, wins, top3, avgRank: avgRank ?? null }
  })
  uniquePlayers(rows)
  return { ...common, rows }
}

function wire(row) {
  return {
    ...row.payload, id: row.id, status: row.status,
    createdAt: row.created_at.toISOString(), verifiedAt: row.verified_at?.toISOString() || null,
    verifiedBy: row.verified_by, evidenceReady: Boolean(row.evidence_ready),
    contributesToMatchStats: false
  }
}

const READ_OBSERVATIONS = `
  SELECT o.*, (e.status='VERIFIED' AND b.size_bytes>0 AND octet_length(b.content)=b.size_bytes) AS evidence_ready
  FROM prediction_observations o
  LEFT JOIN evidences e ON e.id=o.evidence_id
  LEFT JOIN evidence_blobs b ON b.sha256=e.sha256`

export class ObservationService {
  constructor(pool, checkEvidence) {
    this.pool = pool
    this.checkEvidence = checkEvidence
  }
  async list() {
    const result = await this.pool.query(READ_OBSERVATIONS + ' ORDER BY o.created_at DESC, o.id')
    return result.rows.map(wire)
  }
  async get(id) {
    const result = await this.pool.query(READ_OBSERVATIONS + ' WHERE o.id=$1', [id])
    return result.rows[0] ? wire(result.rows[0]) : null
  }
  async save(raw) {
    const data = normalizeObservation(raw)
    const hash = payloadHash(data)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await this.checkEvidence(client, data.evidenceId)
      const { rows } = await client.query(`
        INSERT INTO prediction_observations(id,source_key,payload_hash,kind,payload,evidence_id)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_key) DO NOTHING RETURNING *`,
      [randomUUID(), data.sourceKey, hash, data.kind, JSON.stringify(data), data.evidenceId])
      const row = rows[0] || (await client.query(
        'SELECT * FROM prediction_observations WHERE source_key=$1', [data.sourceKey])).rows[0]
      if (row.payload_hash !== hash) throw fail('来源键已有不同内容，不覆盖旧资料', 'OBSERVATION_CONFLICT', 409)
      await client.query('COMMIT')
      return { observation: await this.get(row.id), deduplicated: rows.length === 0 }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }
  async review(id, operator, quarantine = false) {
    if (typeof operator !== 'string' || !operator.trim() || operator.length > 128) {
      throw fail('请填写操作人', 'OPERATOR_REQUIRED')
    }
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const row = (await client.query(
        'SELECT * FROM prediction_observations WHERE id=$1 FOR UPDATE', [id])).rows[0]
      if (!row) throw fail('资料不存在', 'NOT_FOUND', 404)
      if (row.status === 'QUARANTINED' || (!quarantine && row.status !== 'PENDING')) {
        throw fail('资料状态不允许本次操作', 'INVALID_REVIEW_STATE', 409)
      }
      if (!quarantine) await this.checkEvidence(client, row.evidence_id, true)
      const sql = quarantine
        ? "UPDATE prediction_observations SET status='QUARANTINED',quarantined_at=clock_timestamp(),quarantined_by=$2 WHERE id=$1 RETURNING *"
        : "UPDATE prediction_observations SET status='VERIFIED',verified_at=clock_timestamp(),verified_by=$2 WHERE id=$1 RETURNING *"
      const updated = (await client.query(sql, [id, operator.trim()])).rows[0]
      await client.query('COMMIT')
      return await this.get(updated.id)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }
}
