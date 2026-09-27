// 王者万象棋 - 全服高分顶尖选手档案与历史对战数据库 (Master Database & Match Archive)
// 沉淀全服 9000~19000★ 顶尖王者选手的完整战绩画像与历史对局大盘流水

export interface MasterPlayerItem {
  id: string
  nickname: string
  titleBadge?: string
  platform: string
  rankText: string
  rankScore: number
  totalRecordedMatches: number
  firstPlaceRate: number // 真实吃鸡率
  top3Rate: number // 真实前三率
  avgPlacement: number // 平均排名
  signatureHero: string
  primaryLineup: string
  playstyleCategory: 'OPERATIONAL' | 'AGGRO_REROLL' | 'LATE_HYPERCARRY' | 'BALANCED'
  playstyleName: string
  recentPlacements: number[]
}

export interface MasterMatchItem {
  matchId: string
  matchDate: string // 如 "2026-09-27 16:00"
  matchTitle: string
  gameVersion: string
  spectatorCount: number
  winnerNickname: string
  winningLineup: string
  participants: Array<{
    slot: number
    nickname: string
    rankScore: number
    finalRank: number // 1 ~ 6
    lineup: string
    odds: number
    evNet: number
    isBestEV: boolean
  }>
}

/**
 * 全服高分段顶尖王者选手大盘库 (20+ 位各路顶尖主播、天梯前十与路人王)
 */
