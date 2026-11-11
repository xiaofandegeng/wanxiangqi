import { describe, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  evaluate6PlayerMatchup,
  type Player6MatchupEvaluation
} from '../src/utils/player-matchup'

describe('11月9日第四场真实比赛开局推演', () => {
  it('执行 6 人同场预测推演', () => {
    const catalogPath = path.resolve(__dirname, '../../backend/data/prediction-catalog/ruanshi.json')
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
    const allMatches = catalog.matches

    // 6 位开局出战选手与棋手：
    // #1 抖音EZ丶色彩: 班叔 (重装工匠头盔)
    // #2 抖音月影孤冰: 小妲己 (金狐耳大尾巴)
    // #3 抖音EGM皮皮: 玉环 (绿色夹克电琵琶)
    // #4 抖音梦飞1: 白歌 (书生白衫白歌)
    // #5 抖音EZ阿文: 嬴律 (现代黑西装银白短发)
    // #6 遗愿: 庄小鱼 (鲨鱼连帽卫衣)
    const participants = [
      { slot: 1, nickname: '抖音EZ色彩', commander: '班叔' },
      { slot: 2, nickname: '抖音月影孤冰', commander: '小妲己' },
      { slot: 3, nickname: '抖音EGM皮皮', commander: '玉环' },
      { slot: 4, nickname: '梦飞大大', commander: '白歌' },
      { slot: 5, nickname: 'EZ阿文', commander: '嬴律' },
      { slot: 6, nickname: '遗愿', commander: '庄小鱼' }
    ]

    console.log('=== 11-09 第 4 场开局对决推演 (无 Ban / 常规赛) ===')

    const result = evaluate6PlayerMatchup(participants, null, allMatches)

    console.log('\n--- 选手推演结果 ---')
    result.players.forEach((p: Player6MatchupEvaluation) => {
      console.log(`席位 #${p.slot} [${p.nickname}] (出战棋手: ${p.commander})`)
      console.log(`  推断出战阵容: ${p.inferredLineup.lineupName} [${p.lineupArchetype.name}]`)
      console.log(`  推断依据: ${p.inferredLineup.reason}`)
      console.log(`  选手熟练度: ${p.lineupProficiency?.levelLabel || '未知'} [加分: ${p.proficiencyModifier}]`)
      console.log(`  棋手阵容王牌胜率: ${p.commanderBuildSynergy.winRateFormatted} (${p.commanderBuildSynergy.tierLabel}, 加分: ${p.commanderBuildModifier})`)
      console.log(`  同场克制情况: ${p.h2hSummary} [克制加分: ${p.h2hBonus}]`)
      console.log(`  体系生态克制: ${p.lineupCounterSummary} [加分: ${p.lineupCounterScore}]`)
      console.log(`  综合战力分: ${p.finalScore}`)
      console.log(`  预测获胜概率: ${(p.adjustedProbability * 100).toFixed(2)}%`)
      console.log('----------------------------------------------------')
    })

    console.log('\n--- 阵容体系对抗概览 ---')
    console.log(result.lineupMatrix?.ecosystemSummary)
  })
})

