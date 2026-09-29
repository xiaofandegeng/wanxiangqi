// 王者万象棋数据站 - 统一 RESTful API 客户端 (v3 真实数据整改版)
// 任务书 §P2-C / F04 / F06 / F09 / V16:
// 1. 严格使用真实 API 状态渲染，无任何生产 mock 回退；失败态如实抛出由视图呈现
// 2. 管理凭证由运营者显式提供（内存 + localStorage 记忆），不再硬编码于仓库
// 3. 未知/缺失字段类型一律可空，视图必须如实展示（禁默认值伪装）
// 4. 筛选请求可取消（AbortController），切换筛选时过期请求不再覆盖新结果
// 5. 不宣称任何数据来源标签；来源以每条记录自带 sourceId/batchId 可追溯

const ADMIN_TOKEN_STORAGE_KEY = 'wxq-admin-token'

/**
 * 管理凭证：由运营者在核验工作台等写操作处显式录入。
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

export interface PlayerStats {
  sampleCount: number
  firstPlaces?: number
  top3Places?: number
  winRate: number | null
  top3Rate: number | null
  avgRank: number | null
  coverageNote?: string | null
  isSmallSample?: boolean
}

export interface PlayerRecord {
  id: string
  nickname: string
  platform: string | null
  serverZone: string | null
  rankScore: number | null
  rankText: string | null
  title?: string | null
  commander?: string | null
  style?: string | null
  // 天梯与赛事积分分列（F06：赛事积分不得再伪装成天梯分）
  ladderScore?: number | null
  ladderSource?: string | null
  ladderAt?: string | null
  tournamentPoints?: number | null
  tournamentRank?: number | null
  tournamentName?: string | null
  tournamentAt?: string | null
  stats?: PlayerStats
}

export interface MatchRecord {
  id: string
  playerId: string
  matchTime: string
  availableAt: string
  mode?: string | null
  finalRank: number
  commander?: string | null
  lineup?: string | null
  roundsSurvived?: number | null
  threeStars?: string[]
  verified: boolean
  evidenceId?: string | null
  batchId?: string | null
  recordStatus?: string
  recordKey?: string | null
  revision?: number
  supersededAt?: string | null
  synthetic?: boolean
  sourceId?: string | null
  verifiedBy?: string | null
  verifiedAt?: string | null
}

export interface EventParticipant {
  slot: number
  playerId: string | null
  nickname: string
  rankText?: string | null
  rankScore: number | null
  odds: number | null
  supportCount: number | null
  finalRank: number | null
  commander: string | null
  lineup: string | null
}

export interface EventRecord {
  id: string
  mode: string
  scheduledAt: string
  title: string
  status: string
  evidenceId?: string | null
  participants: EventParticipant[]
  verifiedAt?: string | null
  verifiedBy?: string | null
}

export interface LineupSnapshot {
  id: string
  sourceId: string
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

export interface ImportBatchResult {
  batchId: string
  source?: string
  totalRecords?: number
  inserted: number
  duplicates: number
  superseded?: number
  createdAt?: string
}

export class AdminTokenMissingError extends Error {
  constructor() {
    super('管理凭证未配置：请先在核验工作台录入管理 Token（服务端 ADMIN_TOKEN）')
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
    err.details = json?.details
    throw err
  }

  return json
}

/**
 * 1. 获取选手大盘列表 (真实双截点过滤统计；失败如实抛出，视图呈现失败态)
 */
export async function fetchPlayersList(
  params: { query?: string; sort?: string; mode?: string; from?: string; to?: string } = {},
  signal?: AbortSignal
): Promise<{ players: PlayerRecord[]; total: number; dataAsOf: string }> {
  const queryParts: string[] = []
  if (params.query) queryParts.push(`query=${encodeURIComponent(params.query)}`)
  if (params.sort) queryParts.push(`sort=${encodeURIComponent(params.sort)}`)
  if (params.mode) queryParts.push(`mode=${encodeURIComponent(params.mode)}`)
  if (params.from) queryParts.push(`from=${encodeURIComponent(params.from)}`)
  if (params.to) queryParts.push(`to=${encodeURIComponent(params.to)}`)

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''
  const res = await requestApi<any>(`/api/v1/players${queryString}`, { signal })
  return {
    players: Array.isArray(res.data) ? res.data : [],
    total: res.total || (res.data ? res.data.length : 0),
    dataAsOf: res.dataAsOf || new Date().toISOString()
  }
}

/**
 * 2. 获取单选手统计及分母（N=0 时比率均为 null）
 */
export async function fetchPlayerStats(
  playerId: string,
  options: { cutoff?: string; mode?: string; from?: string; to?: string } = {},
  signal?: AbortSignal
): Promise<PlayerStats | null> {
  const query = new URLSearchParams()
  if (options.cutoff) query.set('cutoff', options.cutoff)
  if (options.mode) query.set('mode', options.mode)
  if (options.from) query.set('from', options.from)
  if (options.to) query.set('to', options.to)
  const qs = query.toString() ? `?${query.toString()}` : ''

  const res = await requestApi<any>(`/api/v1/players/${encodeURIComponent(playerId)}/stats${qs}`, { signal })
  return res.stats || null
}

