// 王牌对决研究台 · 路由表验收
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import router from '../src/router'

const ACTIVE_ROUTES: Array<[string, string]> = [
  ['/', 'home'],
  ['/research/roster', 'research-roster'],
  ['/research/sources', 'research-sources'],
  ['/research/matches', 'research-matches'],
  ['/research/players', 'research-players'],
  ['/research/predict', 'research-predict'],
  ['/research/import', 'research-import'],
  ['/admin/sources', 'admin-sources']
]

// 旧路由不再注册，统一落入 not-found 兜底
const RETIRED_PATHS = [
  '/learn',
  '/lineups',
  '/library',
  '/updates',
  '/admin/content',
  '/events/ev-1',
  '/players/pl-1',
  '/roster',
  '/archive',
  '/matches',
  '/admin/verify',
  '/admin/personal-import',
  '/models/backtest'
]

describe('王牌对决研究台路由表', () => {
  it.each(ACTIVE_ROUTES)('%s 解析到 %s', (path, name) => {
    const resolved = router.resolve(path)
    expect(resolved.name).toBe(name)
    expect(resolved.matched.length).toBeGreaterThan(0)
  })

  it.each(RETIRED_PATHS)('旧路由 %s 不再注册，落入 not-found 兜底', (path) => {
    const resolved = router.resolve(path)
    expect(resolved.name).toBe('not-found')
  })

  it('未知路径同样落入 not-found（如实 404）', () => {
    expect(router.resolve('/definitely/not/a/route').name).toBe('not-found')
  })

  it('路由标题统一使用王牌对决研究台品牌', () => {
    for (const record of router.getRoutes()) {
      if (record.meta?.title) {
        expect(String(record.meta.title)).toMatch(/王牌对决研究台/)
      }
    }
  })
})
