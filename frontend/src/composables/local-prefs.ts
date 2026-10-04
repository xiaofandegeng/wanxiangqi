// 本地偏好（任务书 §4：「进度与收藏先用本地存储，不新增游戏登录和账号绑定；
// 浏览器不允许存储时仍可使用课程」；§验收：「收藏/进度有明确反馈」）。
//
// - localStorage 可用 → 持久化；不可用（隐私模式/禁用/配额）→ 自动降级为本次会话内存态，
//   课程/手册功能不受影响，界面提示「仅本次会话有效」。
// - 单例模块级状态：header/learn/lesson/lineup 各处共享同一份收藏与进度。
import { ref, computed } from 'vue'

const FAV_KEY = 'wxq.v6.favorites.v1'
const PROGRESS_KEY = 'wxq.v6.lessonProgress.v1'

export type FavoriteKind = 'lesson' | 'manual'

export interface FavoriteItem {
  kind: FavoriteKind
  id: string
  title: string
  href: string
  savedAt: string
}

export interface LessonProgress {
  layer?: 'basic' | 'advanced'
  done?: boolean
  updatedAt?: string
}

// ---- 存储可用性探测（一次性；读写全程 try/catch 兜底） ----
function detectStorage(): boolean {
  try {
    const probe = '__wxq_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}
const storageOk = detectStorage()

function readJson<T>(key: string, fallback: T): T {
  if (!storageOk) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeJson(key: string, value: unknown): void {
  if (!storageOk) return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 写失败（如隐私模式中途收紧）→ 保持在内存态，不阻塞功能 */
  }
}

// ---- 收藏（课程 + 阵容手册） ----
const favorites = ref<Record<string, FavoriteItem>>(readJson(FAV_KEY, {}))

export const favoritesList = computed(() =>
  Object.values(favorites.value).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)))

export function isFavorited(kind: FavoriteKind, id: string): boolean {
  return Boolean(favorites.value[`${kind}:${id}`])
}

export function toggleFavorite(item: Omit<FavoriteItem, 'savedAt'>): boolean {
  const key = `${item.kind}:${item.id}`
  const next = { ...favorites.value }
  if (next[key]) delete next[key]
  else next[key] = { ...item, savedAt: new Date().toISOString() }
  favorites.value = next
  writeJson(FAV_KEY, next)
  return Boolean(next[key])
}

// ---- 课程进度（观看层次沿用既有 LAYER_KEY 语义 + 学完标记） ----
const progress = ref<Record<string, LessonProgress>>(readJson(PROGRESS_KEY, {}))

export function lessonProgressOf(slug: string): LessonProgress {
  return progress.value[slug] ?? {}
}

export function setLessonLayer(slug: string, layer: 'basic' | 'advanced'): void {
  const next = { ...progress.value, [slug]: { ...progress.value[slug], layer, updatedAt: new Date().toISOString() } }
  progress.value = next
  writeJson(PROGRESS_KEY, next)
}

export function toggleLessonDone(slug: string): boolean {
  const cur = progress.value[slug] ?? {}
  const done = !cur.done
  const next = { ...progress.value, [slug]: { ...cur, done, updatedAt: new Date().toISOString() } }
  progress.value = next
  writeJson(PROGRESS_KEY, next)
  return done
}

export function doneLessonSlugs(): Set<string> {
  const out = new Set<string>()
  for (const [slug, p] of Object.entries(progress.value)) if (p?.done) out.add(slug)
  return out
}

/** 存储不可用时的界面提示文案（§4「浏览器不允许存储时仍可使用课程」的如实告知） */
export const storageNotice = storageOk ? null : '浏览器本地存储不可用：收藏与学习进度仅在本次会话内有效，刷新后不保留（课程内容不受影响）。'
