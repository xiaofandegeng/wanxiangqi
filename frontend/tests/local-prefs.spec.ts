// v6 M5-4 前置 · 本地收藏与学习进度（任务书 §4：「进度与收藏先用本地存储，
// 不新增游戏登录和账号绑定；浏览器不允许存储时仍可使用课程」）。
// 验证：localStorage 持久化与重载恢复、收藏开关语义、学完标记、
// 以及存储被禁时的降级（会话内存态可用 + storageNotice 如实提示 + 不写崩溃）。

// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

type Prefs = typeof import('../src/composables/local-prefs')

// 模块是导入时一次性探测存储的单例：每个用例 resetModules 后动态导入，
// 才能分别覆盖「存储可用」与「存储被禁」两条路径。
async function loadPrefs(): Promise<Prefs> {
  vi.resetModules()
  return await import('../src/composables/local-prefs')
}

// 用抛异常的 localStorage 模拟隐私模式/站点存储被禁
let setItemCalls = 0
function blockLocalStorage() {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get() {
      return {
        setItem: () => { setItemCalls++; throw new DOMException('blocked', 'SecurityError') },
        getItem: () => null,
        removeItem: () => {},
        clear: () => {},
        key: () => null,
        length: 0
      }
    }
  })
}

describe('local-prefs（存储可用）', () => {
  beforeEach(() => { window.localStorage.clear() })

  it('storageNotice 为 null（存储可用不需提示）', async () => {
    const p = await loadPrefs()
    expect(p.storageNotice).toBeNull()
  })

  it('收藏开关：toggle 返回新状态并持久化到 localStorage', async () => {
    const p = await loadPrefs()
    expect(p.isFavorited('lesson', 'lesson-a')).toBe(false)
    expect(p.toggleFavorite({ kind: 'lesson', id: 'lesson-a', title: '第一课', href: '/learn/lesson-a' })).toBe(true)
    expect(p.isFavorited('lesson', 'lesson-a')).toBe(true)

    const raw = window.localStorage.getItem('wxq.v6.favorites.v1')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!)['lesson:lesson-a'].title).toBe('第一课')

    expect(p.toggleFavorite({ kind: 'lesson', id: 'lesson-a', title: '第一课', href: '/learn/lesson-a' })).toBe(false)
    expect(p.isFavorited('lesson', 'lesson-a')).toBe(false)
    expect(JSON.parse(window.localStorage.getItem('wxq.v6.favorites.v1')!)).toEqual({})
  })

  it('课程与手册同 id 不冲突（kind 前缀键）；favoritesList 按 savedAt 倒序', async () => {
    window.localStorage.setItem('wxq.v6.favorites.v1', JSON.stringify({
      'lesson:x': { kind: 'lesson', id: 'x', title: '旧收藏', href: '/learn/x', savedAt: '2026-01-01T00:00:00.000Z' },
      'manual:x': { kind: 'manual', id: 'x', title: '同名手册', href: '/lineups/x', savedAt: '2026-01-02T00:00:00.000Z' }
    }))
    const p = await loadPrefs()
    expect(p.isFavorited('lesson', 'x')).toBe(true)
    expect(p.isFavorited('manual', 'x')).toBe(true)
    expect(p.favoritesList.value.map(f => f.kind)).toEqual(['manual', 'lesson'])
  })

  it('重载模块后收藏与进度从 localStorage 恢复（跨刷新持久）', async () => {
    const p1 = await loadPrefs()
    p1.toggleFavorite({ kind: 'manual', id: 'lu-1', title: '手册', href: '/lineups/lu-1' })
    p1.setLessonLayer('lesson-a', 'advanced')
    p1.toggleLessonDone('lesson-a')

    const p2 = await loadPrefs()
    expect(p2.isFavorited('manual', 'lu-1')).toBe(true)
    expect(p2.lessonProgressOf('lesson-a').layer).toBe('advanced')
    expect(p2.doneLessonSlugs().has('lesson-a')).toBe(true)
  })

  it('进度：层次切换保留学完标记；学完开关返回新状态', async () => {
    const p = await loadPrefs()
    p.setLessonLayer('lesson-b', 'basic')
    expect(p.toggleLessonDone('lesson-b')).toBe(true)
    expect(p.lessonProgressOf('lesson-b').layer).toBe('basic') // 标记学完不丢层次
    expect(p.toggleLessonDone('lesson-b')).toBe(false)
    expect(p.doneLessonSlugs().has('lesson-b')).toBe(false)
  })
})

describe('local-prefs（存储被禁 → 会话内存降级）', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')

  beforeEach(() => { setItemCalls = 0; blockLocalStorage() })
  afterEach(() => {
    if (originalDescriptor) Object.defineProperty(window, 'localStorage', originalDescriptor)
  })

  it('storageNotice 如实提示「仅本次会话有效」；收藏功能仍可用', async () => {
    const p = await loadPrefs()
    expect(p.storageNotice).toContain('浏览器本地存储不可用')
    expect(p.storageNotice).toContain('课程内容不受影响')

    expect(p.toggleFavorite({ kind: 'lesson', id: 'lesson-a', title: '第一课', href: '/learn/lesson-a' })).toBe(true)
    expect(p.isFavorited('lesson', 'lesson-a')).toBe(true)
    expect(p.favoritesList.value).toHaveLength(1)
    expect(setItemCalls).toBeGreaterThan(0) // 确实尝试过写并被拒，而非静默跳过
  })

  it('降级态不持久：重载模块后回到空收藏（如实不假装已保存）', async () => {
    const p1 = await loadPrefs()
    p1.toggleFavorite({ kind: 'manual', id: 'lu-1', title: '手册', href: '/lineups/lu-1' })
    const p2 = await loadPrefs()
    expect(p2.isFavorited('manual', 'lu-1')).toBe(false)
    expect(p2.storageNotice.value).not.toBeNull()
  })
})
