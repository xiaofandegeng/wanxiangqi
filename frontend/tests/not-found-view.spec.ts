// 王牌对决研究台 · 404 兜底视图测试
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import NotFound from '../src/views/not-found.vue'

async function mountAt(path: string): Promise<HTMLElement> {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFound }
    ]
  })
  router.push(path)
  await router.isReady()
  const app = createApp(NotFound)
  app.use(router)
  const host = document.createElement('div')
  document.body.appendChild(host)
  app.mount(host)
  await new Promise(r => setTimeout(r, 10))
  return host
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('兜底视图（旧路由退役说明 / 未知路径 404）', () => {
  it.each(['/players/pl-1', '/roster', '/archive', '/admin/verify', '/models/backtest', '/learn', '/lineups', '/library'])(
    '旧路径 %s 呈现转型退役说明',
    async (path) => {
      const host = await mountAt(path)
      expect(host.textContent).toContain('功能已退役')
      expect(host.textContent).toContain('王牌对决研究台')
      expect(host.textContent).toContain('场次赛果')
      expect(host.textContent).toContain('赛前研究')
    }
  )

  it('未知路径如实 404（不冒充退役功能）', async () => {
    const host = await mountAt('/no/such/page')
    expect(host.textContent).toContain('404')
    expect(host.textContent).toContain('页面不存在')
    expect(host.textContent).not.toContain('功能已退役')
  })
})
