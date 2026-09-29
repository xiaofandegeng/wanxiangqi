// 王者万象棋数据站 - 万象棋大数据 (datawxq.com / api.datatft.com) 第三方聚合适配器
// v3 S6/P2-B 治理版（任务书 §3.2、F06、F09）：
// 1. 只保留来源真实公布字段：赛事积分/排名（tournament* 分列），缺失 → null
// 2. 删除全部推导：赛事积分→天梯分/段位换算、按列表序号赋 T0/T1/T2、编造称号/风格/区服
// 3. 签名密钥走环境变量 WXQ_DATATFT_SIGN_SECRET（仓库与日志不落密钥；未配置即拒绝调用）
// 4. 本源默认 UNCONFIGURED，需 WXQ_ENABLE_DATATFT=1 且密钥就绪才可同步（服务层 409 门禁）

import crypto from 'node:crypto'

export const DATATFT_ADAPTER_METADATA = {
  sourceId: 'src-datatft-platform',
  name: '万象棋大数据平台 (datawxq.com)',
  type: 'BIG_DATA_AGGREGATE',
  targetUrl: 'https://www.datawxq.com/',
  apiUrl: 'https://api.datatft.com',
  capabilities: ['player_identity', 'tournament_details', 'lineup_aggregate', 'commander_rankings', 'hero_rankings'],
  license: 'API 契约与授权范围未核实（同步默认关闭）'
}

const NONCE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function generateNonce(len = 16) {
  let s = ''
  for (let i = 0; i < len; i++) {
    s += NONCE_CHARS.charAt(Math.floor(Math.random() * NONCE_CHARS.length))
  }
  return s
}

/**
 * 构造 api.datatft.com 安全鉴权头（密钥来自环境，缺失即拒绝 —— 不降级不硬编码）
 */
export function buildAuthHeaders() {
  const secret = process.env.WXQ_DATATFT_SIGN_SECRET
  if (!secret) {
    throw new Error('缺少 WXQ_DATATFT_SIGN_SECRET 环境变量：datatft 签名密钥不入仓库（任务书红线），需在部署环境显式提供')
  }
  const did = 'did' + generateNonce(23)
  const t = String(Date.now())
  const nonce = generateNonce(16)
  const signature = crypto.createHash('md5').update(t + nonce + did + secret).digest('hex')

  return {
    t,
    did,
    nonce,
    signature,
    'Accept-Language': 'CN',
    'Browser-Language': 'ZH-CN',
    'App-Platform': 'wzwxq'
  }
}

/**
 * 拉取赛事选手列表及赛事轮次。
 * 仅保留来源公布字段（排名/积分/昵称/UID）—— 天梯分/段位/称号/风格/区服
 * 均为推导或编造，一律不产出（F06）。
 */
export async function fetchRealTournaments(tournamentId = 'd5a16d4c-8bd6-4da2-85a2-6d2d51fbaf64') {
  const headers = buildAuthHeaders()
  const url = `${DATATFT_ADAPTER_METADATA.apiUrl}/wzwxq/tournaments/${tournamentId}`

  const res = await fetch(url, { headers })
  if (!res.ok) {
    throw new Error(`请求赛事数据失败: HTTP ${res.status}`)
  }
  const json = await res.json()
  if (!json.success || !json.data) {
    throw new Error(`赛事接口响应异常: ${json.message || '未知错误'}`)
  }

  const tData = json.data
  const standingsList = (tData.standings && tData.standings.length > 0) ? tData.standings : (tData.players || [])
  const players = standingsList.map((p, idx) => ({
    id: `p-${p.playerId || p.uid || p.displayName}`,
    nickname: p.displayName || p.nickname || `选手-${idx + 1}`,
    gameUid: p.uid || null,
    // 来源公布字段：缺失 → null，不补 0/不推导
    tournamentRank: Number.isFinite(Number(p.rank)) ? Number(p.rank) : null,
    tournamentPoints: Number.isFinite(Number(p.points)) ? Number(p.points) : null,
    tournamentName: tData.name || null
  }))

  return {
    tournamentId: tData.id,
    name: tData.name,
    season: tData.season,
    status: tData.status,
    totalPlayers: players.length,
    players,
    days: tData.days || []
  }
}

