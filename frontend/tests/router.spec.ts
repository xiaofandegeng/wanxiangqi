// v6 M1-5 · 路由表验收：新信息架构（§3）注册齐全；旧 v2–v5 路由不再注册，
// 统一落入 catch-all（not-found 视图负责退役说明），退役 = 删除而非隐藏。

// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import router from '../src/router'

const NEW_ROUTES: Array<[string, string]> = [
  ['/', 'home'],
  ['/learn', 'learn'],
  ['/learn/first-lesson', 'lesson'],
  ['/lineups', 'lineup-roster'],
  ['/lineups/lm-example', 'lineup-detail'],
  ['/library', 'library'],
  ['/library/hero/example-hero', 'entity'],
  ['/library/mechanics/example-mechanic', 'mechanic'],
  ['/updates', 'updates'],
  ['/updates/v260924', 'update-detail'],
  ['/admin/content', 'admin-content'],
  ['/admin/sources', 'admin-sources']
]

// 旧产品路由：不得再注册为具名路由（落入 not-found 兜底）
const RETIRED_PATHS = [
  '/events/ev-1',
  '/players/pl-1',
  '/roster',
  '/archive',
  '/matches',
  '/admin/verify',
  '/admin/personal-import',
  '/models/backtest'
]

describe('v6 路由表（新信息架构）', () => {
  it.each(NEW_ROUTES)('%s 解析到 %s', (path, name) => {
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

  it('路由标题统一使用阵容研习站品牌', () => {
    for (const record of router.getRoutes()) {
      if (record.meta?.title) {
        expect(String(record.meta.title)).toContain('阵容研习站')
      }
    }
  })
})
