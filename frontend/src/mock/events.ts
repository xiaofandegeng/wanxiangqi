import type { EventItem, PlayerProfile } from '../types/event'
import { realProPlayersData } from './pro-players'

export const mockPlayerProfiles: Record<string, PlayerProfile> = {
  ...realProPlayersData
}

export const mockEvents: EventItem[] = [
  // 最新真实对局实盘数据 (来自真实客户端截图 18824分断层局)
  {
    id: 'evt-real-champion-18824',
    mode: 'DIAMOND',
    scheduledAt: '2026-09-27 18:00:00',
    status: 'PREDICTABLE',
    gameVersion: 'v1.12.3',
    participants: [
      {
        slot: 1,
        playerId: 'p-ezyeyu',
        nickname: 'EZ夜余',
        rankText: '最强王者',
        rankScore: 18824,
        winRateRecent: 0.440,
        top3RateRecent: 0.890,
        sampleMatches: 420,
        commanderName: '弈星',
        favoriteLineup: '九稷下长城射'
      },
      {
        slot: 2,
        playerId: 'p-dyxiaozhang',
        nickname: 'DY校长神Gin',
        rankText: '最强王者',
        rankScore: 12091,
        winRateRecent: 0.285,
        top3RateRecent: 0.760,
        sampleMatches: 280,
        commanderName: '司空震',
        favoriteLineup: '尧天男刺极速切入'
      },
      {
        slot: 3,
        playerId: 'p-liyouduo',
        nickname: '抖音李由多',
        rankText: '最强王者',
        rankScore: 10075,
        winRateRecent: 0.120,
        top3RateRecent: 0.650,
        sampleMatches: 145,
        commanderName: '司空震',
        favoriteLineup: '扶桑刺客闪电战'
      },
      {
        slot: 4,
        playerId: 'p-pipisha',
        nickname: '抖音EGM皮皮鲨',
        rankText: '最强王者',
        rankScore: 10054,
        winRateRecent: 0.110,
        top3RateRecent: 0.620,
        sampleMatches: 130,
        commanderName: '庄周',
        favoriteLineup: '坦射玄雍坚韧壁垒'
      },
      {
        slot: 5,
        playerId: 'p-yishengjun',
        nickname: '想k益笙菌',
        rankText: '最强王者',
        rankScore: 9996,
        winRateRecent: 0.080,
        top3RateRecent: 0.580,
        sampleMatches: 110,
        commanderName: '诸葛亮',
        favoriteLineup: '稷下群雄元素法'
      },
      {
        slot: 6,
        playerId: 'p-xiaoyoulu',
        nickname: 'B站小优律',
        rankText: '最强王者',
        rankScore: 9961,
        winRateRecent: 0.100,
        top3RateRecent: 0.600,
        sampleMatches: 160,
        commanderName: '公孙离',
        favoriteLineup: '尧天纯射极致输出'
      }
    ],
    forecast: {
      modelVersion: 'matchup-synergy-v2.0',
      asOf: '2026-09-27 17:58:00',
      sampleSize: 1245,
      coverageRate: 0.98,
      probabilities: {
        1: 0.42,
        2: 0.28,
        3: 0.08,
        4: 0.09,
        5: 0.06,
        6: 0.07
      },
      baselineProbabilities: { 1: 0.167, 2: 0.167, 3: 0.167, 4: 0.167, 5: 0.167, 6: 0.167 },
      status: 'ACTIVE'
    },
    supportSnapshot: {
      1: { observedAt: '2026-09-27 17:59:00', ratioPercent: 32.3, oddsDisplay: 1.8 },
      2: { observedAt: '2026-09-27 17:59:00', ratioPercent: 17.0, oddsDisplay: 7.1 },
      3: { observedAt: '2026-09-27 17:59:00', ratioPercent: 13.6, oddsDisplay: 10.2 },
      4: { observedAt: '2026-09-27 17:59:00', ratioPercent: 12.3, oddsDisplay: 10.1 },
      5: { observedAt: '2026-09-27 17:59:00', ratioPercent: 12.6, oddsDisplay: 10.5 },
      6: { observedAt: '2026-09-27 17:59:00', ratioPercent: 12.2, oddsDisplay: 10.3 }
    }
  },

  // 历史真实对局实盘数据 (11768分场次)
  {
    id: 'evt-real-champion-11768',
    mode: 'DIAMOND',
    scheduledAt: '2026-09-27 17:00:00',
    status: 'PREDICTABLE',
    gameVersion: 'v1.12.3',
    participants: [
      {
        slot: 1,
        playerId: 'p-baibai',
        nickname: '白白白白3',
        rankText: '最强王者',
        rankScore: 11768,
        winRateRecent: 0.385,
        top3RateRecent: 0.812,
        sampleMatches: 245,
        commanderName: '弈星',
        favoriteLineup: '九稷下长城射'
      },
      {
        slot: 2,
        playerId: 'p-yiming',
        nickname: '抖音一茗',
        rankText: '最强王者',
        rankScore: 11183,
        winRateRecent: 0.362,
        top3RateRecent: 0.845,
        sampleMatches: 310,
        commanderName: '弈星',
        favoriteLineup: '尧天男刺极速切入'
      },
      {
        slot: 3,
        playerId: 'p-ezliu',
        nickname: '抖音EZ流儿',
        rankText: '最强王者',
        rankScore: 10234,
        winRateRecent: 0.288,
        top3RateRecent: 0.720,
        sampleMatches: 198,
        commanderName: '司空震',
        favoriteLineup: '扶桑刺客闪电战'
      },
      {
        slot: 4,
        playerId: 'p-asen',
        nickname: 'Asen',
        rankText: '最强王者',
        rankScore: 10132,
        winRateRecent: 0.265,
        top3RateRecent: 0.690,
        sampleMatches: 165,
        commanderName: '庄周',
        favoriteLineup: '坦射玄雍坚韧壁垒'
      },
      {
        slot: 5,
        playerId: 'p-citong',
        nickname: '抖音刺痛',
        rankText: '最强王者',
        rankScore: 9638,
        winRateRecent: 0.310,
        top3RateRecent: 0.680,
        sampleMatches: 220,
        commanderName: '公孙离',
        favoriteLineup: '尧天纯射极致输出'
      },
      {
        slot: 6,
        playerId: 'p-daowuya',
        nickname: 'DY道无涯',
        rankText: '最强王者',
        rankScore: 9405,
        winRateRecent: 0.235,
        top3RateRecent: 0.640,
        sampleMatches: 154,
        commanderName: '诸葛亮',
        favoriteLineup: '稷下群雄元素法'
      }
    ],
    forecast: {
      modelVersion: 'plackett-luce-v2.0-real',
      asOf: '2026-09-27 16:58:00',
      sampleSize: 1292,
      coverageRate: 1.0,
      probabilities: {
        1: 0.285,
        2: 0.260,
        3: 0.145,
        4: 0.115,
        5: 0.105,
        6: 0.090
      },
      baselineProbabilities: {
        1: 0.1667,
        2: 0.1667,
        3: 0.1667,
        4: 0.1667,
        5: 0.1667,
        6: 0.1667
      },
      status: 'ACTIVE'
    },
    supportSnapshot: {
      1: { observedAt: '2026-09-27 16:58:01', ratioPercent: 19.68, oddsDisplay: 4.2 },
      2: { observedAt: '2026-09-27 16:58:01', ratioPercent: 18.66, oddsDisplay: 3.8 },
      3: { observedAt: '2026-09-27 16:58:01', ratioPercent: 16.65, oddsDisplay: 6.2 },
      4: { observedAt: '2026-09-27 16:58:01', ratioPercent: 15.31, oddsDisplay: 7.2 },
      5: { observedAt: '2026-09-27 16:58:01', ratioPercent: 14.85, oddsDisplay: 7.7 },
      6: { observedAt: '2026-09-27 16:58:01', ratioPercent: 14.85, oddsDisplay: 7.5 }
    },
    evidences: [
      {
        id: 'ev-real-screenshot',
        sha256: '7c98b65da9841f32a76ef4821a8dcf8673a5a8f2780e98031d257a3e786b46e3',
        imageUrl: '/assets/sample-pre-match.png',
        capturedAt: '2026-09-27 16:58:01',
        verifiedAt: '2026-09-27 16:58:10',
        verifiedBy: 'SystemAutoOCR',
        evidenceType: 'PRE_MATCH_LOBBY',
        status: 'CONFIRMED'
      }
    ]
  },
  {
    id: 'evt-20260927-1400',
    mode: 'DIAMOND',
    scheduledAt: '2026-09-27 14:00:00',
    status: 'SETTLED',
    gameVersion: 'v1.12.3',
    participants: [
      {
        slot: 1,
        playerId: 'p-baibai',
        nickname: '白白白白3',
        rankText: '最强王者',
        rankScore: 11768,
        finalRank: 1,
        winRateRecent: 0.385,
        top3RateRecent: 0.812,
        sampleMatches: 245,
        commanderName: '弈星',
        favoriteLineup: '九稷下长城射'
      },
      {
        slot: 2,
        playerId: 'p-yiming',
        nickname: '抖音一茗',
        rankText: '最强王者',
        rankScore: 11183,
        finalRank: 2,
        winRateRecent: 0.362,
        top3RateRecent: 0.845,
        sampleMatches: 310,
        commanderName: '弈星',
        favoriteLineup: '尧天男刺极速切入'
      },
      {
        slot: 3,
        playerId: 'p-ezliu',
        nickname: '抖音EZ流儿',
        rankText: '最强王者',
        rankScore: 10234,
        finalRank: 4,
        winRateRecent: 0.288,
        top3RateRecent: 0.720,
        sampleMatches: 198,
        commanderName: '司空震',
        favoriteLineup: '扶桑刺客闪电战'
      },
      {
        slot: 4,
        playerId: 'p-asen',
        nickname: 'Asen',
        rankText: '最强王者',
        rankScore: 10132,
        finalRank: 3,
        winRateRecent: 0.265,
        top3RateRecent: 0.690,
        sampleMatches: 165,
        commanderName: '庄周',
        favoriteLineup: '坦射玄雍坚韧壁垒'
      },
      {
        slot: 5,
        playerId: 'p-citong',
        nickname: '抖音刺痛',
        rankText: '最强王者',
        rankScore: 9638,
        finalRank: 5,
        winRateRecent: 0.310,
        top3RateRecent: 0.680,
        sampleMatches: 220,
        commanderName: '公孙离',
        favoriteLineup: '尧天纯射极致输出'
      },
      {
        slot: 6,
        playerId: 'p-daowuya',
        nickname: 'DY道无涯',
        rankText: '最强王者',
        rankScore: 9405,
        finalRank: 6,
        winRateRecent: 0.235,
        top3RateRecent: 0.640,
        sampleMatches: 154,
        commanderName: '诸葛亮',
        favoriteLineup: '稷下群雄元素法'
      }
    ],
    forecast: {
      modelVersion: 'plackett-luce-v1.2',
      asOf: '2026-09-27 13:58:30',
      sampleSize: 1286,
      coverageRate: 0.98,
      probabilities: {
        1: 0.285,
        2: 0.260,
        3: 0.145,
        4: 0.115,
        5: 0.105,
        6: 0.090
      },
      baselineProbabilities: {
        1: 0.167,
        2: 0.167,
        3: 0.167,
        4: 0.167,
        5: 0.167,
        6: 0.167
      },
      status: 'ACTIVE'
    }
  }
]
