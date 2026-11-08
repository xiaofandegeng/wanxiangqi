// 王牌对决研究台 · HTTP 服务
import http from 'node:http'
import { resolveMaxUploadBytes, evidenceFileExtension } from './evidence-core.mjs'

export const PORT = process.env.PORT || 8080
export const HOST = process.env.HOST || '127.0.0.1'

/**
 * 允许的跨域来源列表
 */
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
])

export function createApiServer({ services = null, adminToken = null } = {}) {
  if (!services) {
    throw new Error('createApiServer 需要显式注入 services')
  }
  const svc = services
  const token = adminToken || process.env.ADMIN_TOKEN
  if (!token) {
    throw new Error('createApiServer 需要显式注入 adminToken（或设置 ADMIN_TOKEN 环境变量）')
  }

  return http.createServer(async (req, res) => {
    // 1. CORS 跨域白名单处理
    const reqOrigin = req.headers['origin']
    if (reqOrigin && ALLOWED_ORIGINS.has(reqOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', reqOrigin)
    } else if (!reqOrigin) {
      res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:5174')
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

    /** 统一服务异常 → HTTP 映射 */
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
        } catch {
          reject(Object.assign(new Error('请求体不是合法 JSON'), { status: 400 }))
        }
      })
      req.on('error', reject)
    })

    /** 二进制请求体读取（素材原件上传） */
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

    // 2. 管理接口鉴权中间件
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

    // 3. 王牌对决研究台接口
    if (pathname.startsWith('/api/v1/admin/prediction/')) {
      try {
        const action = pathname.slice('/api/v1/admin/prediction/'.length)
        const p = svc.prediction
        if (!p) return sendJson(503, { code: 503, error: '预测工作台未启用' })

        const analysisGet = action.match(/^screenshot-analyses\/([^/]+)$/)
        if (req.method === 'GET' && analysisGet) return sendJson(200, { code: 0, data: await p.screenshots.analysis(analysisGet[1]) })

        const draftGet = action.match(/^screenshots\/([^/]+)$/)
        if (req.method === 'GET' && draftGet) return sendJson(200, { code: 0, data: await p.screenshots.get(draftGet[1]) })

        if (req.method === 'GET' && action === 'catalog') return sendJson(200, { code: 0, data: await p.catalog.list() })
        if (req.method === 'GET' && action === 'observations') return sendJson(200, { code: 0, data: await p.observations.list() })
        if (req.method === 'GET' && action === 'matches') return sendJson(200, { code: 0, data: await p.list() })
        if (req.method === 'GET' && action === 'stats') return sendJson(200, { code: 0, data: await p.stats() })
        if (req.method === 'GET' && action === 'runs') return sendJson(200, { code: 0, data: await p.runs() })

        if (req.method === 'POST') {
          const bytes = await readRawBody(256 * 1024)
          let body
          try { body = JSON.parse(bytes.toString('utf8')) } catch { return sendJson(400, { code: 400, error: '请求体不是合法JSON' }) }

          if (action === 'screenshots') return sendJson(200, { code: 0, data: await p.screenshots.read(body?.evidenceId) })

          const analyzeScreenshot = action.match(/^screenshots\/([^/]+)\/analyze$/)
          if (analyzeScreenshot) return sendJson(200, { code: 0, data: await p.screenshots.analyze(analyzeScreenshot[1], body) })

          if (action === 'observations') return sendJson(200, { code: 0, data: await p.observations.save(body) })

          const observation = action.match(/^observations\/([^/]+)\/(verify|quarantine)$/)
          if (observation) return sendJson(200, { code: 0, data: await p.observations.review(observation[1], body?.operator, observation[2] === 'quarantine') })

          if (action === 'matches') return sendJson(200, { code: 0, data: await p.import(body) })
          if (action === 'estimate') return sendJson(200, { code: 0, data: await p.predict(body) })

          const quarantine = action.match(/^matches\/([^/]+)\/quarantine$/)
          if (quarantine) return sendJson(200, { code: 0, data: await p.quarantine(quarantine[1], body?.operator) })

          const hit = action.match(/^matches\/([^/]+)\/verify$/)
          if (hit) return sendJson(200, { code: 0, data: await p.verify(hit[1], body?.operator) })
        }
        return sendJson(404, { code: 404, error: '工作台接口不存在' })
      } catch (err) {
        return handleServiceError(err, 500)
      }
    }

    // 4. 素材原件入库与证据管理
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
            error: `证据 [${evidenceContentMatch[1]}] 只有哈希元信息、无可恢复原件`,
            code_name: 'ORIGINAL_MISSING'
          })
        }
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

    // 5. 就绪与健康探测
    if (pathname === '/api/v1/ready' && req.method === 'GET') {
      const ready = await svc.isReady()
      return ready
        ? sendJson(200, { code: 0, status: 'READY', mode: svc.mode, time: new Date().toISOString() })
        : sendJson(503, { code: 503, status: 'UNAVAILABLE', mode: svc.mode, error: '权威存储不可用（PostgreSQL 连接失败）' })
    }

    if (pathname === '/api/v1/health' && req.method === 'GET') {
      const health = await svc.health()
      return sendJson(200, { code: 0, ...health })
    }

    // 6. 兜底 404
    return sendJson(404, { code: 404, error: '接口不存在' })
  })
}