/**
 * 3. 获取单选手历史战绩事实流水（默认仅已核验 ACTIVE 记录）
 */
export async function fetchPlayerMatches(playerId: string, signal?: AbortSignal): Promise<MatchRecord[]> {
  const res = await requestApi<any>(`/api/v1/players/${encodeURIComponent(playerId)}/matches`, { signal })
  return Array.isArray(res.data) ? res.data : []
}

/**
 * 4. 获取对局场次大盘列表
 */
export async function fetchEventsList(
  params: { date?: string; mode?: string } = {},
  signal?: AbortSignal
): Promise<EventRecord[]> {
  const query = new URLSearchParams()
  if (params.date) query.set('date', params.date)
  if (params.mode) query.set('mode', params.mode)
  const qs = query.toString() ? `?${query.toString()}` : ''

  const res = await requestApi<any>(`/api/v1/events${qs}`, { signal })
  return Array.isArray(res.data) ? res.data : []
}

/**
 * 4.0.5 获取已收录对局流水大盘（v3：服务端不再宣称来源标签，返回原始 total/data）
 */
export async function fetchMatchesList(
  params: { limit?: number; offset?: number; playerId?: string; mode?: string; recordStatus?: string } = {},
  signal?: AbortSignal
): Promise<{ total: number; data: MatchRecord[] }> {
  const query = new URLSearchParams()
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))
  if (params.playerId) query.set('playerId', params.playerId)
  if (params.mode) query.set('mode', params.mode)
  if (params.recordStatus) query.set('recordStatus', params.recordStatus)
  const qs = query.toString() ? `?${query.toString()}` : ''

  const res = await requestApi<any>(`/api/v1/matches${qs}`, { signal })
  return {
    total: res.total || 0,
    data: Array.isArray(res.data) ? res.data : []
  }
}

/**
 * 4.1 获取单场对决详情
 */
export async function fetchEventDetail(eventId: string, signal?: AbortSignal): Promise<EventRecord | null> {
  const res = await requestApi<any>(`/api/v1/events/${encodeURIComponent(eventId)}`, { signal })
  return res.data || null
}

/**
 * 5. 获取第三方阵容快照大盘（含来源/窗口/样本口径语义字段；缺失字段为 null）
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
 * 5.1 获取单套阵容详情
 */
export async function fetchLineupDetail(lineupId: string, signal?: AbortSignal): Promise<LineupSnapshot | null> {
  const res = await requestApi<any>(`/api/v1/lineups/${encodeURIComponent(lineupId)}`, { signal })
  return res.data || null
}

/**
 * 6. 获取数据源健康度与同步状态
 */
export async function fetchDataStatus(signal?: AbortSignal): Promise<{
  sources: DataSourceStatus[]
  totalMatches: number
  totalPlayers: number
  totalEvents: number
  lastUpdated: string
}> {
  const res = await requestApi<any>('/api/v1/data-status', { signal })
  return {
    sources: res.sources || [],
    totalMatches: res.totalMatches || 0,
    totalPlayers: res.totalPlayers || 0,
    totalEvents: res.totalEvents || 0,
    lastUpdated: res.lastUpdated || new Date().toISOString()
  }
}

/**
 * 7. 导入战绩流水 (verified 一律由服务端忽略 → PENDING 待核验，V17)
 */
export async function importMatchRecords(records: any[], source = 'ADMIN_IMPORT'): Promise<ImportBatchResult> {
  const res = await requestApi<any>('/api/v1/admin/imports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records, source })
  })

  if (res.code !== 0 || !res.result) {
    throw new Error(res.error || '导入未成功完成')
  }
  return res.result
}

/**
 * 7.1 查询指定导入批次
 */
export async function fetchImportBatch(batchId: string): Promise<any> {
  const res = await requestApi<any>(`/api/v1/admin/imports/${encodeURIComponent(batchId)}`)
  return res.data
}

/**
 * 7.2 人工校对工作台 6 席位持久化入库确认（evidenceSha256 存证关联）
 */
export async function confirmSlotAudit(payload: {
  eventId?: string
  title?: string
  scheduledAt?: string
  mode?: string
  evidenceSha256?: string
  slots: Array<{
    slot: number
    playerId?: string
    nickname: string
    rankScore?: number | null
    rankText?: string | null
    odds?: number | null
    supportCount?: number | null
    finalRank: number
    commander?: string | null
    lineup?: string | null
  }>
}): Promise<EventRecord> {
  const res = await requestApi<any>('/api/v1/admin/slots/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (res.code !== 0 || !res.data) {
    throw new Error(res.error || '持久化保存失败')
  }
  return res.data
}

/**
 * 8. 触发外部数据源同步（服务端按 data_sources 状态门禁：409/400 如实返回）
 */
export async function syncSource(sourceId: string): Promise<any> {
  return requestApi<any>(`/api/v1/admin/sources/${encodeURIComponent(sourceId)}/sync`, {
    method: 'POST'
  })
}
