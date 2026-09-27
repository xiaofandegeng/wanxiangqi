// 王牌对决 - 钻石收益数学计算与规则验证库 (Settlement Math & Formula Validator)
// 遵循 v2 规范：样本明确标注为规则推导样例，不替代真实审核流水；保留严格数学公式计算

export interface SettlementSample {
  sampleId: string
  eventId: string
  matchDate: string
  investDiamonds: number      // 投入钻石数
  displayOdds: number         // 界面显示倍率 (如 2.50x)
  finalRank: number           // 选手实际名次 (1~6)
  actualPayout: number        // 实际到账钻石数
  expectedPayout: number      // 理论到账计算
  isExactMatch: boolean       // 理论与实盘是否 100% 吻合
  deductionRate: number       // 抽水比例
  includesPrincipal: boolean  // 显示倍率是否已包含本金
  note?: string
  auditSignature?: string
}

export interface EVCalculationResult {
  investAmount: number
  probability: number         // 胜率 (0~1)
  displayOdds: number         // 显示倍率
  grossReturnWin: number      // 获胜时总到账
  grossReturnLose: number     // 失败时到账 (通常为 0)
  netProfitWin: number        // 获胜净利润 (总到账 - 本金)
  netLoss: number             // 失败净损失 (-本金)
  expectedNetValue: number    // 期望净收益 EV_net = p * R_win + (1-p) * R_lose - s
  roiPercent: number          // 预期收益率 EV_net / s * 100%
  isPositiveEV: boolean       // 是否为正期望 (EV > 0)
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
  suggestedBudgetCap?: number // 单场建议预算上限 (若提供总预算)
}

/**
 * 规则验证推演样例 (用于验证计算公式正确性，非生产真实流水)
 */
export const FIXTURE_SETTLEMENT_SAMPLES: SettlementSample[] = [
  {
    sampleId: 'SAMPLE-RULE-01',
    eventId: 'evt-sample-01',
    matchDate: '2026-09-26 12:00',
    investDiamonds: 100,
    displayOdds: 2.50,
    finalRank: 1, // 获胜
    actualPayout: 250,
    expectedPayout: 250,
    isExactMatch: true,
    deductionRate: 0.0,
    includesPrincipal: true,
    note: '单注 100 钻获胜 (2.50x 含本金返 250)',
    auditSignature: 'VERIFIED_RULE_SIGN_01'
  },
  {
    sampleId: 'SAMPLE-RULE-02',
    eventId: 'evt-sample-02',
    matchDate: '2026-09-26 13:00',
    investDiamonds: 50,
    displayOdds: 4.20,
    finalRank: 4, // 未获胜
    actualPayout: 0,
    expectedPayout: 0,
    isExactMatch: true,
    deductionRate: 0.0,
    includesPrincipal: true,
    note: '未夺冠到账为 0',
    auditSignature: 'VERIFIED_RULE_SIGN_02'
  },
  {
    sampleId: 'SAMPLE-RULE-03',
    eventId: 'evt-sample-03',
    matchDate: '2026-09-27 12:00',
    investDiamonds: 200,
    displayOdds: 1.80,
    finalRank: 1, // 获胜
    actualPayout: 360,
    expectedPayout: 360,
    isExactMatch: true,
    deductionRate: 0.0,
    includesPrincipal: true,
    note: '单注 200 钻获胜 (1.80x 含本金返 360)',
    auditSignature: 'VERIFIED_RULE_SIGN_03'
  }
]

// 保持历史导出名兼容现有单元测试
export const verifiedSettlementSamples = FIXTURE_SETTLEMENT_SAMPLES

/**
 * 计算单笔投入的净期望收益 (EV_net) 与预期收益率
 * 公式：EV_net = p * (displayOdds * s) - s = s * (p * displayOdds - 1)
 */
export function calculateNetExpectedValue(
  investAmount: number,
  probability: number,
  displayOdds: number,
  dailyBudget?: number
): EVCalculationResult {
  const p = Math.max(0, Math.min(1, probability))
  const s = Math.max(0, investAmount)
  const odds = Math.max(1.0, displayOdds)

  const grossReturnWin = Math.round(s * odds)
  const grossReturnLose = 0
  const netProfitWin = grossReturnWin - s
  const netLoss = -s

  const expectedNetValue = Math.round((p * (s * odds) - s) * 100) / 100
  const roiPercent = s > 0 ? Math.round((expectedNetValue / s) * 1000) / 10 : 0
  const isPositiveEV = expectedNetValue > 0
  const suggestedBudgetCap = dailyBudget !== undefined ? Math.round(dailyBudget * 0.2) : undefined
  const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = p >= 0.35 ? 'LOW' : p >= 0.2 ? 'MEDIUM' : 'HIGH'

  return {
    investAmount: s,
    probability: p,
    displayOdds: odds,
    grossReturnWin,
    grossReturnLose,
    netProfitWin,
    netLoss,
    expectedNetValue,
    roiPercent,
    isPositiveEV,
    riskLevel,
    suggestedBudgetCap
  }
}

export const calculateEV = calculateNetExpectedValue

/**
 * 复算实际到账是否与规则吻合
 */
export function verifyPayoutConsistency(
  investAmount: number,
  displayOdds: number,
  finalRank: number,
  actualPayout: number
): { isConsistent: boolean; expected: number; diff: number } {
  const expected = finalRank === 1 ? Math.round(investAmount * displayOdds) : 0
  const diff = actualPayout - expected
  return {
    isConsistent: diff === 0,
    expected,
    diff
  }
}
