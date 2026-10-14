// v6 M1-5 · 来源与素材管理台（/admin/sources）：
// 凭证状态门禁（无凭证时禁用管理动作、台账提示需要凭证）、来源状态如实陈列、
// 上传 ≠ 核验语义在界面上如实表达。

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createApp } from 'vue'
import AdminSources from '../src/views/admin-sources.vue'
import { fetchSyncJobs, fetchEvidences, fetchRawMaterials } from '../src/api'

const mocks = vi.hoisted(() => {
  class AdminTokenMissingError extends Error {
    constructor() {
      super('管理凭证未配置')
      this.name = 'AdminTokenMissingError'
    }
  }
  return {
    AdminTokenMissingError,
    tokenReady: false,
    sources: [] as any[]
  }
})

vi.mock('../src/api', () => ({
  AdminTokenMissingError: mocks.AdminTokenMissingError,
  getAdminToken: vi.fn(() => (mocks.tokenReady ? 'tok' : null)),
  setAdminToken: vi.fn(),
  hasAdminToken: () => mocks.tokenReady,
  fetchDataStatus: vi.fn(async () => ({
    sources: mocks.sources,
    recentSyncJobs: [],
    counts: null,
    lastUpdated: '2026-10-03T08:00:00Z'
  })),
  fetchSyncJobs: vi.fn(async () => {
    if (!mocks.tokenReady) throw new mocks.AdminTokenMissingError()
    return []
  }),
  fetchEvidences: vi.fn(async () => {
    if (!mocks.tokenReady) throw new mocks.AdminTokenMissingError()
    return []
  }),
  fetchRawMaterials: vi.fn(async () => {
    if (!mocks.tokenReady) throw new mocks.AdminTokenMissingError()
    return []
  }),
  syncSource: vi.fn(),
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
  mocks.sources = []
  document.body.innerHTML = ''
})

describe('来源与素材管理台', () => {
  it('无凭证时：凭证状态如实「未配置」，管理台账提示需要凭证', async () => {
    mocks.sources = [{ id: 'src-hokace-wiki', sourceId: 'src-hokace-wiki', name: 'hokace 阵容工作台', type: 'THIRD_PARTY', status: 'READY', lastAttemptAt: null, lastSuccessAt: null, lastError: null }]
    const host = await mountView()
    expect(host.textContent).toContain('未配置')
    expect(host.textContent).toContain('管理功能尚未解锁')
    expect(host.querySelector('input[type=file]')).toBeNull()
    expect(fetchSyncJobs).not.toHaveBeenCalled()
    expect(fetchEvidences).not.toHaveBeenCalled()
    expect(fetchRawMaterials).not.toHaveBeenCalled()
    // 数据源状态是公开只读信息：无凭证也如实陈列
    expect(host.textContent).toContain('hokace 阵容工作台')
    expect(host.textContent).toContain('READY')
  })

  it('无凭证时同步按钮禁用（写操作不得发起）', async () => {
    mocks.sources = [{ id: 'src-hokace-wiki', sourceId: 'src-hokace-wiki', name: 'hokace 阵容工作台', type: 'THIRD_PARTY', status: 'READY', lastAttemptAt: null, lastSuccessAt: null, lastError: null }]
    const host = await mountView()
    const syncBtn = Array.from(host.querySelectorAll('button'))
      .find(b => b.textContent?.includes('触发同步'))
    expect(syncBtn).toBeTruthy()
    expect((syncBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('有凭证时展示上传与核验管理功能', async () => {
    mocks.tokenReady = true
    const host = await mountView()
    expect(host.textContent).toContain('上传不等于核验')
    expect(host.textContent).toContain('PENDING')
  })

  it('datatft 停用与 hokace 唯一同步来源的说明如实呈现', async () => {
    const host = await mountView()
    expect(host.textContent).toContain('datatft 已停用')
    expect(host.textContent).toContain('hokace')
  })
})
