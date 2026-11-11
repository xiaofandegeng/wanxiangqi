// 王牌对决历史战绩本地持久化与修改覆盖管理层 (Match Storage & Patch Manager)
// 支持对录入错误、名单错漏、流派与胜者不准的场次进行本地修改与即时生效
// 支持用户手工录入最新比赛对局，并响应式联动刷新大盘、排行榜与赛前推演

export interface StoredSeat {
  slot: number
  playerId?: string
  nickname: string
  build: string
  winner: boolean
  commander?: string
  avatar?: string
}

export interface StoredMatch {
  id: string
  day: string
  ordinal: number
  ban: string | null
  winnerBuild: string
  winnerSlot: number | null
  winnerNickname: string | null
  seats: StoredSeat[]
  sourceUrl?: string
  materialSha256?: string
  matchType?: 'full_transcribed' | 'winner_snapshot'
  isCustom?: boolean    // 是否为用户手工录入的新比赛
  isModified?: boolean  // 是否为用户修改过的比赛
  modifiedAt?: string   // 上次修改时间
}

export interface ModifiedMatchStats {
  modifiedCount: number
  customCount: number
  deletedCount: number
  totalChanged: number
}

const STORAGE_KEY_OVERRIDES = 'wxq_match_overrides_v1'
const STORAGE_KEY_CUSTOMS = 'wxq_match_customs_v1'
const STORAGE_KEY_DELETED = 'wxq_match_deleted_v1'

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

function safeGetStorage<T>(key: string, fallback: T): T {
  const storage = getStorage()
  if (!storage) return fallback
  try {
    const raw = storage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function safeSetStorage(key: string, value: unknown): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.warn(`[MatchStorage] 写入 localStorage 失败 (${key}):`, err)
  }
}

/** 获取所有被用户修改过的官方场次字典 */
export function getMatchOverrides(): Record<string, StoredMatch> {
  return safeGetStorage<Record<string, StoredMatch>>(STORAGE_KEY_OVERRIDES, {})
}

/** 获取所有由用户手工新增录入的比赛列表 */
export function getCustomMatches(): StoredMatch[] {
  return safeGetStorage<StoredMatch[]>(STORAGE_KEY_CUSTOMS, [])
}

/** 获取所有被用户标记删除的比赛 ID 集合 */
export function getDeletedMatchIds(): string[] {
  return safeGetStorage<string[]>(STORAGE_KEY_DELETED, [])
}

/** 保存一场比赛的修改（或录入的新比赛） */
export function saveStoredMatch(match: StoredMatch): StoredMatch {
  const overrides = getMatchOverrides()
  const customs = getCustomMatches()
  const deleted = getDeletedMatchIds().filter(id => id !== match.id)
  safeSetStorage(STORAGE_KEY_DELETED, deleted)

  const updated: StoredMatch = {
    ...match,
    modifiedAt: new Date().toISOString()
  }

  // 1. 若为手工新增的场次（或未曾记录在官方库中的场次）
  if (match.isCustom) {
    updated.isCustom = true
    const idx = customs.findIndex(m => m.id === match.id)
    if (idx >= 0) {
      customs[idx] = updated
    } else {
      customs.unshift(updated)
    }
    safeSetStorage(STORAGE_KEY_CUSTOMS, customs)
    return updated
  }

  // 2. 属于官方历史场次的修正覆盖
  updated.isModified = true
  overrides[match.id] = updated
  safeSetStorage(STORAGE_KEY_OVERRIDES, overrides)
  return updated
}

/** 删除某场对局（新增对局直接物理移除，官方对局添加至软删除黑名单） */
export function deleteStoredMatch(matchId: string): void {
  // 检查是否在 customs 中
  const customs = getCustomMatches()
  const customsFiltered = customs.filter(m => m.id !== matchId)
  if (customsFiltered.length !== customs.length) {
    safeSetStorage(STORAGE_KEY_CUSTOMS, customsFiltered)
    return
  }

  // 属于官方比赛：从 overrides 移除，并记录到 deleted 列表
  const overrides = getMatchOverrides()
  delete overrides[matchId]
  safeSetStorage(STORAGE_KEY_OVERRIDES, overrides)

  const deleted = getDeletedMatchIds()
  if (!deleted.includes(matchId)) {
    deleted.push(matchId)
    safeSetStorage(STORAGE_KEY_DELETED, deleted)
  }
}

