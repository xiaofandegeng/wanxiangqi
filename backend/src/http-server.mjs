// 王者万象棋阵容研习站 · HTTP 层 (v6)
// 自 tools/emulator-watcher/index.mjs 迁入 backend/src（v6 M1-2）：
// 1. createApiServer({ services, adminToken }) 注入式路由；demo 文件引擎已退役，
//    services 为必填（正式模式 server.js 注入 PG 栈；测试注入隔离测试库栈）
// 2. 管理写接口 Bearer 鉴权、CORS 白名单、默认 127.0.0.1（v2 F09 规范保留）
// 3. v6 M1-3：旧赛事/玩家战绩/实时预测 API 统一 410 RETIRED —— 不读旧数据、不留壳路由
// 4. 保留能力：ready/health、阵容快照（公开，来源口径如实在案）、数据源状态、
//    同步台账、原始材料存证、素材原件生命周期（上传≠核验）

import http from 'node:http'
import { resolveMaxUploadBytes, evidenceFileExtension } from './evidence-core.mjs'

export const PORT = process.env.PORT || 8080
export const HOST = process.env.HOST || '127.0.0.1'

/**
 * 允许的跨域来源列表 (F09: 拒绝通配符 *)
 */
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
])

/**
 * v6 退役路由（M1-3）：原赛事/玩家战绩/实时预测产品的 API 一律 410。
 * 归档说明见 docs/v6旧功能删除与数据归档对照表.md §3。
 */
const RETIRED_ROUTES = [
  { pattern: /^\/api\/v1\/players(\/.*)?$/, api: '/api/v1/players*' },
  { pattern: /^\/api\/v1\/matches(\/.*)?$/, api: '/api/v1/matches*' },
  { pattern: /^\/api\/v1\/events(\/.*)?$/, api: '/api/v1/events*' },
  { pattern: /^\/api\/v1\/admin\/events(\/.*)?$/, api: '/api/v1/admin/events*' },
  { pattern: /^\/api\/v1\/admin\/matches(\/.*)?$/, api: '/api/v1/admin/matches*' },
  { pattern: /^\/api\/v1\/admin\/imports(\/.*)?$/, api: '/api/v1/admin/imports*' },
  { pattern: /^\/api\/v1\/admin\/slots\/confirm$/, api: '/api/v1/admin/slots/confirm' },
  { pattern: /^\/api\/live(\/.*)?$/, api: '/api/live*' }
]

