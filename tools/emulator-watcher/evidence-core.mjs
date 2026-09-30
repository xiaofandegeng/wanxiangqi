// v4 W1 · 证据原件纯函数集（PG 与 File 引擎共用，唯一事实源）
//
// 铁律（任务书 W1）：
// 1. 服务端计算 SHA256 为准，客户端哈希仅作传输校验参考；
// 2. 服务端校验格式与大小：MIME 白名单 + 魔数嗅探（改名文件不得入库）；
// 3. 上传不等于核验 —— 上传只产生 PENDING 证据，有效与否由人工确认动作流转；
// 4. usage_scope 是授权相关字段：缺失按最严格（INTERNAL_ONLY），冲突显式 409，禁止静默覆盖。

import { createHash } from 'node:crypto'

export const ALLOWED_EVIDENCE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']

export const EVIDENCE_USAGE_SCOPES = ['INTERNAL_ONLY', 'PUBLIC']

/** demo 文件引擎硬上限：saveState 全量 JSON 重写，base64 原件会把 storage.json 撑爆 */
export const DEMO_EVIDENCE_MAX_BYTES = 1024 * 1024

/** 正式模式默认上限 10MB（WXQ_MAX_UPLOAD_BYTES 可覆盖） */
export function resolveMaxUploadBytes(repoKind) {
  if (repoKind === 'pg') {
    const raw = Number(process.env.WXQ_MAX_UPLOAD_BYTES)
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10 * 1024 * 1024
  }
  return DEMO_EVIDENCE_MAX_BYTES
}

export function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * 魔数嗅探：返回白名单内的真实类型，未知签名返回 null。
 * 防改名 HTML/脚本以 image/* 名义入库后被 content 端点回放（存储型 XSS）。
 */
export function sniffEvidenceMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
      buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) {
    return 'image/png'
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  // PDF: 25 50 44 46 2D (%PDF-)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2d) {
    return 'application/pdf'
  }
  // WebP: RIFF....WEBP
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  return null
}

/** 白名单 MIME → 下载文件扩展名 */
export function evidenceFileExtension(mime) {
  return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' }[mime] || 'bin'
}

/**
 * 统一上传校验（两个仓储共用）：
 * 返回规整后的 { sha256, mimeType, usageScope, kind, capturedAt }，
 * 不合法时抛出带 status/code 的 Error（由 HTTP 层 handleServiceError 映射）。
 */
export function validateEvidenceUpload({ content, declaredMime = null, capturedAt = null, kind = null, usageScope = null, clientSha256 = null, maxBytes }) {
  if (!Buffer.isBuffer(content) || content.length === 0) {
    throw Object.assign(new Error('上传内容不能为空'), { status: 400 })
  }
  if (content.length > maxBytes) {
    throw Object.assign(new Error(`材料原件超过大小上限（${maxBytes} 字节）`), { status: 413, code: 'UPLOAD_TOO_LARGE' })
  }
  const sniffed = sniffEvidenceMime(content)
  if (!sniffed) {
    throw Object.assign(
      new Error('材料格式不受支持：仅接受 PNG/JPEG/WebP 图片或 PDF（以文件真实魔数判定，改名文件无效）'),
      { status: 422, code: 'UNSUPPORTED_EVIDENCE_TYPE' }
    )
  }
  if (declaredMime && declaredMime.trim().toLowerCase() !== sniffed) {
    throw Object.assign(
      new Error(`声明的 Content-Type [${declaredMime}] 与文件真实格式 [${sniffed}] 不一致`),
      { status: 422, code: 'MIME_MISMATCH' }
    )
  }

  const sha256 = sha256Hex(content)
  if (clientSha256) {
    if (!/^[0-9a-f]{64}$/i.test(clientSha256) || clientSha256.toLowerCase() !== sha256) {
      throw Object.assign(
        new Error('客户端 SHA256 与服务端计算结果不一致，传输可能损坏，请重试'),
        { status: 422, code: 'SHA_MISMATCH' }
      )
    }
  }

  const scope = usageScope || 'INTERNAL_ONLY'
  if (!EVIDENCE_USAGE_SCOPES.includes(scope)) {
    throw Object.assign(new Error(`usageScope 必须为 ${EVIDENCE_USAGE_SCOPES.join(' / ')}，收到 [${scope}]`), { status: 400 })
  }

  const normalizedKind = kind || 'OTHER'
  if (normalizedKind.length > 32) {
    throw Object.assign(new Error('kind 长度不得超过 32 字符'), { status: 400 })
  }

  let capturedIso = null
  if (capturedAt) {
    const t = Date.parse(capturedAt)
    if (!Number.isFinite(t)) {
      throw Object.assign(new Error(`capturedAt [${capturedAt}] 不是合法的时间字符串`), { status: 400 })
    }
    capturedIso = new Date(t).toISOString()
  }

  return { sha256, mimeType: sniffed, usageScope: scope, kind: normalizedKind, capturedAt: capturedIso }
}

/** 生成证据 id（时间戳 + 随机段，与项目 ev- 风格一致） */
export function generateEvidenceId() {
  return `ev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
}

/** 证据元信息 wire 格式（元信息不携带原件字节；hasOriginal 为派生事实） */
export function evidenceWire(e, blobMeta = null) {
  return {
    id: e.id,
    sha256: e.sha256,
    sourceId: e.sourceId ?? e.source_id,
    kind: e.kind ?? null,
    status: e.status,
    capturedAt: e.capturedAt ?? (e.captured_at ? new Date(e.captured_at).toISOString() : null),
    verifiedAt: e.verifiedAt ?? (e.verified_at ? new Date(e.verified_at).toISOString() : null),
    verifiedBy: e.verifiedBy ?? e.verified_by ?? null,
    providedBy: e.providedBy ?? e.provided_by ?? null,
    usageScope: e.usageScope ?? e.usage_scope ?? null,
    note: e.note ?? null,
    hasOriginal: Boolean(blobMeta),
    mimeType: blobMeta?.mimeType ?? blobMeta?.mime_type ?? null,
    sizeBytes: blobMeta?.sizeBytes ?? (blobMeta?.size_bytes != null ? Number(blobMeta.size_bytes) : null),
    storageUri: blobMeta?.storageUri ?? blobMeta?.storage_uri ?? null
  }
}
