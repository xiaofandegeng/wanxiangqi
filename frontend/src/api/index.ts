// 王牌对决研究台 - API 客户端与凭证管理
const ADMIN_TOKEN_STORAGE_KEY = 'wxq-admin-token'

let adminTokenInMemory: string | null = null

export class AdminTokenMissingError extends Error {
  constructor(message = '未配置管理凭证：请先在管理页保存服务端 ADMIN_TOKEN') {
    super(message)
    this.name = 'AdminTokenMissingError'
  }
}

export function getAdminToken(): string | null {
  if (adminTokenInMemory !== null) return adminTokenInMemory
  try {
    adminTokenInMemory = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY)
  } catch {
    adminTokenInMemory = null
  }
  return adminTokenInMemory
}

export function setAdminToken(token: string | null) {
  adminTokenInMemory = token
  try {
    if (token === null) localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY)
    else localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token)
  } catch {
    // 忽略 localStorage 写入错误
  }
}

export function hasAdminToken(): boolean {
  return Boolean(getAdminToken())
}

export interface EvidenceRecord {
  id: string
  sha256: string
  sourceId: string
  capturedAt: string
  status: 'PENDING' | 'VERIFIED' | 'QUARANTINED'
  note?: string | null
  kind?: string | null
  providedBy?: string | null
  usageScope?: 'INTERNAL_ONLY' | 'PUBLIC' | null
  hasOriginal: boolean
  mimeType?: string | null
  sizeBytes?: number | null
  storageUri?: string | null
  verifiedAt?: string | null
  verifiedBy?: string | null
  createdAt?: string
}

async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken()
  const headers = new Headers(init?.headers || {})

  if (path.startsWith('/api/v1/admin/')) {
    if (!token) throw new AdminTokenMissingError()
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(path, { ...init, headers })
  const json = await res.json().catch(() => null)

  if (!res.ok) {
    const err: any = new Error(json?.error || `HTTP ${res.status} 请求失败`)
    err.status = res.status
    err.code = json?.code_name
    err.payload = json
    throw err
  }
  return json as T
}

/**
 * 1. 上传素材原件（原始字节直传，元信息走 query）
 */
export async function uploadEvidence(
  file: File | Blob,
  meta: {
    capturedAt: string
    kind?: string
    usageScope?: 'INTERNAL_ONLY' | 'PUBLIC'
    providedBy?: string
    note?: string
    clientSha256?: string
  }
): Promise<{ evidenceId: string; deduplicated: boolean; evidence: EvidenceRecord }> {
  const token = getAdminToken()
  if (!token) throw new AdminTokenMissingError()

  const q = new URLSearchParams({ capturedAt: meta.capturedAt })
  if (meta.kind) q.set('kind', meta.kind)
  if (meta.usageScope) q.set('usageScope', meta.usageScope)
  if (meta.providedBy) q.set('providedBy', meta.providedBy)
  if (meta.note) q.set('note', meta.note)
  if (meta.clientSha256) q.set('clientSha256', meta.clientSha256)

  const contentType = (file as File).type || 'application/octet-stream'
  const res = await fetch(`/api/v1/admin/evidences/upload?${q}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: file
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const err: any = new Error(json?.error || `HTTP ${res.status} 上传失败`)
    err.status = res.status
    err.code = json?.code_name
    throw err
  }
  return json
}

/**
 * 2. 素材证据台账列表
 */
export async function fetchEvidences(status?: string): Promise<EvidenceRecord[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  const res = await requestApi<{ code: number; total: number; data: EvidenceRecord[] }>(`/api/v1/admin/evidences${qs}`)
  return Array.isArray(res.data) ? res.data : []
}

/**
 * 3. 人工确认材料有效（PENDING → VERIFIED）
 */
export async function verifyEvidence(evidenceId: string, verifiedBy: string): Promise<EvidenceRecord> {
  const res = await requestApi<{ code: number; data: EvidenceRecord; error?: string }>(
    `/api/v1/admin/evidences/${encodeURIComponent(evidenceId)}/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verifiedBy })
    }
  )
  if (res.code !== 0 || !res.data) {
    throw new Error(res.error || '确认材料有效失败')
  }
  return res.data
}

/**
 * 4. 取回素材原件
 */
export async function fetchEvidenceObjectUrl(evidenceId: string): Promise<string> {
  const token = getAdminToken()
  if (!token) throw new AdminTokenMissingError()
  const res = await fetch(`/api/v1/admin/evidences/${encodeURIComponent(evidenceId)}/content`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) {
    const json = await res.json().catch(() => null)
    const err: any = new Error(json?.error || `HTTP ${res.status} 原件获取失败`)
    err.status = res.status
    err.code = json?.code_name
    throw err
  }
  return URL.createObjectURL(await res.blob())
}
