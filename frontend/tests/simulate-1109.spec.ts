import { describe, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  evaluate6PlayerMatchup,
  buildPlayerMatchupProfiles,
  inferPlayerLineup,
  evaluateBanImpact,
  evaluateCommander,
  evaluateCommanderBuildSynergy,
  type Player6MatchupEvaluation
} from '../src/utils/player-matchup'

describe('11月9日第一场真实比赛推演', () => {
  it('执行 6 人同场预测推演', () => {
    const catalogPath = path.resolve(__dirname, '../../backend/data/prediction-catalog/ruanshi.json')
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
    const allMatches = catalog.matches

    // 6 位选手、出战棋手与禁位
    const participants = [
      { slot: 1, nickname: '胜天半子嘉誉', commander: '镜' },
      { slot: 2, nickname: 'WE葫芦呼噜', commander: '乔汐' },
      { slot: 3, nickname: '下雨了下雨了', commander: '常小娥' },
      { slot: 4, nickname: '抖音猪葛龟龟', commander: '诸葛亮' },
      { slot: 5, nickname: '小宇13', commander: '孙小宾' },
      { slot: 6, nickname: 'B站万象棋小祥', commander: '庄小鱼' }
    ]

    const bannedFaction = '逐鹿'

    console.log('=== 开始执行 11-09 第 1 场对局推演 ===')
    console.log('禁选阵营:', bannedFaction)

    const result = evaluate6PlayerMatchup(participants, bannedFaction, allMatches)

    console.log('\n--- 选手推演结果 ---')
    result.players.forEach((p: Player6MatchupEvaluation) => {
      console.log(`席位 #${p.slot} [${p.nickname}] (出战棋手: ${p.commander})`)
      console.log(`  推断出战阵容: ${p.inferredLineup.lineupName} [${p.lineupArchetype.name}]`)
      console.log(`  推断依据: ${p.inferredLineup.reason}`)
      console.log(`  选手熟练度: ${p.lineupProficiency?.levelLabel || '未知'} (${p.lineupProficiency?.reasoning || '无'}) [加分: ${p.proficiencyModifier}]`)
      console.log(`  棋手阵容王牌胜率: ${p.commanderBuildSynergy.winRateFormatted} (${p.commanderBuildSynergy.tierLabel}, 加分: ${p.commanderBuildModifier})`)
      console.log(`  Ban位【${bannedFaction}】影响: ${p.banEvaluation?.levelLabel || '未受限'} (${p.banEvaluation?.description}) [加分: ${p.banModifier}]`)
      console.log(`  同场克制情况: ${p.h2hSummary} [克制加分: ${p.h2hBonus}]`)
      console.log(`  体系生态克制: ${p.lineupCounterSummary} [加分: ${p.lineupCounterScore}]`)
      console.log(`  综合战力分: ${p.finalScore}`)
      console.log(`  预测获胜概率: ${(p.adjustedProbability * 100).toFixed(2)}%`)
      console.log('----------------------------------------------------')
    })

    console.log('\n--- 阵容体系对抗概览 ---')
    console.log(result.lineupMatrix?.ecosystemSummary)

    console.log('\n--- Ban 位全局影响分析 ---')
    console.log(result.banSummary.summaryText)
  })
})
