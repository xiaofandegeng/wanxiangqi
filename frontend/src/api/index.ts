// 王者万象棋阵容研习站 - RESTful API 客户端 (v6)
// 原则（延续已验收规范）：
// 1. 严格使用真实 API 状态渲染，无任何生产 mock 回退；失败态如实抛出由视图呈现
// 2. 管理凭证由运营者显式提供（内存 + localStorage 记忆），不硬编码于仓库
// 3. 未知/缺失字段类型一律可空，视图必须如实展示（禁默认值伪装）
// 4. 旧赛事/玩家战绩接口已随 v6 退役（服务端 410），客户端不再保留对应请求
// 5. 内容契约（课程/资料/阵容手册/版本动态）随 M2 内容底座接入扩展

const ADMIN_TOKEN_STORAGE_KEY = 'wxq-admin-token'

/**
 * 管理凭证：由运营者在管理页显式录入。
 * 写接口（/api/v1/admin/*）未配置凭证时直接拒绝发起，不静默降级。
 */
let adminTokenInMemory: string | null = null

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
    // localStorage 不可用（隐私模式等）时仅保留内存态
  }
}

export function hasAdminToken(): boolean {
  return Boolean(getAdminToken())
}

export interface LineupSnapshot {
  id: string
  sourceId: string
  sourceName?: string | null
  sourceStatus?: string | null
  sourceType?: string | null
  lineupName: string
  tier: string | null
  commander: string | null
  coreHeroes: string[]
  sampleCount: number | null
  winRate: number | null
  top3Rate: number | null
  avgRank: number | null
  snapshotVersion: string | null
  windowText: string | null
  scope: string | null
  structureKey?: string | null
  windowStart?: string | null
  windowEnd?: string | null
  sampleUnit?: string | null
  rateUnit?: string | null
  dataCutoffAt?: string | null
  updatedAt: string
  stale?: boolean | null
}

export interface DataSourceStatus {
  id: string
  sourceId?: string
  name: string
  type: string
  url?: string | null
  status: string
  licenseNote?: string | null
  lastAttemptAt?: string | null
  lastSuccessAt?: string | null
  lastError?: string | null
  note?: string | null
}

export interface SyncJobRecord {
  id: number
  sourceId: string
  jobType: string | null
  status: string
  startedAt: string | null
  finishedAt: string | null
  fetchedCount: number | null
  insertedCount: number | null
  duplicateCount: number | null
  failedCount: number | null
  errorSummary: string | null
}

/**
 * 证据/素材材料（v6 承接内容素材资产）：status PENDING（上传≠核验）→
 * VERIFIED（人工确认）/ QUARANTINED。hasOriginal=false 表示只有哈希元信息、
 * 无可恢复原件，不得作为内容来源引用依据。
 */
export interface EvidenceRecord {
  id: string
  sha256: string
  sourceId: string | null
  kind: string | null
  status: 'PENDING' | 'VERIFIED' | 'QUARANTINED'
  capturedAt: string | null
  verifiedAt: string | null
  verifiedBy: string | null
  providedBy: string | null
  usageScope: string | null
  note: string | null
  hasOriginal: boolean
  mimeType: string | null
  sizeBytes: number | null
  storageUri: string | null
}

export class AdminTokenMissingError extends Error {
  constructor() {
    super('管理凭证未配置：请先在管理页录入管理 Token（服务端 ADMIN_TOKEN）')
    this.name = 'AdminTokenMissingError'
  }
}

/**
 * 封装通用 fetch 请求。GET 公开接口匿名；管理写接口显式要求凭证。
 * options.signal 支持取消过期请求（切换筛选时复用）。
 */
async function requestApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {})
  const isAdminPath = path.startsWith('/api/v1/admin/')
  if (isAdminPath && !headers.has('Authorization')) {
    const token = getAdminToken()
    if (!token) throw new AdminTokenMissingError()
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(path, { ...options, headers })

  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const errorMsg = json?.error || `HTTP ${res.status} 请求失败`
    const err: any = new Error(errorMsg)
    err.status = res.status
    err.code = json?.code_name
    err.details = json?.details
    throw err
  }

  return json
}

/**
 * 1. 来源阵容快照大盘（含来源/窗口/样本口径语义字段；缺失字段为 null）
 */
