// 王者万象棋数据站 - 统一 RESTful API 客户端 (v2 真实数据闭环版)
// 遵循 v2 规范与验收报告要求 (F04, F05, F08, F09, F13):
// 1. 严格使用真实 API 状态渲染，删除一切生产 mock 回退 (F04)
// 2. 携带管理端 Bearer Token，支持安全写操作 (F09)
// 3. 补齐 events/:id, lineups/:id, slots/confirm, imports/:id 等标准接口 (F13)
// 4. 接口失败与空库状态真实呈现，绝不伪装数据或批次 (F05)

const ADMIN_TOKEN = 'wanxiangqi-admin-token-v2'

export interface PlayerStats {
  sampleCount: number
  firstPlaces?: number
  top3Places?: number
  winRate: number | null
  top3Rate: number | null
  avgRank: number | null
  warning?: string | null
  isSmallSample?: boolean
}

export interface PlayerRecord {
  id: string
  nickname: string
  platform: string
  serverZone: string
  rankScore: number
  rankText: string
  title?: string
  commander?: string
  style?: string
  stats?: PlayerStats
}

export interface MatchRecord {
  id: string
  playerId: string
  playerUid?: string
  campSeq?: string
  matchTime: string
  availableAt: string
  mode?: string
  finalRank: number
  commander?: string
  lineup?: string
  roundsSurvived?: number
  threeStars?: string[]
  verified: boolean
  evidenceId?: string
  batchId?: string
}

export interface EventParticipant {
  slot: number
  playerId: string
  nickname: string
  rankScore: number
  odds: number
  supportCount: number
  finalRank?: number
  commander?: string
  lineup?: string
}

export interface EventRecord {
  id: string
  mode: string
  scheduledAt: string
  title: string
  status: string
  evidenceId?: string
  participants: EventParticipant[]
  verifiedAt?: string
  verifiedBy?: string
}

export interface LineupSnapshot {
  id: string
  sourceId: string
  lineupName: string
  tier: string
  commander: string
  coreHeroes: string[]
  sampleCount: number
  winRate: number
  top3Rate: number
  avgRank: number
  snapshotVersion: string
  windowText: string
  scope: string
  updatedAt: string
}

export interface DataSourceStatus {
  id: string
  name: string
  type: string
  url: string
  status: string
  lastAttemptAt?: string | null
  lastSuccessAt?: string | null
  lastError?: string | null
  note?: string
}

export interface ImportBatchResult {
  batchId: string
  source: string
  totalRecords: number
  inserted: number
  updated: number
  duplicates: number
  createdAt: string
}

/**
 * 封装通用 fetch 请求，默认携带管理凭证
 */
