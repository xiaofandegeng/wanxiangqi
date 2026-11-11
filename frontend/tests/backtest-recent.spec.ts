import { describe, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  evaluate6PlayerMatchup,
  buildPlayerMatchupProfiles,
  inferPlayerLineup,
  type Player6MatchupEvaluation
} from '../src/utils/player-matchup'

describe('最近战绩回测：评估预测机制准确率与偏差分析', () => {
  it('执行最近战绩全面回测', () => {
    const catalogPath = path.resolve(__dirname, '../../backend/data/prediction-catalog/ruanshi.json')
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
    const allMatches = catalog.matches

    // 筛选出 11 月份最近 7 天内的全部 19 场全量转写对局
    const recentMatches = allMatches.filter((m: any) => m.day && m.day.startsWith('2026-11'))

    console.log(`=== 最近战绩回测启动：共 ${recentMatches.length} 场完整对局 ===\n`)

    interface BacktestItem {
      key: string
      day: string
      ordinal: number
      ban: string | null
      actualWinner: string
      actualWinnerBuild: string
      predictedWinner: string
      predictedProb: number
      actualWinnerPredictedRank: number
      actualWinnerPredictedProb: number
      isTop1Hit: boolean
      isTop2Hit: boolean
      isTop3Hit: boolean
      rankings: { rank: number; nickname: string; prob: number; score: number; inferredBuild: string }[]
    }

    const results: BacktestItem[] = []

    for (const match of recentMatches) {
      const participants = match.seats.map((s: any) => ({
        slot: s.slot,
        nickname: s.nickname,
        commander: s.commander
      }))

      // 注意：真实回测时，选手历史交锋与画像来自全局对局
      const evalResult = evaluate6PlayerMatchup(participants, match.ban, allMatches)

      const sorted = [...evalResult.players].sort((a, b) => b.adjustedProbability - a.adjustedProbability)

      const actualWinnerSeat = match.seats.find((s: any) => s.slot === match.winnerSlot) || match.seats[0]
      const actualWinnerName = actualWinnerSeat.nickname

      // 寻找真实胜者在预测列表中的位次
      const predictedRank = sorted.findIndex(p => p.slot === match.winnerSlot) + 1
      const predictedWinner = sorted[0].nickname
      const actualWinnerEval = sorted.find(p => p.slot === match.winnerSlot)

      results.push({
        key: match.key,
        day: match.day,
        ordinal: match.ordinal,
        ban: match.ban,
        actualWinner: actualWinnerName,
        actualWinnerBuild: match.winnerBuild,
        predictedWinner,
        predictedProb: sorted[0].adjustedProbability,
        actualWinnerPredictedRank: predictedRank,
        actualWinnerPredictedProb: actualWinnerEval?.adjustedProbability || 0,
        isTop1Hit: predictedRank === 1,
        isTop2Hit: predictedRank <= 2,
        isTop3Hit: predictedRank <= 3,
        rankings: sorted.map((p, idx) => ({
          rank: idx + 1,
          nickname: p.nickname,
          prob: p.adjustedProbability,
          score: p.finalScore,
          inferredBuild: p.inferredLineup.lineupName
        }))
      })
    }

    // 统计总体指标
    const total = results.length
    const top1Hits = results.filter(r => r.isTop1Hit).length
    const top2Hits = results.filter(r => r.isTop2Hit).length
    const top3Hits = results.filter(r => r.isTop3Hit).length

    console.log('------------------------------------------------------------')
    console.log(`回测总场次: ${total} 场`)
    console.log(`Top 1 命中率 (首选夺冠命中): ${top1Hits}/${total} (${((top1Hits / total) * 100).toFixed(1)}%)`)
    console.log(`Top 2 命中率 (前二覆盖命中): ${top2Hits}/${total} (${((top2Hits / total) * 100).toFixed(1)}%)`)
    console.log(`Top 3 命中率 (前三覆盖命中): ${top3Hits}/${total} (${((top3Hits / total) * 100).toFixed(1)}%)`)
    console.log('------------------------------------------------------------\n')

    console.log('\n=== 深入诊断未命中 Top 1 的 3 场比赛评分构成 ===')
    for (const key of ['ruanshi:2026-11-08:2', 'ruanshi:2026-11-08:8', 'ruanshi:2026-11-09:2']) {
      const match = recentMatches.find((m: any) => m.key === key)
      if (!match) continue
      const participants = match.seats.map((s: any) => ({
        slot: s.slot,
        nickname: s.nickname,
        commander: s.commander
      }))
      const evalResult = evaluate6PlayerMatchup(participants, match.ban, allMatches)
      const sorted = [...evalResult.players].sort((a, b) => b.adjustedProbability - a.adjustedProbability)
      console.log(`\n【对局 ${key}】(Ban: ${match.ban || '无'}, 实际胜者: #${match.winnerSlot} ${match.seats.find((s:any)=>s.slot===match.winnerSlot)?.nickname} [${match.winnerBuild}])`)
      sorted.forEach(p => {
        const isWinner = p.slot === match.winnerSlot ? '👑【实际胜者】' : '  '
        console.log(`${isWinner} 席位#${p.slot} [${p.nickname}] (出战棋手:${p.commander}) -> 胜率:${(p.adjustedProbability*100).toFixed(1)}% | 最终分:${p.finalScore}`)
        console.log(`     基础分(胜率):${p.baseScore} | H2H:${p.h2hBonus} | Ban:${p.banModifier} | 棋手:${p.commanderModifier} | 熟练度:${p.proficiencyModifier} | 棋手协同:${p.commanderBuildModifier} | 体系对抗:${p.lineupCounterScore}`)
        console.log(`     推断阵容:${p.inferredLineup.lineupName} [${p.lineupArchetype.name}] | 推断依据:${p.inferredLineup.reason}`)
      })
    }
  })

  it('诊断小谷芷与QT新一的推断原因', () => {
    const catalogPath = path.resolve(__dirname, '../../backend/data/prediction-catalog/ruanshi.json')
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
    const allMatches = catalog.matches
    const profileMap = buildPlayerMatchupProfiles(allMatches, true)

    const profGuzhi = profileMap.get('小谷芷')
    console.log('=== 小谷芷画像 ===')
    console.log('commonBuilds:', profGuzhi?.commonBuilds)
    console.log('commanderProfiles:', JSON.stringify(profGuzhi?.commanderProfiles, null, 2))
    const inferredGuzhi = inferPlayerLineup(profGuzhi?.commonBuilds, null, '安琪拉', '抖音EGM小谷芷', profGuzhi?.commanderProfiles, allMatches)
    console.log('小谷芷 安琪拉 推断结果:', inferredGuzhi)

    const profXinyi = profileMap.get('新一')
    console.log('\n=== QT新一画像 ===')
    console.log('commonBuilds:', profXinyi?.commonBuilds)
    console.log('commanderProfiles:', JSON.stringify(profXinyi?.commanderProfiles, null, 2))
    const inferredXinyi = inferPlayerLineup(profXinyi?.commonBuilds, '三分', '嬴律', 'QT新一', profXinyi?.commanderProfiles, allMatches)
    console.log('QT新一 嬴律 (Ban三分) 推断结果:', inferredXinyi)
  })
})