function sendRetired(res, api) {
  const payload = {
    code: 410,
    error: `接口 [${api}] 已随产品转型退役（2026-10 v6：赛事与玩家战绩数据站 → 阵容研习站）`,
    code_name: 'API_RETIRED',
    retired: true
  }
  res.writeHead(410, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

export function createApiServer({ services = null, adminToken = null } = {}) {
  if (!services) {
    throw new Error('createApiServer 需要显式注入 services（demo 文件引擎已随 v6 退役）')
  }
  const svc = services
  const token = adminToken || process.env.ADMIN_TOKEN
  if (!token) {
    throw new Error('createApiServer 需要显式注入 adminToken（或设置 ADMIN_TOKEN 环境变量）')
  }

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
     * 二进制请求体读取（素材原件上传专用，readJsonBody 无上限不可复用）：
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
    //    （含 GET：sync-jobs/raw-materials 查询会暴露内部运营细节，不得公开）
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

    // 3. v6 退役路由 → 410（置于鉴权之后：退役管理路径仍不匿名枚举）
    const retired = RETIRED_ROUTES.find(r => r.pattern.test(pathname))
    if (retired) {
      return sendRetired(res, retired.api)
    }

    // ----------------------------------------------------
    // 就绪探测：权威存储 ping，200/503
    // GET /api/v1/ready
    // ----------------------------------------------------
    if (pathname === '/api/v1/ready' && req.method === 'GET') {
      const ready = await svc.isReady()
      return ready
        ? sendJson(200, { code: 0, status: 'READY', mode: svc.mode, time: new Date().toISOString() })
        : sendJson(503, { code: 503, status: 'UNAVAILABLE', mode: svc.mode, error: '权威存储不可用（PostgreSQL 连接失败）' })
    }

    // ----------------------------------------------------
    // 系统健康：真实组件状态与真实计数
    // GET /api/v1/health
    // ----------------------------------------------------
    if (pathname === '/api/v1/health' && req.method === 'GET') {
      const health = await svc.health()
      return sendJson(200, { code: 0, ...health })
    }

    // ----------------------------------------------------
    // 来源阵容快照大盘（缺失字段 null + 窗口/单位/截止/过期标识）
    // GET /api/v1/lineups
    // v6：快照语义保留（来源统计子对象），稳定阵容教学契约在 M2-7 接入
    // ----------------------------------------------------
    if (pathname === '/api/v1/lineups' && req.method === 'GET') {
      try {
        const list = await svc.getLineupsList()
        return sendJson(200, {
          code: 0,
          total: list.length,
          data: list,
          sourceNotice: '数据来源于第三方阵容汇总快照（含来源/窗口/样本口径），仅供流派参考，不代表个人真实战绩',
          dataAsOf: new Date().toISOString()
        })
      } catch (err) {
        return handleServiceError(err, 500)
      }
    }

    // ----------------------------------------------------
    // 单阵容快照详情
    // GET /api/v1/lineups/:id
    // ----------------------------------------------------
    const lineupDetailMatch = pathname.match(/^\/api\/v1\/lineups\/([^/]+)$/)
    if (lineupDetailMatch && req.method === 'GET') {
      try {
        const lineup = await svc.getLineupById(lineupDetailMatch[1])
        if (!lineup) {
          return sendJson(404, { code: 404, error: `阵容 [${lineupDetailMatch[1]}] 不存在` })
        }
        return sendJson(200, { code: 0, data: lineup })
      } catch (err) {
        return handleServiceError(err, 500)
      }
    }

    // ----------------------------------------------------
    // 数据源与采集新鲜度状态（data_sources + 最近同步任务）
    // GET /api/v1/data-status
    // ----------------------------------------------------
    if (pathname === '/api/v1/data-status' && req.method === 'GET') {
      try {
        const status = await svc.getDataStatus()
        return sendJson(200, { code: 0, ...status, lastUpdated: new Date().toISOString() })
      } catch (err) {
        return handleServiceError(err, 500)
      }
    }

    // ----------------------------------------------------
    // 原始材料存证查阅（离线复核用）
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
    // 素材原件入库与证据生命周期（上传 ≠ 核验；v6 承接内容素材资产）
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
            : '材料原件已入库，证据状态 PENDING —— 上传不等于核验，请人工确认材料有效后再用于内容引用',
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
    // 触发外部数据源同步任务（hokace 台账化；其余 400 UNCONFIGURED / 409 隔离）
    // POST /api/v1/admin/sources/:id/sync
    // ----------------------------------------------------
    const sourceSyncMatch = pathname.match(/^\/api\/v1\/admin\/sources\/([^/]+)\/sync$/)
    if (sourceSyncMatch && req.method === 'POST') {
      try {
        const result = await svc.sync.syncSource(sourceSyncMatch[1])
        if (result.ok) {
          return sendJson(200, { code: 0, message: result.message, result: result.result })
        }
        return sendJson(200, { code: 1, message: result.message, result: result.result })
      } catch (err) {
        return handleServiceError(err, 500)
      }
    }

    // ----------------------------------------------------
    // 同步任务历史
    // GET /api/v1/admin/sync-jobs?limit=20
    // ----------------------------------------------------
    if (pathname === '/api/v1/admin/sync-jobs' && req.method === 'GET') {
      try {
        const limit = parseInt(url.searchParams.get('limit') || '20', 10)
        const jobs = await svc.sync.getSyncJobs(Number.isFinite(limit) ? limit : 20)
        return sendJson(200, { code: 0, total: jobs.length, data: jobs })
      } catch (err) {
        return handleServiceError(err)
      }
    }

    // 404 兜底
    return sendJson(404, { code: 404, error: `Endpoint ${pathname} not found` })
  })
}