export const masterPlayersList: MasterPlayerItem[] = [
  {
    id: 'p-ezyeyu',
    nickname: 'EZ夜余',
    titleBadge: '战力巅峰第一人',
    platform: '全服天梯',
    rankText: '最强王者',
    rankScore: 18824,
    totalRecordedMatches: 68,
    firstPlaceRate: 0.441,
    top3Rate: 0.897,
    avgPlacement: 1.82,
    signatureHero: '弈星',
    primaryLineup: '九稷下长城射',
    playstyleCategory: 'OPERATIONAL',
    playstyleName: '极致九五运营流',
    recentPlacements: [1, 1, 2, 1, 1, 3, 2, 1, 1, 2]
  },
  {
    id: 'p-dyxiaozhang',
    nickname: 'DY校长神Gin',
    titleBadge: '战力巅峰第十人',
    platform: '斗鱼直播',
    rankText: '最强王者',
    rankScore: 12091,
    totalRecordedMatches: 54,
    firstPlaceRate: 0.296,
    top3Rate: 0.778,
    avgPlacement: 2.38,
    signatureHero: '司空震',
    primaryLineup: '尧天男刺极速切入',
    playstyleCategory: 'BALANCED',
    playstyleName: '刺客速攻破局流',
    recentPlacements: [2, 1, 3, 1, 2, 4, 1, 2, 3, 1]
  },
  {
    id: 'p-baibai',
    nickname: '白白白白3',
    titleBadge: '荣耀先驱者 0004',
    platform: '全服天梯',
    rankText: '最强王者',
    rankScore: 11768,
    totalRecordedMatches: 62,
    firstPlaceRate: 0.387,
    top3Rate: 0.822,
    avgPlacement: 2.18,
    signatureHero: '弈星',
    primaryLineup: '九稷下长城射',
    playstyleCategory: 'BALANCED',
    playstyleName: '全能控血运营流',
    recentPlacements: [1, 2, 1, 1, 3, 2, 1, 4, 2, 1]
  },
  {
    id: 'p-yiming',
    nickname: '抖音一茗',
    titleBadge: '联合创始人 1072',
    platform: '抖音直播',
    rankText: '最强王者',
    rankScore: 11183,
    totalRecordedMatches: 75,
    firstPlaceRate: 0.360,
    top3Rate: 0.853,
    avgPlacement: 2.12,
    signatureHero: '弈星',
    primaryLineup: '尧天男刺极速切入',
    playstyleCategory: 'OPERATIONAL',
    playstyleName: '经济理财九五流',
    recentPlacements: [1, 1, 2, 2, 1, 3, 1, 2, 2, 3]
  },
  {
    id: 'p-ezliu',
    nickname: '抖音EZ流儿',
    titleBadge: '天梯高分主播',
    platform: '抖音直播',
    rankText: '最强王者',
    rankScore: 10234,
    totalRecordedMatches: 48,
    firstPlaceRate: 0.125,
    top3Rate: 0.750,
    avgPlacement: 2.82,
    signatureHero: '司空震',
    primaryLineup: '扶桑刺客闪电战',
    playstyleCategory: 'AGGRO_REROLL',
    playstyleName: '激进赌狗快攻流',
    recentPlacements: [3, 2, 1, 4, 2, 1, 5, 2, 3, 2]
  },
  {
    id: 'p-asen',
    nickname: 'Asen',
    titleBadge: '巅峰独狼选手',
    platform: '全服天梯',
    rankText: '最强王者',
    rankScore: 10132,
    totalRecordedMatches: 45,
    firstPlaceRate: 0.222,
    top3Rate: 0.711,
    avgPlacement: 3.02,
    signatureHero: '庄周',
    primaryLineup: '坦射玄雍坚韧壁垒',
    playstyleCategory: 'BALANCED',
    playstyleName: '稳健重装防刺流',
    recentPlacements: [2, 3, 3, 1, 4, 2, 5, 3, 2, 4]
  },
  {
    id: 'p-liyouduo',
    nickname: '抖音李由多',
    titleBadge: '华北区第人 0015',
    platform: '抖音直播',
    rankText: '最强王者',
    rankScore: 10075,
    totalRecordedMatches: 36,
    firstPlaceRate: 0.111,
    top3Rate: 0.667,
    avgPlacement: 3.22,
    signatureHero: '不知火舞',
    primaryLineup: '扶桑刺客闪电战',
    playstyleCategory: 'AGGRO_REROLL',
    playstyleName: '刺客速推流',
    recentPlacements: [3, 4, 2, 5, 3, 1, 6, 4, 2, 5]
  },
  {
    id: 'p-pipisha',
    nickname: '抖音EGM皮皮鲨',
    titleBadge: '高分技术女主播',
    platform: '抖音直播',
    rankText: '最强王者',
    rankScore: 10054,
    totalRecordedMatches: 32,
    firstPlaceRate: 0.094,
    top3Rate: 0.625,
    avgPlacement: 3.35,
    signatureHero: '廉颇',
    primaryLineup: '坦射玄雍坚韧壁垒',
    playstyleCategory: 'BALANCED',
    playstyleName: '重装护卫流',
    recentPlacements: [2, 4, 3, 5, 4, 2, 5, 3, 4, 2]
  },
  {
    id: 'p-yishengjun',
    nickname: '想k益笙菌',
    titleBadge: '天梯高分玩家',
    platform: '全服天梯',
    rankText: '最强王者',
    rankScore: 9996,
    totalRecordedMatches: 30,
    firstPlaceRate: 0.067,
    top3Rate: 0.567,
    avgPlacement: 3.72,
    signatureHero: '诸葛亮',
    primaryLineup: '稷下群雄元素法',
    playstyleCategory: 'BALANCED',
    playstyleName: '群雄法核控制流',
    recentPlacements: [4, 3, 5, 2, 6, 4, 3, 5, 4, 6]
  },
  {
    id: 'p-xiaoyoulu',
    nickname: 'B站小优律',
    titleBadge: '联合创始人 0496',
    platform: 'B站直播',
    rankText: '最强王者',
    rankScore: 9961,
    totalRecordedMatches: 38,
    firstPlaceRate: 0.079,
    top3Rate: 0.605,
    avgPlacement: 3.58,
    signatureHero: '公孙离',
    primaryLineup: '尧天纯射极致输出',
    playstyleCategory: 'LATE_HYPERCARRY',
    playstyleName: '单核大射走位流',
    recentPlacements: [5, 2, 4, 1, 6, 3, 5, 4, 3, 2]
  },
  {
    id: 'p-citong',
    nickname: '抖音刺痛',
    titleBadge: '联合创始人 1814 (Hurt)',
    platform: '抖音直播',
    rankText: '最强王者',
    rankScore: 9638,
    totalRecordedMatches: 52,
    firstPlaceRate: 0.288,
    top3Rate: 0.577,
    avgPlacement: 3.42,
    signatureHero: '公孙离',
    primaryLineup: '尧天纯射极致输出',
    playstyleCategory: 'LATE_HYPERCARRY',
    playstyleName: '职业级单核神射流',
    recentPlacements: [1, 5, 1, 4, 2, 6, 1, 3, 5, 1]
  },
  {
    id: 'p-daowuya',
    nickname: 'DY道无涯',
    titleBadge: '万象技术流独狼',
    platform: '斗鱼直播',
    rankText: '最强王者',
    rankScore: 9405,
    totalRecordedMatches: 40,
    firstPlaceRate: 0.175,
    top3Rate: 0.625,
    avgPlacement: 3.32,
    signatureHero: '诸葛亮',
    primaryLineup: '稷下群雄元素法',
    playstyleCategory: 'BALANCED',
    playstyleName: '冷门法核破局流',
    recentPlacements: [4, 2, 3, 5, 1, 4, 3, 2, 4, 3]
  },
  {
    id: 'p-qitu',
    nickname: '虎牙弃徒',
    titleBadge: '万象邀请赛冠军',
    platform: '虎牙直播',
    rankText: '最强王者',
    rankScore: 10890,
    totalRecordedMatches: 44,
    firstPlaceRate: 0.273,
    top3Rate: 0.727,
    avgPlacement: 2.75,
    signatureHero: '李白',
    primaryLineup: '雷霆扶桑刺',
    playstyleCategory: 'OPERATIONAL',
    playstyleName: '刺客大成控血流',
    recentPlacements: [1, 3, 2, 4, 1, 3, 2, 5, 1, 2]
  },
  {
    id: 'p-guying',
    nickname: '斗鱼小孤影',
    titleBadge: '全能战神',
    platform: '斗鱼直播',
    rankText: '最强王者',
    rankScore: 10450,
    totalRecordedMatches: 41,
    firstPlaceRate: 0.244,
    top3Rate: 0.707,
    avgPlacement: 2.88,
    signatureHero: '司空震',
    primaryLineup: '尧天男刺极速切入',
    playstyleCategory: 'BALANCED',
    playstyleName: '高敏切入爆发流',
    recentPlacements: [2, 1, 4, 3, 2, 1, 3, 4, 2, 3]
  }
]

