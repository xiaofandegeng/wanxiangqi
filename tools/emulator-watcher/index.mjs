// 王者万象棋 - 统一数据站后端业务与实时监听服务 (Unified Backend & Watcher API)
// v3 架构（任务书 P1-A）：
// 1. createApiServer({ services, adminToken }) 注入服务层；无参调用自建 demo（FileRepository，
//    经 getBusinessStorage() 惰性解析 WXQ_DATA_DIR → 测试沙箱/演示目录，保持两套测试 import 兼容）
// 2. 业务读写全部经 services（正式模式 PgRepository / demo 模式 FileRepository），HTTP 层不直接触达存储引擎
// 3. 管理写接口 Bearer 鉴权、CORS 白名单、默认 127.0.0.1 (v2 F09 规范保留)
// 4. 双时间截点与统计口径收敛在 stats-core + 统计服务（非法参数 400，V16）
// 5. 新增 /api/v1/ready（PG ping 200/503）、/admin/matches/:id/verify（V17）、/admin/sync-jobs
// 6. /api/v1/matches 不再宣称任何来源标签（v3 删除伪造 src-kohcamp-official 文案）

import http from 'node:http'
import { extractLobbyParticipants } from './analyzer.mjs'
import { solveDeepMetaProbabilities, solveDeepRecommendations } from './solver.mjs'
import { getBusinessStorage } from './storage.mjs'
import { InvalidStatsParamError } from './stats-core.mjs'
import { resolveMaxUploadBytes, evidenceFileExtension } from './evidence-core.mjs'
import { FileRepository } from '../../backend/src/repositories/file-repository.mjs'
import { createServices } from '../../backend/src/services/index.mjs'
import { getEnv } from '../../backend/src/env.mjs'

export const PORT = process.env.PORT || 8080
export const HOST = process.env.HOST || '127.0.0.1'
const DEFAULT_DEMO_ADMIN_TOKEN = 'wanxiangqi-admin-token-v2' // 仅 demo 默认；formal 必须显式注入（env.mjs 断言）

let lastCapturedData = null
const sseClients = new Set()

/**
 * 广播 SSE 实时事件到所有连接的前端客户端
 */
export function broadcastSSE(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    try {
      client.write(payload)
    } catch {
      sseClients.delete(client)
    }
  }
}

/**
 * 处理单次完整抓取或上传流
 */
export async function processImageAndSolve(imageBuffer, sourceDesc = 'MANUAL') {
  const startTime = Date.now()
  // 1. 画面席位识别 (严格模式: 未匹配已知存证返回待核验状态，禁止猜测)
  const analysis = await extractLobbyParticipants(imageBuffer)

  if (analysis.status === 'NEED_MANUAL_REVIEW') {
    return {
      status: 'NEED_MANUAL_REVIEW',
      sha256: analysis.sha256,
      note: analysis.note,
      latencyMs: Date.now() - startTime
    }
  }

  // 生产环境规范 (A18, F06)：未通过 P4 验证前，不输出未校对的强推荐
  const probabilities = solveDeepMetaProbabilities(analysis.participants)
  const recommendations = solveDeepRecommendations(analysis.participants, probabilities, analysis.oddsMap)

  const latencyMs = Date.now() - startTime
  const liveEvent = {
    eventId: `live-${new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 14)}`,
    timestamp: new Date().toISOString(),
    sourceDesc,
    sha256: analysis.sha256,
    latencyMs,
    participants: analysis.participants,
    probabilities,
    recommendations,
    bestRecommendation: recommendations[0] || null
  }

  lastCapturedData = liveEvent
  broadcastSSE('MATCH_DETECTED', liveEvent)
  return liveEvent
}

/**
 * 允许的跨域来源列表 (F09)
 */
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
])

function buildDemoServices() {
  // demo 自建：FileRepository 包装惰性业务实例（WXQ_DATA_DIR 优先 → 测试沙箱）
  const engine = getBusinessStorage()
  const repo = new FileRepository(engine)
  return createServices(repo, { ...getEnv(), appMode: 'demo' })
}