export async function fetchLineupSnapshots(
  signal?: AbortSignal
): Promise<{ lineups: LineupSnapshot[]; sourceNotice: string; dataAsOf: string }> {
  const res = await requestApi<any>('/api/v1/lineups', { signal })
  return {
    lineups: Array.isArray(res.data) ? res.data : [],
    sourceNotice: res.sourceNotice || '数据来源于第三方阵容汇总快照，仅供流派参考，不代表个人真实战绩',
    dataAsOf: res.dataAsOf || new Date().toISOString()
  }
}

/**
 * 1.1 单阵容快照详情
 */
export async function fetchLineupDetail(lineupId: string, signal?: AbortSignal): Promise<LineupSnapshot | null> {
  const res = await requestApi<any>(`/api/v1/lineups/${encodeURIComponent(lineupId)}`, { signal })
  return res.data || null
}

/**
 * 2. 数据源健康度与同步状态（来源注册表 + 最近任务 + 内容计数）
 */
export async function fetchDataStatus(signal?: AbortSignal): Promise<{
  sources: DataSourceStatus[]
  recentSyncJobs: SyncJobRecord[]
  counts: Record<string, number> | null
  lastUpdated: string
}> {
  const res = await requestApi<any>('/api/v1/data-status', { signal })
  return {
    sources: res.sources || [],
    recentSyncJobs: res.recentSyncJobs || [],
    counts: res.counts ?? null,
    lastUpdated: res.lastUpdated || new Date().toISOString()
  }
}

// ---------------- 管理面：素材证据生命周期 + 来源同步 ----------------

/**
 * 3.1 上传素材原件（原始字节直传，元信息走 query）。
 * 独立 fetch：请求体是 File 二进制、响应为 JSON，且须透传 4xx 的 code_name（如 MIME_MISMATCH）。
 * 上传只产生 PENDING —— 上传不等于核验。
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
 * 3.2 素材证据台账列表（可按状态过滤）
 */
export async function fetchEvidences(status?: string): Promise<EvidenceRecord[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : ''
  const res = await requestApi<any>(`/api/v1/admin/evidences${qs}`)
  return Array.isArray(res.data) ? res.data : []
}

/**
 * 3.3 人工确认材料有效（PENDING → VERIFIED；上传不等于核验）
 */
export async function verifyEvidence(evidenceId: string, verifiedBy: string): Promise<EvidenceRecord> {
  const res = await requestApi<any>(`/api/v1/admin/evidences/${encodeURIComponent(evidenceId)}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verifiedBy })
  })
  if (res.code !== 0 || !res.data) {
    throw new Error(res.error || '确认材料有效失败')
  }
  return res.data
}

/**
 * 3.4 取回素材原件（Blob → objectURL 预览；服务端 nosniff + attachment）。
 * 返回的 URL 由调用方负责 URL.revokeObjectURL 释放。
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

/**
 * 4. 触发外部数据源同步（服务端按 data_sources 状态门禁：409/400 如实返回）
 */
export async function syncSource(sourceId: string): Promise<any> {
  return requestApi<any>(`/api/v1/admin/sources/${encodeURIComponent(sourceId)}/sync`, {
    method: 'POST'
  })
}

/**
 * 5. 同步任务台账
 */
export async function fetchSyncJobs(limit = 20, signal?: AbortSignal): Promise<SyncJobRecord[]> {
  const res = await requestApi<any>(`/api/v1/admin/sync-jobs?limit=${limit}`, { signal })
  return Array.isArray(res.data) ? res.data : []
}

/**
 * 6. 原始材料存证列表（离线复核入口）
 */
export async function fetchRawMaterials(
  params: { sourceId?: string; limit?: number } = {},
  signal?: AbortSignal
): Promise<Array<Record<string, unknown>>> {
  const query = new URLSearchParams()
  if (params.sourceId) query.set('sourceId', params.sourceId)
  if (params.limit) query.set('limit', String(params.limit))
  const qs = query.toString() ? `?${query.toString()}` : ''
  const res = await requestApi<any>(`/api/v1/admin/raw-materials${qs}`, { signal })
  return Array.isArray(res.data) ? res.data : []
}
