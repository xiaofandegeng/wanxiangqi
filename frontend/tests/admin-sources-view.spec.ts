// 王牌对决研究台 · 素材原件管理台（/admin/sources）测试
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp } from 'vue'
import AdminSources from '../src/views/admin-sources.vue'
import { fetchEvidences } from '../src/api'

const mocks = vi.hoisted(() => {
  class AdminTokenMissingError extends Error {
    constructor() {
      super('管理凭证未配置')
      this.name = 'AdminTokenMissingError'
    }
  }
  return {
    AdminTokenMissingError,
    tokenReady: false
  }
})

vi.mock('../src/api', () => ({
  AdminTokenMissingError: mocks.AdminTokenMissingError,
  getAdminToken: vi.fn(() => (mocks.tokenReady ? 'tok' : null)),
  setAdminToken: vi.fn(),
  hasAdminToken: () => mocks.tokenReady,
  fetchEvidences: vi.fn(async () => {
    if (!mocks.tokenReady) throw new mocks.AdminTokenMissingError()
    return []
  }),
  uploadEvidence: vi.fn(),
  verifyEvidence: vi.fn(),
  fetchEvidenceObjectUrl: vi.fn()
}))

async function mountView(): Promise<HTMLElement> {
  const app = createApp(AdminSources)
  const host = document.createElement('div')
  document.body.appendChild(host)
  app.mount(host)
  await new Promise(r => setTimeout(r, 20))
  return host
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.tokenReady = false
  document.body.innerHTML = ''
})

describe('素材原件管理台', () => {
  it('无凭证时：状态显示未配置，管理功能尚未解锁', async () => {
    const host = await mountView()
    expect(host.textContent).toContain('未配置')
    expect(host.textContent).toContain('管理功能尚未解锁')
    expect(host.querySelector('input[type=file]')).toBeNull()
    expect(fetchEvidences).not.toHaveBeenCalled()
  })

  it('有凭证时展示上传与素材证据台账', async () => {
    mocks.tokenReady = true
    const host = await mountView()
    expect(host.textContent).toContain('已配置')
    expect(host.textContent).toContain('上传素材原件')
    expect(host.textContent).toContain('素材证据台账')
    expect(host.querySelector('input[type=file]')).not.toBeNull()
    expect(fetchEvidences).toHaveBeenCalled()
  })
})
