// v6 M2-7 · 阵容研习库视图（稳定阵容手册 + 来源统计子对象契约）：
// 手册卡片按真实字段渲染、统计缺失如实「未公布/暂无统计」、空态不编造、API 失败如实呈现。

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp } from 'vue'
import LineupRoster from '../src/views/lineup-roster.vue'

const mocks = vi.hoisted(() => ({
  manuals: [] as any[]
}))

vi.mock('../src/api', () => ({
  fetchLineups: vi.fn(async () => ({
    manuals: mocks.manuals,
    statsNotice: '测试统计口径说明',
    dataAsOf: '2026-10-03T08:00:00Z'
  }))
}))

async function mountView(): Promise<HTMLElement> {
  const app = createApp(LineupRoster)
  const host = document.createElement('div')
  document.body.appendChild(host)
  app.mount(host)
  // 等待 onMounted 异步加载完成
  await new Promise(r => setTimeout(r, 20))
  return host
}

function sampleManual(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lu-test-1',
    slug: 'lu-test-1',
    displayName: '示例阵容手册',
    oneLineSummary: '一套围绕英雄A成型的入门阵容',
    difficulty: 'LOW',
    newbieFitRationale: '过渡平缓，容错高',
    gameVersion: { versionId: 'v261001' },
    commander: { id: 'cmd-1', slug: 'cmd-1', displayName: '棋手甲' },
    components: [
      { entityId: 'ent-1', slug: 'hero-a', displayName: '英雄A', kind: 'HERO', role: 'CORE_OUTPUT', necessity: 'REQUIRED' },
      { entityId: 'ent-2', slug: null, displayName: '英雄B', kind: 'HERO', role: 'FRONTLINE', necessity: 'OPTIONAL' }
    ],
    hasOpenRecheck: false,
    publishedAt: '2026-10-01T00:00:00Z',
    snapshots: [
      {
        id: 'ls-1', sourceId: 'src-hokace-wiki', sourceName: 'hokace 阵容工作台',
        lineupName: '示例阵容', tier: null, commander: null, coreHeroes: [],
        sampleCount: 1200, winRate: 0.12, top3Rate: 0.48, avgRank: null,
        snapshotVersion: 'v260924', windowText: '7日对局快照', scope: null,
        updatedAt: '2026-10-01T00:00:00Z'
      }
    ],
    ...overrides
  }
}

beforeEach(() => {
  mocks.manuals = []
  document.body.innerHTML = ''
})

describe('阵容研习库视图（M2-7 手册契约）', () => {
  it('空库时如实呈现空态，不编造手册', async () => {
    const host = await mountView()
    expect(host.textContent).toContain('暂无已发布的阵容手册')
    expect(host.textContent).not.toContain('示例阵容手册')
  })

  it('手册卡片渲染难度/棋手/构成；构成标注角色与必需性', async () => {
    mocks.manuals = [sampleManual()]
    const host = await mountView()
    expect(host.textContent).toContain('示例阵容手册')
    expect(host.textContent).toContain('难度：低')
    expect(host.textContent).toContain('棋手甲')
    expect(host.textContent).toContain('核心输出')
    expect(host.textContent).toContain('英雄A')
  })

  it('来源统计子对象按来源口径陈列；缺失字段（平均名次等）不 0 兜底', async () => {
    mocks.manuals = [sampleManual()]
    const host = await mountView()
    expect(host.textContent).toContain('hokace 阵容工作台')
    expect(host.textContent).toContain('12.0%')
    expect(host.textContent).toContain('1,200')
    expect(host.textContent).toContain('7日对局快照')
  })

  it('无映射快照的手册如实显示「暂无统计」', async () => {
    mocks.manuals = [sampleManual({ snapshots: [] })]
    const host = await mountView()
    expect(host.textContent).toContain('暂无统计')
  })

  it('统计口径提示（statsNotice）如实透传服务端说明', async () => {
    mocks.manuals = [sampleManual()]
    const host = await mountView()
    expect(host.textContent).toContain('测试统计口径说明')
  })

  it('页面声明第三方统计语义（不代表个人真实战绩）', async () => {
    mocks.manuals = [sampleManual()]
    const host = await mountView()
    expect(host.textContent).toContain('不代表任何个人真实战绩')
  })

  it('仅看新手友好筛选：难度=LOW 保留，HIGH 被过滤', async () => {
    mocks.manuals = [
      sampleManual(),
      sampleManual({ id: 'lu-2', slug: 'lu-2', displayName: '高手阵容', difficulty: 'HIGH', snapshots: [] })
    ]
    const host = await mountView()
    const toggle = host.querySelector('.sort-tab-btn') as HTMLButtonElement
    expect(toggle).toBeTruthy()
    toggle.click()
    await new Promise(r => setTimeout(r, 10))
    expect(host.textContent).toContain('示例阵容手册')
    expect(host.textContent).not.toContain('高手阵容')
  })
})
