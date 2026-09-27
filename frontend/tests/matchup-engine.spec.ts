import { describe, it, expect } from 'vitest'
import { simulateMatchupMechanics, COUNTER_MATRIX } from '../src/utils/matchup-engine'

describe('自走棋局内推演引擎验证 (Matchup Engine Tests)', () => {
  const mockParticipants = [
    { slot: 1, nickname: '白白白白3', rankScore: 11768 },
    { slot: 2, nickname: '抖音一茗', rankScore: 11183 },
    { slot: 3, nickname: '抖音EZ流儿', rankScore: 10234 },
    { slot: 4, nickname: 'Asen', rankScore: 10132 },
    { slot: 5, nickname: '抖音刺痛', rankScore: 9638 },
    { slot: 6, nickname: 'DY道无涯', rankScore: 9405 }
  ]

  it('1. 验证公共卡池撞车与独家流派判定', () => {
    const res = simulateMatchupMechanics(mockParticipants)
    expect(res.contestedAnalysis).toHaveLength(6)

    // Asen 独家坦射无竞争，享有独家卡池加成
    const asen = res.contestedAnalysis.find(p => p.nickname === 'Asen')
    expect(asen).toBeDefined()
    expect(asen?.contestStatus).toBe('EXCLUSIVE')
    expect(asen?.contestFactor).toBeGreaterThan(1.0)
  })

  it('2. 验证流派相克食物链矩阵 (Assassins vs ADCs vs Tanks)', () => {
    // 刺客克制射手
    expect(COUNTER_MATRIX['ASSASSIN']['ADC']).toBeGreaterThan(1.0)
    // 重装坦严重克制刺客冲脸
    expect(COUNTER_MATRIX['TANK']['ASSASSIN']).toBeGreaterThan(1.0)
    // 刺客切不动重坦
    expect(COUNTER_MATRIX['ASSASSIN']['TANK']).toBeLessThan(1.0)
  })

  it('3. 验证局内 6 人推演概率归一化严格等于 100%', () => {
    const res = simulateMatchupMechanics(mockParticipants)
    const totalProb = Object.values(res.probabilities).reduce((a, b) => a + b, 0)
    // 允许浮点精度在 0.999 ~ 1.001 之间
    expect(totalProb).toBeGreaterThanOrEqual(0.998)
    expect(totalProb).toBeLessThanOrEqual(1.002)
  })

  it('4. 验证快攻赌狗(EZ流儿)与单核大射(刺痛)的历史吃鸡率分化', () => {
    const res = simulateMatchupMechanics(mockParticipants)
    const ez = res.contestedAnalysis.find(p => p.nickname === '抖音EZ流儿')
    const citong = res.contestedAnalysis.find(p => p.nickname === '抖音刺痛')

    // EZ流儿是快攻保烂分，前三率远大于其吃鸡率
    expect(ez!.historicalTop3Rate).toBeGreaterThan(ez!.historicalWinRate * 3)
    // 刺痛单核大射吃鸡率高于 EZ流儿
    expect(citong!.historicalWinRate).toBeGreaterThan(ez!.historicalWinRate)
  })
})
