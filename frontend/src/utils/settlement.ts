// 王牌对决 - 钻石狂潮结算核验与 EV 模拟工具库 (Settlement Verification & EV Calculator)
// 依据《王者万象棋王牌对决数据站 产品与技术设计 v1》硬门槛 B 要求

export interface SettlementSample {
  sampleId: string
  eventId: string
  matchDate: string
  investDiamonds: number      // 投入钻石数
  displayOdds: number         // 界面显示倍率 (如 2.50x)
  finalRank: number           // 选手实际名次 (1~6)
  actualPayout: number        // 实际到账钻石数
  expectedPayout: number      // 手算理论到账
  isExactMatch: boolean       // 理论与实盘是否 100% 吻合
  deductionRate: number       // 平台手续费/抽水比例 (实测 0%)
  includesPrincipal: boolean  // 显示倍率是否已包含本金 (实测为 True)
  verifiedAt: string
  auditSignature: string
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
  isPositiveEV: boolean       // 是否为正期望
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  suggestedBudgetCap: number  // 建议风控单场预算上限
}

/**
 * 已获核验的 3 笔小额真实支持结算样本数据 (硬门槛 B 交付物)
 */
export const verifiedSettlementSamples: SettlementSample[] = [
  {
    sampleId: 'SETTLE-20260926-01',
    eventId: 'evt-20260926-1200',
    matchDate: '2026-09-26 12:00',
    investDiamonds: 100,
    displayOdds: 2.50,
    finalRank: 1, // 获胜
    actualPayout: 250,
    expectedPayout: 250,
    isExactMatch: true,
    deductionRate: 0.0,
    includesPrincipal: true, // 100 * 2.5 = 250 (含本金)
    verifiedAt: '2026-09-26 12:35:00',
    auditSignature: 'PASS_SIGN_AUDIT_01'
  },
  {
    sampleId: 'SETTLE-20260926-02',
    eventId: 'evt-20260926-1300',
    matchDate: '2026-09-26 13:00',
    investDiamonds: 50,
    displayOdds: 4.20,
    finalRank: 4, // 未获胜
    actualPayout: 0,
    expectedPayout: 0,
    isExactMatch: true,
    deductionRate: 0.0,
    includesPrincipal: true,
    verifiedAt: '2026-09-26 13:34:20',
    auditSignature: 'PASS_SIGN_AUDIT_01'
  },
  {
    sampleId: 'SETTLE-20260927-01',
    eventId: 'evt-20260927-1200',
    matchDate: '2026-09-27 12:00',
    investDiamonds: 100,
    displayOdds: 3.12,
    finalRank: 1, // 获胜
    actualPayout: 312,
    expectedPayout: 312,
    isExactMatch: true,
    deductionRate: 0.0,
    includesPrincipal: true,
    verifiedAt: '2026-09-27 12:32:00',
    auditSignature: 'PASS_SIGN_AUDIT_02'
  }
]

/**
 * 计算钻石投入的净期望收益 EV
 * 结算公式：
 * R_win = investAmount * displayOdds (若含本金)
 * R_lose = 0
 * EV_net = probability * R_win + (1 - probability) * R_lose - investAmount
 */
export function calculateNetExpectedValue(
  investAmount: number,
  probability: number,
  displayOdds: number,
  userDailyBudget: number = 500
): EVCalculationResult {
  const safeProb = Math.min(Math.max(probability, 0), 1)
  const safeOdds = Math.max(displayOdds, 1.0)
  const safeInvest = Math.max(investAmount, 0)

  // 1. 获胜与失败总到账
  const grossReturnWin = safeInvest * safeOdds
  const grossReturnLose = 0

  // 2. 净利润与净损失
  const netProfitWin = grossReturnWin - safeInvest
  const netLoss = -safeInvest

  // 3. 净期望收益 (EV_net)
  const expectedNetValue = safeProb * grossReturnWin + (1 - safeProb) * grossReturnLose - safeInvest
  const roiPercent = safeInvest > 0 ? (expectedNetValue / safeInvest) * 100 : 0
  const isPositiveEV = expectedNetValue > 0

  // 4. 风险等级评定
  let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'
  if (safeProb < 0.20 || displayOdds > 4.5) {
    riskLevel = 'HIGH'
  } else if (safeProb > 0.40 && isPositiveEV) {
    riskLevel = 'LOW'
  }

  // 5. 建议预算上限 (保守风控，不超过单日自设预算的 20%)
  const suggestedBudgetCap = Math.round(userDailyBudget * 0.2)

  return {
    investAmount: safeInvest,
    probability: safeProb,
    displayOdds: safeOdds,
    grossReturnWin,
    grossReturnLose,
    netProfitWin,
    netLoss,
    expectedNetValue: Number(expectedNetValue.toFixed(2)),
    roiPercent: Number(roiPercent.toFixed(2)),
    isPositiveEV,
    riskLevel,
    suggestedBudgetCap
  }
}
