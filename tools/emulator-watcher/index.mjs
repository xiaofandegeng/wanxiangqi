// 王者万象棋 - 统一数据站后端业务与实时监听服务 (Unified Backend & Watcher API)
// 符合 v2 任务书规范:
// 1. 提供标准的 /api/v1/ RESTful 接口
// 2. 真实数据持久化与幂等入库
// 3. 统计指标严格基于有效样本计算 (登顶率, 前三率, 均名)
// 4. SSE 广播数据版本变更通知

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { extractLobbyParticipants } from './analyzer.mjs'
import { solveDeepMetaProbabilities, solveDeepRecommendations } from './solver.mjs'
import { storage } from './storage.mjs'

const PORT = process.env.PORT || 8080
let lastCapturedData = null
const sseClients = new Set()

/**
 * 广播 SSE 实时事件到所有连接的前端客户端
 */
function broadcastSSE(eventType, data) {
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
async function processImageAndSolve(imageBuffer, sourceDesc = 'MANUAL') {
  const startTime = Date.now()
  // 1. 画面席位识别 (严格模式: 未匹配已知存证返回待核验状态)
  const analysis = await extractLobbyParticipants(imageBuffer)
  
  if (analysis.status === 'NEED_MANUAL_REVIEW') {
    return {
      status: 'NEED_MANUAL_REVIEW',
      sha256: analysis.sha256,
      note: analysis.note,
      latencyMs: Date.now() - startTime
    }
  }

  // 2. 6人真实 MMR 段位分与流派模型归一化求解
  const probabilities = solveDeepMetaProbabilities(analysis.participants)

  // 3. 盘面参考赔率与收益推导
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

const server = http.createServer(async (req, res) => {
  // CORS 跨域放行
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)
  const pathname = url.pathname

  // 工具函数: 发送 JSON 响应
  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(data))
  }

  // ----------------------------------------------------
  // v2 标准 API: 1. 选手天梯大盘列表 (带真实聚合统计)
  // GET /api/v1/players?query=&sort=&mode=
  // ----------------------------------------------------
  if (pathname === '/api/v1/players' && req.method === 'GET') {
    const query = url.searchParams.get('query') || ''
    const sort = url.searchParams.get('sort') || 'rankScore'
    const list = storage.getPlayersList(query, sort)
    return sendJson(200, {
      code: 0,
      total: list.length,
      data: list,
      dataAsOf: new Date().toISOString(),
      qualityStatus: 'VERIFIED_FACT'
    })
  }

  // ----------------------------------------------------
  // v2 标准 API: 2. 单选手统计及分母
  // GET /api/v1/players/:id/stats
  // ----------------------------------------------------
  const playerStatsMatch = pathname.match(/^\/api\/v1\/players\/([^/]+)\/stats$/)
  if (playerStatsMatch && req.method === 'GET') {
    const playerId = playerStatsMatch[1]
    const stats = storage.computePlayerStats(playerId)
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
  // v2 标准 API: 4. 对局场次大盘列表
  // GET /api/v1/events?date=&mode=
  // ----------------------------------------------------
  if (pathname === '/api/v1/events' && req.method === 'GET') {
    const dateStr = url.searchParams.get('date') || ''
    const list = storage.getEventsList(dateStr)
    return sendJson(200, {
      code: 0,
      total: list.length,
      data: list,
      dataAsOf: new Date().toISOString()
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
      sourceNotice: '数据来源于第三方阵容快照 (hokace.wiki)，仅供流派环境参考',
      dataAsOf: new Date().toISOString()
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
  // v2 标准 API: 7. 导入真实材料/战绩流水 (带幂等去重)
  // POST /api/v1/admin/imports
  // ----------------------------------------------------
  if (pathname === '/api/v1/admin/imports' && req.method === 'POST') {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString())
        const records = Array.isArray(body.records) ? body.records : []
        const runMeta = storage.importMatchRecords(records, { source: body.source })
        broadcastSSE('DATA_UPDATED', { type: 'IMPORT_COMPLETED', batchId: runMeta.batchId })
        return sendJson(200, {
          code: 0,
          message: '导入成功',
          result: runMeta
        })
      } catch (err) {
        return sendJson(400, { error: `导入数据格式错误: ${err.message}` })
      }
    })
    return
  }

  // ----------------------------------------------------
  // 8. SSE 实时推流端点 (通知版本变更与新事件)
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
  // 9. 接收剪贴板或上传的二进制图片
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
  return sendJson(404, { error: `Endpoint ${pathname} not found` })
})

server.listen(PORT, () => {
  console.log(`=================================================`)
  console.log(`[Wanxiangqi API Server] 王者万象棋数据站后端业务服务已启动`)
  console.log(`- 运行端口: http://localhost:${PORT}`)
  console.log(`- REST API: http://localhost:${PORT}/api/v1/players`)
  console.log(`- SSE 监听: http://localhost:${PORT}/api/live/stream`)
  console.log(`- 数据落盘: tools/emulator-watcher/data/storage.json`)
  console.log(`=================================================`)
})