export function createApiServer({ services = null, adminToken = null } = {}) {
  const svc = services || buildDemoServices()
  const token = adminToken || process.env.ADMIN_TOKEN || DEFAULT_DEMO_ADMIN_TOKEN

  return http.createServer(async (req, res) => {
    // 1. CORS 跨域白名单限制 (F09: 拒绝通配符 *)
    const reqOrigin = req.headers['origin']
    if (reqOrigin && ALLOWED_ORIGINS.has(reqOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', reqOrigin)
    } else if (!reqOrigin) {
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
    res.setHeader('Vary', 'Origin')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const pathname = url.pathname

    const sendJson = (statusCode, data) => {
      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(data))
    }

    /** 统一服务异常 → HTTP 映射（不泄漏内部错误细节） */
    const handleServiceError = (err, fallbackStatus = 400) => {
      if (err instanceof InvalidStatsParamError) {
        return sendJson(400, { code: 400, error: err.message, field: err.field })
      }
      const status = Number(err.status) || fallbackStatus
      return sendJson(status, { code: status, error: err.message, code_name: err.code || null })
    }

    const readJsonBody = () => new Promise((resolve, reject) => {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          const rawText = Buffer.concat(chunks).toString().trim()
          resolve({ rawText, body: rawText ? JSON.parse(rawText) : null })
        } catch (e) {
          reject(Object.assign(new Error('请求体不是合法 JSON'), { status: 400 }))
        }
      })
      req.on('error', reject)
    })

    /**
     * 二进制请求体读取（v4 W1 上传专用，readJsonBody 无上限不可复用）：
     * 双重限额 —— Content-Length 预检 + 流式字节计数（客户端可谎报/缺报长度）。
     * 超限时持续排空剩余字节再拒绝，避免残留数据污染 keep-alive 连接。
     */
    const readRawBody = maxBytes => new Promise((resolve, reject) => {
      const chunks = []
      let total = 0
      let overflow = false
      req.on('data', chunk => {
        total += chunk.length
        if (total > maxBytes) {
          overflow = true
          chunks.length = 0
          return
        }
        if (!overflow) chunks.push(chunk)
      })
      req.on('end', () => {
        if (overflow) {
          return reject(Object.assign(
            new Error(`上传内容超过大小上限（${maxBytes} 字节）`),
            { status: 413, code: 'UPLOAD_TOO_LARGE' }
          ))
        }
        resolve(Buffer.concat(chunks))
      })
      req.on('error', reject)
    })

    // 2. 管理接口鉴权中间件 (F09, A14)：/admin/ 命名空间整体鉴权
    //    （含 GET：sync-jobs/imports 查询会暴露内部运营细节，不得公开）
    if (pathname.startsWith('/api/v1/admin/')) {
      const authHeader = req.headers['authorization'] || ''
      const provided = authHeader.replace(/^Bearer\s+/i, '').trim()
      if (!provided || provided !== token) {
        return sendJson(401, {
          code: 401,
          error: '未授权：管理接口必须携带有效的 Authorization Bearer Token'
        })
      }
    }

    // ----------------------------------------------------
    // 就绪探测 (v3 F04)：正式模式 PG ping，200/503
    // GET /api/v1/ready
    // ----------------------------------------------------
    if (pathname === '/api/v1/ready' && req.method === 'GET') {
      const ready = await svc.isReady()
      return ready
        ? sendJson(200, { code: 0, status: 'READY', mode: svc.mode, time: new Date().toISOString() })
        : sendJson(503, { code: 503, status: 'UNAVAILABLE', mode: svc.mode, error: '权威存储不可用（PostgreSQL 连接失败）' })
    }

    // ----------------------------------------------------
    // 系统健康：真实组件状态与真实计数 (v3 F04)
    // GET /api/v1/health
    // ----------------------------------------------------
    if (pathname === '/api/v1/health' && req.method === 'GET') {
      const health = await svc.health()
      return sendJson(200, { code: 0, ...health })
    }

    // ----------------------------------------------------
    // v2 标准 API: 1. 选手大盘列表 (统一统计服务，非法参数 400)
    // GET /api/v1/players?query=&sort=&mode=&from=&to=
    // ----------------------------------------------------
    if (pathname === '/api/v1/players' && req.method === 'GET') {
      try {
        const query = url.searchParams.get('query') || ''
        const sort = url.searchParams.get('sort') || 'rankScore'
        const mode = url.searchParams.get('mode') || null
        const from = url.searchParams.get('from') || null
        const to = url.searchParams.get('to') || null
        const list = await svc.stats.getPlayersList({ query, sort, mode, from, to })
        return sendJson(200, {
          code: 0,
          total: list.length,
          data: list,
          dataAsOf: new Date().toISOString(),
          qualityStatus: list.some(p => p.stats.sampleCount > 0) ? 'VERIFIED_FACT' : 'ZERO_SAMPLE_NULL'
        })
      } catch (err) {
        return handleServiceError(err)
      }
    }

    // ----------------------------------------------------
    // v2 标准 API: 2. 单选手统计及分母 (cutoff/mode/from/to，非法参数 400，V16)
    // GET /api/v1/players/:id/stats?cutoff=&mode=&from=&to=
    // ----------------------------------------------------
    const playerStatsMatch = pathname.match(/^\/api\/v1\/players\/([^/]+)\/stats$/)
    if (playerStatsMatch && req.method === 'GET') {
      try {
        const result = await svc.stats.getPlayerStats(playerStatsMatch[1], {
          cutoffTime: url.searchParams.get('cutoff') || null,
          mode: url.searchParams.get('mode') || null,
          from: url.searchParams.get('from') || null,
          to: url.searchParams.get('to') || null
        })
        return sendJson(200, { code: 0, ...result, dataAsOf: new Date().toISOString() })
      } catch (err) {
        return handleServiceError(err)
      }
    }

    // ----------------------------------------------------
    // v2 标准 API: 3. 选手历史对局战绩流水下钻（默认仅有效记录，+recordStatus 覆盖）
    // GET /api/v1/players/:id/matches?recordStatus=
    // ----------------------------------------------------
    const playerMatchesMatch = pathname.match(/^\/api\/v1\/players\/([^/]+)\/matches$/)
    if (playerMatchesMatch && req.method === 'GET') {
      try {
        const matches = await svc.stats.getPlayerMatches(playerMatchesMatch[1], {
          recordStatus: url.searchParams.get('recordStatus') || null
        })
        return sendJson(200, { code: 0, playerId: playerMatchesMatch[1], total: matches.length, data: matches })
      } catch (err) {
        return handleServiceError(err)
      }
    }

    // ----------------------------------------------------
    // v2 标准 API: 3.1 对局流水大盘（默认仅 ACTIVE 非合成；v3 删除伪造来源标签）
    // GET /api/v1/matches?limit=50&offset=0&playerId=&mode=&recordStatus=
    // ----------------------------------------------------
    if (pathname === '/api/v1/matches' && req.method === 'GET') {
      try {
        const limit = parseInt(url.searchParams.get('limit') || '50', 10)
        const offset = parseInt(url.searchParams.get('offset') || '0', 10)
        const playerId = url.searchParams.get('playerId') || null
        const mode = url.searchParams.get('mode') || null
        const recordStatus = url.searchParams.get('recordStatus') || 'ACTIVE'
        const result = await svc.getAllMatches({ limit, offset, playerId, mode, recordStatus })
        return sendJson(200, {
          code: 0,
          // v3：不再宣称任何数据来源；每条记录自带 sourceId/batchId 可追溯
          total: result.total,
          limit,
          offset,
          data: result.data,
          dataAsOf: new Date().toISOString()
        })
      } catch (err) {
        return handleServiceError(err)
      }
    }

    // ----------------------------------------------------
    // v2 标准 API: 4. 对局场次大盘列表
    // GET /api/v1/events?date=&mode=
    // 复验P1（续）：INTERNAL_ONLY 材料生成的场次不进公开列表
    // （仓储层统一排除；管理端走 /api/v1/admin/events）
    // ----------------------------------------------------
    if (pathname === '/api/v1/events' && req.method === 'GET') {
      const dateStr = url.searchParams.get('date') || ''
      const mode = url.searchParams.get('mode') || null
      const list = await svc.getEventsList(dateStr, mode)
      return sendJson(200, { code: 0, total: list.length, data: list, dataAsOf: new Date().toISOString() })
    }

    // ----------------------------------------------------
    // v2 标准 API: 4.1 对局场次单场详情 (F13)
    // GET /api/v1/events/:id
    // 复验P1（续）：内部材料场次对匿名等同不存在 → 404
    // ----------------------------------------------------
    const eventDetailMatch = pathname.match(/^\/api\/v1\/events\/([^/]+)$/)
    if (eventDetailMatch && req.method === 'GET') {
      const eventData = await svc.getEventById(eventDetailMatch[1])
      if (!eventData) {
        return sendJson(404, { code: 404, error: `对决场次 [${eventDetailMatch[1]}] 不存在` })
      }
      return sendJson(200, { code: 0, data: eventData })
    }

    // ----------------------------------------------------
    // 复验P1（续）新增：管理端对决场次列表/详情
    // GET /api/v1/admin/events?date=&mode=   ·   GET /api/v1/admin/events/:id
    // includeInternal=true —— 内部材料场次仅授权管理端可见，wire 如实回 usageScope
    // 前缀 Bearer 守卫已覆盖。
    // ----------------------------------------------------
    if (pathname === '/api/v1/admin/events' && req.method === 'GET') {
      const dateStr = url.searchParams.get('date') || ''
      const mode = url.searchParams.get('mode') || null
      const list = await svc.getEventsList(dateStr, mode, { includeInternal: true })
      return sendJson(200, { code: 0, total: list.length, data: list, dataAsOf: new Date().toISOString() })
    }
    const adminEventDetailMatch = pathname.match(/^\/api\/v1\/admin\/events\/([^/]+)$/)
    if (adminEventDetailMatch && req.method === 'GET') {
      const eventData = await svc.getEventById(adminEventDetailMatch[1], { includeInternal: true })
      if (!eventData) {
        return sendJson(404, { code: 404, error: `对决场次 [${adminEventDetailMatch[1]}] 不存在` })
      }
      return sendJson(200, { code: 0, data: eventData })
    }

    // ----------------------------------------------------
    // v2 标准 API: 5. 外部阵容快照大盘（缺失字段 null + 窗口/单位/截止/过期标识）
    // GET /api/v1/lineups
    // ----------------------------------------------------
    if (pathname === '/api/v1/lineups' && req.method === 'GET') {
      const list = await svc.getLineupsList()
      return sendJson(200, {
        code: 0,
        total: list.length,
        data: list,
        sourceNotice: '数据来源于第三方阵容汇总快照（含来源/窗口/样本口径），仅供流派参考，不代表个人真实战绩',
        dataAsOf: new Date().toISOString()
      })
    }

    // ----------------------------------------------------
    // v2 标准 API: 5.1 单阵容详情 (F13)
    // GET /api/v1/lineups/:id
    // ----------------------------------------------------
    const lineupDetailMatch = pathname.match(/^\/api\/v1\/lineups\/([^/]+)$/)
    if (lineupDetailMatch && req.method === 'GET') {
      const lineup = await svc.getLineupById(lineupDetailMatch[1])
      if (!lineup) {
        return sendJson(404, { code: 404, error: `阵容 [${lineupDetailMatch[1]}] 不存在` })
      }
      return sendJson(200, { code: 0, data: lineup })
    }

    // ----------------------------------------------------
    // v2 标准 API: 6. 数据源与采集新鲜度状态（data_sources + 最近同步任务）
    // GET /api/v1/data-status
    // ----------------------------------------------------
    if (pathname === '/api/v1/data-status' && req.method === 'GET') {
      const status = await svc.getDataStatus()
      return sendJson(200, { code: 0, ...status, lastUpdated: new Date().toISOString() })
    }

    // ----------------------------------------------------
    // v2 标准 API: 7. 导入真实材料/战绩流水（verified 一律忽略 → PENDING，V17）
    // POST /api/v1/admin/imports
    // ----------------------------------------------------
    if (pathname === '/api/v1/admin/imports' && req.method === 'POST') {
      try {
        const { body } = await readJsonBody()
        if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.records)) {
          return sendJson(400, { code: 400, error: '请求体必须包含 records 数组' })
        }
        if (body.records.length === 0) {
          return sendJson(400, { code: 400, error: 'records 数组不能为空' })
        }
        const runMeta = await svc.imports.importMatches(body.records, { source: body.source })
        broadcastSSE('DATA_UPDATED', { type: 'IMPORT_COMPLETED', batchId: runMeta.batchId })
        return sendJson(200, { code: 0, message: '导入成功（记录已入库待核验，verified 状态不随导入授予）', result: runMeta })
      } catch (err) {
        return handleServiceError(err)
      }
    }

    // ----------------------------------------------------
    // v2 标准 API: 7.1 查询指定导入批次详情 (F13)
    // GET /api/v1/admin/imports/:id
    // ----------------------------------------------------
    const importBatchMatch = pathname.match(/^\/api\/v1\/admin\/imports\/([^/]+)$/)
    if (importBatchMatch && req.method === 'GET') {
      const batchData = await svc.imports.getImportBatch(importBatchMatch[1])
      if (!batchData) {
        return sendJson(404, { code: 404, error: `导入批次 [${importBatchMatch[1]}] 未找到` })
      }
      return sendJson(200, { code: 0, data: batchData })
    }

    // ----------------------------------------------------
    // v2 标准 API: 7.2 人工校对工作台席位持久化 (F05，单事务)
    // POST /api/v1/admin/slots/confirm
    // ----------------------------------------------------
    if (pathname === '/api/v1/admin/slots/confirm' && req.method === 'POST') {
      try {
        const { body: payload } = await readJsonBody()
        if (!payload) return sendJson(400, { code: 400, error: '核验内容不能为空' })
        const staff = payload.auditStaff || payload.verifiedBy || 'AUDIT_STAFF'
        const result = await svc.imports.confirmSlotAudit(payload, staff)
        broadcastSSE('DATA_UPDATED', { type: 'SLOT_AUDITED', eventId: result.id })
        return sendJson(200, {
          code: 0,
          message: '校对结果已成功持久化至权威数据库事实表',
          data: result
        })
      } catch (err) {
        return handleServiceError(err)
      }
    }

    // ----------------------------------------------------
    // v4 W2 新增：管理端战绩记录列表（单人逐局导入核验工作台）
    // GET /api/v1/admin/matches?recordStatus=&playerId=&mode=&limit=&offset=
    // 默认 recordStatus=PENDING（待核验候选口径）；公开 /api/v1/matches 行为不变。
    // 复验P1：includeInternal=true —— INTERNAL_ONLY 材料记录仅授权管理端可见
    // （公开 /matches、/players/:id/matches、/stats 一律排除）。
    // 前缀 Bearer 守卫已覆盖（含 GET：PENDING 候选含未放行材料定位，属运营细节）。
    // ----------------------------------------------------
    if (pathname === '/api/v1/admin/matches' && req.method === 'GET') {
      try {
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10) || 200, 500)
        const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0)
        const playerId = url.searchParams.get('playerId') || null
        const mode = url.searchParams.get('mode') || null
        const recordStatus = url.searchParams.get('recordStatus') || 'PENDING'
        const result = await svc.getAllMatches({ limit, offset, playerId, mode, recordStatus, includeInternal: true })
        return sendJson(200, {
          code: 0,
          total: result.total,
          limit,
          offset,
          data: result.data,
          dataAsOf: new Date().toISOString()
        })
      } catch (err) {
        return handleServiceError(err)
      }
    }

    // ----------------------------------------------------
    // v3 新增 (V17)：核验放行动作
    // POST /api/v1/admin/matches/:id/verify  { verifiedBy, evidenceId? }
    // 复验1/2：无证据链 → 422 拒绝；放行 = SCD-2 新版本（availableAt=实际核验时刻）
    // ----------------------------------------------------
    const verifyMatchRoute = pathname.match(/^\/api\/v1\/admin\/matches\/([^/]+)\/verify$/)
    if (verifyMatchRoute && req.method === 'POST') {
      try {
        const { body } = await readJsonBody()
        const result = await svc.imports.verifyMatch(verifyMatchRoute[1], {
          verifiedBy: body?.verifiedBy || body?.auditStaff,
          evidenceId: body?.evidenceId || null
        })
        broadcastSSE('DATA_UPDATED', { type: 'MATCH_VERIFIED', matchId: result.id })
        return sendJson(200, {
          code: 0,
          message: '记录已核验放行：以核验时刻建立新可见版本（availableAt=now），旧版本封存，过去截点统计不受回写',
          data: result
        })
      } catch (err) {
        return handleServiceError(err)
      }
    }

    // ----------------------------------------------------
    // v3.1 新增 (复验4)：原始材料存证查阅（离线复核用）
    // GET /api/v1/admin/raw-materials?sourceId=&limit=
    // GET /api/v1/admin/raw-materials/:id   （含完整正文 content）
    // ----------------------------------------------------
    if (pathname === '/api/v1/admin/raw-materials' && req.method === 'GET') {
      try {
        const list = await svc.repo.getRawMaterials({
          sourceId: url.searchParams.get('sourceId') || null,
          limit: url.searchParams.get('limit') || 20
        })
        return sendJson(200, { code: 0, total: list.length, data: list })
      } catch (err) {
        return handleServiceError(err)
      }
    }
    const rawMaterialMatch = pathname.match(/^\/api\/v1\/admin\/raw-materials\/([^/]+)$/)
    if (rawMaterialMatch && req.method === 'GET') {
      try {
        const material = await svc.repo.getRawMaterialById(rawMaterialMatch[1])
        if (!material) return sendJson(404, { code: 404, error: `存证 [${rawMaterialMatch[1]}] 不存在` })
        return sendJson(200, { code: 0, data: material })
      } catch (err) {
        return handleServiceError(err)
      }
    }

    // ----------------------------------------------------
    // v4 W1 新增：个人材料原件入库与证据生命周期（上传 ≠ 核验）
    // POST /api/v1/admin/evidences/upload?kind=&capturedAt=&providedBy=&usageScope=&note=&clientSha256=
    //   body = 原始字节（Content-Type 为真实 MIME；服务端魔数嗅探 + SHA256 为准）
    // GET  /api/v1/admin/evidences?status=&limit=      元信息列表（不含字节）
    // GET  /api/v1/admin/evidences/:id                 单条元信息
    // GET  /api/v1/admin/evidences/:id/content         原件字节（nosniff + attachment）
    // POST /api/v1/admin/evidences/:id/verify          人工确认材料有效 PENDING→VERIFIED
    // ----------------------------------------------------
    if (pathname === '/api/v1/admin/evidences/upload' && req.method === 'POST') {
      try {
        const maxBytes = resolveMaxUploadBytes(svc.repo.kind)
        const declaredLength = Number(req.headers['content-length'] || 0)
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
          return sendJson(413, { code: 413, error: `上传内容超过大小上限（${maxBytes} 字节）`, code_name: 'UPLOAD_TOO_LARGE' })
        }
        const buf = await readRawBody(maxBytes)
        const q = url.searchParams
        const result = await svc.repo.uploadEvidence({
          content: buf,
          declaredMime: (req.headers['content-type'] || '').split(';')[0].trim() || null,
          capturedAt: q.get('capturedAt'),
          providedBy: q.get('providedBy'),
          usageScope: q.get('usageScope'),
          kind: q.get('kind'),
          note: q.get('note'),
          clientSha256: q.get('clientSha256')
        })
        return sendJson(result.deduplicated ? 200 : 201, {
          code: 0,
          message: result.deduplicated
            ? '该原件已按内容去重复用既有证据（状态如实回显）'
            : '材料原件已入库，证据状态 PENDING —— 上传不等于核验，请人工确认材料有效后再用于放行',
          ...result
        })
      } catch (err) {
        return handleServiceError(err)
      }
    }

    if (pathname === '/api/v1/admin/evidences' && req.method === 'GET') {
      try {
        const list = await svc.repo.listEvidences({
          status: url.searchParams.get('status') || null,
          limit: url.searchParams.get('limit') || 50
        })
        return sendJson(200, { code: 0, total: list.length, data: list })
      } catch (err) {
        return handleServiceError(err)
      }
    }

    const evidenceContentMatch = pathname.match(/^\/api\/v1\/admin\/evidences\/([^/]+)\/content$/)
    if (evidenceContentMatch && req.method === 'GET') {
      try {
        const blob = await svc.repo.getEvidenceContentBytes(evidenceContentMatch[1])
        if (blob === null) {
          return sendJson(404, { code: 404, error: `证据 [${evidenceContentMatch[1]}] 不存在` })
        }
        if (blob.missingOriginal) {
          return sendJson(422, {
            code: 422,
            error: `证据 [${evidenceContentMatch[1]}] 只有哈希元信息、无可恢复原件（pre-0005 存量材料）`,
            code_name: 'ORIGINAL_MISSING'
          })
        }
        // 管理端受控预览/下载：nosniff + attachment，防存储型内容回放
        res.writeHead(200, {
          'Content-Type': blob.mimeType,
          'Content-Length': blob.sizeBytes,
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': `attachment; filename="${evidenceContentMatch[1]}.${evidenceFileExtension(blob.mimeType)}"`
        })
        return res.end(blob.content)
      } catch (err) {
        return handleServiceError(err)
      }
    }

    const evidenceVerifyMatch = pathname.match(/^\/api\/v1\/admin\/evidences\/([^/]+)\/verify$/)
    if (evidenceVerifyMatch && req.method === 'POST') {
      try {
        const { body } = await readJsonBody()
        const evidence = await svc.repo.verifyEvidence(evidenceVerifyMatch[1], {
          verifiedBy: body?.verifiedBy || 'AUDIT_STAFF'
        })
        if (!evidence) {
          return sendJson(404, { code: 404, error: `证据 [${evidenceVerifyMatch[1]}] 不存在` })
        }
        return sendJson(200, { code: 0, message: '材料已确认为有效（VERIFIED）', data: evidence })
      } catch (err) {
        return handleServiceError(err)
      }
    }

    const evidenceMatch = pathname.match(/^\/api\/v1\/admin\/evidences\/([^/]+)$/)
    if (evidenceMatch && req.method === 'GET') {
      try {
        const evidence = await svc.repo.getEvidenceById(evidenceMatch[1])
        if (!evidence) return sendJson(404, { code: 404, error: `证据 [${evidenceMatch[1]}] 不存在` })
        return sendJson(200, { code: 0, data: evidence })
      } catch (err) {
        return handleServiceError(err)
      }
    }

    // ----------------------------------------------------
    // v2 标准 API: 8. 触发外部数据源同步任务 (datatft 默认 409，hokace 台账化，其余 400)
    // POST /api/v1/admin/sources/:id/sync
    // ----------------------------------------------------
    const sourceSyncMatch = pathname.match(/^\/api\/v1\/admin\/sources\/([^/]+)\/sync$/)
    if (sourceSyncMatch && req.method === 'POST') {
      try {
        const result = await svc.sync.syncSource(sourceSyncMatch[1])
        if (result.ok) {
          broadcastSSE('DATA_UPDATED', { type: 'SOURCE_SYNCED', sourceId: sourceSyncMatch[1] })
          return sendJson(200, { code: 0, message: result.message, result: result.result })
        }
        return sendJson(200, { code: 1, message: result.message, result: result.result })
      } catch (err) {
        return handleServiceError(err, 500)
      }
    }

    // ----------------------------------------------------
    // v3 新增：同步任务历史
    // GET /api/v1/admin/sync-jobs?limit=20
    // ----------------------------------------------------
    if (pathname === '/api/v1/admin/sync-jobs' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '20', 10)
      const jobs = await svc.sync.getSyncJobs(Number.isFinite(limit) ? limit : 20)
      return sendJson(200, { code: 0, total: jobs.length, data: jobs })
    }

    // ----------------------------------------------------
    // 9. SSE 实时推流端点
    // GET /api/live/stream
    // ----------------------------------------------------
    if (pathname === '/api/live/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      })
      res.write('event: CONNECTED\ndata: {"status": "ONLINE"}\n\n')
      sseClients.add(res)
      req.on('close', () => sseClients.delete(res))
      return
    }

    // ----------------------------------------------------
    // 10. 接收剪贴板或上传的二进制图片
    // POST /api/live/analyze
    // ----------------------------------------------------
    if (pathname === '/api/live/analyze' && req.method === 'POST') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', async () => {
        try {
          const bodyBuffer = Buffer.concat(chunks)
          let imageBuffer = bodyBuffer

          const contentType = req.headers['content-type'] || ''
          if (contentType.includes('application/json')) {
            const json = JSON.parse(bodyBuffer.toString())
            if (json.imageBase64) {
              imageBuffer = Buffer.from(json.imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
            }
          }

          const result = await processImageAndSolve(imageBuffer, 'UPLOAD_OR_CLIPBOARD')
          return sendJson(200, result)
        } catch (err) {
          return sendJson(400, { error: err.message })
        }
      })
      return
    }

    // 404 兜底
    return sendJson(404, { code: 404, error: `Endpoint ${pathname} not found` })
  })
}

// 若作为主脚本启动（demo 模式；正式模式请用 backend/src/server.js）
if (process.argv[1] && process.argv[1].endsWith('index.mjs')) {
  const services = buildDemoServices()
  const server = createApiServer({ services })
  server.listen(PORT, HOST, () => {
    console.log(`=================================================`)
    console.log(`[Wanxiangqi API Server] 王者万象棋数据站后端业务服务已启动 (demo)`)
    console.log(`- 运行地址: http://${HOST}:${PORT}`)
    console.log(`- 安全鉴权: 已启用 Bearer Token 验证`)
    console.log(`- 存储仓储: FileRepository (demo；正式模式请运行 backend/src/server.js)`)
    console.log(`=================================================`)
  })
}
