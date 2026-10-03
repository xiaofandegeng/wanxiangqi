// v6 M1-5 · 兜底视图：旧路由误入时给出转型退役说明（而非裸 404）；
// 真正的未知路径如实 404。两种形态都不得出现编造内容。

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
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
  it.each(['/players/pl-1', '/roster', '/archive', '/admin/verify', '/models/backtest'])(
    '旧路径 %s 呈现转型退役说明',
    async (path) => {
      const host = await mountAt(path)
      expect(host.textContent).toContain('功能已退役')
      expect(host.textContent).toContain('阵容研习站')
      // 引导到新功能区
      expect(host.textContent).toContain('新手学堂')
    }
  )

  it('未知路径如实 404（不冒充退役功能）', async () => {
    const host = await mountAt('/no/such/page')
    expect(host.textContent).toContain('404')
    expect(host.textContent).toContain('页面不存在')
    expect(host.textContent).not.toContain('功能已退役')
  })
})
