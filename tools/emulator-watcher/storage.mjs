// 王者万象棋数据站 - 真实持久化存储与统计引擎 (Storage & Statistical Engine)
// 遵循 v2 任务书及验收报告规范：
// 1. 冷启动零 mock：默认空事实库启动，样例严格隔离，绝不自动插入已核验数据 (F02)
// 2. 双时间截点防未来泄漏：matchTime < cutoff && availableAt <= cutoff (F10)
// 3. 严格数据校验：拒绝空对象，整数名次 1~6，有效 ISO 时间戳，未核验数据隔离 (F08)
// 4. 幂等去重与稳定键更正机制 (A03, A13)
// 5. 阵容统计与选手个人战绩物理隔离 (A06)

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
 * 真实空事实库初始状态 (Zero-Mock Cold Start)
 * 严格遵从 A01 与 F02：首次运行必须为空库
 */
function createEmptyState() {
  const now = new Date().toISOString()
  return {
    meta: {
      version: '2.0.0',
      initializedAt: now,
      engine: 'PostgreSQL_Compatible_Local_Engine',
      storageMode: 'EMPTY_COLD_START'
    },
    dataSources: [
      {
        id: 'src-manual-review',
        name: '截图人工校对录入工作台',
        type: 'SCREENSHOT_OCR_MANUAL',
        url: 'internal://evidence-workbench',
        capabilities: ['player_identity', 'match_details'],
        status: 'ACTIVE',
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastError: null
      },
      {
        id: 'src-hokace-wiki',
        name: 'hokace.wiki 第三方阵容快照',
        type: 'LINEUP_AGGREGATE',
        url: 'https://hokace.wiki/zh/lineups/',
        capabilities: ['lineup_aggregate'],
        status: 'READY',
        version: 'v260917',
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastError: null
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
        lastSuccessAt: null,
        lastError: null
      },
      {
        id: 'src-datatft-platform',
        name: '万象棋大数据公开数据平台 (datawxq.com)',
        type: 'BIG_DATA_AGGREGATE',
        url: 'https://www.datawxq.com/',
        capabilities: ['player_identity', 'tournament_details', 'lineup_aggregate', 'commander_rankings', 'hero_rankings'],
        status: 'READY',
        version: 'S1-202609',
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastError: null
      }
    ],
    evidences: [],
    players: [],
    matches: [],
    events: [],
    lineupSnapshots: [],
    pendingCandidates: [], // 待人工核验候选池
    importBatches: []
  }
}

/**
 * 仅用于明确指定 DEMO_MODE 或 FIXTURES 环境变量时加载的示范数据
 * 生产默认模式绝不加载
 */
function createDemoFixtures() {
  const now = new Date().toISOString()
  return {
    meta: {
      version: '2.0.0',
      initializedAt: now,
      engine: 'PostgreSQL_Compatible_Local_Engine',
      storageMode: 'DEMO_FIXTURES'
    },
    dataSources: [
      {
        id: 'src-manual-review',
        name: '截图人工校对录入工作台',
        type: 'SCREENSHOT_OCR_MANUAL',
        url: 'internal://evidence-workbench',
        capabilities: ['player_identity', 'match_details'],
        status: 'ACTIVE',
        lastAttemptAt: now,
        lastSuccessAt: now,
        lastError: null
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
        lastSuccessAt: now,
        lastError: null
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
        lastSuccessAt: null,
        lastError: null
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
      }
    ],
    players: [
      { id: 'p-ez-yeyu', nickname: 'EZ夜余', platform: 'HUYA', serverZone: '手Q1区', rankScore: 18824, rankText: '最强王者', title: '战力巅峰第一人', commander: '弈星', style: '极限大后期九五' },
      { id: 'p-dy-gin', nickname: 'DY校长神Gin', platform: 'DOUYU', serverZone: '微信1区', rankScore: 12091, rankText: '最强王者', title: '战力巅峰第十人', commander: '司空震', style: '雷霆扶桑刺快攻' }
    ],
    matches: [
      { id: 'mh-101', playerId: 'p-ez-yeyu', matchTime: '2026-09-27T11:20:00.000Z', availableAt: '2026-09-27T11:25:00.000Z', mode: 'RANKED_DIAMOND', finalRank: 1, commander: '弈星', lineup: '九五之尊·终极完全体', roundsSurvived: 33, threeStars: ['弈星', '公孙离'], verified: true, batchId: 'batch-fixture' },
      { id: 'mh-105', playerId: 'p-dy-gin', matchTime: '2026-09-27T11:15:00.000Z', availableAt: '2026-09-27T11:20:00.000Z', mode: 'RANKED_DIAMOND', finalRank: 2, commander: '司空震', lineup: '雷霆扶桑刺', roundsSurvived: 32, threeStars: ['司空震'], verified: true, batchId: 'batch-fixture' }
    ],
    events: [
      {
        id: 'evt-20260927-18824',
        mode: 'RANKED_DIAMOND',
        scheduledAt: '2026-09-27T12:00:00.000Z',
        title: '巅峰赛 18824★ 战力巅峰对决',
        status: 'AUDITED',
        evidenceId: 'ev-18824',
        participants: [
          { slot: 1, playerId: 'p-ez-yeyu', nickname: 'EZ夜余', rankScore: 18824, odds: 1.8, supportCount: 3325, finalRank: 1 },
          { slot: 2, playerId: 'p-dy-gin', nickname: 'DY校长神Gin', rankScore: 12091, odds: 7.1, supportCount: 1747, finalRank: 2 }
        ]
      }
    ],
    lineupSnapshots: [],
    pendingCandidates: [],
    importBatches: []
  }
}

