import type { EventItem, PlayerProfile } from '../types/event'

export const mockEvents: EventItem[] = [
  {
    id: 'evt-20260927-1200',
    mode: 'DIAMOND',
    scheduledAt: '2026-09-27 12:00:00',
    status: 'AUDITED',
    gameVersion: 'v1.12.3',
    participants: [
      {
        slot: 1,
        playerId: 'p-1001',
        nickname: '天元弈心',
        rankText: '万象宗师 III',
        rankScore: 88,
        finalRank: 1,
        winRateRecent: 0.38,
        top3RateRecent: 0.82,
        sampleMatches: 45,
        commanderName: '弈星',
        favoriteLineup: '九稷下长城射'
      },
      {
        slot: 2,
        playerId: 'p-1002',
        nickname: '落子无悔',
        rankText: '无双王者 II',
        rankScore: 54,
        finalRank: 4,
        winRateRecent: 0.22,
        top3RateRecent: 0.65,
        sampleMatches: 38,
        commanderName: '司空震',
        favoriteLineup: '雷霆扶桑刺'
      },
      {
        slot: 3,
        playerId: 'p-1003',
        nickname: '云梦小诸葛',
        rankText: '万象宗师 I',
        rankScore: 112,
        finalRank: 2,
        winRateRecent: 0.31,
        top3RateRecent: 0.78,
        sampleMatches: 52,
        commanderName: '诸葛亮',
        favoriteLineup: '稷下群雄法'
      },
      {
        slot: 4,
        playerId: 'p-1004',
        nickname: '北冥有鱼',
        rankText: '最强王者 IV',
        rankScore: 32,
        finalRank: 5,
        winRateRecent: 0.15,
        top3RateRecent: 0.50,
        sampleMatches: 26,
        commanderName: '庄周',
        favoriteLineup: '坦射玄雍'
      },
      {
        slot: 5,
        playerId: 'p-1005',
        nickname: '绝影惊鸿',
        rankText: '万象宗师 II',
        rankScore: 95,
        finalRank: 3,
        winRateRecent: 0.27,
        top3RateRecent: 0.72,
        sampleMatches: 41,
        commanderName: '公孙离',
        favoriteLineup: '尧天射手阵'
      },
      {
        slot: 6,
        playerId: 'p-1006',
        nickname: '孤勇破晓',
        rankText: '无双王者 I',
        rankScore: 68,
        finalRank: 6,
        winRateRecent: 0.18,
        top3RateRecent: 0.58,
        sampleMatches: 33,
        commanderName: '铠',
        favoriteLineup: '长城守卫战士'
      }
    ],
    forecast: {
      modelVersion: 'plackett-luce-v1.2',
      asOf: '2026-09-27 11:58:30',
      sampleSize: 235,
      coverageRate: 0.94,
      probabilities: {
        1: 0.32,
        2: 0.14,
        3: 0.25,
        4: 0.08,
        5: 0.15,
        6: 0.06
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
    },
    supportSnapshot: {
      1: { observedAt: '2026-09-27 11:59:00', ratioPercent: 35 },
      2: { observedAt: '2026-09-27 11:59:00', ratioPercent: 12 },
      3: { observedAt: '2026-09-27 11:59:00', ratioPercent: 28 },
      4: { observedAt: '2026-09-27 11:59:00', ratioPercent: 6 },
      5: { observedAt: '2026-09-27 11:59:00', ratioPercent: 14 },
      6: { observedAt: '2026-09-27 11:59:00', ratioPercent: 5 }
    },
    evidences: [
      {
        id: 'ev-01',
        sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        imageUrl: '/assets/sample-pre-match.png',
        capturedAt: '2026-09-27 11:55:00',
        verifiedAt: '2026-09-27 11:57:30',
        verifiedBy: 'AuditAdmin-01',
        evidenceType: 'PRE_MATCH_LOBBY',
        status: 'CONFIRMED'
      },
      {
        id: 'ev-02',
        sha256: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
        imageUrl: '/assets/sample-post-match.png',
        capturedAt: '2026-09-27 12:28:15',
        verifiedAt: '2026-09-27 12:30:00',
        verifiedBy: 'AuditAdmin-01',
        evidenceType: 'POST_MATCH_SUMMARY',
        status: 'CONFIRMED'
      }
    ]
  },
  {
    id: 'evt-20260927-1300',
    mode: 'DIAMOND',
    scheduledAt: '2026-09-27 13:00:00',
    status: 'SETTLED',
    gameVersion: 'v1.12.3',
    participants: [
      {
        slot: 1,
        playerId: 'p-1007',
        nickname: '星汉流光',
        rankText: '万象宗师 IV',
        rankScore: 45,
        finalRank: 2,
        winRateRecent: 0.28,
        top3RateRecent: 0.70,
        sampleMatches: 30,
        commanderName: '曜',
        favoriteLineup: '稷下星之队'
      },
      {
        slot: 2,
        playerId: 'p-1008',
        nickname: '枫华绝代',
        rankText: '万象宗师 I',
        rankScore: 120,
        finalRank: 1,
        winRateRecent: 0.40,
        top3RateRecent: 0.85,
        sampleMatches: 60,
        commanderName: '弈星',
        favoriteLineup: '尧天男刺'
      },
      {
        slot: 3,
        playerId: 'p-1009',
        nickname: '青莲剑客',
        rankText: '无双王者 III',
        rankScore: 40,
        finalRank: 6,
        winRateRecent: 0.16,
        top3RateRecent: 0.52,
        sampleMatches: 25,
        commanderName: '李白',
        favoriteLineup: '长安刺客流'
      },
      {
        slot: 4,
        playerId: 'p-1010',
        nickname: '烽火连城',
        rankText: '万象宗师 III',
        rankScore: 78,
        finalRank: 3,
        winRateRecent: 0.24,
        top3RateRecent: 0.68,
        sampleMatches: 44,
        commanderName: '廉颇',
        favoriteLineup: '重装坦克坦射'
      },
      {
        slot: 5,
        playerId: 'p-1011',
        nickname: '寒霜冷月',
        rankText: '无双王者 II',
        rankScore: 62,
        finalRank: 4,
        winRateRecent: 0.20,
        top3RateRecent: 0.61,
        sampleMatches: 35,
        commanderName: '王昭君',
        favoriteLineup: '极冻冰雪法'
      },
      {
        slot: 6,
        playerId: 'p-1012',
        nickname: '破阵霸王',
        rankText: '最强王者 I',
        rankScore: 89,
        finalRank: 5,
        winRateRecent: 0.18,
        top3RateRecent: 0.55,
        sampleMatches: 29,
        commanderName: '项羽',
        favoriteLineup: '楚汉争霸坦'
      }
    ],
    forecast: {
      modelVersion: 'plackett-luce-v1.2',
      asOf: '2026-09-27 12:58:30',
      sampleSize: 223,
      coverageRate: 0.91,
      probabilities: {
        1: 0.18,
        2: 0.42,
        3: 0.08,
        4: 0.16,
        5: 0.11,
        6: 0.05
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
    },
    supportSnapshot: {
      1: { observedAt: '2026-09-27 12:59:10', ratioPercent: 19 },
      2: { observedAt: '2026-09-27 12:59:10', ratioPercent: 46 },
      3: { observedAt: '2026-09-27 12:59:10', ratioPercent: 7 },
      4: { observedAt: '2026-09-27 12:59:10', ratioPercent: 15 },
      5: { observedAt: '2026-09-27 12:59:10', ratioPercent: 9 },
      6: { observedAt: '2026-09-27 12:59:10', ratioPercent: 4 }
    }
  },
  {
    id: 'evt-20260927-1400',
    mode: 'DIAMOND',
    scheduledAt: '2026-09-27 14:00:00',
    status: 'PREDICTABLE',
    gameVersion: 'v1.12.3',
    participants: [
      {
        slot: 1,
        playerId: 'p-1001',
        nickname: '天元弈心',
        rankText: '万象宗师 III',
        rankScore: 92,
        winRateRecent: 0.39,
        top3RateRecent: 0.83,
        sampleMatches: 46,
        commanderName: '弈星',
        favoriteLineup: '九稷下长城射'
      },
      {
        slot: 2,
        playerId: 'p-1013',
        nickname: '玄甲破军',
        rankText: '万象宗师 II',
        rankScore: 84,
        winRateRecent: 0.26,
        top3RateRecent: 0.71,
        sampleMatches: 37,
        commanderName: '蒙恬',
        favoriteLineup: '玄雍重甲卫'
      },
      {
        slot: 3,
        playerId: 'p-1008',
        nickname: '枫华绝代',
        rankText: '万象宗师 I',
        rankScore: 125,
        winRateRecent: 0.41,
        top3RateRecent: 0.86,
        sampleMatches: 61,
        commanderName: '弈星',
        favoriteLineup: '尧天男刺'
      },
      {
        slot: 4,
        playerId: 'p-1014',
        nickname: '惊鸿照影',
        rankText: '无双王者 I',
        rankScore: 72,
        winRateRecent: 0.21,
        top3RateRecent: 0.64,
        sampleMatches: 31,
        commanderName: '不知火舞',
        favoriteLineup: '扶桑法刺'
      },
      {
        slot: 5,
        playerId: 'p-1015',
        nickname: '苍穹之光',
        rankText: '无双王者 III',
        rankScore: 36,
        winRateRecent: 0.17,
        top3RateRecent: 0.54,
        sampleMatches: 28,
        commanderName: '项羽',
        favoriteLineup: '楚汉坦'
      },
      {
        slot: 6,
        playerId: 'p-1016',
        nickname: '暗夜游侠',
        rankText: '万象宗师 IV',
        rankScore: 50,
        winRateRecent: 0.23,
        top3RateRecent: 0.66,
        sampleMatches: 34,
        commanderName: '百里守约',
        favoriteLineup: '长城狙击流'
      }
    ],
    forecast: {
      modelVersion: 'plackett-luce-v1.2',
      asOf: '2026-09-27 13:50:00',
      sampleSize: 237,
      coverageRate: 0.96,
      probabilities: {
        1: 0.28,
        2: 0.16,
        3: 0.33,
        4: 0.10,
        5: 0.05,
        6: 0.08
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
    },
    supportSnapshot: {
      1: { observedAt: '2026-09-27 13:52:00', ratioPercent: 30 },
      2: { observedAt: '2026-09-27 13:52:00', ratioPercent: 14 },
      3: { observedAt: '2026-09-27 13:52:00', ratioPercent: 38 },
      4: { observedAt: '2026-09-27 13:52:00', ratioPercent: 8 },
      5: { observedAt: '2026-09-27 13:52:00', ratioPercent: 4 },
      6: { observedAt: '2026-09-27 13:52:00', ratioPercent: 6 }
    }
  },
  {
    id: 'evt-20260927-1500',
    mode: 'DIAMOND',
    scheduledAt: '2026-09-27 15:00:00',
    status: 'PENDING_VERIFY',
    gameVersion: 'v1.12.3',
    participants: [
      {
        slot: 1,
        nickname: '白虹贯日',
        rankText: '万象宗师 II',
        rankScore: 80
      },
      {
        slot: 2,
        nickname: '雷霆千军',
        rankText: '无双王者 I',
        rankScore: 66
      },
      {
        slot: 3,
        nickname: '凌波微步',
        rankText: '万象宗师 III',
        rankScore: 90
      },
      {
        slot: 4,
        nickname: '破晓之星',
        rankText: '最强王者 II',
        rankScore: 50
      },
      {
        slot: 5,
        nickname: '飞将巡天',
        rankText: '万象宗师 I',
        rankScore: 110
      },
      {
        slot: 6,
        nickname: '山河永寂',
        rankText: '无双王者 III',
        rankScore: 42
      }
    ]
  }
]

export const mockPlayerProfiles: Record<string, PlayerProfile> = {
  'p-1001': {
    id: 'p-1001',
    lastNickname: '天元弈心',
    platform: '微信大区',
    rankText: '万象宗师 III',
    rankScore: 92,
    totalMatches: 182,
    winRate: 0.39,
    top3Rate: 0.83,
    favoriteCommanders: [
      { name: '弈星', usageRate: 0.65, winRate: 0.44 },
      { name: '诸葛亮', usageRate: 0.22, winRate: 0.32 },
      { name: '庄周', usageRate: 0.13, winRate: 0.25 }
    ],
    favoriteLineups: [
      { name: '九稷下长城射', usageRate: 0.52, top3Rate: 0.88 },
      { name: '稷下群雄法', usageRate: 0.30, top3Rate: 0.79 },
      { name: '尧天坦射', usageRate: 0.18, top3Rate: 0.75 }
    ],
    recentRanks: [1, 2, 1, 3, 2, 1, 4, 1]
  },
  'p-1008': {
    id: 'p-1008',
    lastNickname: '枫华绝代',
    platform: 'QQ大区',
    rankText: '万象宗师 I',
    rankScore: 125,
    totalMatches: 210,
    winRate: 0.41,
    top3Rate: 0.86,
    favoriteCommanders: [
      { name: '弈星', usageRate: 0.58, winRate: 0.46 },
      { name: '公孙离', usageRate: 0.28, winRate: 0.38 },
      { name: '司空震', usageRate: 0.14, winRate: 0.29 }
    ],
    favoriteLineups: [
      { name: '尧天男刺', usageRate: 0.48, top3Rate: 0.90 },
      { name: '尧天射手阵', usageRate: 0.35, top3Rate: 0.84 },
      { name: '雷霆扶桑刺', usageRate: 0.17, top3Rate: 0.72 }
    ],
    recentRanks: [1, 1, 2, 1, 3, 1, 2, 1]
  }
}
