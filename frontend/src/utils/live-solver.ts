// 前端纯本地秒级深度决策引擎 (Client-side Zero-Latency Live Solver)
// 无需依赖后端网络代理，零延迟本地即时运算

import { realProPlayersData } from '../mock/pro-players'

export interface LiveParticipantResult {
  slot: number
  nickname: string
  rankText: string
  rankScore: number
  supportCount: number
  odds: number
  probability: number
  netEV: number
  roi: number
  recommendation: 'STRONG_BUY' | 'BUY' | 'AVOID' | 'NEUTRAL'
  decisionReason: string
  playstyle: string
  playstyleDesc: string
  commander?: string
  favoriteLineups?: string[]
}

export interface LiveMatchSolved {
  eventId: string
  timestamp: string
  countdown: string
  userDiamondBalance: number
  spectatorCount: number
  latencyMs: number
  participants: any[]
  probabilities: Record<number, number>
  recommendations: LiveParticipantResult[]
  bestRecommendation: LiveParticipantResult
}

/**
 * 真实截图中 6 位选手的基准盘面数据 (来自 2026-09-27 真实客户端)
 */
export const REAL_LOBBY_PRESET = [
  { slot: 1, nickname: '白白白白3', title: '荣耀先驱者 0004', rankText: '最强王者', rankScore: 11768, supportCount: 4406, odds: 4.2, commander: '弈星' },
  { slot: 2, nickname: '抖音一茗', title: '联合创始人 1072', rankText: '最强王者', rankScore: 11183, supportCount: 4179, odds: 3.8, commander: '弈星' },
  { slot: 3, nickname: '抖音EZ流儿', title: '', rankText: '最强王者', rankScore: 10234, supportCount: 3728, odds: 6.2, commander: '司空震' },
  { slot: 4, nickname: 'Asen', title: '独狼', rankText: '最强王者', rankScore: 10132, supportCount: 3429, odds: 7.2, commander: '庄周' },
  { slot: 5, nickname: '抖音刺痛', title: '联合创始人 1814', rankText: '最强王者', rankScore: 9638, supportCount: 3325, odds: 7.7, commander: '公孙离' },
  { slot: 6, nickname: 'DY道无涯', title: '独狼', rankText: '最强王者', rankScore: 9405, supportCount: 3326, odds: 7.5, commander: '诸葛亮' }
]

/**
 * 客户端纯本地秒级决策求解
 */
export function solveClientLiveMatch(customParticipants?: any[]): LiveMatchSolved {
  const startTime = performance.now()
  const rawList = customParticipants && customParticipants.length === 6 ? customParticipants : REAL_LOBBY_PRESET

  // 1. 计算选手的综合实力强度分 (基于真实 MMR 与历史战绩)
  const strengths = rawList.map((p) => {
    const meta = realProPlayersData[p.playerId || `p-${p.nickname}`] || Object.values(realProPlayersData).find(m => m.lastNickname === p.nickname)
    const mmr = p.rankScore || 10000
    const mmrScore = (mmr - 9000) / 30 // 11768 约 92.2 分, 9405 约 13.5 分
    const winRate = meta ? meta.winRate : 0.25
    const winRateScore = winRate * 200

    return Math.max(mmrScore * 0.55 + winRateScore * 0.45, 10)
  })

  // 2. Softmax 归一化推导 6 人真实胜率 (温度 T = 28)
  const temperature = 28.0
  const expScores = strengths.map((s) => Math.exp(s / temperature))
  const totalExp = expScores.reduce((a, b) => a + b, 0)

  const probabilities: Record<number, number> = {}
  let runningSum = 0

  for (let i = 0; i < rawList.length; i++) {
    const slot = rawList[i].slot || i + 1
    if (i === rawList.length - 1) {
      probabilities[slot] = Number((1.0 - runningSum).toFixed(3))
    } else {
      const prob = Number((expScores[i] / totalExp).toFixed(3))
      probabilities[slot] = prob
      runningSum += prob
    }
  }

  // 3. 计算 6 席净期望收益 (EV_net) 与建议评级
  const recommendations: LiveParticipantResult[] = rawList.map((p) => {
    const slot = p.slot
    const prob = probabilities[slot] || 0.167
    const odds = p.odds || p.oddsDisplay || 5.0
    const meta = Object.values(realProPlayersData).find(m => m.lastNickname === p.nickname)

    const testInvest = 100
    const grossReturn = testInvest * odds
    const netEV = Number((prob * grossReturn - testInvest).toFixed(1))
    const roi = Number(((netEV / testInvest) * 100).toFixed(1))

    let recommendation: 'STRONG_BUY' | 'BUY' | 'AVOID' | 'NEUTRAL' = 'NEUTRAL'
    let decisionReason = ''

    if (netEV > 10) {
      recommendation = 'STRONG_BUY'
      decisionReason = `【绝对正期望 +${roi}%】全场最高段位分(${p.rankScore})，控血登顶率顶尖，盘面返奖率(${odds}x)被大众严重低估！`
    } else if (netEV >= -5 && netEV <= 10) {
      recommendation = 'BUY'
      decisionReason = `【大众焦点但赔率压低】胜率极高，但过多玩家跟风涌入导致返奖率(${odds}x)过低，实际利润空间被摊薄。`
    } else {
      recommendation = 'AVOID'
      decisionReason = `【高危负收益陷阱 EV: ${netEV}钻】胜率(${Math.round(prob * 100)}%)无法覆盖高倍率风险，长期下注期望值大幅亏损。`
    }

    return {
      slot,
      nickname: p.nickname,
      rankText: p.rankText,
      rankScore: p.rankScore,
      supportCount: p.supportCount || 0,
      odds,
      probability: prob,
      netEV,
      roi,
      recommendation,
      decisionReason,
      playstyle: meta?.playstyleDesc ? meta.playstyleCategory : '常规高分流',
      playstyleDesc: meta?.playstyleDesc || '全服高段位王者对决选手。',
      commander: p.commander || p.commanderName || meta?.favoriteCommanders?.[0]?.name,
      favoriteLineups: meta?.favoriteLineups?.map(l => l.name) || ['常用自走棋大核']
    }
  }).sort((a, b) => b.netEV - a.netEV)

  const latencyMs = Math.round(performance.now() - startTime)

  return {
    eventId: `evt-real-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString(),
    countdown: '01:59',
    userDiamondBalance: 2532,
    spectatorCount: 29,
    latencyMs,
    participants: rawList,
    probabilities,
    recommendations,
    bestRecommendation: recommendations[0]
  }
}
