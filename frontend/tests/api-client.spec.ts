// v6 M1-5 · API 客户端收敛验收：
// 1. 管理凭证机制：缺失即拒绝发起（不静默降级）；配置后注入 Bearer；
// 2. 映射层契约：lineups / data-status 新形态（sources/recentSyncJobs/counts）；
// 3. 错误语义透传：HTTP code_name / status 挂到 Error 上；
// 4. 旧赛事/玩家接口在客户端不再存在（退役请求已删除）。

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getAdminToken, setAdminToken, hasAdminToken, AdminTokenMissingError,
  fetchLineups, fetchDataStatus, uploadEvidence, syncSource,
  fetchSyncJobs, fetchEvidences,
  fetchLearnPath, fetchCatalog, fetchLineupManual
} from '../src/api'

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  }
}

describe('管理凭证机制', () => {
  beforeEach(() => {
    setAdminToken(null)
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { code: 0, data: [] })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('未配置凭证时管理请求直接拒绝（fetch 不发起）', async () => {
    await expect(fetchEvidences()).rejects.toBeInstanceOf(AdminTokenMissingError)
    expect((globalThis as any).fetch).not.toHaveBeenCalled()
  })

  it('配置凭证后注入 Authorization Bearer 头', async () => {
    setAdminToken('tok-v6')
    expect(hasAdminToken()).toBe(true)
    await fetchEvidences()
    const call = (globalThis as any).fetch.mock.calls[0]
    expect(call[0]).toBe('/api/v1/admin/evidences')
    expect(call[1].headers.get('Authorization')).toBe('Bearer tok-v6')
  })

  it('凭证持久化到 localStorage 并可读取', () => {
    setAdminToken('tok-persist')
    expect(localStorage.getItem('wxq-admin-token')).toBe('tok-persist')
    expect(getAdminToken()).toBe('tok-persist')
    setAdminToken(null)
    expect(localStorage.getItem('wxq-admin-token')).toBe(null)
    expect(hasAdminToken()).toBe(false)
  })

  it('公开只读接口（lineups）匿名可请求', async () => {
    await fetchLineups()
    const call = (globalThis as any).fetch.mock.calls[0]
    expect(call[0]).toBe('/api/v1/lineups')
  })
})

describe('响应映射（v6 新形态）', () => {
  beforeEach(() => {
    setAdminToken(null)
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchLineups 映射 data/statsNotice/dataAsOf（稳定手册 + 统计子对象契约）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {
      code: 0,
      total: 1,
      data: [{
        id: 'lu-1', slug: 'lu-1', displayName: '示例阵容手册',
        oneLineSummary: null, difficulty: 'LOW', newbieFitRationale: null,
        gameVersion: { versionId: 'v261001' }, commander: null,
        components: [], hasOpenRecheck: false, publishedAt: '2026-10-03T00:00:00Z',
        snapshots: [{
          id: 'ls-1', sourceId: 'src-hokace-wiki', lineupName: '示例阵容',
          tier: null, commander: null, coreHeroes: [], sampleCount: 100,
          winRate: 0.1, top3Rate: 0.5, avgRank: null, snapshotVersion: 'v260924',
          windowText: '7日对局快照', scope: null, updatedAt: '2026-10-03T00:00:00Z'
        }]
      }],
      statsNotice: '统计口径说明',
      dataAsOf: '2026-10-03T08:00:00Z'
    })))
    const res = await fetchLineups()
    expect(res.manuals).toHaveLength(1)
    expect(res.manuals[0].displayName).toBe('示例阵容手册')
    expect(res.manuals[0].snapshots[0].sampleCount).toBe(100)
    expect(res.statsNotice).toBe('统计口径说明')
    expect(res.dataAsOf).toBe('2026-10-03T08:00:00Z')
  })

  it('fetchLearnPath 映射 stages/total；空阶段如实为空数组', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {
      code: 0,
      stages: [
        { stage: 'A', lessons: [{ id: 'l-1', slug: 'l-1', title: '第一课', stage: 'A', sortOrder: 1, objectives: null, gameVersion: null, hasOpenRecheck: false, publishedAt: null, prerequisites: [] }] },
        { stage: 'B', lessons: [] }
      ],
      total: 1
    })))
    const res = await fetchLearnPath()
    expect(res.total).toBe(1)
    expect(res.stages).toHaveLength(2)
    expect(res.stages[0].lessons[0].title).toBe('第一课')
    expect(res.stages[1].lessons).toEqual([])
  })

  it('fetchCatalog 携带 kind/q 查询参数并映射 data 数组', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {
      code: 0, total: 1,
      data: [{ id: 'ent-1', slug: 'hero-a', kind: 'HERO', displayName: '英雄A', gameVersion: null, publishedAt: null, factsSummary: null }]
    })))
    const items = await fetchCatalog({ kind: 'heroes', q: '英雄' })
    const call = (globalThis as any).fetch.mock.calls[0]
    expect(call[0]).toBe('/api/v1/catalog?kind=heroes&q=' + encodeURIComponent('英雄'))
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('HERO')
  })

  it('fetchLineupManual 404 → null（未发布/不存在由视图如实呈现）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, {
      code: 404, error: '阵容 [ghost] 不存在或未发布'
    })))
    const res = await fetchLineupManual('ghost')
    expect(res).toBeNull()
  })

  it('fetchDataStatus 映射 sources/recentSyncJobs/counts（新计数形态）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {
      code: 0,
      sources: [{ id: 'src-hokace-wiki', sourceId: 'src-hokace-wiki', name: 'hokace', type: 'THIRD_PARTY', status: 'READY' }],
      recentSyncJobs: [{ id: 1, sourceId: 'src-hokace-wiki', status: 'SUCCESS' }],
      counts: { sources: 5, lineups: 35, lineupsActive: 35, evidences: 0 },
      lastUpdated: '2026-10-03T08:00:00Z'
    })))
    const status = await fetchDataStatus()
    expect(status.sources).toHaveLength(1)
    expect(status.recentSyncJobs[0].status).toBe('SUCCESS')
    expect(status.counts?.lineups).toBe(35)
    // 旧 totalMatches/totalPlayers/totalEvents 计数不复存在
    expect(status.counts).not.toHaveProperty('totalMatches')
    expect(status.counts).not.toHaveProperty('totalPlayers')
  })

  it('错误响应透传 status 与 code_name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(409, {
      code: 409, error: 'datatft 平台同步已随 v6 转型停用', code_name: 'SOURCE_DISABLED'
    })))
    setAdminToken('tok')
    const err = await syncSource('src-datatft-platform').catch(e => e)
    expect(err).toBeInstanceOf(Error)
    expect(err.status).toBe(409)
    expect(err.code).toBe('SOURCE_DISABLED')
    expect(err.message).toContain('停用')
  })

  it('fetchSyncJobs 附加 limit 参数', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { code: 0, total: 0, data: [] })))
    setAdminToken('tok')
    await fetchSyncJobs(5)
    const call = (globalThis as any).fetch.mock.calls[0]
    expect(call[0]).toBe('/api/v1/admin/sync-jobs?limit=5')
  })
})

