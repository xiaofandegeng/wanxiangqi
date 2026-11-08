// 王牌对决研究台 · API 客户端测试
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getAdminToken, setAdminToken, hasAdminToken, AdminTokenMissingError,
  uploadEvidence, fetchEvidences, verifyEvidence
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
    setAdminToken('tok-test')
    expect(hasAdminToken()).toBe(true)
    await fetchEvidences()
    const call = (globalThis as any).fetch.mock.calls[0]
    expect(call[0]).toBe('/api/v1/admin/evidences')
    expect(call[1].headers.get('Authorization')).toBe('Bearer tok-test')
  })

  it('凭证持久化到 localStorage 并可读取', () => {
    setAdminToken('tok-persist')
    expect(localStorage.getItem('wxq-admin-token')).toBe('tok-persist')
    expect(getAdminToken()).toBe('tok-persist')
    setAdminToken(null)
    expect(localStorage.getItem('wxq-admin-token')).toBe(null)
    expect(hasAdminToken()).toBe(false)
  })
})

describe('素材原件操作', () => {
  beforeEach(() => {
    setAdminToken(null)
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('无凭证上传直接拒绝', async () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    await expect(uploadEvidence(blob, { capturedAt: '2026-10-03T00:00:00Z' }))
      .rejects.toBeInstanceOf(AdminTokenMissingError)
  })

  it('上传原件直传二进制并带入元信息', async () => {
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

  it('核验原件发送请求', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, {
      code: 0,
      data: { id: 'ev-1', status: 'VERIFIED' }
    })))
    setAdminToken('tok')
    const res = await verifyEvidence('ev-1', 'AUDITOR')
    expect(res.status).toBe('VERIFIED')
  })
})

describe('退役旧业务请求检查', () => {
  it('api 模块不再导出任何旧内容或旧爬虫请求函数', async () => {
    const api = await import('../src/api')
    const retired = [
      'fetchLineups', 'fetchDataStatus', 'syncSource', 'fetchSyncJobs', 'fetchRawMaterials',
      'fetchLearnPath', 'fetchCatalog', 'fetchLineupManual', 'fetchEventsToday'
    ]
    for (const name of retired) {
      expect((api as any)[name]).toBeUndefined()
    }
  })
})
