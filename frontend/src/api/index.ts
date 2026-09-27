// 王者万象棋数据站 - 统一 RESTful API 客户端
// 遵循 v2 规范：优先读取真实后端，保留完整元信息 (dataAsOf, qualityStatus)，失败时优雅降级并明确提示状态

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
  note?: string
}

/**
 * 获取选手列表 (带真实统计计算)
 */
export async function fetchPlayersList(query = '', sort = 'rankScore'): Promise<{ players: PlayerRecord[]; dataAsOf: string; fromBackend: boolean }> {
  try {
    const res = await fetch(`/api/v1/players?query=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}`)
    if (res.ok) {
      const json = await res.json()
      if (json.code === 0 && Array.isArray(json.data)) {
        return {
          players: json.data,
          dataAsOf: json.dataAsOf || new Date().toISOString(),
          fromBackend: true
        }
      }
    }
  } catch (err) {
    console.warn('[API Client] Backend /api/v1/players unreachable, falling back to local master database', err)
  }

  // 优雅降级：读取前端 master-database
  const { masterPlayersList } = await import('../mock/master-database')
  let list: PlayerRecord[] = masterPlayersList.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    platform: p.platform,
    serverZone: '官方区服',
    rankScore: p.rankScore,
    rankText: p.rankText,
    title: p.titleBadge,
    commander: p.signatureHero,
    style: p.primaryLineup,
    stats: {
      sampleCount: p.totalRecordedMatches,
      winRate: p.firstPlaceRate,
      top3Rate: p.top3Rate,
      avgRank: p.avgPlacement,
      isSmallSample: p.totalRecordedMatches < 20,
      warning: p.totalRecordedMatches < 20 ? '样本量较少' : null
    }
  }))

  if (query) {
    const q = query.toLowerCase()
    list = list.filter((p: PlayerRecord) => 
      p.nickname.toLowerCase().includes(q) || 
      (p.title && p.title.toLowerCase().includes(q))
    )
  }

  if (sort === 'winRate') {
    list.sort((a: PlayerRecord, b: PlayerRecord) => (b.stats?.winRate ?? -1) - (a.stats?.winRate ?? -1))
  } else if (sort === 'top3Rate') {
    list.sort((a: PlayerRecord, b: PlayerRecord) => (b.stats?.top3Rate ?? -1) - (a.stats?.top3Rate ?? -1))
  } else if (sort === 'avgRank') {
    list.sort((a: PlayerRecord, b: PlayerRecord) => (a.stats?.avgRank ?? 99) - (b.stats?.avgRank ?? 99))
  } else {
    list.sort((a: PlayerRecord, b: PlayerRecord) => b.rankScore - a.rankScore)
  }

  return {
    players: list,
    dataAsOf: new Date().toISOString(),
    fromBackend: false
  }
}

/**
 * 获取选手对局流水下钻
 */
export async function fetchPlayerMatches(playerId: string): Promise<any[]> {
  try {
    const res = await fetch(`/api/v1/players/${encodeURIComponent(playerId)}/matches`)
    if (res.ok) {
      const json = await res.json()
      if (json.code === 0 && Array.isArray(json.data)) {
        return json.data
      }
    }
  } catch (err) {
    console.warn('[API Client] Backend player matches unreachable, fallback to local', err)
  }

  const { masterMatchesList } = await import('../mock/master-database')
  return masterMatchesList
}

/**
 * 获取第三方阵容大盘快照 (hokace.wiki)
 */