describe('素材上传（独立二进制通道）', () => {
  beforeEach(() => {
    setAdminToken(null)
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('无凭证直接拒绝，不构造 FormData/请求', async () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    await expect(uploadEvidence(blob, { capturedAt: '2026-10-03T00:00:00Z' }))
      .rejects.toBeInstanceOf(AdminTokenMissingError)
  })

  it('元信息走 query，二进制作为 body 直传', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(201, {
      code: 0,
      evidenceId: 'ev-1',
      deduplicated: false,
      evidence: { id: 'ev-1', status: 'PENDING', hasOriginal: true }
    })))
    setAdminToken('tok')
    const blob = new Blob(['png-bytes'], { type: 'image/png' })
    const res = await uploadEvidence(blob, {
      capturedAt: '2026-10-03T00:00:00Z',
      kind: 'CONTENT_ASSET',
      usageScope: 'INTERNAL_ONLY'
    })
    expect(res.evidence.status).toBe('PENDING')
    const call = (globalThis as any).fetch.mock.calls[0]
    const [path] = call as [string, any]
    expect(path).toContain('/api/v1/admin/evidences/upload?')
    expect(path).toContain('capturedAt=2026-10-03T00%3A00%3A00Z')
    expect(path).toContain('kind=CONTENT_ASSET')
    expect(call[1].body).toBe(blob)
  })
})

describe('v6 退役请求已从客户端删除', () => {
  it('api 模块不再导出任何赛事/选手/对局/导入请求函数', async () => {
    const api = await import('../src/api')
    const retired = [
      'fetchEventsToday', 'fetchEventDetail', 'fetchPlayersList', 'fetchPlayerProfile',
      'fetchMatchesList', 'fetchAdminMatches', 'importMatchRecords', 'verifyMatch',
      'confirmSlotAudit', 'fetchPlayersRoster'
    ]
    for (const name of retired) {
      expect((api as any)[name]).toBeUndefined()
    }
  })
})