async function requestApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {})
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${ADMIN_TOKEN}`)
  }

  const res = await fetch(path, {
    ...options,
    headers
  })

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
 * 1. 获取选手大盘列表 (带真实双截点过滤与统计，严禁 mock 回退)
 */
export async function fetchPlayersList(params: {
  query?: string
  sort?: string
  mode?: string
  from?: string
  to?: string
} = {}): Promise<{ players: PlayerRecord[]; total: number; dataAsOf: string; fromBackend: boolean }> {
  const queryParts: string[] = []
  if (params.query) queryParts.push(`query=${encodeURIComponent(params.query)}`)
  if (params.sort) queryParts.push(`sort=${encodeURIComponent(params.sort)}`)
  if (params.mode) queryParts.push(`mode=${encodeURIComponent(params.mode)}`)
  if (params.from) queryParts.push(`from=${encodeURIComponent(params.from)}`)
  if (params.to) queryParts.push(`to=${encodeURIComponent(params.to)}`)

  const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''
  try {
    const res = await requestApi<any>(`/api/v1/players${queryString}`)
    return {
      players: Array.isArray(res.data) ? res.data : [],
      total: res.total || (res.data ? res.data.length : 0),
      dataAsOf: res.dataAsOf || new Date().toISOString(),
      fromBackend: true
    }
  } catch (err) {
    console.error('[API Client] fetchPlayersList 失败:', err)
    return {
      players: [],
      total: 0,
      dataAsOf: new Date().toISOString(),
      fromBackend: false
    }
  }
}

/**
 * 2. 获取单选手统计及分母
 */
export async function fetchPlayerStats(playerId: string, options: { cutoff?: string; mode?: string } = {}): Promise<PlayerStats | null> {
  const query = new URLSearchParams()
  if (options.cutoff) query.set('cutoff', options.cutoff)
  if (options.mode) query.set('mode', options.mode)
  const qs = query.toString() ? `?${query.toString()}` : ''

  const res = await requestApi<any>(`/api/v1/players/${encodeURIComponent(playerId)}/stats${qs}`)
  return res.stats || null
}

/**
 * 3. 获取单选手历史战绩事实流水
 */
export async function fetchPlayerMatches(playerId: string): Promise<MatchRecord[]> {
  const res = await requestApi<any>(`/api/v1/players/${encodeURIComponent(playerId)}/matches`)
  return Array.isArray(res.data) ? res.data : []
}

/**
 * 4. 获取对局场次大盘列表
 */
export async function fetchEventsList(params: { date?: string; mode?: string } = {}): Promise<EventRecord[]> {
  const query = new URLSearchParams()
  if (params.date) query.set('date', params.date)
  if (params.mode) query.set('mode', params.mode)
  const qs = query.toString() ? `?${query.toString()}` : ''

  const res = await requestApi<any>(`/api/v1/events${qs}`)
  return Array.isArray(res.data) ? res.data : []
}

/**
 * 获取官方王者营地全量实战排位流水大盘 (Camp Feed)
 */
export async function fetchMatchesList(params: { limit?: number; offset?: number; playerId?: string; mode?: string } = {}): Promise<{
  total: number
  data: MatchRecord[]
  source: string
  sourceName: string
}> {
  const query = new URLSearchParams()
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))
  if (params.playerId) query.set('playerId', params.playerId)
  if (params.mode) query.set('mode', params.mode)
  const qs = query.toString() ? `?${query.toString()}` : ''

  const res = await requestApi<any>(`/api/v1/matches${qs}`)
  return {
    total: res.total || 0,
    data: Array.isArray(res.data) ? res.data : [],
    source: res.source || 'src-kohcamp-official',
    sourceName: res.sourceName || '腾讯王者营地官方战绩网关'
  }
}

/**
 * 4.1 获取单场对决详情 (F13)
 */
export async function fetchEventDetail(eventId: string): Promise<EventRecord | null> {
  const res = await requestApi<any>(`/api/v1/events/${encodeURIComponent(eventId)}`)
  return res.data || null
}

/**
 * 5. 获取第三方阵容快照大盘 (hokace.wiki)
 */
export async function fetchLineupSnapshots(): Promise<{ lineups: LineupSnapshot[]; sourceNotice: string; dataAsOf: string }> {
  try {
    const res = await requestApi<any>('/api/v1/lineups')
    return {
      lineups: Array.isArray(res.data) ? res.data : [],
      sourceNotice: res.sourceNotice || '第三方阵容环境参考',
      dataAsOf: res.dataAsOf || new Date().toISOString()
    }
  } catch (err) {
    console.error('[API Client] fetchLineupSnapshots 失败:', err)
    return {
      lineups: [],
      sourceNotice: '无法连接阵容快照服务',
      dataAsOf: new Date().toISOString()
    }
  }
}

/**
 * 5.1 获取单套阵容详情 (F13)
 */
export async function fetchLineupDetail(lineupId: string): Promise<LineupSnapshot | null> {
  const res = await requestApi<any>(`/api/v1/lineups/${encodeURIComponent(lineupId)}`)
  return res.data || null
}

/**
 * 6. 获取数据源健康度与同步状态
 */
export async function fetchDataStatus(): Promise<{
  sources: DataSourceStatus[]
  totalMatches: number
  totalPlayers: number
  totalEvents: number
  lastUpdated: string
}> {
  const res = await requestApi<any>('/api/v1/data-status')
  return {
    sources: res.sources || [],
    totalMatches: res.totalMatches || 0,
    totalPlayers: res.totalPlayers || 0,
    totalEvents: res.totalEvents || 0,
    lastUpdated: res.lastUpdated || new Date().toISOString()
  }
}

/**
 * 7. 导入战绩流水 (带严格校验，支持真实反馈与错误提示 F08)
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
 * 7.1 查询指定导入批次 (F13)
 */
export async function fetchImportBatch(batchId: string): Promise<any> {
  const res = await requestApi<any>(`/api/v1/admin/imports/${encodeURIComponent(batchId)}`)
  return res.data
}

/**
 * 7.2 人工校对工作台 6 席位持久化入库确认 (F05)
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
    rankScore?: number
    rankText?: string
    odds?: number
    supportCount?: number
    finalRank: number
    commander?: string
    lineup?: string
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
 * 8. 触发外部数据源同步 (F03)
 */
export async function syncSource(sourceId: string): Promise<any> {
  const res = await requestApi<any>(`/api/v1/admin/sources/${encodeURIComponent(sourceId)}/sync`, {
    method: 'POST'
  })
  return res
}
