// v3 P2-A · 统一统计口径核心（纯函数，零 IO）
// 任务书 §P2-A / V12 / V18：
//   - 本模块是统计过滤语义的唯一事实源（JS 侧）；PG 侧 SQL 以等价性测试锁死（V18）
//   - 双时间截点: matchTime < cutoff ∧ availableAt ≤ cutoff；availableAt=cutoff 纳入、matchTime=cutoff 排除
//   - availableAt 缺失且有截点 → 排除（禁止回退 matchTime）
//   - 未指定 cutoff 时以 now 为隐式截点（未来完赛/未来收录的记录不得计入"当前统计"）
//   - 时间窗口 [from, to)；指定 mode 时未知/不匹配一律排除
//   - 有效记录 = verified ∧ recordStatus=ACTIVE ∧ 非 synthetic ∧ 名次为 1~6 整数
//   - N=0 → 比率/均名为 null（严禁 0 兜底）；N>0 无夺冠 → 0
//
// 被 FileRepository（tools 侧 StorageEngine）与 backend services 共用；
// 修改任何过滤条件必须同步修改 pg-repository.mjs 的 SQL 实现并跑等价性测试。

export class InvalidStatsParamError extends Error {
  constructor(message, field) {
    super(message)
    this.name = 'InvalidStatsParamError'
    this.status = 400
    this.code = 'INVALID_PARAM'
    this.field = field || null
  }
}

export const DEFAULT_SMALL_SAMPLE_THRESHOLD = 20

function parseDateParam(name, value) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') {
    throw new InvalidStatsParamError(`参数 ${name} 必须为 ISO 日期字符串`, name)
  }
  const ms = new Date(value).getTime()
  if (isNaN(ms)) {
    throw new InvalidStatsParamError(`参数 ${name} [${value}] 不是有效的 ISO 日期格式`, name)
  }
  return ms
}

/**
 * 校验并解析统计查询参数（非法值抛 400 InvalidStatsParamError，V16 前置）
 */
export function validateStatsParams({ cutoffTime = null, mode = null, from = null, to = null } = {}) {
  const cutoffMs = parseDateParam('cutoff', cutoffTime)
  const fromMs = parseDateParam('from', from)
  const toMs = parseDateParam('to', to)
  if (fromMs !== null && toMs !== null && fromMs > toMs) {
    throw new InvalidStatsParamError('参数 from 不得晚于 to', 'from')
  }
  if (mode !== null && mode !== undefined && mode !== '' && typeof mode !== 'string') {
    throw new InvalidStatsParamError('参数 mode 必须为字符串', 'mode')
  }
  const modeFilter = (mode === null || mode === undefined || mode === '' || mode === 'ALL') ? null : mode
  return { cutoffMs, fromMs, toMs, modeFilter }
}

/**
 * 记录级有效性判定（正式口径）。record 兼容 JS 侧 camelCase 战绩记录。
 */
export function isEffectiveMatchRecord(m, { cutoffMs = null, fromMs = null, toMs = null, modeFilter = null, nowMs = null } = {}) {
  // 正式口径三条件：已核验 + 当前有效版本 + 非合成 (P0-B)
  if (m.verified !== true) return false
  const status = m.recordStatus == null ? 'ACTIVE' : m.recordStatus
  if (status !== 'ACTIVE') return false
  if (m.synthetic === true) return false

  // 名次必须是 1~6 整数（六席对局事实）
  if (typeof m.finalRank !== 'number' || !Number.isInteger(m.finalRank) || m.finalRank < 1 || m.finalRank > 6) {
    return false
  }

  const matchDateMs = new Date(m.matchTime).getTime()
  if (isNaN(matchDateMs)) return false

  // 隐式截点：未指定 cutoff 时以 now 为截点（未来完赛不得计入当前统计）
  const effectiveCutoffMs = cutoffMs != null ? cutoffMs : (nowMs != null ? nowMs : Date.now())

  // 双时间截点 (V12)：matchTime < cutoff（严格小于）
  if (matchDateMs >= effectiveCutoffMs) return false

  // availableAt ≤ cutoff；缺失 → 排除（禁止回退 matchTime）
  if (!m.availableAt) return false
  const availableMs = new Date(m.availableAt).getTime()
  if (isNaN(availableMs)) return false
  if (availableMs > effectiveCutoffMs) return false

  // 模式过滤：指定具体模式时，mode 未知或不匹配一律排除（禁止模糊通过）
  if (modeFilter && m.mode !== modeFilter) return false

  // 时间窗口 [from, to)
  if (fromMs !== null && matchDateMs < fromMs) return false
  if (toMs !== null && matchDateMs >= toMs) return false

  return true
}

/**
 * SCD-2 版本选择 (V13)：同一 recordKey 在截点 t 可见的那一行版本
 * （availableAt ≤ t 且未被 t 之前的事后更正取代）。t 为空时按"当前版本"（未被取代的最新版）。
 * 输入应为本键的全部版本行；无 recordKey 的行原样保留（各自独立）。
 */
