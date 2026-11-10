import { describe, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  evaluate6PlayerMatchup
} from '../frontend/src/utils/player-matchup'

describe('11月9日第二场真实比赛精确推演 (纠偏棋手后)', () => {
  it('执行 6 人同场预测推演', () => {
    const catalogPath = path.resolve(__dirname, '../../backend/data/prediction-catalog/ruanshi.json')
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
    const allMatches = catalog.matches

    // 用户权威指正的 6 位选手与真实出战棋手：
    // #1 丰川祥子: 马可
    // #2 小琳谷芷: 嬴律
    // #3 甜卷大王: 镜
    // #4 雾与散声慢慢: 阿离
    // #5 抖音湛蓝: 武凤
    // #6 B站东方朔: 玉环
    const participants = [
      { slot: 1, nickname: '丰川祥子', commander: '马可' },
      { slot: 2, nickname: '小琳谷芷', commander: '嬴律' },
      { slot: 3, nickname: '甜卷大王', commander: '镜' },
      { slot: 4, nickname: '雾与散声慢慢', commander: '阿离' },
      { slot: 5, nickname: '抖音湛蓝', commander: '武凤' },
      { slot: 6, nickname: 'B站东方朔', commander: '玉环' }
    ]

    const bannedFaction = '大河'

    console.log('=== 11-09 第 2 场精确推演 (Ban: 大河) ===')

    const result = evaluate6PlayerMatchup(participants, bannedFaction, allMatches)

    console.log('\n--- 选手推演结果 ---')
    result.players.forEach(p => {
      console.log(`席位 #${p.slot} [${p.nickname}] (出战棋手: ${p.commander})`)
      console.log(`  推断出战阵容: ${p.inferredLineup.lineupName} [${p.lineupArchetype.name}]`)
      console.log(`  推断依据: ${p.inferredLineup.reason}`)
      console.log(`  选手熟练度: ${p.lineupProficiency?.levelLabel || '未知'} [加分: ${p.proficiencyModifier}]`)
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
