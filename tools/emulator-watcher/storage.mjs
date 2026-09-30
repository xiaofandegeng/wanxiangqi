// 王者万象棋数据站 - 文件型持久化存储引擎 (File-backed Storage Engine, v3)
// 遵循 v3 任务书 P0-A 测试隔离规范：
// 1. 模块导入零副作用：不自动建目录、不自动读写任何文件、不创建单例 (F08 修复)
// 2. 存储目录必须显式注入 (constructor { dataDir }) 或经 getBusinessStorage() 惰性创建
// 3. saveState 原子写 (tmp + rename)，仅在业务动作成功后才落盘
// 4. 冷启动零 mock：默认空事实库，样例仅限显式 demo 注入，绝不自动插入已核验数据
// 5. 双时间截点防未来泄漏：matchTime < cutoff && availableAt <= cutoff (F10)
// 6. 严格数据校验：拒绝空对象，整数名次 1~6，有效 ISO 时间戳，未核验数据隔离 (F08)
// 7. 幂等去重与稳定键更正机制 (A03, A13)
//
// 注意：本引擎在 v3 架构中仅作为 demo 模式仓储；正式模式以 PostgreSQL 为唯一权威。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateStatsParams, computeStatsFromMatches } from './stats-core.mjs'

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_DATA_DIR = path.join(MODULE_DIR, 'data')

/**
 * 真实空事实库初始状态 (Zero-Mock Cold Start)
 * 严格遵从 A01 与 F02：首次运行必须为空库
 */
function createEmptyState() {
  const now = new Date().toISOString()
  return {
    meta: {
      version: '3.0.0',
      initializedAt: now,
      engine: 'FILE_ENGINE_DEMO',
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
        type: 'THIRD_PARTY_AGGREGATE',
        url: 'https://hokace.wiki/zh/lineups/',
        capabilities: ['lineup_aggregate'],
        status: 'READY',
        version: null,
        licenseNote: '第三方汇总，再利用许可待核实',
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastError: null
      },
      {
        id: 'src-kohcamp-official',
        name: '腾讯王者营地官方战绩网关',
        type: 'OFFICIAL_MATCH_FEED',
        url: 'unknown://no-confirmed-public-api',
        capabilities: [],
        status: 'UNCONFIGURED',
        note: '仅有代码声明，未确认开放 API 与访问资格，不得标 ACTIVE (v3 §3.1)',
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
        status: 'UNCONFIGURED',
        note: 'API 契约与授权范围未核实，未确认前不扩展批量采集 (v3 §3.2)',
        lastAttemptAt: null,
        lastSuccessAt: null,
        lastError: null
      }
    ],
    evidences: [],
    evidenceBlobs: [], // v4 W1：原件内容寻址（contentBase64，同一原图跨记录共享）
    players: [],
    matches: [],
    events: [],
    lineupSnapshots: [],
    pendingCandidates: [], // 待人工核验候选池
    importBatches: []
  }
}

/**
 * 仅用于显式 demo 注入时加载的示范数据 (createStorageEngine({ demo: true }))
 * 生产与测试默认绝不加载
 */
