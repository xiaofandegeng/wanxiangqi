import { describe, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  evaluate6PlayerMatchup,
  type Player6MatchupEvaluation
} from '../src/utils/player-matchup'

describe('11月9日第三场真实比赛推演', () => {
  it('执行 6 人同场预测推演 (Ban: 三分)', () => {
    const catalogPath = path.resolve(__dirname, '../../backend/data/prediction-catalog/ruanshi.json')
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
    const allMatches = catalog.matches

    // 6 位参赛选手与出战棋手 (用户权威指明确认):
    // #1 有局丨白兔: 阿离
    // #2 抖音EG碎碎圆圆: 安琪拉 (皮肤: 薄荷假期 · 青蓝发眼镜妹)
    // #3 EZ拉丁鱼: 玉环
    // #4 Yk丶: 安琪拉 (原皮: 粉红双马尾红眼镜)
    // #5 B站QT小优律: 庄小鱼
    // #6 抖音搜流儿: 嬴律
    const participants = [
      { slot: 1, nickname: '有局丨白兔', commander: '阿离' },
      { slot: 2, nickname: '武汉EG碎碎圆圆', commander: '安琪拉' },
      { slot: 3, nickname: 'EZ拉丁鱼', commander: '玉环' },
      { slot: 4, nickname: 'YK丶', commander: '安琪拉' },
      { slot: 5, nickname: 'B站QT小优律', commander: '庄小鱼' },
      { slot: 6, nickname: '抖音搜流儿', commander: '嬴律' }
    ]

    const bannedFaction = '三分'

    console.log('=== 11-09 第 3 场精确推演 (Ban: 三分) ===')

    const result = evaluate6PlayerMatchup(participants, bannedFaction, allMatches)

    console.log('\n--- 选手推演结果 ---')
    result.players.forEach((p: Player6MatchupEvaluation) => {
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

