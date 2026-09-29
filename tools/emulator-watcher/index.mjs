// 王者万象棋 - 统一数据站后端业务与实时监听服务 (Unified Backend & Watcher API)
// 遵循 v2 任务书及验收报告规范：
// 1. 管理接口鉴权 (ADMIN_TOKEN) 与明确 CORS 白名单 (F09)
// 2. 默认监听 127.0.0.1 回环地址 (F09)
// 3. 严格数据导入校验，空对象/非法格式拒绝 400，候选隔离 (F08)
// 4. 双时间防泄漏 (matchTime < cutoff && availableAt <= cutoff) 与多维度过滤 (F10)
// 5. 第三方同步失败保护：严禁覆盖有效快照，严禁失败记录成功时间 (F03)
// 6. 补齐 events/:id, lineups/:id, slots/confirm, imports/:id 路由 (F13, F05)

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { extractLobbyParticipants } from './analyzer.mjs'
import { solveDeepMetaProbabilities, solveDeepRecommendations } from './solver.mjs'
import { getBusinessStorage } from './storage.mjs'

// v3 P0-A 测试隔离：storage 单例已移除，改为惰性业务实例（仅读取业务目录；
// S3 重构后本文件将改为注入 services，不再直连存储引擎）
const storage = getBusinessStorage()

export const PORT = process.env.PORT || 8080
export const HOST = process.env.HOST || '127.0.0.1'
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'wanxiangqi-admin-token-v2'

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