/** 撤销某场官方比赛的修改，恢复官方原样 */
export function resetStoredMatch(matchId: string): void {
  const overrides = getMatchOverrides()
  delete overrides[matchId]
  safeSetStorage(STORAGE_KEY_OVERRIDES, overrides)

  const deleted = getDeletedMatchIds().filter(id => id !== matchId)
  safeSetStorage(STORAGE_KEY_DELETED, deleted)
}

/** 一键重置所有本地修改，清空新增与删除，恢复初始官方版本 */
export function resetAllStoredMatches(): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(STORAGE_KEY_OVERRIDES)
    storage.removeItem(STORAGE_KEY_CUSTOMS)
    storage.removeItem(STORAGE_KEY_DELETED)
  } catch (err) {
    console.warn('[MatchStorage] 清空战绩补丁失败:', err)
  }
}

/** 获取当前本地修正与录入的状态统计 */
export function getModifiedStats(): ModifiedMatchStats {
  const overrides = getMatchOverrides()
  const customs = getCustomMatches()
  const deleted = getDeletedMatchIds()

  const modifiedCount = Object.keys(overrides).length
  const customCount = customs.length
  const deletedCount = deleted.length

  return {
    modifiedCount,
    customCount,
    deletedCount,
    totalChanged: modifiedCount + customCount + deletedCount
  }
}

/**
 * 核心方法：将官方原始场次列表与本地修改补丁、新增场次、删除记录完整合并
 * 自动完成排序与状态打标，确保全局响应式即时生效
 */
export function applyMatchPatches<T extends StoredMatch>(rawMatches: T[]): T[] {
  const overrides = getMatchOverrides()
  const customs = getCustomMatches()
  const deletedSet = new Set(getDeletedMatchIds())

  // 1. 处理官方原始列表（剔除已删除，替换为已修改版本）
  const processedRaw = rawMatches
    .filter(m => !deletedSet.has(m.id))
    .map(m => {
      const override = overrides[m.id]
      if (override) {
        return {
          ...m,
          ...override,
          isModified: true
        } as T
      }
      return m
    })

  // 2. 融入用户手工新增的场次（去重以防万一）
  const existingIds = new Set(processedRaw.map(m => m.id))
  const validCustoms = (customs as unknown as T[]).filter(
    m => !existingIds.has(m.id) && !deletedSet.has(m.id)
  )

  const combined = [...validCustoms, ...processedRaw]

  // 3. 统一规范排序：日期降序 (最新在前) -> 场次序号升序
  combined.sort((a, b) => {
    const dayCmp = b.day.localeCompare(a.day)
    if (dayCmp !== 0) return dayCmp
    return (a.ordinal || 0) - (b.ordinal || 0)
  })

  return combined
}

/** 导出当前所有本地修改与录入的数据为格式化 JSON 字符串 */
export function exportPatchesJson(): string {
  const payload = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    overrides: getMatchOverrides(),
    customs: getCustomMatches(),
    deleted: getDeletedMatchIds()
  }
  return JSON.stringify(payload, null, 2)
}

/** 导入外部战绩修正 JSON 字符串 */
export function importPatchesJson(jsonStr: string): boolean {
  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed.overrides && typeof parsed.overrides === 'object') {
      safeSetStorage(STORAGE_KEY_OVERRIDES, parsed.overrides)
    }
    if (Array.isArray(parsed.customs)) {
      safeSetStorage(STORAGE_KEY_CUSTOMS, parsed.customs)
    }
    if (Array.isArray(parsed.deleted)) {
      safeSetStorage(STORAGE_KEY_DELETED, parsed.deleted)
    }
    return true
  } catch (err) {
    console.error('[MatchStorage] 导入补丁数据失败:', err)
    return false
  }
}