/**
 * 全服王牌对决历史对战记录大盘 (收录近期的完整历史对局场次)
 */
export const masterMatchesList: MasterMatchItem[] = [
  {
    matchId: 'm-20260927-1800',
    matchDate: '2026-09-27 18:00',
    matchTitle: '巅峰狂潮 · 18824★ 全服断层第一局',
    gameVersion: 'v1.12.3',
    spectatorCount: 59,
    winnerNickname: 'EZ夜余',
    winningLineup: '九稷下长城射',
    participants: [
      { slot: 1, nickname: 'EZ夜余', rankScore: 18824, finalRank: 1, lineup: '九稷下长城射', odds: 1.8, evNet: -20.8, isBestEV: false },
      { slot: 2, nickname: 'DY校长神Gin', rankScore: 12091, finalRank: 2, lineup: '尧天男刺极速切入', odds: 7.1, evNet: 91.7, isBestEV: true },
      { slot: 3, nickname: '抖音李由多', rankScore: 10075, finalRank: 3, lineup: '扶桑刺客闪电战', odds: 10.2, evNet: -18.4, isBestEV: false },
      { slot: 4, nickname: '抖音EGM皮皮鲨', rankScore: 10054, finalRank: 4, lineup: '坦射玄雍坚韧壁垒', odds: 10.1, evNet: -9.1, isBestEV: false },
      { slot: 5, nickname: '想k益笙菌', rankScore: 9996, finalRank: 5, lineup: '稷下群雄元素法', odds: 10.5, evNet: -37.0, isBestEV: false },
      { slot: 6, nickname: 'B站小优律', rankScore: 9961, finalRank: 6, lineup: '尧天纯射极致输出', odds: 10.3, evNet: -27.9, isBestEV: false }
    ]
  },
  {
    matchId: 'm-20260927-1700',
    matchDate: '2026-09-27 17:00',
    matchTitle: '王牌对决 · 11768★ 荣耀先驱决战局',
    gameVersion: 'v1.12.3',
    spectatorCount: 29,
    winnerNickname: '白白白白3',
    winningLineup: '九稷下长城射',
    participants: [
      { slot: 1, nickname: '白白白白3', rankScore: 11768, finalRank: 1, lineup: '九稷下长城射', odds: 4.2, evNet: 47.0, isBestEV: true },
      { slot: 2, nickname: '抖音一茗', rankScore: 11183, finalRank: 2, lineup: '尧天男刺极速切入', odds: 3.8, evNet: -1.2, isBestEV: false },
      { slot: 3, nickname: '抖音EZ流儿', rankScore: 10234, finalRank: 3, lineup: '扶桑刺客闪电战', odds: 6.2, evNet: -31.8, isBestEV: false },
      { slot: 4, nickname: 'Asen', rankScore: 10132, finalRank: 4, lineup: '坦射玄雍坚韧壁垒', odds: 7.2, evNet: 29.6, isBestEV: false },
      { slot: 5, nickname: '抖音刺痛', rankScore: 9638, finalRank: 5, lineup: '尧天纯射极致输出', odds: 7.7, evNet: 15.5, isBestEV: false },
      { slot: 6, nickname: 'DY道无涯', rankScore: 9405, finalRank: 6, lineup: '稷下群雄元素法', odds: 7.5, evNet: -47.5, isBestEV: false }
    ]
  },
  {
    matchId: 'm-20260927-1600',
    matchDate: '2026-09-27 16:00',
    matchTitle: '钻石狂潮 · 刺痛极限神射翻盘局',
    gameVersion: 'v1.12.3',
    spectatorCount: 42,
    winnerNickname: '抖音刺痛',
    winningLineup: '尧天纯射极致输出',
    participants: [
      { slot: 1, nickname: '抖音一茗', rankScore: 11150, finalRank: 2, lineup: '长城守卫射手阵', odds: 3.5, evNet: 5.0, isBestEV: false },
      { slot: 2, nickname: '白白白白3', rankScore: 11720, finalRank: 3, lineup: '尧天射手大核', odds: 3.9, evNet: 17.0, isBestEV: false },
      { slot: 3, nickname: '抖音刺痛', rankScore: 9610, finalRank: 1, lineup: '尧天纯射极致输出', odds: 8.5, evNet: 146.5, isBestEV: true },
      { slot: 4, nickname: 'Asen', rankScore: 10110, finalRank: 4, lineup: '楚汉争霸重甲坦', odds: 6.8, evNet: 8.8, isBestEV: false },
      { slot: 5, nickname: '虎牙弃徒', rankScore: 10850, finalRank: 5, lineup: '雷霆扶桑刺', odds: 5.5, evNet: -12.0, isBestEV: false },
      { slot: 6, nickname: 'DY道无涯', rankScore: 9380, finalRank: 6, lineup: '长安法刺理财流', odds: 9.0, evNet: -55.0, isBestEV: false }
    ]
  },
  {
    matchId: 'm-20260927-1500',
    matchDate: '2026-09-27 15:00',
    matchTitle: '王牌对决 · 独家坦射防刺克制经典局',
    gameVersion: 'v1.12.3',
    spectatorCount: 35,
    winnerNickname: 'Asen',
    winningLineup: '坦射玄雍坚韧壁垒',
    participants: [
      { slot: 1, nickname: 'Asen', rankScore: 10090, finalRank: 1, lineup: '坦射玄雍坚韧壁垒', odds: 7.5, evNet: 87.5, isBestEV: true },
      { slot: 2, nickname: '抖音EZ流儿', rankScore: 10210, finalRank: 2, lineup: '长安六刺暴杀流', odds: 5.8, evNet: -24.6, isBestEV: false },
      { slot: 3, nickname: '斗鱼小孤影', rankScore: 10420, finalRank: 3, lineup: '尧天男刺极速切入', odds: 4.8, evNet: -4.0, isBestEV: false },
      { slot: 4, nickname: '抖音一茗', rankScore: 11120, finalRank: 4, lineup: '长城守卫射手阵', odds: 3.2, evNet: -10.4, isBestEV: false },
      { slot: 5, nickname: '抖音李由多', rankScore: 10060, finalRank: 5, lineup: '扶桑刺客闪电战', odds: 8.8, evNet: -38.4, isBestEV: false },
      { slot: 6, nickname: '想k益笙菌', rankScore: 9980, finalRank: 6, lineup: '稷下群雄元素法', odds: 11.0, evNet: -45.0, isBestEV: false }
    ]
  }
]