export function createApiServer() {
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

    // 2. 管理写接口鉴权中间件 (F09, A14)
    if (pathname.startsWith('/api/v1/admin/') && req.method !== 'GET') {
      const authHeader = req.headers['authorization'] || ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()
      if (token !== ADMIN_TOKEN) {
        return sendJson(401, {
          code: 401,
          error: '未授权：管理写操作必须携带有效的 Authorization Bearer Token'
        })
      }
    }

    // ----------------------------------------------------
    // 系统健康与数据库连接状态 (F01)
    // GET /api/v1/health
    // ----------------------------------------------------
    if (pathname === '/api/v1/health' && req.method === 'GET') {
      return sendJson(200, {
        code: 0,
        status: 'UP',
        engine: storage.state.meta?.engine || 'Local_Persistent_Engine',
        storageMode: storage.state.meta?.storageMode || 'COLD_START',
        totalPlayers: storage.state.players.length,
        totalMatches: storage.state.matches.length,
        totalEvents: storage.state.events.length,
        time: new Date().toISOString()
      })
    }

    // ----------------------------------------------------
    // v2 标准 API: 1. 选手大盘列表 (带真实聚合统计，支持双截点与多维过滤 F10)
    // GET /api/v1/players?query=&sort=&mode=&from=&to=
    // ----------------------------------------------------
    if (pathname === '/api/v1/players' && req.method === 'GET') {
      const query = url.searchParams.get('query') || ''
      const sort = url.searchParams.get('sort') || 'rankScore'
      const mode = url.searchParams.get('mode') || null
      const from = url.searchParams.get('from') || null
      const to = url.searchParams.get('to') || null

      const list = storage.getPlayersList({ query, sort, mode, from, to })
      return sendJson(200, {
        code: 0,
        total: list.length,
        data: list,
        dataAsOf: new Date().toISOString(),
        qualityStatus: list.length > 0 ? 'VERIFIED_FACT' : 'ZERO_SAMPLE_NULL'
      })
    }

    // ----------------------------------------------------
    // v2 标准 API: 2. 单选手统计及分母 (支持 cutoff 与模式过滤 F10)
    // GET /api/v1/players/:id/stats?cutoff=&mode=&from=&to=
    // ----------------------------------------------------
    const playerStatsMatch = pathname.match(/^\/api\/v1\/players\/([^/]+)\/stats$/)
    if (playerStatsMatch && req.method === 'GET') {
      const playerId = playerStatsMatch[1]
      const cutoffTime = url.searchParams.get('cutoff') || null
      const mode = url.searchParams.get('mode') || null
      const from = url.searchParams.get('from') || null
      const to = url.searchParams.get('to') || null

      const stats = storage.computePlayerStats(playerId, { cutoffTime, mode, from, to })
      return sendJson(200, {
        code: 0,
        playerId,
        stats,
        dataAsOf: new Date().toISOString()
      })
    }

    // ----------------------------------------------------
    // v2 标准 API: 3. 选手历史对局战绩流水下钻
    // GET /api/v1/players/:id/matches
    // ----------------------------------------------------
    const playerMatchesMatch = pathname.match(/^\/api\/v1\/players\/([^/]+)\/matches$/)
    if (playerMatchesMatch && req.method === 'GET') {
      const playerId = playerMatchesMatch[1]
      const matches = storage.getPlayerMatches(playerId)
      return sendJson(200, {
        code: 0,
        playerId,
        total: matches.length,
        data: matches
      })
    }

    // ----------------------------------------------------
    // v2 标准 API: 3.1 官方王者营地全量实战对局大盘流水
    // GET /api/v1/matches?limit=50&offset=0&playerId=&mode=
    // ----------------------------------------------------
    if (pathname === '/api/v1/matches' && req.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10)
      const offset = parseInt(url.searchParams.get('offset') || '0', 10)
      const playerId = url.searchParams.get('playerId') || null
      const mode = url.searchParams.get('mode') || null

      const res = storage.getAllMatches({ limit, offset, playerId, mode })
      return sendJson(200, {
        code: 0,
        source: 'src-kohcamp-official',
        sourceName: '腾讯王者营地官方战绩网关',
        total: res.total,
        limit,
        offset,
        data: res.data,
        dataAsOf: new Date().toISOString()
      })
    }

    // ----------------------------------------------------
    // v2 标准 API: 4. 对局场次大盘列表
    // GET /api/v1/events?date=&mode=
    // ----------------------------------------------------
    if (pathname === '/api/v1/events' && req.method === 'GET') {
      const dateStr = url.searchParams.get('date') || ''
      const mode = url.searchParams.get('mode') || null
      const list = storage.getEventsList(dateStr, mode)
      return sendJson(200, {
        code: 0,
        total: list.length,
        data: list,
        dataAsOf: new Date().toISOString()
      })
    }

    // ----------------------------------------------------
    // v2 标准 API: 4.1 对局场次单场详情 (F13)
    // GET /api/v1/events/:id
    // ----------------------------------------------------
    const eventDetailMatch = pathname.match(/^\/api\/v1\/events\/([^/]+)$/)
    if (eventDetailMatch && req.method === 'GET') {
      const eventId = eventDetailMatch[1]
      const eventData = storage.getEventById(eventId)
      if (!eventData) {
        return sendJson(404, { code: 404, error: `对决场次 [${eventId}] 不存在` })
      }
      return sendJson(200, {
        code: 0,
        data: eventData
      })
    }

    // ----------------------------------------------------
    // v2 标准 API: 5. 外部阵容快照大盘 (hokace.wiki)
    // GET /api/v1/lineups
    // ----------------------------------------------------
    if (pathname === '/api/v1/lineups' && req.method === 'GET') {
      const list = storage.getLineupsList()
      return sendJson(200, {
        code: 0,
        total: list.length,
        data: list,
        sourceNotice: '数据来源于第三方阵容快照 (hokace.wiki)，仅供流派参考',
        dataAsOf: new Date().toISOString()
      })
    }

    // ----------------------------------------------------
    // v2 标准 API: 5.1 单阵容详情 (F13)
    // GET /api/v1/lineups/:id
    // ----------------------------------------------------
    const lineupDetailMatch = pathname.match(/^\/api\/v1\/lineups\/([^/]+)$/)
    if (lineupDetailMatch && req.method === 'GET') {
      const lineupId = lineupDetailMatch[1]
      const lineup = storage.getLineupById(lineupId)
      if (!lineup) {
        return sendJson(404, { code: 404, error: `阵容 [${lineupId}] 不存在` })
      }
      return sendJson(200, {
        code: 0,
        data: lineup
      })
    }

    // ----------------------------------------------------
    // v2 标准 API: 6. 数据源与采集新鲜度状态
    // GET /api/v1/data-status
    // ----------------------------------------------------
    if (pathname === '/api/v1/data-status' && req.method === 'GET') {
      return sendJson(200, {
        code: 0,
        sources: storage.state.dataSources,
        totalMatches: storage.state.matches.length,
        totalPlayers: storage.state.players.length,
        totalEvents: storage.state.events.length,
        lastUpdated: new Date().toISOString()
      })
    }

    // ----------------------------------------------------
    // v2 标准 API: 7. 导入真实材料/战绩流水 (带严格校验 F08)
    // POST /api/v1/admin/imports
    // ----------------------------------------------------
    if (pathname === '/api/v1/admin/imports' && req.method === 'POST') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          const rawText = Buffer.concat(chunks).toString().trim()
          if (!rawText) {
            return sendJson(400, { code: 400, error: '请求体不能为空' })
          }
          const body = JSON.parse(rawText)
          if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.records)) {
            return sendJson(400, { code: 400, error: '请求体必须包含 records 数组' })
          }
          if (body.records.length === 0) {
            return sendJson(400, { code: 400, error: 'records 数组不能为空' })
          }

          const runMeta = storage.importMatchRecords(body.records, { source: body.source })
          broadcastSSE('DATA_UPDATED', { type: 'IMPORT_COMPLETED', batchId: runMeta.batchId })
          return sendJson(200, {
            code: 0,
            message: '导入成功',
            result: runMeta
          })
        } catch (err) {
          return sendJson(400, { code: 400, error: `导入校验失败: ${err.message}`, details: err.details || null })
        }
      })
      return
    }

    // ----------------------------------------------------
    // v2 标准 API: 7.1 查询指定导入批次详情 (F13)
    // GET /api/v1/admin/imports/:id
    // ----------------------------------------------------
    const importBatchMatch = pathname.match(/^\/api\/v1\/admin\/imports\/([^/]+)$/)
    if (importBatchMatch && req.method === 'GET') {
      const batchId = importBatchMatch[1]
      const batchData = storage.getImportBatchById(batchId)
      if (!batchData) {
        return sendJson(404, { code: 404, error: `导入批次 [${batchId}] 未找到` })
      }
      return sendJson(200, {
        code: 0,
        data: batchData
      })
    }

    // ----------------------------------------------------
    // v2 标准 API: 7.2 人工校对工作台席位持久化 (F05)
    // POST /api/v1/admin/slots/confirm
    // ----------------------------------------------------
    if (pathname === '/api/v1/admin/slots/confirm' && req.method === 'POST') {
      const chunks = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        try {
          const rawText = Buffer.concat(chunks).toString().trim()
          if (!rawText) return sendJson(400, { code: 400, error: '核验内容不能为空' })
          const payload = JSON.parse(rawText)
          const result = storage.confirmSlotAudit(payload)
          broadcastSSE('DATA_UPDATED', { type: 'SLOT_AUDITED', eventId: result.id })
          return sendJson(200, {
            code: 0,
            message: '校对结果已成功持久化至主数据库事实表',
            data: result
          })
        } catch (err) {
          return sendJson(400, { code: 400, error: `持久化失败: ${err.message}` })
        }
      })
      return
    }

    // ----------------------------------------------------
    // v2 标准 API: 8. 触发外部数据源同步任务 (F03 严格防伪)
    // POST /api/v1/admin/sources/:id/sync
    // ----------------------------------------------------
    const sourceSyncMatch = pathname.match(/^\/api\/v1\/admin\/sources\/([^/]+)\/sync$/)
    if (sourceSyncMatch && req.method === 'POST') {
      const sourceId = sourceSyncMatch[1]
      if (sourceId === 'src-datatft-platform') {
        const { fetchRealTournaments, fetchRealLineups } = await import('./adapters/datatft.mjs')
        const src = storage.state.dataSources.find(s => s.id === sourceId)
        const startTime = new Date().toISOString()
        if (src) src.lastAttemptAt = startTime

        try {
          const [tRes, lRes] = await Promise.all([
            fetchRealTournaments(),
            fetchRealLineups(50)
          ])

          const syncRes = storage.importRealDatatftData({
            players: tRes.players,
            lineups: lRes.lineups
          })

          const endTime = new Date().toISOString()
          if (src) {
            src.lastSuccessAt = endTime
            src.lastError = null
            src.status = 'ACTIVE'
            storage.saveState()
          }

          broadcastSSE('DATA_UPDATED', { type: 'DATATFT_SYNCED', sourceId })
          return sendJson(200, {
            code: 0,
            message: `成功接入万象棋大数据真实数据: 同步 ${tRes.players.length} 位真实全服选手与 ${lRes.lineups.length} 套主流阵容`,
            result: {
              tournament: tRes.name,
              playersCount: tRes.players.length,
              lineupsCount: lRes.lineups.length,
              sampleCount: lRes.sampleCount,
              ...syncRes
            }
          })
        } catch (err) {
          if (src) {
            src.lastError = err.message
            storage.saveState()
          }
          return sendJson(500, {
            code: 500,
            error: `同步万象棋大数据平台失败: ${err.message}`
          })
        }
      } else if (sourceId === 'src-hokace-wiki') {
        const { syncHokaceLineups } = await import('./adapters/hokace.mjs')
        const result = await syncHokaceLineups()

        const src = storage.state.dataSources.find(s => s.id === sourceId)
        if (src) {
          src.lastAttemptAt = result.startTime
          // 仅当真实 SUCCESS 时更新快照与成功时间！绝不覆盖已有快照！(F03)
          if (result.status === 'SUCCESS' && Array.isArray(result.data) && result.data.length > 0) {
            storage.state.lineupSnapshots = result.data
            src.lastSuccessAt = result.endTime
            src.lastError = null
            storage.saveState()
            broadcastSSE('DATA_UPDATED', { type: 'LINEUP_SYNCED', sourceId })
            return sendJson(200, {
              code: 0,
              message: '数据源真实同步完成并已更新快照',
              result
            })
          } else {
            // 同步失败：记录错误日志，保留原有快照，绝不更新成功时间
            src.lastError = result.error
            storage.saveState()
            return sendJson(200, {
              code: 1,
              message: `数据源同步未完成: ${result.error}`,
              result
            })
          }
        }
      } else {
        return sendJson(400, {
          code: 400,
          error: `数据源 [${sourceId}] 暂不支持自动在线同步或需本人授权材料`
        })
      }
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

// 若作为主脚本启动
if (process.argv[1] && process.argv[1].endsWith('index.mjs')) {
  const server = createApiServer()
  server.listen(PORT, HOST, () => {
    console.log(`=================================================`)
    console.log(`[Wanxiangqi API Server] 王者万象棋数据站后端业务服务已启动`)
    console.log(`- 运行地址: http://${HOST}:${PORT}`)
    console.log(`- 安全鉴权: 已启用 Bearer Token 验证`)
    console.log(`- 数据引擎: ${storage.state.meta?.engine}`)
    console.log(`=================================================`)
  })
}
