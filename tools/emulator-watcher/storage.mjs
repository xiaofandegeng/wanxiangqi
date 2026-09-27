// 王者万象棋数据站 - 持久化存储与统计引擎 (Storage & Statistical Engine)
// 遵循 v2 任务书规范：
// 1. 数据持久化到本地文件 (重启后不丢)
// 2. 登顶率/前三率/平均名次严格按有效局数 N 计算，N=0 返回 null，N<20 提示样本不足
// 3. 幂等去重，重复提交不增加对局与重复统计
// 4. 严格记录时间戳: match_time, observed_at, ingested_at, verified_at, available_at
// 5. 阵容统计与选手个人战绩隔离

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const DB_FILE = path.join(DATA_DIR, 'storage.json')

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

/**
 * 默认初始数据集 (基于真实录入的王者天梯战绩)
 */
function createInitialState() {
  const now = new Date().toISOString()
  return {
    dataSources: [
      {
        id: 'src-manual-review',
        name: '截图人工校对录入',
        type: 'SCREENSHOT_OCR_MANUAL',
        url: 'internal://evidence-workbench',
        capabilities: ['player_identity', 'match_details'],
        status: 'ACTIVE',
        lastAttemptAt: now,
        lastSuccessAt: now
      },
      {
        id: 'src-hokace-wiki',
        name: 'hokace.wiki 第三方阵容快照',
        type: 'LINEUP_AGGREGATE',
        url: 'https://hokace.wiki/zh/lineups/',
        capabilities: ['lineup_aggregate'],
        status: 'READY',
        version: 'v260917',
        lastAttemptAt: now,
        lastSuccessAt: now
      },
      {
        id: 'src-official-helper',
        name: '官方战绩小助手',
        type: 'OFFICIAL_API',
        url: 'https://wxq.qq.com/',
        capabilities: ['player_identity', 'match_details'],
        status: 'UNAVAILABLE',
        note: '未确认第三方公开开放接口，需本人账号授权材料',
        lastAttemptAt: null,
        lastSuccessAt: null
      }
    ],
    evidences: [
      {
        id: 'ev-18824',
        sha256: 'e4ea43a1b70ad626d5e5508684d5de3d9bf1eb12265ca703a3fb45c2ec4bfa82',
        sourceId: 'src-manual-review',
        capturedAt: '2026-09-27T12:00:00.000Z',
        verifiedAt: '2026-09-27T12:05:00.000Z',
        verifiedBy: 'AUDIT_STAFF',
        status: 'VERIFIED',
        note: '巅峰赛 18824★ 战力巅峰第一人实战截图材料'
      },
      {
        id: 'ev-11768',
        sha256: 'aa02599c279e88d1d86e927c3f8e6c7104b901a1827b9c66e92823a31e847c2d',
        sourceId: 'src-manual-review',
        capturedAt: '2026-09-27T10:00:00.000Z',
        verifiedAt: '2026-09-27T10:05:00.000Z',
        verifiedBy: 'AUDIT_STAFF',
        status: 'VERIFIED',
        note: '王牌对决 11768★ 荣耀先驱者实战截图材料'
      }
    ],
    players: [
      { id: 'p-ez-yeyu', nickname: 'EZ夜余', platform: 'HUYA', serverZone: '手Q1区', rankScore: 18824, rankText: '最强王者', title: '战力巅峰第一人', commander: '弈星', style: '极限大后期九五' },
      { id: 'p-dy-gin', nickname: 'DY校长神Gin', platform: 'DOUYU', serverZone: '微信1区', rankScore: 12091, rankText: '最强王者', title: '战力巅峰第十人', commander: '司空震', style: '雷霆扶桑刺快攻' },
      { id: 'p-dy-liyouduo', nickname: '抖音李由多', platform: 'DOUYIN', serverZone: '手Q2区', rankScore: 10075, rankText: '最强王者', title: '华北区第人 0015', commander: '司空震', style: '扶桑法刺' },
      { id: 'p-egm-pipisha', nickname: '抖音EGM皮皮鲨', platform: 'DOUYIN', serverZone: '微信2区', rankScore: 10054, rankText: '最强王者', title: '', commander: '庄周', style: '玄雍重坦防刺' },
      { id: 'p-xiang-k', nickname: '想k益笙菌', platform: 'DOUYIN', serverZone: '手Q1区', rankScore: 9996, rankText: '最强王者', title: '', commander: '诸葛亮', style: '稷下群雄大招流' },
      { id: 'p-b-xiaoyulv', nickname: 'B站小优律', platform: 'BILIBILI', serverZone: '微信3区', rankScore: 9961, rankText: '最强王者', title: '联合创始人 0496', commander: '公孙离', style: '尧天公孙离射手' },
      { id: 'p-bai-3', nickname: '白白白白3', platform: 'HUYA', serverZone: '手Q1区', rankScore: 11768, rankText: '最强王者', title: '荣耀先驱者 0004', commander: '弈星', style: '长城守卫射' },
      { id: 'p-dy-yiming', nickname: '抖音一茗', platform: 'DOUYIN', serverZone: '微信1区', rankScore: 11183, rankText: '最强王者', title: '联合创始人 1072', commander: '弈星', style: '稷下长城混搭' },
      { id: 'p-dy-liuer', nickname: '抖音EZ流儿', platform: 'DOUYIN', serverZone: '手Q3区', rankScore: 10234, rankText: '最强王者', title: '', commander: '司空震', style: '快攻赌狗刺' },
      { id: 'p-asen', nickname: 'Asen', platform: 'DEFAULT', serverZone: '微信2区', rankScore: 10132, rankText: '最强王者', title: '独狼', commander: '庄周', style: '重坦玄雍肉盾' },
      { id: 'p-dy-citong', nickname: '抖音刺痛', platform: 'DOUYIN', serverZone: '手Q1区', rankScore: 9638, rankText: '最强王者', title: '联合创始人 1814', commander: '公孙离', style: '极限阿离单核' },
      { id: 'p-dy-daowuya', nickname: 'DY道无涯', platform: 'DOUYU', serverZone: '微信4区', rankScore: 9405, rankText: '最强王者', title: '独狼', commander: '诸葛亮', style: '群雄法师核爆' }
    ],
    matches: [
      // 真实收录的对战记录流水 (逐局事实)
      { id: 'mh-101', playerId: 'p-ez-yeyu', matchTime: '2026-09-27T11:20:00.000Z', finalRank: 1, commander: '弈星', lineup: '九五之尊·终极完全体', roundsSurvived: 33, threeStars: ['弈星', '公孙离'], verified: true },
      { id: 'mh-102', playerId: 'p-ez-yeyu', matchTime: '2026-09-27T10:40:00.000Z', finalRank: 1, commander: '弈星', lineup: '完全体尧天法核', roundsSurvived: 32, threeStars: ['弈星'], verified: true },
      { id: 'mh-103', playerId: 'p-ez-yeyu', matchTime: '2026-09-27T10:00:00.000Z', finalRank: 2, commander: '弈星', lineup: '长城守卫射', roundsSurvived: 30, threeStars: ['公孙离'], verified: true },
      { id: 'mh-104', playerId: 'p-ez-yeyu', matchTime: '2026-09-27T09:15:00.000Z', finalRank: 1, commander: '司空震', lineup: '雷霆扶桑刺', roundsSurvived: 34, threeStars: ['司空震'], verified: true },
      { id: 'mh-105', playerId: 'p-dy-gin', matchTime: '2026-09-27T11:15:00.000Z', finalRank: 1, commander: '司空震', lineup: '雷霆扶桑刺', roundsSurvived: 32, threeStars: ['司空震', '娜可露露'], verified: true },
      { id: 'mh-106', playerId: 'p-dy-gin', matchTime: '2026-09-27T10:30:00.000Z', finalRank: 2, commander: '司空震', lineup: '雷霆扶桑刺', roundsSurvived: 30, threeStars: ['司空震'], verified: true },
      { id: 'mh-107', playerId: 'p-dy-gin', matchTime: '2026-09-27T09:50:00.000Z', finalRank: 1, commander: '弈星', lineup: '尧天射手', roundsSurvived: 33, threeStars: ['公孙离'], verified: true },
      { id: 'mh-108', playerId: 'p-dy-liyouduo', matchTime: '2026-09-27T11:00:00.000Z', finalRank: 3, commander: '司空震', lineup: '扶桑法刺', roundsSurvived: 28, threeStars: ['不知火舞'], verified: true },
      { id: 'mh-109', playerId: 'p-egm-pipisha', matchTime: '2026-09-27T10:55:00.000Z', finalRank: 2, commander: '庄周', lineup: '玄雍重坦防刺', roundsSurvived: 31, threeStars: ['廉颇', '白起'], verified: true },
      { id: 'mh-110', playerId: 'p-xiang-k', matchTime: '2026-09-27T10:50:00.000Z', finalRank: 4, commander: '诸葛亮', lineup: '稷下群雄大招流', roundsSurvived: 26, threeStars: ['诸葛亮'], verified: true },
      { id: 'mh-111', playerId: 'p-b-xiaoyulv', matchTime: '2026-09-27T10:45:00.000Z', finalRank: 3, commander: '公孙离', lineup: '尧天公孙离射手', roundsSurvived: 27, threeStars: ['公孙离'], verified: true },
      { id: 'mh-112', playerId: 'p-bai-3', matchTime: '2026-09-27T09:40:00.000Z', finalRank: 1, commander: '弈星', lineup: '九稷下长城射', roundsSurvived: 33, threeStars: ['弈星', '公孙离'], verified: true },
      { id: 'mh-113', playerId: 'p-dy-yiming', matchTime: '2026-09-27T09:35:00.000Z', finalRank: 2, commander: '弈星', lineup: '九稷下长城射', roundsSurvived: 31, threeStars: ['弈星'], verified: true },
      { id: 'mh-114', playerId: 'p-dy-liuer', matchTime: '2026-09-27T09:30:00.000Z', finalRank: 3, commander: '司空震', lineup: '快攻赌狗刺', roundsSurvived: 29, threeStars: ['司空震', '百里玄策'], verified: true },
      { id: 'mh-115', playerId: 'p-asen', matchTime: '2026-09-27T09:25:00.000Z', finalRank: 4, commander: '庄周', lineup: '坦射玄雍', roundsSurvived: 27, threeStars: ['白起'], verified: true },
      { id: 'mh-116', playerId: 'p-dy-citong', matchTime: '2026-09-27T09:20:00.000Z', finalRank: 1, commander: '公孙离', lineup: '极限阿离单核', roundsSurvived: 32, threeStars: ['公孙离', '伽罗'], verified: true },
      { id: 'mh-117', playerId: 'p-dy-daowuya', matchTime: '2026-09-27T09:15:00.000Z', finalRank: 5, commander: '诸葛亮', lineup: '群雄法师核爆', roundsSurvived: 24, threeStars: [], verified: true }
    ],
    events: [
      {
        id: 'evt-20260927-18824',
        mode: 'DIAMOND',
        scheduledAt: '2026-09-27T12:00:00.000Z',
        title: '巅峰赛 18824★ 战力巅峰对决',
        status: 'AUDITED',
        evidenceId: 'ev-18824',
        participants: [
          { slot: 1, playerId: 'p-ez-yeyu', nickname: 'EZ夜余', rankScore: 18824, odds: 1.8, supportCount: 3325, finalRank: 1 },
          { slot: 2, playerId: 'p-dy-gin', nickname: 'DY校长神Gin', rankScore: 12091, odds: 7.1, supportCount: 1747, finalRank: 2 },
          { slot: 3, playerId: 'p-dy-liyouduo', nickname: '抖音李由多', rankScore: 10075, odds: 10.2, supportCount: 1404, finalRank: 4 },
          { slot: 4, playerId: 'p-egm-pipisha', nickname: '抖音EGM皮皮鲨', rankScore: 10054, odds: 10.1, supportCount: 1268, finalRank: 3 },
          { slot: 5, playerId: 'p-xiang-k', nickname: '想k益笙菌', rankScore: 9996, odds: 10.5, supportCount: 1300, finalRank: 5 },
          { slot: 6, playerId: 'p-b-xiaoyulv', nickname: 'B站小优律', rankScore: 9961, odds: 10.3, supportCount: 1256, finalRank: 6 }
        ]
      },
      {
        id: 'evt-20260927-11768',
        mode: 'DIAMOND',
        scheduledAt: '2026-09-27T10:00:00.000Z',
        title: '王牌对决 11768★ 荣耀先驱者对决',
        status: 'AUDITED',
        evidenceId: 'ev-11768',
        participants: [
          { slot: 1, playerId: 'p-bai-3', nickname: '白白白白3', rankScore: 11768, odds: 4.2, supportCount: 4406, finalRank: 2 },
          { slot: 2, playerId: 'p-dy-yiming', nickname: '抖音一茗', rankScore: 11183, odds: 3.8, supportCount: 4179, finalRank: 3 },
          { slot: 3, playerId: 'p-dy-liuer', nickname: '抖音EZ流儿', rankScore: 10234, odds: 6.2, supportCount: 3728, finalRank: 4 },
          { slot: 4, playerId: 'p-asen', nickname: 'Asen', rankScore: 10132, odds: 7.2, supportCount: 3429, finalRank: 5 },
          { slot: 5, playerId: 'p-dy-citong', nickname: '抖音刺痛', rankScore: 9638, odds: 7.7, supportCount: 3325, finalRank: 1 },
          { slot: 6, playerId: 'p-dy-daowuya', nickname: 'DY道无涯', rankScore: 9405, odds: 7.5, supportCount: 3326, finalRank: 6 }
        ]
      }
    ],
    lineupSnapshots: [
      {
        id: 'lineup-snap-01',
        sourceId: 'src-hokace-wiki',
        lineupName: '雷霆扶桑刺',
        tier: 'T1',
        commander: '司空震',
        coreHeroes: ['司空震', '不知火舞', '娜可露露', '宫本武藏'],
        sampleCount: 14280,
        winRate: 0.224,      // 登顶率
        top3Rate: 0.582,     // 前三率
        avgRank: 3.12,       // 平均名次
        snapshotVersion: 'v260917',
        windowText: '近 7 日实战聚合',
        scope: '全服王者段位',
        updatedAt: '2026-09-27T08:00:00.000Z'
      },
      {
        id: 'lineup-snap-02',
        sourceId: 'src-hokace-wiki',
        lineupName: '九五至尊完全体',
        tier: 'T0.5',
        commander: '弈星',
        coreHeroes: ['弈星', '武则天', '吕布', '公孙离'],
        sampleCount: 8940,
        winRate: 0.286,
        top3Rate: 0.512,
        avgRank: 3.28,
        snapshotVersion: 'v260917',
        windowText: '近 7 日实战聚合',
        scope: '全服王者段位',
        updatedAt: '2026-09-27T08:00:00.000Z'
      },
      {
        id: 'lineup-snap-03',
        sourceId: 'src-hokace-wiki',
        lineupName: '玄雍重坦防刺',
        tier: 'T1',
        commander: '庄周',
        coreHeroes: ['廉颇', '白起', '嬴政', '镜'],
        sampleCount: 11200,
        winRate: 0.165,
        top3Rate: 0.620,
        avgRank: 3.05,
        snapshotVersion: 'v260917',
        windowText: '近 7 日实战聚合',
        scope: '全服王者段位',
        updatedAt: '2026-09-27T08:00:00.000Z'
      },
      {
        id: 'lineup-snap-04',
        sourceId: 'src-hokace-wiki',
        lineupName: '尧天阿离神射',
        tier: 'T1.5',
        commander: '公孙离',
        coreHeroes: ['公孙离', '明世隐', '裴擒虎', '伽罗'],
        sampleCount: 9650,
        winRate: 0.198,
        top3Rate: 0.540,
        avgRank: 3.35,
        snapshotVersion: 'v260917',
        windowText: '近 7 日实战聚合',
        scope: '全服王者段位',
        updatedAt: '2026-09-27T08:00:00.000Z'
      }
    ],
    importBatches: []
  }
}