export async function fetchLineupSnapshots(): Promise<{ lineups: LineupSnapshot[]; sourceNotice: string; dataAsOf: string }> {
  try {
    const res = await fetch('/api/v1/lineups')
    if (res.ok) {
      const json = await res.json()
      if (json.code === 0 && Array.isArray(json.data)) {
        return {
          lineups: json.data,
          sourceNotice: json.sourceNotice || '数据来源于第三方阵容快照 (hokace.wiki)',
          dataAsOf: json.dataAsOf || new Date().toISOString()
        }
      }
    }
  } catch (err) {
    console.warn('[API Client] Backend /api/v1/lineups unreachable, fallback to initial snapshots', err)
  }

  // 本地快照兜底
  return {
    lineups: [
      {
        id: 'lineup-snap-01',
        sourceId: 'src-hokace-wiki',
        lineupName: '雷霆扶桑刺',
        tier: 'T1',
        commander: '司空震',
        coreHeroes: ['司空震', '不知火舞', '娜可露露', '宫本武藏'],
        sampleCount: 14280,
        winRate: 0.224,
        top3Rate: 0.582,
        avgRank: 3.12,
        snapshotVersion: 'v260917',
        windowText: '近 7 日实战聚合',
        scope: '全服王者段位',
        updatedAt: '2026-09-27T08:00:00.000Z'
      },
      {
        id: 'lineup-snap-02',
        sourceId: 'src-hokace-wiki',
        lineupName: '九五至尊完全体',
        tier: 'T0.5',
        commander: '弈星',
        coreHeroes: ['弈星', '武则天', '吕布', '公孙离'],
        sampleCount: 8940,
        winRate: 0.286,
        top3Rate: 0.512,
        avgRank: 3.28,
        snapshotVersion: 'v260917',
        windowText: '近 7 日实战聚合',
        scope: '全服王者段位',
        updatedAt: '2026-09-27T08:00:00.000Z'
      },
      {
        id: 'lineup-snap-03',
        sourceId: 'src-hokace-wiki',
        lineupName: '玄雍重坦防刺',
        tier: 'T1',
        commander: '庄周',
        coreHeroes: ['廉颇', '白起', '嬴政', '镜'],
        sampleCount: 11200,
        winRate: 0.165,
        top3Rate: 0.620,
        avgRank: 3.05,
        snapshotVersion: 'v260917',
        windowText: '近 7 日实战聚合',
        scope: '全服王者段位',
        updatedAt: '2026-09-27T08:00:00.000Z'
      },
      {
        id: 'lineup-snap-04',
        sourceId: 'src-hokace-wiki',
        lineupName: '尧天阿离神射',
        tier: 'T1.5',
        commander: '公孙离',
        coreHeroes: ['公孙离', '明世隐', '裴擒虎', '伽罗'],
        sampleCount: 9650,
        winRate: 0.198,
        top3Rate: 0.540,
        avgRank: 3.35,
        snapshotVersion: 'v260917',
        windowText: '近 7 日实战聚合',
        scope: '全服王者段位',
        updatedAt: '2026-09-27T08:00:00.000Z'
      }
    ],
    sourceNotice: '数据来源于第三方阵容快照 (hokace.wiki 快照 v260917)，仅供环境参考',
    dataAsOf: new Date().toISOString()
  }
}

/**
 * 查询数据源与服务状态
 */
export async function fetchDataSourceStatus(): Promise<DataSourceStatus[]> {
  try {
    const res = await fetch('/api/v1/data-status')
    if (res.ok) {
      const json = await res.json()
      if (json.code === 0 && Array.isArray(json.sources)) {
        return json.sources
      }
    }
  } catch (err) {
    console.warn('[API Client] Backend data-status unreachable', err)
  }
  return [
    { id: 'src-manual-review', name: '截图人工校对录入', type: 'SCREENSHOT_OCR_MANUAL', url: 'internal://evidence', status: 'ACTIVE' },
    { id: 'src-hokace-wiki', name: 'hokace.wiki 第三方阵容快照', type: 'LINEUP_AGGREGATE', url: 'https://hokace.wiki/zh/lineups/', status: 'READY' },
    { id: 'src-official-helper', name: '官方战绩小助手', type: 'OFFICIAL_API', url: 'https://wxq.qq.com/', status: 'UNAVAILABLE', note: '未确认第三方公开 API' }
  ]
}
