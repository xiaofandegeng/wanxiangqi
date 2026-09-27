import { describe, it, expect } from 'vitest'
import {
  verifiedSettlementSamples,
  calculateNetExpectedValue
} from '../src/utils/settlement'

describe('王牌对决数据站 - 硬门槛 B 结算规则核验与 EV 模拟测试套件', () => {

  describe('1. 真实结算样本与手算吻合率测试 (Threshold B Verification)', () => {
    it('必须至少包含 3 笔完整核实的实测结算样本', () => {
      expect(verifiedSettlementSamples.length).toBeGreaterThanOrEqual(3)
    })

    it('所有样本的手算理论到账必须与实盘实际到账 100% 吻合 (isExactMatch = true)', () => {
      verifiedSettlementSamples.forEach((sample) => {
        expect(sample.isExactMatch).toBe(true)
        // 获胜时：到账 = 投入 * 显示倍率
        if (sample.finalRank === 1) {
          const manualCalc = Number((sample.investDiamonds * sample.displayOdds).toFixed(2))
          expect(sample.actualPayout).toBe(manualCalc)
        } else {
          // 未获胜时：到账 = 0
          expect(sample.actualPayout).toBe(0)
        }
        // 确认包含本金且无手续费抽水
        expect(sample.includesPrincipal).toBe(true)
        expect(sample.deductionRate).toBe(0.0)
      })
    })
  })

  describe('2. 净期望收益 (EV_net) 与 ROI 数学模型验证', () => {
    it('正期望情景计算：胜率 40%, 倍率 3.0, 投入 100 钻 -> EV 净收益应为 +20 钻, ROI +20%', () => {
      const result = calculateNetExpectedValue(100, 0.40, 3.0)
      expect(result.grossReturnWin).toBe(300)
      expect(result.netProfitWin).toBe(200)
      expect(result.expectedNetValue).toBe(20)
      expect(result.roiPercent).toBe(20)
      expect(result.isPositiveEV).toBe(true)
    })

    it('负期望情景计算：胜率 20%, 倍率 3.0, 投入 100 钻 -> EV 净收益应为 -40 钻, ROI -40%', () => {
      const result = calculateNetExpectedValue(100, 0.20, 3.0)
      expect(result.grossReturnWin).toBe(300)
      expect(result.netProfitWin).toBe(200)
      expect(result.expectedNetValue).toBe(-40)
      expect(result.roiPercent).toBe(-40)
      expect(result.isPositiveEV).toBe(false)
    })

    it('零投入或无效概率边界安全处理', () => {
      const zeroInvest = calculateNetExpectedValue(0, 0.5, 2.0)
      expect(zeroInvest.expectedNetValue).toBe(0)
      expect(zeroInvest.roiPercent).toBe(0)

      const clampedProb = calculateNetExpectedValue(100, 1.5, 2.0) // 概率超界 150% -> 截断为 100%
      expect(clampedProb.probability).toBe(1.0)
      expect(clampedProb.expectedNetValue).toBe(100)
    })

    it('单场风控建议上限计算不应超过单日自设预算的 20%', () => {
      const userBudget = 1000
      const result = calculateNetExpectedValue(200, 0.35, 2.8, userBudget)
      expect(result.suggestedBudgetCap).toBe(200) // 1000 * 20% = 200
    })
  })
})