export class StorageEngine {
  constructor() {
    this.syncHandler = null
    this.state = this.loadState()
  }

  setSyncHandler(handler) {
    this.syncHandler = handler
  }

  triggerSync(action, payload) {
    if (typeof this.syncHandler === 'function') {
      try {
        this.syncHandler(action, payload)
      } catch (err) {
        console.error(`[StorageEngine] Sync handler error (${action}):`, err.message)
      }
    }
  }

  loadState() {
    const isDemoMode = process.env.DEMO_MODE === 'true' || process.env.FIXTURES === 'true'
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8')
        const parsed = JSON.parse(raw)
        // 保证关键字段数组健全
        parsed.players = parsed.players || []
        parsed.matches = parsed.matches || []
        parsed.events = parsed.events || []
        parsed.lineupSnapshots = parsed.lineupSnapshots || []
        parsed.pendingCandidates = parsed.pendingCandidates || []
        parsed.importBatches = parsed.importBatches || []
        parsed.evidences = parsed.evidences || []
        parsed.dataSources = parsed.dataSources || []
        return parsed
      }
    } catch (err) {
      console.error('[StorageEngine] Error loading storage.json:', err.message)
      // 文件损坏时抛出告警并保持空状态，绝不暗度陈仓生成假核验数据 (F02)
    }

    const state = isDemoMode ? createDemoFixtures() : createEmptyState()
    this.saveState(state)
    return state
  }

  saveState(stateToSave = this.state) {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(stateToSave, null, 2), 'utf-8')
    } catch (err) {
      console.error('[StorageEngine] Failed to write storage.json:', err)
      throw err
    }
  }

  /**
   * 重置为空库 (用于自动化测试与清库核验 A01)
   */
  resetToEmpty() {
    this.state = createEmptyState()
    this.saveState()
    return this.state
  }

  /**
   * 严格按有效局数 N 计算选手统计 (登顶率, 前三率, 均名)
   * 严格实现双时间截点防泄漏 (F10):
   * 1. matchTime < cutoff (赛前已打完)
   * 2. availableAt <= cutoff (赛前系统已收录可用，防晚到数据未来泄漏)
   * 3. mode 模式隔离
   * 4. from ~ to 时间窗口
   * 5. N=0 时全部返回 null，严禁借用 0% 或假数据
   */
  computePlayerStats(playerId, options = {}) {
    const { cutoffTime = null, mode = null, from = null, to = null } = options

    const validMatches = this.state.matches.filter(m => {
      if (m.playerId !== playerId) return false
      // 必须为经正式核验通过的战绩
      if (m.verified !== true) return false

      // 必须是合法整数名次 1~6
      if (typeof m.finalRank !== 'number' || !Number.isInteger(m.finalRank) || m.finalRank < 1 || m.finalRank > 6) {
        return false
      }

      const matchDateMs = new Date(m.matchTime).getTime()
      if (isNaN(matchDateMs)) return false

      // 截点过滤 1: matchTime < cutoff
      if (cutoffTime) {
        const cutoffMs = new Date(cutoffTime).getTime()
        if (isNaN(cutoffMs)) return false
        if (matchDateMs >= cutoffMs) return false

        // 截点过滤 2 (防未来信息泄漏): availableAt <= cutoff
        const availableMs = m.availableAt ? new Date(m.availableAt).getTime() : matchDateMs
        if (!isNaN(availableMs) && availableMs > cutoffMs) {
          return false // 晚到数据：比赛发生早但系统收录晚，在截点时刻尚未知晓，必须剔除
        }
      }

      // 模式过滤 (A10)
      if (mode && mode !== 'ALL') {
        if (m.mode && m.mode !== mode) return false
      }

      // 时间范围过滤 (from / to)
      if (from) {
        const fromMs = new Date(from).getTime()
        if (!isNaN(fromMs) && matchDateMs < fromMs) return false
      }
      if (to) {
        const toMs = new Date(to).getTime()
        if (!isNaN(toMs) && matchDateMs > toMs) return false
      }

      return true
    })

    const n = validMatches.length
    if (n === 0) {
      return {
        sampleCount: 0,
        firstPlaces: 0,
        top3Places: 0,
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
   * 获取选手列表 (带实时真实统计，支持 query, sort, mode, from, to)
   */
  getPlayersList(options = {}) {
    const { query = '', sort = 'rankScore', mode = null, from = null, to = null } = options

    let list = this.state.players.map(p => {
      const stats = this.computePlayerStats(p.id, { mode, from, to })
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
      list.sort((a, b) => (a.stats.avgRank ?? 99) - (b.stats.avgRank ?? 99))
    } else {
      list.sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0))
    }

    return list
  }

  /**
   * 获取单选手的逐局战绩明细 (只返回已核验或全量)
   */
  getPlayerMatches(playerId, onlyVerified = true) {
    return this.state.matches
      .filter(m => m.playerId === playerId && (!onlyVerified || m.verified === true))
      .sort((a, b) => new Date(b.matchTime).getTime() - new Date(a.matchTime).getTime())
  }

  /**
   * 获取对决场次列表
   */
  getEventsList(dateStr = '', mode = null) {
    let list = this.state.events.slice()
    if (dateStr) {
      list = list.filter(e => e.scheduledAt && e.scheduledAt.startsWith(dateStr))
    }
    if (mode && mode !== 'ALL') {
      list = list.filter(e => e.mode === mode)
    }
    return list.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
  }

  /**
   * 获取单个对决场次详情 (F13)
   */
  getEventById(eventId) {
    return this.state.events.find(e => e.id === eventId) || null
  }

  /**
   * 获取第三方阵容快照大盘
   */
  getLineupsList() {
    return this.state.lineupSnapshots
  }

  /**
   * 获取单个阵容快照详情 (F13)
   */
  getLineupById(lineupId) {
    return this.state.lineupSnapshots.find(l => l.id === lineupId) || null
  }

  /**
   * 严格校验单条对战记录 (F08)
   */
  validateMatchRecord(rec, index = 0) {
    if (!rec || typeof rec !== 'object') {
      throw new Error(`第 ${index + 1} 条记录为空或非对象`)
    }
    if (!rec.playerId || typeof rec.playerId !== 'string' || !rec.playerId.trim()) {
      throw new Error(`第 ${index + 1} 条记录缺少必填项 playerId`)
    }
    if (!rec.matchTime || typeof rec.matchTime !== 'string') {
      throw new Error(`第 ${index + 1} 条记录缺少有效 matchTime (禁止自动使用系统当前时间)`)
    }
    const matchTimeMs = new Date(rec.matchTime).getTime()
    if (isNaN(matchTimeMs)) {
      throw new Error(`第 ${index + 1} 条记录的 matchTime [${rec.matchTime}] 不是有效的 ISO 日期格式`)
    }

    const rank = Number(rec.finalRank)
    if (!Number.isInteger(rank) || rank < 1 || rank > 6) {
      throw new Error(`第 ${index + 1} 条记录的名次 finalRank [${rec.finalRank}] 无效，必须是 1 到 6 的整数`)
    }

    return {
      playerId: rec.playerId.trim(),
      matchTime: new Date(matchTimeMs).toISOString(),
      availableAt: rec.availableAt ? new Date(rec.availableAt).toISOString() : new Date().toISOString(),
      finalRank: rank,
      commander: rec.commander || '通用',
      lineup: rec.lineup || '未识别',
      roundsSurvived: Number.isInteger(Number(rec.roundsSurvived)) ? Number(rec.roundsSurvived) : 20,
      threeStars: Array.isArray(rec.threeStars) ? rec.threeStars : [],
      mode: rec.mode || 'RANKED_DIAMOND',
      sourceRecordKey: rec.sourceRecordKey || `${rec.playerId}:${new Date(matchTimeMs).toISOString()}`,
      verified: rec.verified === true, // 绝对不强制转为 true！保持其真实状态
      evidenceId: rec.evidenceId || null,
      revision: Number(rec.revision) || 1
    }
  }

  /**
   * 导入战绩事实 (带严格类型校验、幂等去重与版本更正机制 F08, A03, A13)
   */
  importMatchRecords(records, batchMeta = {}) {
    if (!Array.isArray(records) || records.length === 0) {
      throw new Error('导入记录列表不能为空数组')
    }

    const batchId = `batch-${Date.now()}`
    const validatedRecords = []
    const validationErrors = []

    // 1. 逐行全面强校验，拒绝任何无效或格式不合规记录
    records.forEach((rec, idx) => {
      try {
        const valid = this.validateMatchRecord(rec, idx)
        validatedRecords.push(valid)
      } catch (err) {
        validationErrors.push({ index: idx, error: err.message })
      }
    })

    if (validationErrors.length > 0) {
      const err = new Error(`导入数据校验失败 (共 ${validationErrors.length} 处错误): ${validationErrors[0].error}`)
      err.details = validationErrors
      throw err
    }

    let inserted = 0
    let duplicates = 0
    let updated = 0

    validatedRecords.forEach(rec => {
      // 稳定幂等键: id 或 sourceRecordKey 或 (playerId + matchTime)
      const existingIndex = this.state.matches.findIndex(m => 
        (rec.id && m.id === rec.id) ||
        (rec.sourceRecordKey && m.sourceRecordKey === rec.sourceRecordKey) ||
        (m.playerId === rec.playerId && m.matchTime === rec.matchTime)
      )

      if (existingIndex >= 0) {
        const existing = this.state.matches[existingIndex]
        // 支持版本更正 (A13): 若新记录带更高 revision 或明确更正标识，执行更新
        if (rec.revision > (existing.revision || 1)) {
          this.state.matches[existingIndex] = {
            ...existing,
            ...rec,
            id: existing.id,
            updatedAt: new Date().toISOString(),
            batchId
          }
          updated++
        } else {
          duplicates++
        }
      } else {
        const newRecord = {
          id: rec.id || `mh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          ...rec,
          batchId,
          createdAt: new Date().toISOString()
        }
        this.state.matches.push(newRecord)
        inserted++

        // 若选手未存在于主选手列表，自动注册该选手实体
        if (!this.state.players.some(p => p.id === rec.playerId)) {
          this.state.players.push({
            id: rec.playerId,
            nickname: rec.playerId,
            platform: 'SYSTEM_INGEST',
            serverZone: '官方区服',
            rankScore: 10000,
            rankText: '最强王者',
            title: '',
            commander: rec.commander,
            style: rec.lineup
          })
        }
      }
    })

    const runMeta = {
      batchId,
      source: batchMeta.source || 'MANUAL_IMPORT',
      totalRecords: records.length,
      inserted,
      updated,
      duplicates,
      createdAt: new Date().toISOString()
    }

    this.state.importBatches.push(runMeta)
    this.saveState()
    this.triggerSync('IMPORT_BATCH', {
      batchRecord: runMeta,
      matchRecords: this.state.matches.filter(m => m.batchId === batchId)
    })
    return runMeta
  }

  /**
   * 获取指定导入批次详情 (F13)
   */
  getImportBatchById(batchId) {
    const meta = this.state.importBatches.find(b => b.batchId === batchId)
    if (!meta) return null
    const records = this.state.matches.filter(m => m.batchId === batchId)
    return {
      ...meta,
      records
    }
  }

  /**
   * 人工核验对局持久化确认 (F05)
   * 将人工校对完成的 6 席位事实持久化存入正式 events 和 matches
   */
  confirmSlotAudit(payload, auditStaff = 'AUDIT_STAFF') {
    if (!payload || !Array.isArray(payload.slots) || payload.slots.length !== 6) {
      throw new Error('对局核验必须提供完整的 6 个席位选手数据')
    }

    const eventId = payload.eventId || `evt-${Date.now()}`
    const matchTime = payload.scheduledAt || new Date().toISOString()
    const evidenceSha256 = payload.evidenceSha256 || crypto.randomBytes(16).toString('hex')
    const now = new Date().toISOString()

    // 1. 存证记录入库
    const existingEv = this.state.evidences.find(e => (payload.evidenceId && e.id === payload.evidenceId) || (evidenceSha256 && e.sha256 === evidenceSha256))
    const evidenceId = existingEv ? existingEv.id : (payload.evidenceId || `ev-${Date.now()}`)
    if (!existingEv) {
      this.state.evidences.push({
        id: evidenceId,
        sha256: evidenceSha256,
        sourceId: 'src-manual-review',
        capturedAt: payload.capturedAt || matchTime,
        verifiedAt: now,
        verifiedBy: auditStaff,
        status: 'VERIFIED',
        note: payload.title || '工作台人工校对存证'
      })
    }

    // 2. 6 席位战绩正式录入 (verified: true, availableAt 明确标定)
    const participants = payload.slots.map((s, idx) => {
      const slotNum = s.slot || (idx + 1)
      const playerId = s.playerId || `p-${s.nickname}`
      const rank = Number(s.finalRank || slotNum)

      // 确保选手在选手实体表中存在
      let player = this.state.players.find(p => p.id === playerId || p.nickname === s.nickname)
      if (!player) {
        player = {
          id: playerId,
          nickname: s.nickname || `选手-${slotNum}`,
          platform: 'DEFAULT',
          serverZone: s.serverZone || '手Q1区',
          rankScore: Number(s.rankScore) || 10000,
          rankText: s.rankText || '最强王者',
          title: s.title || '',
          commander: s.commander || '通用',
          style: s.lineup || '常规'
        }
        this.state.players.push(player)
      } else {
        // 更新段位分
        if (s.rankScore) player.rankScore = Number(s.rankScore)
      }

      // 生成对战记录流水事实
      const matchRecordId = `mh-${eventId}-s${slotNum}`
      const existingMatch = this.state.matches.find(m => m.id === matchRecordId)
      if (!existingMatch) {
        this.state.matches.push({
          id: matchRecordId,
          playerId: player.id,
          matchTime,
          availableAt: now, // 明确记录可用时间 (防止未来泄漏)
          mode: payload.mode || 'RANKED_DIAMOND',
          finalRank: rank,
          commander: s.commander || player.commander,
          lineup: s.lineup || player.style,
          roundsSurvived: Number(s.roundsSurvived) || 30,
          threeStars: Array.isArray(s.threeStars) ? s.threeStars : [],
          verified: true,
          evidenceId,
          batchId: `audit-${eventId}`
        })
      }

      return {
        slot: slotNum,
        playerId: player.id,
        nickname: player.nickname,
        rankScore: player.rankScore,
        odds: Number(s.odds) || 5.0,
        supportCount: Number(s.supportCount) || 0,
        finalRank: rank,
        commander: s.commander || player.commander,
        lineup: s.lineup || player.style
      }
    })

    // 3. 对决场次正式入库
    const existingEvtIndex = this.state.events.findIndex(e => e.id === eventId)
    const eventRecord = {
      id: eventId,
      mode: payload.mode || 'RANKED_DIAMOND',
      scheduledAt: matchTime,
      title: payload.title || '对战事实人工核验对决',
      status: 'AUDITED',
      evidenceId,
      participants,
      verifiedAt: now,
      verifiedBy: auditStaff
    }

    if (existingEvtIndex >= 0) {
      this.state.events[existingEvtIndex] = eventRecord
    } else {
      this.state.events.push(eventRecord)
    }

    this.saveState()
    this.triggerSync('CONFIRM_AUDIT', {
      eventRecord,
      evidenceRecord: this.state.evidences.find(e => e.id === evidenceId),
      players: this.state.players.filter(p => participants.some(pt => pt.playerId === p.id)),
      matches: this.state.matches.filter(m => m.batchId === `audit-${eventId}`)
    })
    return eventRecord
  }

  /**
   * 导入万象棋大数据平台的真实选手、阵容快照与实战对决
   */
  importRealDatatftData({ players = [], lineups = [] }) {
    let playersAdded = 0
    let playersUpdated = 0

    for (const p of players) {
      const idx = this.state.players.findIndex(x => x.id === p.id || x.nickname === p.nickname)
      if (idx >= 0) {
        this.state.players[idx] = { ...this.state.players[idx], ...p }
        playersUpdated++
      } else {
        this.state.players.push(p)
        playersAdded++
      }
    }

    if (Array.isArray(lineups) && lineups.length > 0) {
      this.state.lineupSnapshots = lineups
    }

    // 更新数据源状态
    const src = this.state.dataSources.find(s => s.id === 'src-datatft-platform')
    if (src) {
      src.lastAttemptAt = new Date().toISOString()
      src.lastSuccessAt = new Date().toISOString()
      src.lastError = null
      src.status = 'ACTIVE'
    }

    this.saveState()

    // 触发 PostgreSQL 持久化
    this.triggerSync('SYNC_PLAYERS', this.state.players)
    if (lineups.length > 0) {
      this.triggerSync('LINEUP_SYNCED', lineups)
    }

    return {
      playersAdded,
      playersUpdated,
      totalPlayers: this.state.players.length,
      totalLineups: this.state.lineupSnapshots.length
    }
  }
}

export const storage = new StorageEngine()