/**
 * 拉取全服聚合阵容快照。缺失指标 → null（禁 0/3.5 兜底，F09）；
 * 不按列表序号编造 tier；名称用来源字段或 lineupKey（不附加编造的“T0 级体系”文案）。
 */
export async function fetchRealLineups(pageSize = 50) {
  const headers = {
    ...buildAuthHeaders(),
    'Content-Type': 'application/json'
  }
  const url = `${DATATFT_ADAPTER_METADATA.apiUrl}/wzwxq/lineups/search`
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ page: 1, pageSize })
  })

  if (!res.ok) {
    throw new Error(`请求阵容数据失败: HTTP ${res.status}`)
  }
  const json = await res.json()
  if (json.code !== 1 || !json.data) {
    throw new Error(`阵容接口响应异常: ${json.message || 'code=' + json.code}`)
  }

  const { sampleCount, total, lineups } = json.data
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)
  const mapped = (lineups || []).map((l, idx) => {
    const primaryCmd = (l.commanders && l.commanders[0]?.name) || null
    const coreHeroIds = (l.coreHeroes || []).map(h => typeof h === 'object' ? h.id : h)

    return {
      id: `lineup-real-${l.lineupKey?.replace(/\|/g, '-') || (idx + 1)}`,
      sourceId: DATATFT_ADAPTER_METADATA.sourceId,
      lineupKey: l.lineupKey || null,
      lineupName: l.name || l.lineupKey || `lineup-${idx + 1}`, // 中性标识，不含编造分级文案
      tier: null, // 来源未公布分级 → 不按序号编造
      commander: primaryCmd,
      coreHeroes: coreHeroIds,
      sampleCount: num(l.count),
      winRate: num(l.firstRate),
      top3Rate: num(l.top3Rate),
      avgRank: num(l.avgPlacement),
      appearanceRate: num(l.appearanceRate),
      lineupCode: l.lineupCode || null,
      snapshotVersion: null,
      windowText: null, // 来源未公布窗口说明 → null（禁止编造“近 7 日 113 万局”）
      scope: null,
      windowStart: null,
      windowEnd: null,
      sampleUnit: '局',
      rateUnit: 'RATIO_0_1',
      dataCutoffAt: null, // 来源未给数据截止时间；updatedAt 仅代表采集时间
      updatedAt: new Date().toISOString()
    }
  })

  return {
    sampleCount,
    totalLineups: total,
    lineups: mapped
  }
}

/**
 * 拉取棋手胜率榜（缺失指标 → null，不做 toFixed 崩溃路径）
 */
export async function fetchRealCommanders(time = 7) {
  const headers = buildAuthHeaders()
  const url = `${DATATFT_ADAPTER_METADATA.apiUrl}/wzwxq/rankings/commanders?time=${time}&version=v1`
  const res = await fetch(url, { headers })
  if (!res.ok) {
    throw new Error(`请求棋手天梯榜失败: HTTP ${res.status}`)
  }
  const json = await res.json()
  if (json.code !== 1 || !json.data) {
    throw new Error(`棋手天梯榜异常: ${json.message || 'code=' + json.code}`)
  }

  const round2 = (v) => (Number.isFinite(Number(v)) ? Number(Number(v).toFixed(2)) : null)
  const round4 = (v) => (Number.isFinite(Number(v)) ? Number(Number(v).toFixed(4)) : null)

  return {
    base: json.data.base,
    commanders: (json.data.rows || []).map(c => ({
      id: c.id,
      name: c.name,
      sampleCount: Number.isFinite(Number(c.count)) ? Number(c.count) : null,
      avgRank: round2(c.avgPlacement),
      winRate: round4(c.firstRate),
      top3Rate: round4(c.top3Rate)
    }))
  }
}