function createDemoFixtures() {
  const now = new Date().toISOString()
  return {
    meta: {
      version: '3.0.0',
      initializedAt: now,
      engine: 'FILE_ENGINE_DEMO',
      storageMode: 'DEMO_FIXTURES'
    },
    dataSources: createEmptyState().dataSources,
    evidences: [
      {
        id: 'ev-18824',
        sha256: 'e4ea43a1b70ad626d5e5508684d5de3d9bf1eb12265ca703a3fb45c2ec4bfa82',
        sourceId: 'src-manual-review',
        capturedAt: '2026-09-27T12:00:00.000Z',
        verifiedAt: '2026-09-27T12:05:00.000Z',
        verifiedBy: 'AUDIT_STAFF',
        status: 'VERIFIED',
        note: 'DEMO 示范材料（非真实核验）'
      }
    ],
    evidenceBlobs: [], // demo 示范证据不附带原件（hasOriginal=false 如实呈现）
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
        title: 'DEMO 示范场次（非真实核验）',
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
  /**
   * @param {object} options
   * @param {string} options.dataDir 存储目录（必填，显式注入；测试用临时目录，业务用 getBusinessStorage()）
   * @param {boolean} [options.demo=false] 显式开启才加载示范数据
   */
  constructor({ dataDir, demo = false } = {}) {
    if (!dataDir || typeof dataDir !== 'string') {
      throw new Error('StorageEngine 必须显式注入 dataDir（测试隔离规范 v3 P0-A，禁止隐式指向业务文件）')
    }
    this.dataDir = dataDir
    this.dbFile = path.join(dataDir, 'storage.json')
    this.demo = demo === true
    this.state = this.loadState()
  }

  loadState() {
    const isDemoMode = this.demo || process.env.DEMO_MODE === 'true' || process.env.FIXTURES === 'true'
    try {
      if (fs.existsSync(this.dbFile)) {
        const raw = fs.readFileSync(this.dbFile, 'utf-8')
        const parsed = JSON.parse(raw)
        // 保证关键字段数组健全
        parsed.meta = parsed.meta || {}
        parsed.players = parsed.players || []
        parsed.matches = parsed.matches || []
        parsed.events = parsed.events || []
        parsed.lineupSnapshots = parsed.lineupSnapshots || []
        parsed.pendingCandidates = parsed.pendingCandidates || []
        parsed.importBatches = parsed.importBatches || []
        parsed.evidences = parsed.evidences || []
        parsed.evidenceBlobs = parsed.evidenceBlobs || []
        parsed.dataSources = parsed.dataSources || []
        return parsed
      }
    } catch (err) {
      console.error('[StorageEngine] Error loading storage.json:', err.message)
      // 文件损坏时保持空状态，绝不暗度陈仓生成假核验数据 (F02)
    }

    // 文件不存在时仅构造内存态，不落盘 (import 零副作用；首次写操作时才创建目录)
    return isDemoMode ? createDemoFixtures() : createEmptyState()
  }

  /**
   * 原子落盘：tmp 文件写入 + rename，避免半写损坏
   */
  saveState(stateToSave = this.state) {
    const tmpFile = `${this.dbFile}.tmp-${process.pid}-${Date.now()}`
    try {
      fs.mkdirSync(this.dataDir, { recursive: true })
      fs.writeFileSync(tmpFile, JSON.stringify(stateToSave, null, 2), 'utf-8')
      fs.renameSync(tmpFile, this.dbFile)
    } catch (err) {
      console.error('[StorageEngine] Failed to write storage.json:', err)
      throw err
    }
  }

  /**
   * 重置为空库 (仅作用于本实例注入的目录；用于自动化测试与清库核验 A01)
   */
  resetToEmpty() {
    this.state = createEmptyState()
    this.saveState()
    return this.state
  }

  /**
   * 严格按有效局数 N 计算选手统计 (登顶率, 前三率, 均名)
   * v3 P2-A：语义统一收敛到 stats-core.mjs（唯一事实源，与 PG SQL 实现等价性锁死 V18）
   * - 双时间截点 (F10/V12)：matchTime < cutoff ∧ availableAt ≤ cutoff
   * - 正式口径：verified ∧ recordStatus=ACTIVE ∧ 非 synthetic
   * - 未指定 cutoff 时以 now 为隐式截点（未来完赛/未来收录不得计入当前统计）
   * - N=0 → 比率/均名 null，严禁借用 0% 或假数据
   */
  computePlayerStats(playerId, options = {}) {
    const { cutoffTime = null, mode = null, from = null, to = null } = options
    const params = validateStatsParams({ cutoffTime, mode, from, to })
    const playerMatches = this.state.matches.filter(m => m.playerId === playerId)
    return computeStatsFromMatches(playerMatches, {
      cutoffMs: params.cutoffMs,
      fromMs: params.fromMs,
      toMs: params.toMs,
      modeFilter: params.modeFilter
    })
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
   * 获取全量对局战绩流水列表 (支持分页与多维筛选)
   */
  getAllMatches({ limit = 50, offset = 0, playerId = null, mode = null } = {}) {
    let list = this.state.matches || []
    if (playerId) list = list.filter(m => m.playerId === playerId)
    if (mode) list = list.filter(m => m.mode === mode)
    list = list.slice().sort((a, b) => new Date(b.matchTime).getTime() - new Date(a.matchTime).getTime())
    return {
      total: list.length,
      data: list.slice(offset, offset + limit)
    }
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
      commander: rec.commander || null,
      lineup: rec.lineup || null,
      roundsSurvived: Number.isInteger(Number(rec.roundsSurvived)) ? Number(rec.roundsSurvived) : null,
      threeStars: Array.isArray(rec.threeStars) ? rec.threeStars : [],
      mode: rec.mode || null,
      synthetic: rec.synthetic === true, // P0-B：合成/demo 数据必须显式标记，正式统计一律排除
      sourceRecordKey: rec.sourceRecordKey || `${rec.playerId}:${new Date(matchTimeMs).toISOString()}`,
      verified: rec.verified === true, // 绝对不强制转为 true！保持其真实状态
      recordStatus: rec.recordStatus || (rec.verified === true ? 'ACTIVE' : 'PENDING'), // 正式口径状态；HTTP 导入由服务层强制 PENDING
      evidenceId: rec.evidenceId || null,
      revision: Number(rec.revision) || 1,
      recordKey: rec.recordKey || null, // 服务层推导的稳定键（透传，不在此重算）
      slot: Number.isInteger(Number(rec.slot)) ? Number(rec.slot) : null, // 材料内序号（ev 键组成段）
      evidenceLocator: rec.evidenceLocator || null // v4 W2：记录在原件中的定位
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

        // 若选手未存在于主选手列表，自动注册该选手实体（仅登记身份，不造战绩数值）
        if (!this.state.players.some(p => p.id === rec.playerId)) {
          this.state.players.push({
            id: rec.playerId,
            nickname: rec.playerId,
            platform: 'SYSTEM_INGEST',
            serverZone: null,
            rankScore: null,
            rankText: null,
            title: null,
            commander: null,
            style: null
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
    const now = new Date().toISOString()

    // 1. 证据链强制（v4 W1，与 PG 同语义）：必须引用已上传、人工确认有效、原件可恢复的证据；
    //    不再接受"客户端哈希即造 VERIFIED 证据"，更不捏造随机 sha
    if (!payload.evidenceId || typeof payload.evidenceId !== 'string') {
      const err = new Error('六席校对必须提供 evidenceId（先经 /api/v1/admin/evidences/upload 上传原件并人工确认有效）——客户端哈希不再构成证据')
      err.status = 422
      err.code = 'NO_EVIDENCE'
      throw err
    }
    const evidenceId = payload.evidenceId
    const evd = (this.state.evidences || []).find(e => e.id === evidenceId)
    if (!evd) {
      const err = new Error(`证据 [${evidenceId}] 不存在，无法以此完成校对`)
      err.status = 422
      err.code = 'EVIDENCE_NOT_FOUND'
      throw err
    }
    if (payload.evidenceSha256 && payload.evidenceSha256.toLowerCase() !== evd.sha256) {
      const err = new Error(`提供的哈希与证据 [${evidenceId}] 指纹不一致`)
      err.status = 422
      err.code = 'SHA_MISMATCH'
      throw err
    }
    if (evd.status === 'QUARANTINED') {
      const err = new Error(`证据 [${evidenceId}] 已被隔离，不得作为校对依据`)
      err.status = 422
      err.code = 'EVIDENCE_QUARANTINED'
      throw err
    }
    if (evd.status !== 'VERIFIED') {
      const err = new Error(`证据 [${evidenceId}] 尚未人工确认有效（${evd.status}）——请先在证据工作台确认材料`)
      err.status = 422
      err.code = 'EVIDENCE_PENDING'
      throw err
    }
    if (!(this.state.evidenceBlobs || []).some(b => b.sha256 === evd.sha256)) {
      const err = new Error(`证据 [${evidenceId}] 只有哈希元信息、无可恢复原件，不得作为校对依据`)
      err.status = 422
      err.code = 'ORIGINAL_MISSING'
      throw err
    }

    // 2. 6 席位战绩正式录入 (verified: true, availableAt 明确标定)
    const participants = payload.slots.map((s, idx) => {
      const slotNum = s.slot || (idx + 1)
      const playerId = s.playerId || `p-${s.nickname}`
      const rank = Number(s.finalRank)
      // V08/人工核验红线：名次必须显式提供（1~6 整数），禁止按席位号推定名次
      if (!Number.isInteger(rank) || rank < 1 || rank > 6) {
        throw new Error(`第 ${slotNum} 席位 finalRank [${s.finalRank}] 无效，必须为 1 到 6 的整数（人工核验不得按席位号推定名次）`)
      }

      // 确保选手在选手实体表中存在（未知属性一律 NULL，禁止造默认值 F06）
      // V08：仅按 playerId 稳定身份匹配，禁止按昵称归并（昵称可重复/可变更）
      let player = this.state.players.find(p => p.id === playerId)
      if (!player) {
        player = {
          id: playerId,
          nickname: s.nickname || `选手-${slotNum}`,
          platform: 'DEFAULT',
          serverZone: s.serverZone || null,
          rankScore: Number.isFinite(Number(s.rankScore)) ? Number(s.rankScore) : null,
          rankText: s.rankText || null,
          title: s.title || null,
          commander: s.commander || null,
          style: s.lineup || null
        }
        this.state.players.push(player)
      } else {
        // 仅更新有限数值，缺失一律不动（禁造默认值）
        if (Number.isFinite(Number(s.rankScore))) player.rankScore = Number(s.rankScore)
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
          mode: payload.mode || null, // 模式未知保持 null，禁止默认 RANKED_DIAMOND 造事实
          finalRank: rank,
          commander: s.commander || player.commander || null,
          lineup: s.lineup || player.style || null,
          roundsSurvived: Number.isInteger(Number(s.roundsSurvived)) ? Number(s.roundsSurvived) : null,
          threeStars: Array.isArray(s.threeStars) ? s.threeStars : [],
          verified: true,
          recordStatus: 'ACTIVE', // 人工核验动作即放行动作 (V17)：经证据链核验 → ACTIVE
          evidenceId,
          evidenceLocator: s.evidenceLocator || null, // v4 W2：该席次在原件中的定位
          batchId: `audit-${eventId}`
        })
      }

      return {
        slot: slotNum,
        playerId: player.id,
        nickname: player.nickname,
        rankScore: player.rankScore,
        odds: Number.isFinite(Number(s.odds)) ? Number(s.odds) : null,
        supportCount: Number.isFinite(Number(s.supportCount)) ? Number(s.supportCount) : null,
        finalRank: rank,
        commander: s.commander || player.commander || null,
        lineup: s.lineup || player.style || null
      }
    })

    // 3. 对决场次正式入库
    const existingEvtIndex = this.state.events.findIndex(e => e.id === eventId)
    const eventRecord = {
      id: eventId,
      mode: payload.mode || null, // 模式未知保持 null
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
    return eventRecord
  }

  /**
   * 导入第三方平台的选手与阵容快照（仅显式来源使用；v3 中 datatft 默认 UNCONFIGURED）
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

    // 更新数据源状态（仅记录尝试/成功时间，不得凭导入动作自行宣称 ACTIVE —— v3 §3.2）
    const src = this.state.dataSources.find(s => s.id === 'src-datatft-platform')
    if (src) {
      src.lastAttemptAt = new Date().toISOString()
      src.lastSuccessAt = new Date().toISOString()
      src.lastError = null
    }

    this.saveState()

    return {
      playersAdded,
      playersUpdated,
      totalPlayers: this.state.players.length,
      totalLineups: this.state.lineupSnapshots.length
    }
  }
}

/**
 * 显式工厂：测试与工具一律通过它创建实例，禁止隐式指向业务文件
 */
export function createStorageEngine({ dataDir, demo = false } = {}) {
  return new StorageEngine({ dataDir, demo })
}

/**
 * 业务存储实例（惰性、进程内唯一）
 * 仅应由服务启动入口 (backend/src/server.js) 与显式业务脚本调用；
 * 测试绝不使用本函数，测试必须 createStorageEngine({ dataDir: <临时目录> })
 */
let businessStorageInstance = null
export function getBusinessStorage() {
  if (!businessStorageInstance) {
    const dataDir = process.env.WXQ_DATA_DIR || DEFAULT_DATA_DIR
    businessStorageInstance = new StorageEngine({ dataDir })
  }
  return businessStorageInstance
}
