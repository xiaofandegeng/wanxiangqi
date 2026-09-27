// 王者万象棋 - 模拟器实时画面监听与秒级决策推送服务 (Live Watcher Service)
// 运行环境: Node.js 18+ (原生 zero-dependency 实现)

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { extractLobbyParticipants } from './analyzer.mjs'
import { solveLiveProbabilities, solveLiveRecommendations } from './solver.mjs'

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
  // 1. 画面席位识别
  const analysis = await extractLobbyParticipants(imageBuffer)
  
  // 2. 6人胜率实时归一化求解
  const probabilities = solveLiveProbabilities(analysis.participants)

  // 3. 支持回报与 EV 推荐推导
  const recommendations = solveLiveRecommendations(analysis.participants, probabilities)

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
  console.log(`[Watcher] Live match solved in ${latencyMs}ms! Best pick: Slot #${liveEvent.bestRecommendation?.slot} ${liveEvent.bestRecommendation?.nickname} (EV: +${liveEvent.bestRecommendation?.netEV}钻)`)
  return liveEvent
}

const server = http.createServer(async (req, res) => {
  // CORS 跨域放行
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)

  // 1. SSE 实时推流端点
  if (url.pathname === '/api/live/stream') {
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

  // 2. 服务状态查询
  if (url.pathname === '/api/live/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({
      status: 'ONLINE',
      port: PORT,
      activeClients: sseClients.size,
      lastCapturedAt: lastCapturedData?.timestamp || null,
      lastEvent: lastCapturedData
    }))
    return
  }

  // 3. 触发 macOS 本地直接截图
  if (url.pathname === '/api/live/capture' && req.method === 'POST') {
    const tmpPath = `/tmp/wxq_cap_${Date.now()}.png`
    exec(`screencapture -x -C "${tmpPath}"`, async (error) => {
      if (error || !fs.existsSync(tmpPath)) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '截屏失败，请确保终端具备屏幕录制权限' }))
        return
      }

      try {
        const imageBuffer = fs.readFileSync(tmpPath)
        fs.unlinkSync(tmpPath) // 清理临时文件
        const result = await processImageAndSolve(imageBuffer, 'SCREEN_CAPTURE')
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(result))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // 4. 接收剪贴板或上传的二进制图片
  if (url.pathname === '/api/live/analyze' && req.method === 'POST') {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', async () => {
      try {
        const bodyBuffer = Buffer.concat(chunks)
        let imageBuffer = bodyBuffer

        // 如果是 JSON base64
        const contentType = req.headers['content-type'] || ''
        if (contentType.includes('application/json')) {
          const json = JSON.parse(bodyBuffer.toString())
          if (json.imageBase64) {
            imageBuffer = Buffer.from(json.imageBase64.replace(/^data:image\/\w+;base64,/, ''), 'base64')
          }
        }

        const result = await processImageAndSolve(imageBuffer, 'UPLOAD_OR_CLIPBOARD')
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(result))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }

  // 5. 模拟一次实战开盘推送 (用于随时调试和测试真实决策反馈)
  if (url.pathname === '/api/live/simulate' && req.method === 'POST') {
    const dummyBuffer = Buffer.from(`SIMULATE_${Date.now()}`)
    const result = await processImageAndSolve(dummyBuffer, 'SIMULATED_TEST')
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(result))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Endpoint not found' }))
})

server.listen(PORT, () => {
  console.log(`=================================================`)
  console.log(`[Watcher Service] 王者万象棋模拟器实时监听服务已启动`)
  console.log(`- 监听端口: http://localhost:${PORT}`)
  console.log(`- SSE 实时推流: http://localhost:${PORT}/api/live/stream`)
  console.log(`- 手动/快捷抓屏: POST http://localhost:${PORT}/api/live/capture`)
  console.log(`=================================================`)
})
