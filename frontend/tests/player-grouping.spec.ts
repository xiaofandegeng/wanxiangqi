// 王牌对决选手多账号归并体系测试
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  getMasterPlayerName,
  getPlayerAliases,
  isMultiAccountPlayer,
  aggregateCatalogPlayers,
  MASTER_PLAYER_GROUPS
} from '../src/utils/player-grouping'

describe('选手多账号归并体系 (player-grouping)', () => {
  it('主选手映射表覆盖主流职业选手与主播', () => {
    expect(MASTER_PLAYER_GROUPS.length).toBeGreaterThanOrEqual(50)
  })

  it('分账号与马甲小号正确解析为同一个主选手', () => {
    // 沐汐 / 拉丁鱼 / 欧洲鱼
    expect(getMasterPlayerName('EZ拉丁鱼丶沐汐')).toBe('沐汐')
    expect(getMasterPlayerName('EZ沐汐')).toBe('沐汐')
    expect(getMasterPlayerName('EZ沐汐嘻嘻嘻')).toBe('沐汐')
    expect(getMasterPlayerName('QT鱼沐汐0丶7版')).toBe('沐汐')
    expect(getMasterPlayerName('EZ灬欧洲鱼')).toBe('沐汐')
    expect(getMasterPlayerName('欧洲鱼')).toBe('沐汐')
    expect(getMasterPlayerName('拉丁鱼')).toBe('沐汐')

    // 梦飞与冻冻、77 严格独立，车队打手号不混同
    expect(getMasterPlayerName('抖音梦飞')).toBe('梦飞')
    expect(getMasterPlayerName('梦飞大大')).toBe('梦飞')
    expect(getMasterPlayerName('抖音梦飞冻冻')).toBe('冻冻')
    expect(getMasterPlayerName('抖音梦飞77')).toBe('77')
    expect(getMasterPlayerName('儒雅随和的77')).toBe('77')
    expect(getMasterPlayerName('抖音梦飞11')).toBe('抖音梦飞11')

    // 沐小朵与沐小呆严格拆分
    expect(getMasterPlayerName('I蟲丶沐小朵')).toBe('沐小朵')
    expect(getMasterPlayerName('华创-沐小朵')).toBe('沐小朵')
    expect(getMasterPlayerName('I蟲丶沐小呆')).toBe('沐小呆')

    // 诸葛龟 / 猪葛龟
    expect(getMasterPlayerName('I蟲抖音诸葛龟')).toBe('猪葛龟')
    expect(getMasterPlayerName('I蟲抖音猪葛龟龟')).toBe('猪葛龟')
    expect(getMasterPlayerName('抖音猪葛龟龟')).toBe('猪葛龟')

    // 清辞严格绑定清辞本人，战队公共名不越界混入
    expect(getMasterPlayerName('EG清辞')).toBe('清辞')
    expect(getMasterPlayerName('DYEG清辞')).toBe('清辞')
    expect(getMasterPlayerName('武汉 EG清辞')).toBe('清辞')
    expect(getMasterPlayerName('武汉EG')).toBe('武汉EG')

    // 天眷与天誉严格拆分
    expect(getMasterPlayerName('EZ天眷')).toBe('天眷')
    expect(getMasterPlayerName('EZ天誉')).toBe('天誉')

    // 所演与所谓Y严格拆分
    expect(getMasterPlayerName('抖音所演')).toBe('所演')
    expect(getMasterPlayerName('抖音所谓Y')).toBe('所谓Y')

    // 7D
    expect(getMasterPlayerName('EZ丶7D')).toBe('7D')
    expect(getMasterPlayerName('EZ、7D')).toBe('7D')

    // 单账号选手保持原名
    expect(getMasterPlayerName('世薄情')).toBe('世薄情')
    expect(getMasterPlayerName('夜余')).toBe('夜余')
  })

  it('多账号判断与别名列表查询正常', () => {
    expect(isMultiAccountPlayer('沐汐')).toBe(true)
    expect(isMultiAccountPlayer('EZ拉丁鱼')).toBe(true)
    expect(getPlayerAliases('沐汐').length).toBeGreaterThanOrEqual(8)
    expect(getPlayerAliases('世薄情')).toEqual(['世薄情'])
  })

  it('aggregateCatalogPlayers 能够聚合多账号对局、胜场与阵容流派', () => {
    const raw = [
      {
        id: 'p1',
        nickname: 'EZ拉丁鱼丶沐汐',
        observedMatches: 4,
        observedWins: 2,
        builds: [{ label: '逐鹿蒙恬', observations: 4, winsForSourceLabel: 2 }]
      },
      {
        id: 'p2',
        nickname: 'EZ沐汐',
        observedMatches: 3,
        observedWins: 1,
        builds: [{ label: '三分倒转', observations: 3, winsForSourceLabel: 1 }]
      },
      {
        id: 'p3',
        nickname: '世薄情',
        observedMatches: 7,
        observedWins: 3,
        builds: [{ label: '逐鹿蒙恬', observations: 7, winsForSourceLabel: 3 }]
      }
    ]

    const agg = aggregateCatalogPlayers(raw)
    // 3 个账号合并为 2 位真实选手
    expect(agg).toHaveLength(2)

    const muxi = agg.find(p => p.nickname === '沐汐')!
    expect(muxi).toBeDefined()
    expect(muxi.observedMatches).toBe(7) // 4 + 3
    expect(muxi.observedWins).toBe(3) // 2 + 1
    expect(muxi.linkedAccounts).toEqual(['EZ拉丁鱼丶沐汐', 'EZ沐汐'])
    expect(muxi.builds).toHaveLength(2)

    const boqing = agg.find(p => p.nickname === '世薄情')!
    expect(boqing.observedMatches).toBe(7)
    expect(boqing.observedWins).toBe(3)
    expect(boqing.linkedAccounts).toEqual(['世薄情'])
  })

  it('铁律防护：任何选手合并分组的别名绝不允许在同一场比赛中同时登场', async () => {
    // 读取 catalog 真实 62 场比赛
    const fs = await import('fs')
    const path = await import('path')
    const catalogPath = path.resolve(__dirname, '../../backend/data/prediction-catalog/ruanshi.json')
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
    
    for (const group of MASTER_PLAYER_GROUPS) {
      if (group.aliases.length <= 1) continue
      for (const m of catalog.matches) {
        const nicknames = m.seats.map((s: any) => s.nickname)
        const matched = group.aliases.filter(alias => nicknames.includes(alias))
        // 同一场 6 席对局中决不允许出现同一个主选手的两个别名（同场必为不同真人）
        expect(
          matched.length,
          `主选手 [${group.masterName}] 的多个别名 (${matched.join(' 与 ')}) 在场次 ${m.day} 第${m.ordinal}场 (${m.key}) 同时出战！必须拆分为不同独立选手！`
        ).toBeLessThanOrEqual(1)
      }
    }
  })
})

