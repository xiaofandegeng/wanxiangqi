// 王牌对决核心数据类型定义 (v3 P2-C 去虚构版)
// 未知/缺失字段一律 null 或省略 —— 未知必须如实展示，禁止默认值填充

export type EventStatus =
  | 'PENDING_COLLECTION' // 待收集（赛前准备期）
  | 'PENDING_VERIFY'     // 待核验（材料已收到，人工核验中）
  | 'PREDICTABLE'        // 名单已核定（六席位人工核验完成）
  | 'BET_CLOSED'         // 比赛进行中
  | 'SETTLED'            // 已出结果（赛后名次已录入）
  | 'AUDITED'            // 已复核

export interface Participant {
  slot: number // 1 ~ 6
  playerId?: string | null
  nickname: string
  rankText?: string | null      // 段位文本（未采集 → null，如实显示未知）
  rankScore?: number | null     // 天梯分（未采集 → null）
  finalRank?: number | null     // 赛后公布名次 (1 ~ 6，未公布 → null)
  commander?: string | null     // 当局棋手（未采集 → null）
  lineup?: string | null        // 当局阵容（未采集 → null）
  odds?: number | null          // 界面倍率（材料可见才录入）
  supportCount?: number | null  // 支持人数（材料可见才录入）

  // 展示携带字段：由视图把该选手真实核验统计随席位下发（无样本 → undefined）
  winRateRecent?: number | null
  top3RateRecent?: number | null
  sampleMatches?: number | null
}
