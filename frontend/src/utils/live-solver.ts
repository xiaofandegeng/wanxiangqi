// 前端深度自走棋局内决策引擎 (Deep Auto Chess Matchup & EV Solver)
// 彻底摒弃简单分数假设，融合：真实历史对局流水、公共卡池撞车惩罚、流派相克矩阵与赔率精算

import { simulateMatchupMechanics, type PlayerContestAnalysis } from './matchup-engine'
import { realMatchHistoryData } from '../mock/match-history'
import { realProPlayersData } from '../mock/pro-players'
import { MATCH_PRESET_18824, type ExtractedLobby } from './image-analyzer'

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
  contestAnalysis: PlayerContestAnalysis
}

export interface LiveMatchSolved {
  eventId: string
  matchTitle?: string
  timestamp: string
  countdown: string
  userDiamondBalance: number
  spectatorCount: number
  latencyMs: number
  participants: any[]
  probabilities: Record<number, number>
  recommendations: LiveParticipantResult[]
  bestRecommendation: LiveParticipantResult
  contestedAnalysis: PlayerContestAnalysis[]
  overallInsights: string[]
}

/**
 * 客户端自走棋推演与决策求解
 * @param lobbyOrList 可以是 ExtractedLobby 对象，或 6 人 Participant 数组，默认使用最新 18824 巅峰场次
 */
export function solveClientLiveMatch(lobbyOrList?: ExtractedLobby | any[]): LiveMatchSolved {
  const startTime = performance.now()

  let rawList: any[] = MATCH_PRESET_18824.participants
  let countdown = '02:29'
  let userDiamondBalance = 3422
  let spectatorCount = 59
  let matchTitle = '巅峰赛 18824★ 全服断层第一局'

  if (lobbyOrList) {
    if (Array.isArray(lobbyOrList) && lobbyOrList.length === 6) {
      rawList = lobbyOrList
    } else if ('participants' in lobbyOrList && lobbyOrList.participants.length === 6) {
      rawList = lobbyOrList.participants
      countdown = lobbyOrList.countdown || countdown
      userDiamondBalance = lobbyOrList.userDiamondBalance || userDiamondBalance
      spectatorCount = lobbyOrList.spectatorCount || spectatorCount
      matchTitle = lobbyOrList.matchTitle || matchTitle
    }
  }

  // 1. 调用自走棋沙盘推演引擎 (计算公共卡池撞车内卷、流派克制与推演胜率)
  const simulation = simulateMatchupMechanics(rawList)
  const probabilities = simulation.probabilities

  // 2. 结合赔率精算 EV 与生成专业自走棋决策评定
  const recommendations: LiveParticipantResult[] = rawList.map((p) => {
    const slot = p.slot
    const prob = probabilities[slot] || 0.167
    const odds = p.odds || p.oddsDisplay || 5.0
    const meta = Object.values(realProPlayersData).find(m => m.lastNickname === p.nickname)
    const contest = simulation.contestedAnalysis.find(c => c.slot === slot)!
    const history = realMatchHistoryData[p.nickname]

    const testInvest = 100
    const grossReturn = testInvest * odds
    const netEV = Number((prob * grossReturn - testInvest).toFixed(1))
    const roi = Number(((netEV / testInvest) * 100).toFixed(1))

    let recommendation: 'STRONG_BUY' | 'BUY' | 'AVOID' | 'NEUTRAL' = 'NEUTRAL'
    let decisionReason = ''

    if (netEV > 15) {
      recommendation = 'STRONG_BUY'
      decisionReason = `【绝对正期望 +${roi}%】${contest.analysisSummary} 真实吃鸡率(${Math.round(contest.historicalWinRate * 100)}%)配合${contest.powerspikeDesc}，盘面返奖率(${odds}x)被大众严重低估！`
    } else if (netEV >= -5 && netEV <= 15) {
      recommendation = 'BUY'
      decisionReason = `【大众焦点但利润摊薄】前三稳率极高(${Math.round(contest.historicalTop3Rate * 100)}%)，但跟风筹码聚集导致返奖率(${odds}x)偏低，EV边际偏平。`
    } else {
      recommendation = 'AVOID'
      decisionReason = `【负收益陷阱 EV: ${netEV}钻】${contest.analysisSummary} 大后期吃鸡期望(${Math.round(prob * 100)}%)无法覆盖高倍率风险，切忌盲目博高赔率。`
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
      playstyle: history?.playstyleType || meta?.playstyleCategory || '常规高分流',
      playstyleDesc: meta?.playstyleDesc || '王者万象棋顶尖选手。',
      commander: p.commander || p.commanderName || meta?.favoriteCommanders?.[0]?.name,
      favoriteLineups: meta?.favoriteLineups?.map(l => l.name) || [contest.chosenLineup],
      contestAnalysis: contest
    }
  }).sort((a, b) => b.netEV - a.netEV)

  const latencyMs = Math.round(performance.now() - startTime)

  return {
    eventId: `evt-real-${Date.now()}`,
    matchTitle,
    timestamp: new Date().toLocaleTimeString(),
    countdown,
    userDiamondBalance,
    spectatorCount,
    latencyMs,
    participants: rawList,
    probabilities,
    recommendations,
    bestRecommendation: recommendations[0],
    contestedAnalysis: simulation.contestedAnalysis,
    overallInsights: simulation.overallInsights
  }
}
