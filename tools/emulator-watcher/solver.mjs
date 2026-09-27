// 实时决策运算引擎 (Live Solver)
// 依据段位先验、历史胜率与赔率快速推导 6 人即时胜率分布与 EV 期望值

// 段位基础先验实力分映射 (用于新选手冷启动)
const RANK_BASE_SCORES = {
  '万象宗师': 100,
  '无双王者': 70,
  '最强王者': 45,
  '星耀': 25,
  '钻石': 10
}

/**
 * 根据段位文本与星级分计算选手基础相对强度
 */
export function estimatePlayerStrength(rankText = '', rankScore = 0) {
  let base = 50
  for (const [tier, score] of Object.entries(RANK_BASE_SCORES)) {
    if (rankText.includes(tier)) {
      base = score
      break
    }
  }
  // 小段位修正 (I > II > III > IV > V)
  let subTierBonus = 0
  if (rankText.includes(' I') || rankText.includes('1')) subTierBonus = 15
  else if (rankText.includes(' II') || rankText.includes('2')) subTierBonus = 10
  else if (rankText.includes(' III') || rankText.includes('3')) subTierBonus = 5

  // 星级加成 (每星 +0.5分)
  const starBonus = Math.min(rankScore * 0.5, 40)

  return base + subTierBonus + starBonus
}

/**
 * 6人即时胜率归一化计算 (Plackett-Luce 相对强度模型)
 */
export function solveLiveProbabilities(participants) {
  if (!participants || participants.length !== 6) {
    throw new Error(`必须为 6 名参赛选手，当前数量: ${participants?.length}`)
  }

  // 1. 计算每个席位的相对实力打分
  const strengths = participants.map((p) => {
    // 若选手有历史战绩胜率，结合历史权重 (70% 历史 + 30% 段位)
    if (p.winRateRecent !== undefined && p.sampleMatches && p.sampleMatches >= 10) {
      const historicalScore = p.winRateRecent * 300 // 胜率 33% 对应 100 分
      const rankScore = estimatePlayerStrength(p.rankText, p.rankScore || 0)
      return Math.max(historicalScore * 0.7 + rankScore * 0.3, 10)
    }
    // 无历史战绩时走纯段位先验估算
    return Math.max(estimatePlayerStrength(p.rankText, p.rankScore || 0), 10)
  })

  // 2. 指数平滑与 Softmax 归一化 (使用适度温度系数 T = 40 避免过度极端)
  const temperature = 40.0
  const expScores = strengths.map((s) => Math.exp(s / temperature))
  const totalExp = expScores.reduce((a, b) => a + b, 0)

  const probabilities = {}
  let runningSum = 0

  for (let i = 0; i < 6; i++) {
    const slot = participants[i].slot || i + 1
    if (i === 5) {
      probabilities[slot] = Number((1.0 - runningSum).toFixed(4))
    } else {
      const prob = Number((expScores[i] / totalExp).toFixed(4))
      probabilities[slot] = prob
      runningSum += prob
    }
  }

  return probabilities
}

/**
 * 实时计算 6 席各选手 EV 净收益与投资推荐建议
 */
export function solveLiveRecommendations(participants, probabilities, supportSnapshots = {}) {
  return participants.map((p) => {
    const slot = p.slot
    const prob = probabilities[slot] || (1 / 6)
    
    // 获取支持进度占比与预估赔率
    const supportRatio = supportSnapshots[slot]?.ratioPercent || 16.67
    // 若盘面无直接倍率，使用支持池倒数模拟估计：赔率 ≈ (100 / 支持比例) * 0.95 (保守扣减安全边际)
    const estimatedOdds = supportSnapshots[slot]?.oddsDisplay || 
      Number(Math.max((100 / Math.max(supportRatio, 3)) * 0.95, 1.2).toFixed(2))

    // 假设测试投入 100 钻计算标准单注 EV
    const testInvest = 100
    const grossReturn = testInvest * estimatedOdds
    const netEV = Number((prob * grossReturn - testInvest).toFixed(2))
    const roi = Number(((netEV / testInvest) * 100).toFixed(1))

    let recommendation = 'NEUTRAL' // 观望
    if (netEV > 15 && prob >= 0.25) {
      recommendation = 'STRONG_BUY' // 强烈推荐
    } else if (netEV > 5 && prob >= 0.18) {
      recommendation = 'BUY'        // 推荐支持
    } else if (netEV < -15 || prob < 0.10) {
      recommendation = 'AVOID'      // 高危陷阱
    }

    return {
      slot,
      nickname: p.nickname,
      rankText: p.rankText,
      rankScore: p.rankScore,
      probability: prob,
      estimatedOdds,
      netEV,
      roi,
      recommendation
    }
  }).sort((a, b) => b.netEV - a.netEV) // 按净期望收益由高到低排序
}
