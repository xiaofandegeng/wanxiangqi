// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyMatchPatches,
  saveStoredMatch,
  resetStoredMatch,
  deleteStoredMatch,
  resetAllStoredMatches,
  getModifiedStats,
  exportPatchesJson,
  importPatchesJson,
  type StoredMatch
} from '../src/utils/match-storage'

describe('王牌对决战绩本地存储与修改覆盖机制 (MatchStorage)', () => {
  const mockRawMatches: StoredMatch[] = [
    {
      id: 'm_1108_1',
      day: '2026-11-08',
      ordinal: 1,
      ban: null,
      winnerBuild: '三分倒转',
      winnerSlot: 1,
      winnerNickname: '梦飞大大',
      seats: [
        { slot: 1, nickname: '梦飞大大', build: '三分倒转', winner: true },
        { slot: 2, nickname: '小谷芷', build: '雷霆战机', winner: false },
        { slot: 3, nickname: '世薄情', build: '逐鹿蒙恬', winner: false },
        { slot: 4, nickname: 'EZ拉丁鱼', build: '日落海倒转', winner: false },
        { slot: 5, nickname: '冷酷心机小猫', build: '逐鹿蒙恬', winner: false },
        { slot: 6, nickname: '风喵喵', build: '三分倒转', winner: false }
      ]
    },
    {
      id: 'm_1108_2',
      day: '2026-11-08',
      ordinal: 2,
      ban: '三分',
      winnerBuild: '日落海倒转',
      winnerSlot: 4,
      winnerNickname: 'EZ拉丁鱼',
      seats: [
        { slot: 1, nickname: '梦飞大大', build: '传统养猪', winner: false },
        { slot: 2, nickname: '小谷芷', build: '雷霆战机', winner: false },
        { slot: 3, nickname: '世薄情', build: '逐鹿蒙恬', winner: false },
        { slot: 4, nickname: 'EZ拉丁鱼', build: '日落海倒转', winner: true },
        { slot: 5, nickname: '冷酷心机小猫', build: '逐鹿蒙恬', winner: false },
        { slot: 6, nickname: '风喵喵', build: '河洛木兰', winner: false }
      ]
    }
  ]

  beforeEach(() => {
    resetAllStoredMatches()
  })

  it('初始状态下合并应返回原始对局，无修改标记', () => {
    const list = applyMatchPatches(mockRawMatches)
    expect(list).toHaveLength(2)
    expect(list[0].id).toBe('m_1108_1')
    expect(list[0].isModified).toBeFalsy()
    expect(list[0].isCustom).toBeFalsy()

    const stats = getModifiedStats()
    expect(stats.totalChanged).toBe(0)
  })

  it('支持修改已有官方对局（更正选手昵称、阵容或胜者），合并后即时生效', () => {
    // 假设用户发现第 1 场录错了，胜者实际应为席位 2 的小谷芷（雷霆战机），且席位 6 名字有错别字更正为「抖音风喵喵」
    const modifiedMatch: StoredMatch = {
      ...mockRawMatches[0],
      winnerSlot: 2,
      winnerNickname: '小谷芷',
      winnerBuild: '雷霆战机',
      seats: [
        { slot: 1, nickname: '梦飞大大', build: '三分倒转', winner: false },
        { slot: 2, nickname: '小谷芷', build: '雷霆战机', winner: true },
        { slot: 3, nickname: '世薄情', build: '逐鹿蒙恬', winner: false },
        { slot: 4, nickname: 'EZ拉丁鱼', build: '日落海倒转', winner: false },
        { slot: 5, nickname: '冷酷心机小猫', build: '逐鹿蒙恬', winner: false },
        { slot: 6, nickname: '抖音风喵喵', build: '三分倒转', winner: false }
      ]
    }

    saveStoredMatch(modifiedMatch)

    const stats = getModifiedStats()
    expect(stats.modifiedCount).toBe(1)
    expect(stats.totalChanged).toBe(1)

    // 应用补丁后重新合并
    const list = applyMatchPatches(mockRawMatches)
    const target = list.find(m => m.id === 'm_1108_1')
    expect(target).toBeDefined()
    expect(target?.isModified).toBe(true)
    expect(target?.winnerNickname).toBe('小谷芷')
    expect(target?.winnerBuild).toBe('雷霆战机')
    expect(target?.seats[5].nickname).toBe('抖音风喵喵')
  })

  it('支持手动录入一场全新的实战对局，合并后自动按日期与场次降序排列', () => {
    const newMatch: StoredMatch = {
      id: 'custom_1109_m1',
      day: '2026-11-09',
      ordinal: 1,
      ban: null,
      winnerSlot: 1,
      winnerNickname: '有局｜白兔',
      winnerBuild: '伞半月',
      isCustom: true,
      seats: [
        { slot: 1, nickname: '有局｜白兔', build: '伞半月', winner: true },
        { slot: 2, nickname: '抖音EG碎碎圆圆', build: '日落海倒转', winner: false },
        { slot: 3, nickname: 'EZ拉丁鱼', build: '大河龙蛇', winner: false },
        { slot: 4, nickname: 'Yk丶', build: '雷霆战机', winner: false },
        { slot: 5, nickname: 'B站QT小优律', build: '传统养猪', winner: false },
        { slot: 6, nickname: '抖音搜流儿', build: '逐鹿蒙恬', winner: false }
      ]
    }

    saveStoredMatch(newMatch)

    const stats = getModifiedStats()
    expect(stats.customCount).toBe(1)

    const list = applyMatchPatches(mockRawMatches)
    expect(list).toHaveLength(3)
    // 2026-11-09 日期最新，排在最前面
    expect(list[0].id).toBe('custom_1109_m1')
    expect(list[0].isCustom).toBe(true)
    expect(list[0].winnerNickname).toBe('有局｜白兔')
  })

  it('支持单场撤销恢复官方原始战绩', () => {
    const modifiedMatch: StoredMatch = {
      ...mockRawMatches[0],
      winnerNickname: '测试篡改名字'
    }
    saveStoredMatch(modifiedMatch)

    let list = applyMatchPatches(mockRawMatches)
    expect(list.find(m => m.id === 'm_1108_1')?.winnerNickname).toBe('测试篡改名字')

    // 撤销该场
    resetStoredMatch('m_1108_1')
    list = applyMatchPatches(mockRawMatches)
    expect(list.find(m => m.id === 'm_1108_1')?.winnerNickname).toBe('梦飞大大')
    expect(list.find(m => m.id === 'm_1108_1')?.isModified).toBeFalsy()
  })

  it('支持删除某场对局', () => {
    deleteStoredMatch('m_1108_2')

    const stats = getModifiedStats()
    expect(stats.deletedCount).toBe(1)

    const list = applyMatchPatches(mockRawMatches)
    expect(list).toHaveLength(1)
    expect(list.map(m => m.id)).not.toContain('m_1108_2')
  })

  it('支持一键重置所有修改，恢复官方默认数据', () => {
    saveStoredMatch({ ...mockRawMatches[0], winnerNickname: '修改1' })
    saveStoredMatch({
      id: 'custom_test',
      day: '2026-11-10',
      ordinal: 1,
      ban: null,
      winnerSlot: 1,
      winnerNickname: '新增',
      winnerBuild: '三分倒转',
      isCustom: true,
      seats: []
    })
    deleteStoredMatch('m_1108_2')

    expect(getModifiedStats().totalChanged).toBe(3)

    resetAllStoredMatches()
    expect(getModifiedStats().totalChanged).toBe(0)

    const list = applyMatchPatches(mockRawMatches)
    expect(list).toHaveLength(2)
    expect(list[0].winnerNickname).toBe('梦飞大大')
  })

  it('导出与导入补丁 JSON 保证配置无缝迁移', () => {
    saveStoredMatch({ ...mockRawMatches[0], winnerNickname: '导出测试' })

    const json = exportPatchesJson()
    expect(json).toContain('导出测试')

    // 清空后再导入
    resetAllStoredMatches()
    expect(getModifiedStats().totalChanged).toBe(0)

    const ok = importPatchesJson(json)
    expect(ok).toBe(true)
    expect(getModifiedStats().modifiedCount).toBe(1)

    const list = applyMatchPatches(mockRawMatches)
    expect(list.find(m => m.id === 'm_1108_1')?.winnerNickname).toBe('导出测试')
  })
})
