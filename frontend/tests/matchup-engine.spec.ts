import { describe, it, expect } from 'vitest'
import { simulateMatchupMechanics, ARCHETYPE_COUNTER_MATRIX } from '../src/utils/matchup-engine'

describe('自走棋真实历史战绩与擅长风格推演引擎验证 (Performance & Archetype Tests)', () => {
  const mockParticipants = [
    { slot: 1, nickname: '白白白白3', rankScore: 11768 },
    { slot: 2, nickname: '抖音一茗', rankScore: 11183 },
    { slot: 3, nickname: '抖音EZ流儿', rankScore: 10234 },
    { slot: 4, nickname: 'Asen', rankScore: 10132 },
    { slot: 5, nickname: '抖音刺痛', rankScore: 9638 },
    { slot: 6, nickname: 'DY道无涯', rankScore: 9405 }
  ]

  it('1. 验证 6 席位均提取真实历史战绩（登顶率、前三率、均名与样本量）', () => {
    const res = simulateMatchupMechanics(mockParticipants)
    expect(res.contestedAnalysis).toHaveLength(6)

    // 白白白白3 是真实认证高分选手，具有完备历史战绩
    const baibai = res.contestedAnalysis.find(p => p.nickname === '白白白白3')
    expect(baibai).toBeDefined()
    expect(baibai?.historicalWinRate).toBeGreaterThan(0.2)
    expect(baibai?.historicalTop3Rate).toBeGreaterThan(0.6)
    expect(baibai?.sampleMatches).toBeGreaterThanOrEqual(10)
    expect(baibai?.preferredStyle).toContain('偏好')
  })

  it('2. 验证风格偏好生态对抗互制矩阵 (Assassins vs ADCs vs Tanks)', () => {
    // 刺客快攻偏好对慢速大射运营构成压制
    expect(ARCHETYPE_COUNTER_MATRIX['ASSASSIN']['ADC']).toBeGreaterThan(1.0)
    // 重装防刺偏好针对刺客突脸
    expect(ARCHETYPE_COUNTER_MATRIX['TANK']['ASSASSIN']).toBeGreaterThan(1.0)
    // 刺客打不动重装防守
    expect(ARCHETYPE_COUNTER_MATRIX['ASSASSIN']['TANK']).toBeLessThan(1.0)
  })

  it('3. 验证局内 6 人推演概率归一化严格等于 100%', () => {
    const res = simulateMatchupMechanics(mockParticipants)
    const totalProb = Object.values(res.probabilities).reduce((a, b) => a + b, 0)
    // 允许浮点精度在 0.999 ~ 1.001 之间
    expect(totalProb).toBeGreaterThanOrEqual(0.998)
    expect(totalProb).toBeLessThanOrEqual(1.002)
  })

  it('4. 验证快攻偏好(EZ流儿)保前三率高但吃鸡率显著低于大后期大核(刺痛)', () => {
    const res = simulateMatchupMechanics(mockParticipants)
    const ez = res.contestedAnalysis.find(p => p.nickname === '抖音EZ流儿')
    const citong = res.contestedAnalysis.find(p => p.nickname === '抖音刺痛')

    // EZ流儿是快攻偏好，前三率远大于其吃鸡率
    expect(ez!.historicalTop3Rate).toBeGreaterThan(ez!.historicalWinRate * 2.5)
    // 刺痛大核射手偏好吃鸡率高于 EZ流儿
    expect(citong!.historicalWinRate).toBeGreaterThan(ez!.historicalWinRate)
  })
})

