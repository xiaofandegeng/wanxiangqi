import { getAdminToken, setAdminToken } from './index'

declare const __WXQ_LOCAL_RESEARCH__: boolean
export const localResearch = typeof __WXQ_LOCAL_RESEARCH__ !== 'undefined' && __WXQ_LOCAL_RESEARCH__
export { getAdminToken, setAdminToken }

export interface Seat {
  rank: number
  nickname: string
  uid: string | null
}

export interface ResearchMatch {
  id: string
  sourceKey: string
  mode: string
  playedAt: string
  version: string
  platform: string
  region: string
  seats: Seat[]
  status: string
  evidenceId: string
  evidenceLocator: string
  verifiedAt: string | null
}

export interface PlayerStat {
  key: string
  mode: string
  version: string
  nickname: string
  uid: string
  platform: string
  region: string
  matches: number
  wins: number
  top3: number
  avgRank: number
  winRate: number
  top3Rate: number
}

export interface Stats {
  eligibleMatches: number
  unlinkedSeats: number
  players: PlayerStat[]
}

export async function researchApi<T>(action: string, body?: unknown): Promise<T> {
  const token = getAdminToken()
  if (!token && !(localResearch && body === undefined && /^(catalog|matches|stats|observations)$/.test(action))) {
    throw new Error('请先配置管理凭证')
  }

  const response = await fetch('/api/v1/admin/prediction/' + action, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })

  const json = await response.json()
  if (!response.ok) {
    throw new Error(response.status === 401 ? '凭证无效，请填写当前后端的管理凭证' : json.error || `请求失败 ${response.status}`)
  }
  return json.data as T
}
