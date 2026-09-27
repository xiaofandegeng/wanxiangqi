// 王牌对决 - 核心防泄漏与基线算法工具库 (Anti-Leakage & Baseline Analytics)

export interface RawMatchRecord {
  id: string
  playerId: string
  matchTime: string // ISO 格式或 "YYYY-MM-DD HH:mm:ss"
  finalRank: number // 1 ~ 6
  commanderName?: string
  lineupSummary?: string
}

export interface PlayerPreMatchStats {
  playerId: string
  cutoffTime: string
  totalValidMatches: number
  winCount: number
  top3Count: number
  winRate: number
  top3Rate: number
  leakedMatchesCount: number // 被安全拦截的未来/泄漏对局数
  commanderUsage: Record<string, number>
}

/**
 * 计算选手赛前画像，严格执行防泄漏过滤：
 * 只有 matchTime < cutoffTime 的历史战绩才允许纳入画像计算。
 */
export function computePreMatchProfile(
  playerId: string,
  allMatches: RawMatchRecord[],
  cutoffTimeStr: string
): PlayerPreMatchStats {
  const cutoffTime = new Date(cutoffTimeStr).getTime()
  let validMatches = 0
  let winCount = 0
  let top3Count = 0
  let leakedMatchesCount = 0
  const commanderUsage: Record<string, number> = {}

  for (const match of allMatches) {
    if (match.playerId !== playerId) continue

    const matchTime = new Date(match.matchTime).getTime()
    // 关键防泄漏切片断言：对局时间必须严格小于预测截点
    if (matchTime >= cutoffTime) {
      leakedMatchesCount++
      continue
    }

    validMatches++
    if (match.finalRank === 1) {
      winCount++
    }
    if (match.finalRank <= 3) {
      top3Count++
    }
    if (match.commanderName) {
      commanderUsage[match.commanderName] = (commanderUsage[match.commanderName] || 0) + 1
    }
  }

  const winRate = validMatches > 0 ? Number((winCount / validMatches).toFixed(4)) : 0
  const top3Rate = validMatches > 0 ? Number((top3Count / validMatches).toFixed(4)) : 0

  return {
    playerId,
    cutoffTime: cutoffTimeStr,
    totalValidMatches: validMatches,
    winCount,
    top3Count,
    winRate,
    top3Rate,
    leakedMatchesCount,
    commanderUsage
  }
}

/**
 * 均匀基线模型：6 名选手各分配 1/6 (约 16.67%)
 */
export function computeUniformBaseline(): Record<number, number> {
  const baselineProb = 1 / 6
  const result: Record<number, number> = {}
  for (let slot = 1; slot <= 6; slot++) {
    result[slot] = Number(baselineProb.toFixed(4))
  }
  return result
}

/**
 * 概率归一化函数：
 * 保证 6 个席位的概率总和严格归一化为 1.0 (100%)
 */
export function normalizeProbabilities(rawScores: Record<number, number>): Record<number, number> {
  const slots = Object.keys(rawScores).map(Number)
  if (slots.length !== 6) {
    throw new Error(`参赛席位数必须严格为 6，当前为 ${slots.length}`)
  }

  const totalScore = slots.reduce((acc, slot) => acc + (rawScores[slot] || 0), 0)
  if (totalScore <= 0) {
    return computeUniformBaseline()
  }

  const normalized: Record<number, number> = {}
  let runningSum = 0

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    if (i === slots.length - 1) {
      // 最后一个席位补齐微小浮点误差，保证总和精确为 1.0
      normalized[slot] = Number((1.0 - runningSum).toFixed(4))
    } else {
      const prob = Number(((rawScores[slot] || 0) / totalScore).toFixed(4))
      normalized[slot] = prob
      runningSum += prob
    }
  }

  return normalized
}

/**
 * 校验场次与席位完整性规则：
 * 1. 席位严格为 1 ~ 6 且不能缺失或重复
 * 2. 赛后名次 (若有) 1 ~ 6 必须唯一且无重复
 */
export function validateEventIntegrity(slots: Array<{ slot: number; finalRank?: number | null }>): {
  isValid: boolean
  errors: string[]
} {
  const errors: string[] = []
  if (slots.length !== 6) {
    errors.push(`场次席位数必须为 6，当前为 ${slots.length}`)
  }

  const slotSet = new Set<number>()
  const rankSet = new Set<number>()

  for (const item of slots) {
    if (item.slot < 1 || item.slot > 6) {
      errors.push(`席位号 #${item.slot} 超出有效范围 1~6`)
    }
    if (slotSet.has(item.slot)) {
      errors.push(`席位号 #${item.slot} 存在重复`)
    }
    slotSet.add(item.slot)

    if (item.finalRank !== undefined && item.finalRank !== null) {
      if (item.finalRank < 1 || item.finalRank > 6) {
        errors.push(`最终名次第 ${item.finalRank} 名超出范围 1~6`)
      }
      if (rankSet.has(item.finalRank)) {
        errors.push(`最终名次第 ${item.finalRank} 名存在重复，违反常规单人登顶规则`)
      }
      rankSet.add(item.finalRank)
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}
