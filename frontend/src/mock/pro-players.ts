// 王者万象棋 - 真实选手画像与核心流派知识库 (Meta & Pro Player Knowledge)
// 依据 2026-09-27 真实对局截图及万象棋主流高分打法归纳

import type { PlayerProfile } from '../types/event'

export interface ProPlayerMeta extends PlayerProfile {
  streamerPlatform?: string
  playstyleCategory: 'OPERATIONAL' | 'AGGRO_REROLL' | 'LATE_HYPERCARRY' | 'BALANCED'
  playstyleDesc: string
  signatureHeroes: string[]
  currentMmr: number
}

/**
 * 真实对局 6 名参赛顶尖选手的打法体系与历史画像归纳
 */
export const realProPlayersData: Record<string, ProPlayerMeta> = {
  'p-baibai': {
    id: 'p-baibai',
    lastNickname: '白白白白3',
    platform: '全服天梯',
    streamerPlatform: '高分路人王',
    rankText: '最强王者',
    rankScore: 11768, // 全场天花板段位分
    currentMmr: 11768,
    totalMatches: 245,
    winRate: 0.385,   // 登顶率 38.5%
    top3Rate: 0.812,  // 前三率 81.2%
    playstyleCategory: 'BALANCED',
    playstyleDesc: '全能控血运营流。极擅长大局观控牌与卡对手关键三星，中后期锁血反打能力天花板，发牌劣势局也能通过转坦射保前三。',
    signatureHeroes: ['弈星', '公孙离', '廉颇'],
    favoriteCommanders: [
      { name: '弈星', usageRate: 0.52, winRate: 0.44 },
      { name: '诸葛亮', usageRate: 0.28, winRate: 0.35 },
      { name: '庄周', usageRate: 0.20, winRate: 0.30 }
    ],
    favoriteLineups: [
      { name: '九稷下长城射', usageRate: 0.45, top3Rate: 0.86 },
      { name: '尧天射手大核', usageRate: 0.35, top3Rate: 0.82 },
      { name: '玄雍重装坦法', usageRate: 0.20, top3Rate: 0.74 }
    ],
    recentRanks: [1, 2, 1, 1, 3, 2, 1, 4]
  },

  'p-yiming': {
    id: 'p-yiming',
    lastNickname: '抖音一茗',
    platform: '抖音直播',
    streamerPlatform: '抖音主播 (联合创始人1072)',
    rankText: '最强王者',
    rankScore: 11183,
    currentMmr: 11183,
    totalMatches: 310,
    winRate: 0.362,
    top3Rate: 0.845,
    playstyleCategory: 'OPERATIONAL',
    playstyleDesc: '极致经济运营流。主打 8 人口甚至 9 人口大羁绊九五阵容，前中期连胜连败理财极度精准，是全场大众最受追捧的大热门选手。',
    signatureHeroes: ['弈星', '司空震', '李白'],
    favoriteCommanders: [
      { name: '弈星', usageRate: 0.60, winRate: 0.42 },
      { name: '公孙离', usageRate: 0.25, winRate: 0.32 },
      { name: '司空震', usageRate: 0.15, winRate: 0.28 }
    ],
    favoriteLineups: [
      { name: '尧天男刺极速切入', usageRate: 0.48, top3Rate: 0.89 },
      { name: '长城守卫射手阵', usageRate: 0.32, top3Rate: 0.84 },
      { name: '雷霆扶桑刺', usageRate: 0.20, top3Rate: 0.76 }
    ],
    recentRanks: [1, 1, 2, 2, 1, 3, 1, 2]
  },

  'p-ezliu': {
    id: 'p-ezliu',
    lastNickname: '抖音EZ流儿',
    platform: '抖音直播',
    streamerPlatform: '抖音高分主播',
    rankText: '最强王者',
    rankScore: 10234,
    currentMmr: 10234,
    totalMatches: 198,
    winRate: 0.288,
    top3Rate: 0.720,
    playstyleCategory: 'AGGRO_REROLL',
    playstyleDesc: '激进快攻赌狗流。倾向于在 6~7 人口提速抽卡打节奏压制，前期压迫全场血线吃烂分极稳，但大后期面对完全体九五阵容上限稍逊。',
    signatureHeroes: ['司空震', '李白', '不知火舞'],
    favoriteCommanders: [
      { name: '司空震', usageRate: 0.45, winRate: 0.34 },
      { name: '弈星', usageRate: 0.35, winRate: 0.29 },
      { name: '铠', usageRate: 0.20, winRate: 0.22 }
    ],
    favoriteLineups: [
      { name: '扶桑刺客闪电战', usageRate: 0.42, top3Rate: 0.78 },
      { name: '长安六刺暴杀流', usageRate: 0.38, top3Rate: 0.72 },
      { name: '稷下群雄速攻', usageRate: 0.20, top3Rate: 0.65 }
    ],
    recentRanks: [3, 2, 1, 4, 2, 1, 5, 2]
  },

  'p-asen': {
    id: 'p-asen',
    lastNickname: 'Asen',
    platform: '全服天梯',
    streamerPlatform: '巅峰独狼选手',
    rankText: '最强王者',
    rankScore: 10132,
    currentMmr: 10132,
    totalMatches: 165,
    winRate: 0.265,
    top3Rate: 0.690,
    playstyleCategory: 'BALANCED',
    playstyleDesc: '稳健重装阵地流。偏好坦射与重装战士流，防刺客切后排站位炉火纯青，对刺客型对手有天然克制，但爆发决胜能力中等。',
    signatureHeroes: ['庄周', '廉颇', '项羽'],
    favoriteCommanders: [
      { name: '庄周', usageRate: 0.50, winRate: 0.30 },
      { name: '廉颇', usageRate: 0.30, winRate: 0.26 },
      { name: '弈星', usageRate: 0.20, winRate: 0.20 }
    ],
    favoriteLineups: [
      { name: '坦射玄雍坚韧壁垒', usageRate: 0.50, top3Rate: 0.75 },
      { name: '楚汉争霸重甲坦', usageRate: 0.30, top3Rate: 0.68 },
      { name: '极冻冰雪群控法', usageRate: 0.20, top3Rate: 0.62 }
    ],
    recentRanks: [2, 3, 3, 1, 4, 2, 5, 3]
  },

  'p-citong': {
    id: 'p-citong',
    lastNickname: '抖音刺痛',
    platform: '抖音直播',
    streamerPlatform: '前职业电竞选手 Hurt (创始人1814)',
    rankText: '最强王者',
    rankScore: 9638,
    currentMmr: 9638,
    totalMatches: 220,
    winRate: 0.310,
    top3Rate: 0.680,
    playstyleCategory: 'LATE_HYPERCARRY',
    playstyleDesc: '极致单核大射流。职业级走位与微操拉满，只要公孙离/黄忠等射手大核心到手成型，大后期输出直接毁天灭地；弱点是成型前过渡期容错率低。',
    signatureHeroes: ['公孙离', '百里守约', '狄仁杰'],
    favoriteCommanders: [
      { name: '公孙离', usageRate: 0.55, winRate: 0.38 },
      { name: '弈星', usageRate: 0.30, winRate: 0.28 },
      { name: '铠', usageRate: 0.15, winRate: 0.20 }
    ],
    favoriteLineups: [
      { name: '尧天纯射极致输出', usageRate: 0.55, top3Rate: 0.76 },
      { name: '长城守卫狙击大阵', usageRate: 0.25, top3Rate: 0.65 },
      { name: '射刺双修暴击流', usageRate: 0.20, top3Rate: 0.60 }
    ],
    recentRanks: [1, 5, 1, 4, 2, 6, 1, 3]
  },

  'p-daowuya': {
    id: 'p-daowuya',
    lastNickname: 'DY道无涯',
    platform: '斗鱼/抖音直播',
    streamerPlatform: '万象技术流独狼',
    rankText: '最强王者',
    rankScore: 9405,
    currentMmr: 9405,
    totalMatches: 154,
    winRate: 0.235,
    top3Rate: 0.640,
    playstyleCategory: 'BALANCED',
    playstyleDesc: '变种法核控制流。精研稷下群雄与控场法师，注重对局装备克制配给（魔女/不祥针对），属于冷门破局型选手。',
    signatureHeroes: ['诸葛亮', '王昭君', '弈星'],
    favoriteCommanders: [
      { name: '诸葛亮', usageRate: 0.48, winRate: 0.28 },
      { name: '弈星', usageRate: 0.32, winRate: 0.22 },
      { name: '庄周', usageRate: 0.20, winRate: 0.18 }
    ],
    favoriteLineups: [
      { name: '稷下群雄元素法', usageRate: 0.45, top3Rate: 0.70 },
      { name: '长安法刺理财流', usageRate: 0.35, top3Rate: 0.62 },
      { name: '玄雍法坦', usageRate: 0.20, top3Rate: 0.58 }
    ],
    recentRanks: [4, 2, 3, 5, 1, 4, 3, 2]
  }
}
