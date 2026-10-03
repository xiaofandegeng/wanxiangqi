// v6 M1-5 · 阵容库视图（原位保留的 lineup-roster）继续满足既有铁律：
// 按来源分组陈列、缺失字段如实「未公布」、空态不编造、API 失败如实呈现。

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp } from 'vue'
import LineupRoster from '../src/views/lineup-roster.vue'

const mocks = vi.hoisted(() => ({
  lineups: [] as any[],
  statusSources: [] as any[]
}))

vi.mock('../src/api', () => ({
  fetchLineupSnapshots: vi.fn(async () => ({
    lineups: mocks.lineups,
    sourceNotice: '测试来源口径说明',
    dataAsOf: '2026-10-03T08:00:00Z'
  })),
  fetchDataStatus: vi.fn(async () => ({
    sources: mocks.statusSources,
    recentSyncJobs: [],
    counts: null,
    lastUpdated: '2026-10-03T08:00:00Z'
  }))
}))

async function mountView(): Promise<HTMLElement> {
  const app = createApp(LineupRoster)
  const host = document.createElement('div')
  document.body.appendChild(host)
  app.mount(host)
  // 等待 onMounted 的两次异步加载完成
  await new Promise(r => setTimeout(r, 20))
  return host
}

function sampleLineup(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lm-test-1', sourceId: 'src-hokace-wiki', sourceName: 'hokace 阵容工作台',
    sourceStatus: 'READY', sourceType: 'THIRD_PARTY',
    lineupName: '示例阵容', tier: null, commander: null, coreHeroes: ['英雄A'],
    sampleCount: 1200, winRate: 0.12, top3Rate: 0.48, avgRank: null,
    snapshotVersion: 'v260924', windowText: '7日对局快照', scope: null,
    updatedAt: '2026-10-01T00:00:00Z', stale: false,
    ...overrides
  }
}

beforeEach(() => {
  mocks.lineups = []
  mocks.statusSources = []
  document.body.innerHTML = ''
})

describe('阵容库视图（v6 原位保留）', () => {
  it('空库时如实呈现空态，不编造阵容', async () => {
    const host = await mountView()
    expect(host.textContent).toContain('暂无已收录的阵容快照')
    expect(host.textContent).not.toContain('lm-test-1')
  })

  it('按来源分组陈列；缺失字段（梯级/平均名次）如实「未公布」', async () => {
    mocks.lineups = [
      sampleLineup(),
      sampleLineup({ id: 'lm-test-2', sourceId: 'src-other-wiki', sourceName: '另一来源', winRate: null })
    ]
    const host = await mountView()
    expect(host.textContent).toContain('hokace 阵容工作台')
    expect(host.textContent).toContain('另一来源')
    // 平均名次缺失 → 未公布（不做 0 兜底）
    expect(host.textContent).toContain('未公布')
  })

  it('来源口径提示（sourceNotice）如实透传服务端说明', async () => {
    mocks.lineups = [sampleLineup()]
    const host = await mountView()
    expect(host.textContent).toContain('测试来源口径说明')
  })

  it('页面声明第三方快照语义（不代表个人真实战绩）', async () => {
    mocks.lineups = [sampleLineup()]
    const host = await mountView()
    expect(host.textContent).toContain('不代表任何个人真实战绩')
  })
})
