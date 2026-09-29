// V16 · 未知/零样本玩家页面无默认数值（P2-C 前端去虚构验收）
// 任务书 §5 V16：未知玩家页面不得出现任何默认数值（v2 缺陷：15 局 / 22% / 65% / 2.8 式填充）。
// 以真实组件挂载（happy-dom + 真路由 + mock API 层）断言两态：
//   A. 已登记但零已核验样本 → N=0、比率 '—'、天梯/赛事 '未采集'、如实空态文案
//   B. 从未录入的玩家 → “未找到该选手”空视图，绝不渲染伪造档案

// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { createApp } from 'vue'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import PlayerProfile from '../src/views/player-profile.vue'

const mocks = vi.hoisted(() => ({
  players: [] as any[],
  stats: null as any
}))

vi.mock('../src/api', () => ({
  fetchPlayersList: vi.fn(async () => ({
    players: mocks.players,
    total: mocks.players.length,
    dataAsOf: '2026-09-29T00:00:00Z'
  })),
  fetchPlayerStats: vi.fn(async () => mocks.stats),
  fetchPlayerMatches: vi.fn(async () => [])
}))

const ZERO_STATS = {
  sampleCount: 0,
  firstPlaces: 0,
  top3Places: 0,
  winRate: null,
  top3Rate: null,
  avgRank: null,
  coverageNote: '已收录 0 局',
  isSmallSample: true,
  warning: '暂无已核验战绩'
}

const KNOWN_ZERO_SAMPLE_PLAYER = {
  id: 'p-zero-sample',
  nickname: '零样本选手',
  rankScore: null,
  rankText: null,
  platform: null,
  serverZone: null,
  ladderScore: null,
  ladderSource: null,
  ladderAt: null,
  tournamentPoints: null,
  tournamentName: null,
  tournamentRank: null,
  stats: ZERO_STATS
}

async function mountProfile(playerId: string): Promise<{ dom: HTMLElement; router: Router; unmount: () => void }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/players/:id', component: PlayerProfile }]
  })
  await router.push(`/players/${playerId}`)
  await router.isReady()

  const app = createApp({ render: () => null })
  app.use(router)
  app.component('PlayerProfile', PlayerProfile)

  const host = document.createElement('div')
  // 挂载真实路由视图组件（经 router-view 之外的直接渲染，绕开异步组件加载）
  const vm = createApp(PlayerProfile)
  vm.use(router)
  vm.mount(host)

  // 等待 onMounted 内 Promise.all 数据加载完成（两次宏任务足够）
  await new Promise(r => setTimeout(r, 0))
  await new Promise(r => setTimeout(r, 0))

  return { dom: host, router, unmount: () => vm.unmount() }
}

describe('V16: 未知/零样本玩家页面无默认数值', () => {
  it('A: 已登记但零已核验样本 → N=0、比率 —、未采集、如实空态（无任何编造数字）', async () => {
    mocks.players = [KNOWN_ZERO_SAMPLE_PLAYER]
    mocks.stats = ZERO_STATS

    const { dom, unmount } = await mountProfile('p-zero-sample')
    try {
      const text = dom.textContent || ''

      // 已核验场次如实显示 0
      expect(text).toContain('已核验场次')
      expect(dom.querySelector('.metric-num')?.textContent?.trim()).toBe('0')

      // 比率/均名缺失 → '—' 占位（≥3 处：登顶率/前三率/平均名次）
      const nums = Array.from(dom.querySelectorAll('.metric-num')).map(n => n.textContent?.trim())
      expect(nums.filter(t => t === '—').length).toBeGreaterThanOrEqual(3)

      // 天梯/赛事积分未采集 → 明示，不得互相推导或造值
      expect(text).toContain('未采集')
      expect(text).toContain('未配置真实天梯来源')

      // 覆盖口径如实（禁“全部历史”式文案）
      expect(text).toContain('已收录 0 局')

      // 偏好面板空态
      expect(text).toContain('暂无已核验对局的棋手记录')

      // v2 编造默认值绝迹：15 局 / 22% / 65% / 2.8
      expect(text).not.toMatch(/15\s*局/)
      expect(text).not.toMatch(/22(?:\.0+)?%/)
      expect(text).not.toMatch(/65(?:\.0+)?%/)
      expect(text).not.toMatch(/2\.80?%/)
      expect(text).not.toContain('2.8')
    } finally {
      unmount()
    }
  })

  it('B: 从未录入的玩家 → “未找到该选手”，绝不渲染伪造档案', async () => {
    mocks.players = []
    mocks.stats = ZERO_STATS

    const { dom, unmount } = await mountProfile('ghost-never-existed')
    try {
      const text = dom.textContent || ''
      expect(text).toContain('未找到该选手')
      // 不出现任何统计数字填充与编造档案
      expect(text).not.toMatch(/\d+(?:\.\d+)?%/)
      expect(text).not.toMatch(/15\s*局/)
      expect(dom.querySelector('.metric-num')).toBeNull()
    } finally {
      unmount()
    }
  })
})