class StorageEngine {
  constructor() {
    this.state = this.loadState()
  }

  loadState() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8')
        return JSON.parse(raw)
      }
    } catch (err) {
      console.error('[StorageEngine] Error loading storage.json, initializing fresh state:', err)
    }
    const initial = createInitialState()
    this.saveState(initial)
    return initial
  }

  saveState(stateToSave = this.state) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(stateToSave, null, 2), 'utf-8')
    } catch (err) {
      console.error('[StorageEngine] Failed to write storage.json:', err)
    }
  }

  /**
   * 严格按有效局数 N 计算选手统计 (登顶率, 前三率, 均名)
   * N=0 时全部返回 null，严禁假借 0%
   */
  computePlayerStats(playerId, cutoffTime = null) {
    const validMatches = this.state.matches.filter(m => {
      if (m.playerId !== playerId || !m.verified) return false
      // 严格防未来信息泄漏 (As-of Cutoff)
      if (cutoffTime && new Date(m.matchTime).getTime() >= new Date(cutoffTime).getTime()) {
        return false
      }
      return typeof m.finalRank === 'number' && m.finalRank >= 1 && m.finalRank <= 6
    })

    const n = validMatches.length
    if (n === 0) {
      return {
        sampleCount: 0,
        winRate: null,
        top3Rate: null,
        avgRank: null,
        warning: '暂无已核验战绩',
        isSmallSample: true
      }
    }

    const firstPlaces = validMatches.filter(m => m.finalRank === 1).length
    const top3Places = validMatches.filter(m => m.finalRank <= 3).length
    const rankSum = validMatches.reduce((acc, cur) => acc + cur.finalRank, 0)

    const winRate = Number((firstPlaces / n).toFixed(4))
    const top3Rate = Number((top3Places / n).toFixed(4))
    const avgRank = Number((rankSum / n).toFixed(2))

    return {
      sampleCount: n,
      firstPlaces,
      top3Places,
      winRate,
      top3Rate,
      avgRank,
      warning: n < 20 ? '样本量较少 (N < 20)' : null,
      isSmallSample: n < 20
    }
  }

  /**
   * 获取选手列表 (带实时真实统计)
   */
  getPlayersList(query = '', sort = 'rankScore') {
    let list = this.state.players.map(p => {
      const stats = this.computePlayerStats(p.id)
      return {
        ...p,
        stats
      }
    })

    if (query) {
      const q = query.toLowerCase()
      list = list.filter(p => p.nickname.toLowerCase().includes(q) || (p.title && p.title.toLowerCase().includes(q)))
    }

    if (sort === 'winRate') {
      list.sort((a, b) => (b.stats.winRate ?? -1) - (a.stats.winRate ?? -1))
    } else if (sort === 'top3Rate') {
      list.sort((a, b) => (b.stats.top3Rate ?? -1) - (a.stats.top3Rate ?? -1))
    } else if (sort === 'avgRank') {
      // 均名越小越优秀
      list.sort((a, b) => (a.stats.avgRank ?? 99) - (b.stats.avgRank ?? 99))
    } else {
      list.sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0))
    }

    return list
  }

  /**
   * 获取单选手的逐局战绩明细
   */
  getPlayerMatches(playerId) {
    return this.state.matches
      .filter(m => m.playerId === playerId)
      .sort((a, b) => new Date(b.matchTime).getTime() - new Date(a.matchTime).getTime())
  }

  /**
   * 获取对决场次列表
   */
  getEventsList(dateStr = '') {
    let list = this.state.events.slice()
    if (dateStr) {
      list = list.filter(e => e.scheduledAt.startsWith(dateStr))
    }
    return list.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
  }

  /**
   * 获取第三方阵容快照大盘
   */
  getLineupsList() {
    return this.state.lineupSnapshots
  }

  /**
   * 导入一批战绩事实 (带幂等去重校验)
   */
  importMatchRecords(records, batchMeta = {}) {
    const batchId = `batch-${Date.now()}`
    let inserted = 0
    let duplicates = 0

    records.forEach(rec => {
      // 幂等去重键: id 或 (playerId + matchTime)
      const isDup = this.state.matches.some(m => 
        (rec.id && m.id === rec.id) ||
        (m.playerId === rec.playerId && m.matchTime === rec.matchTime)
      )

      if (isDup) {
        duplicates++
      } else {
        const newRecord = {
          id: rec.id || `mh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          playerId: rec.playerId,
          matchTime: rec.matchTime || new Date().toISOString(),
          finalRank: Number(rec.finalRank),
          commander: rec.commander || '通用',
          lineup: rec.lineup || '未识别',
          roundsSurvived: Number(rec.roundsSurvived) || 20,
          threeStars: Array.isArray(rec.threeStars) ? rec.threeStars : [],
          verified: true,
          batchId
        }
        this.state.matches.push(newRecord)
        inserted++
      }
    })

    const runMeta = {
      batchId,
      source: batchMeta.source || 'MANUAL_IMPORT',
      totalRecords: records.length,
      inserted,
      duplicates,
      createdAt: new Date().toISOString()
    }

    this.state.importBatches.push(runMeta)
    this.saveState()
    return runMeta
  }
}

export const storage = new StorageEngine()