export function selectVisibleVersion(versions, tMs = null) {
  if (!Array.isArray(versions) || versions.length === 0) return null
  let best = null
  for (const v of versions) {
    const availMs = v.availableAt ? new Date(v.availableAt).getTime() : null
    if (tMs !== null) {
      if (availMs === null || isNaN(availMs) || availMs > tMs) continue
      const supMs = v.supersededAt ? new Date(v.supersededAt).getTime() : null
      if (supMs !== null && !isNaN(supMs) && supMs <= tMs) continue
    } else {
      if (v.supersededAt) continue // 当前版本 = supersededAt 为空的行
    }
    const rev = Number(v.revision) || 1
    if (!best || rev > (Number(best.revision) || 1)) best = v
  }
  return best
}

/**
 * 分组选出每个 recordKey 的可见版本（+无键行），返回扁平数组
 */
export function selectVisibleMatches(matches, tMs = null) {
  const groups = new Map()
  const noKey = []
  for (const m of matches) {
    if (!m.recordKey) {
      noKey.push(m)
    } else {
      if (!groups.has(m.recordKey)) groups.set(m.recordKey, [])
      groups.get(m.recordKey).push(m)
    }
  }
  const out = []
  for (const versions of groups.values()) {
    const v = selectVisibleVersion(versions, tMs)
    if (v) out.push(v)
  }
  return out.concat(noKey)
}

/**
 * 由计数值格式化统计（两 repo 共用：PG 返回 SQL 计数，File 由 JS 过滤计数）
 * N=0 → 比率/均名 null；N>0 无夺冠 → 0（禁 || 兜底）
 */
export function formatStatsFromCounts({ n, firstPlaces, top3Places, rankSum } = {}, { smallSampleThreshold = DEFAULT_SMALL_SAMPLE_THRESHOLD } = {}) {
  const count = Number(n) || 0
  const first = Number(firstPlaces) || 0
  const top3 = Number(top3Places) || 0
  if (count === 0) {
    return {
      sampleCount: 0,
      firstPlaces: 0,
      top3Places: 0,
      winRate: null,
      top3Rate: null,
      avgRank: null,
      coverageNote: '已收录 0 局',
      warning: '暂无已核验战绩',
      isSmallSample: true
    }
  }
  const avg = rankSum != null ? Number((Number(rankSum) / count).toFixed(2)) : null
  return {
    sampleCount: count,
    firstPlaces: first,
    top3Places: top3,
    winRate: Number((first / count).toFixed(4)),
    top3Rate: Number((top3 / count).toFixed(4)),
    avgRank: avg,
    coverageNote: `已收录 ${count} 局`,
    warning: count < smallSampleThreshold ? `样本量较少 (N < ${smallSampleThreshold})` : null,
    isSmallSample: count < smallSampleThreshold
  }
}

/**
 * JS 侧完整统计（File 路径 / 等价性测试基准）
 */
export function computeStatsFromMatches(matches, { cutoffMs = null, fromMs = null, toMs = null, modeFilter = null, smallSampleThreshold } = {}) {
  const nowMs = Date.now()
  const visible = selectVisibleMatches(matches, cutoffMs != null ? cutoffMs : nowMs)
  const effective = visible.filter(m =>
    isEffectiveMatchRecord(m, { cutoffMs, fromMs, toMs, modeFilter, nowMs })
  )
  const firstPlaces = effective.filter(m => m.finalRank === 1).length
  const top3Places = effective.filter(m => m.finalRank <= 3).length
  const rankSum = effective.reduce((acc, m) => acc + m.finalRank, 0)
  return formatStatsFromCounts(
    { n: effective.length, firstPlaces, top3Places, rankSum },
    { smallSampleThreshold }
  )
}

/**
 * 稳定记录键 (V13)：来源外部键优先，其次受控证据键，最后 playerId+matchTime
 */
export function deriveRecordKey(rec = {}) {
  if (rec.sourceId && rec.externalMatchId && rec.externalPlayerId) {
    return `${rec.sourceId}:${rec.externalMatchId}:${rec.externalPlayerId}`
  }
  if (rec.evidenceId && rec.slot) {
    return `ev:${rec.evidenceId}:${rec.slot}`
  }
  const matchTime = rec.matchTime ? new Date(rec.matchTime).toISOString() : 'unknown'
  return `${rec.playerId || 'unknown'}:${matchTime}`
}

/**
 * 可空整数规整（v4 W2）：显式 null/undefined/空串必须保持 null。
 * 直接 Number.isInteger(Number(v)) 会把 null 变 0（Number(null)===0），
 * 使「留空=null」的可选字段（slot/roundsSurvived/playerCount）被静默填 0。
 */
export function nullableInt(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}
