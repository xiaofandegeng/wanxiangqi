import { describe, it, expect } from 'vitest'
import {
  computePreMatchProfile,
  computeUniformBaseline,
  normalizeProbabilities,
  validateEventIntegrity,
  type RawMatchRecord
} from '../src/utils/anti-leakage'

describe('王牌对决数据站 - 时序防泄漏与基线算法测试套件', () => {

  describe('1. 时序防泄漏切片过滤测试 (Anti-Leakage Verification)', () => {
    const cutoffTime = '2026-09-27T11:58:30+08:00'
    const playerId = 'player-test-01'

    const testMatchHistory: RawMatchRecord[] = [
      // 赛前合法历史对局（应该被纳入计算）
      {
        id: 'm-01',
        playerId,
        matchTime: '2026-09-26T12:00:00+08:00',
        finalRank: 1,
        commanderName: '弈星'
      },
      {
        id: 'm-02',
        playerId,
        matchTime: '2026-09-26T15:00:00+08:00',
        finalRank: 3,
        commanderName: '诸葛亮'
      },
      {
        id: 'm-03',
        playerId,
        matchTime: '2026-09-27T10:30:00+08:00',
        finalRank: 2,
        commanderName: '弈星'
      },
      // 赛后未来信息泄漏对局（绝对不能被纳入赛前画像！）
      {
        id: 'm-leak-01',
        playerId,
        matchTime: '2026-09-27T12:35:00+08:00', // 本场赛后公布的结果
        finalRank: 1,
        commanderName: '公孙离'
      },
      {
        id: 'm-leak-02',
        playerId,
        matchTime: '2026-09-27T14:20:00+08:00', // 后续场次的结果
        finalRank: 1,
        commanderName: '不知火舞'
      }
    ]

    it('必须严格剔除 match_time >= cutoffTime 的未来泄漏对局', () => {
      const stats = computePreMatchProfile(playerId, testMatchHistory, cutoffTime)

      // 验证有效对局数仅为 3 场，被安全拦截的泄漏对局为 2 场
      expect(stats.totalValidMatches).toBe(3)
      expect(stats.leakedMatchesCount).toBe(2)

      // 赛前有效对局中：1 场第一名，3 场前三名
      expect(stats.winCount).toBe(1)
      expect(stats.top3Count).toBe(3)
      expect(stats.winRate).toBe(Number((1 / 3).toFixed(4))) // 约 0.3333
      expect(stats.top3Rate).toBe(1.0)
    })

    it('未来泄漏对局的英雄/棋手不得回填至赛前画像', () => {
      const stats = computePreMatchProfile(playerId, testMatchHistory, cutoffTime)

      // 赛前合法对局中使用的棋手：弈星 (2次), 诸葛亮 (1次)
      expect(stats.commanderUsage['弈星']).toBe(2)
      expect(stats.commanderUsage['诸葛亮']).toBe(1)

      // 泄漏对局中使用的棋手公孙离、不知火舞必须为 undefined
      expect(stats.commanderUsage['公孙离']).toBeUndefined()
      expect(stats.commanderUsage['不知火舞']).toBeUndefined()
    })
  })

  describe('2. 概率归一化与均匀基线测试 (Probability & Baseline Verification)', () => {
    it('均匀基线模型必须满足 6 人总和为 100% 且各席位为 1/6', () => {
      const baseline = computeUniformBaseline()
      const slots = Object.keys(baseline).map(Number)

      expect(slots).toEqual([1, 2, 3, 4, 5, 6])
      const totalSum = slots.reduce((sum, slot) => sum + baseline[slot], 0)
      expect(Math.abs(totalSum - 1.0)).toBeLessThan(0.001)

      slots.forEach((slot) => {
        expect(baseline[slot]).toBeCloseTo(0.1667, 3)
      })
    })

    it('任意可解释强度分归一化后，6 人概率总和必须严格等于 1.0 (100%)', () => {
      const rawScores = {
        1: 85,  // 宗师高分
        2: 40,
        3: 110, // 头部选手
        4: 25,
        5: 65,
        6: 15
      }

      const normalized = normalizeProbabilities(rawScores)
      const slots = [1, 2, 3, 4, 5, 6]
      const total = slots.reduce((acc, slot) => acc + normalized[slot], 0)

      expect(Number(total.toFixed(4))).toBe(1.0)
      // 头部选手的胜率预测应最高
      expect(normalized[3]).toBeGreaterThan(normalized[1])
      expect(normalized[1]).toBeGreaterThan(normalized[6])
    })

    it('若席位数不足 6 个应抛出完整性错误', () => {
      const invalidScores = { 1: 50, 2: 50 }
      expect(() => normalizeProbabilities(invalidScores as any)).toThrowError(
        '参赛席位数必须严格为 6'
      )
    })
  })

  describe('3. 场次席位与赛后名次完整性测试 (Standings & Integrity)', () => {
    it('完整的 6 人场次与唯一名次应验证通过', () => {
      const validSlots = [
        { slot: 1, finalRank: 1 },
        { slot: 2, finalRank: 4 },
        { slot: 3, finalRank: 2 },
        { slot: 4, finalRank: 5 },
        { slot: 5, finalRank: 3 },
        { slot: 6, finalRank: 6 }
      ]

      const check = validateEventIntegrity(validSlots)
      expect(check.isValid).toBe(true)
      expect(check.errors.length).toBe(0)
    })

    it('当出现重复名次（例如两个第1名）时应报错拦截', () => {
      const duplicateRankSlots = [
        { slot: 1, finalRank: 1 },
        { slot: 2, finalRank: 1 }, // 异常重复第1名
        { slot: 3, finalRank: 2 },
        { slot: 4, finalRank: 4 },
        { slot: 5, finalRank: 5 },
        { slot: 6, finalRank: 6 }
      ]

      const check = validateEventIntegrity(duplicateRankSlots)
      expect(check.isValid).toBe(false)
      expect(check.errors.some((e) => e.includes('存在重复'))).toBe(true)
    })

    it('席位缺失或越界时应准确报警', () => {
      const missingSlots = [
        { slot: 1, finalRank: 1 },
        { slot: 2, finalRank: 2 },
        { slot: 3, finalRank: 3 },
        { slot: 4, finalRank: 4 },
        { slot: 5, finalRank: 5 }
        // 缺少 slot 6
      ]

      const check = validateEventIntegrity(missingSlots)
      expect(check.isValid).toBe(false)
      expect(check.errors.some((e) => e.includes('场次席位数必须为 6'))).toBe(true)
    })
  })
})
