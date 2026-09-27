// 王牌对决核心数据类型定义

export type EventStatus =
  | 'PENDING_COLLECTION' // 待收集（赛前准备期）
  | 'PENDING_VERIFY'     // 待校验（截图已上传，OCR/人工校验中）
  | 'PREDICTABLE'        // 可预测（名单已核定，赛前预测发布）
  | 'BET_CLOSED'         // 已封盘（比赛开始进行中）
  | 'SETTLED'            // 已结算（赛后简报已出）
  | 'AUDITED'            // 已复核（赛前预测回测与结算归档完成）

export type EventMode = 'DIAMOND' // 钻石狂潮

export interface Participant {
  slot: number // 1 ~ 6
  playerId?: string
  nickname: string
  rankText: string
  rankScore?: number
  finalRank?: number | null // 赛后公布名次 (1 ~ 6)
  winRateRecent?: number    // 近期登顶率 (0 ~ 1)
  top3RateRecent?: number   // 近期前三率 (0 ~ 1)
  sampleMatches?: number    // 样本场次数量
  commanderName?: string    // 常用/当局棋手
  favoriteLineup?: string   // 偏好阵容
}

export interface SupportSnapshot {
  observedAt: string
  ratioPercent: number // 0 ~ 100
  oddsDisplay?: number // 界面倍率 (若可见)
}

export interface Forecast {
  modelVersion: string
  asOf: string
  sampleSize: number
  coverageRate: number
  probabilities: Record<number, number> // key: slot (1~6), value: 0~1 (和为100%)
  baselineProbabilities: Record<number, number> // 均匀基线 1/6
  status: 'ACTIVE' | 'SUSPENDED' | 'UNCONFIRMED'
}

export interface EvidenceRecord {
  id: string
  sha256: string
  imageUrl: string
  capturedAt: string
  verifiedAt?: string
  verifiedBy?: string
  evidenceType: 'PRE_MATCH_LOBBY' | 'SUPPORT_STAGE' | 'POST_MATCH_SUMMARY' | 'SETTLEMENT_RECORD'
  status: 'UNVERIFIED' | 'CONFIRMED' | 'REJECTED'
}

export interface EventItem {
  id: string
  mode: EventMode
  scheduledAt: string // 如 "2026-09-27 13:00:00"
  status: EventStatus
  gameVersion: string
  participants: Participant[]
  forecast?: Forecast
  supportSnapshot?: Record<number, SupportSnapshot> // slot -> snapshot
  evidences?: EvidenceRecord[]
}

export interface PlayerProfile {
  id: string
  lastNickname: string
  platform: string
  rankText: string
  rankScore: number
  totalMatches: number
  winRate: number
  top3Rate: number
  favoriteCommanders: Array<{
    name: string
    usageRate: number
    winRate: number
  }>
  favoriteLineups: Array<{
    name: string
    usageRate: number
    top3Rate: number
  }>
  recentRanks: number[] // 最近历史名次
}
