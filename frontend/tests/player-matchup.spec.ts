// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  getBuildFaction,
  buildPlayerMatchupProfiles,
  evaluateBanImpact,
  evaluate6PlayerMatchup
} from '../src/utils/player-matchup'

describe('选手同场克制与Ban位影响分析引擎 (player-matchup)', () => {
  it('阵容与核心阵营能够正确识别', () => {
    expect(getBuildFaction('逐鹿蒙恬')).toBe('逐鹿')
    expect(getBuildFaction('逐鹿刺')).toBe('逐鹿')
    expect(getBuildFaction('三分登场')).toBe('三分')
    expect(getBuildFaction('三分倒转')).toBe('三分')
    expect(getBuildFaction('成年礼三分登场')).toBe('三分')
    expect(getBuildFaction('日落海倒转')).toBe('日落海')
    expect(getBuildFaction('伞刘邦')).toBe('日落海')
    expect(getBuildFaction('河洛木兰')).toBe('河洛')
    expect(getBuildFaction('牺牲李信')).toBe('河洛')
    expect(getBuildFaction('大河山鬼')).toBe('大河')
    expect(getBuildFaction('传统养猪')).toBe('通用/其他')
    expect(getBuildFaction('雷霆战机')).toBe('通用/其他')
  })

  // 构造一组具有明确克制与Ban位特征的模拟比赛
  const mockMatches = [
    // 场次1：世薄情(逐鹿) 夺冠，同场有 沐汐、北念、小新游、妖柒、遗愿
    {
      key: 'match-1',
      day: '2026-11-01',
      ordinal: 1,
      ban: null,
      winnerSlot: 1,
      seats: [
        { slot: 1, nickname: '世薄情', build: '逐鹿蒙恬', winner: true },
        { slot: 2, nickname: 'EZ拉丁鱼丶沐汐', build: '三分登场', winner: false },
        { slot: 3, nickname: '抖音搜索北念', build: '河洛木兰', winner: false },
        { slot: 4, nickname: '抖音小新游', build: '传统养猪', winner: false },
        { slot: 5, nickname: '抖音妖柒', build: '传统养猪', winner: false },
        { slot: 6, nickname: '遗愿', build: '三分登场', winner: false }
      ]
    },
    // 场次2：北念 夺冠，同场压制 世薄情
    {
      key: 'match-2',
      day: '2026-11-02',
      ordinal: 1,
      ban: '逐鹿',
      winnerSlot: 3,
      seats: [
        { slot: 1, nickname: '世薄情', build: '河洛木兰', winner: false },
        { slot: 2, nickname: 'EZ沐汐', build: '三分登场', winner: false },
        { slot: 3, nickname: '北念', build: '河洛木兰', winner: true },
        { slot: 4, nickname: '抖音小新游', build: '传统养猪', winner: false },
        { slot: 5, nickname: '抖音妖柒', build: '传统养猪', winner: false },
        { slot: 6, nickname: '遗愿', build: '三分倒转', winner: false }
      ]
    },
    // 场次3：遗愿(三分) 夺冠，Ban逐鹿
    {
      key: 'match-3',
      day: '2026-11-03',
      ordinal: 1,
      ban: '逐鹿',
      winnerSlot: 6,
      seats: [
        { slot: 1, nickname: '世薄情', build: '河洛没有木兰', winner: false },
        { slot: 2, nickname: 'EZ拉丁鱼', build: '我不后悔', winner: false },
        { slot: 3, nickname: '北念', build: '河洛木兰', winner: false },
        { slot: 4, nickname: '抖音小新游', build: '三分倒转', winner: false },
        { slot: 5, nickname: '抖音妖柒', build: '传统养猪', winner: false },
        { slot: 6, nickname: '遗愿', build: '三分登场', winner: true }
      ]
    }
  ]

  it('buildPlayerMatchupProfiles 能够正确提取交手胜负与天敌克制关系', () => {
    const profiles = buildPlayerMatchupProfiles(mockMatches, true)

    // 世薄情
    const boqing = profiles.get('世薄情')!
    expect(boqing).toBeDefined()
    expect(boqing.totalMatches).toBe(3)
    expect(boqing.totalWins).toBe(1)

    // 检查世薄情 vs 北念 (世薄情 1 胜，北念 1 胜，平手 1 场)
    const vsBeinian = boqing.h2h.find(x => x.opponentMaster === '北念')!
    expect(vsBeinian).toBeDefined()
    expect(vsBeinian.encounters).toBe(3)
    expect(vsBeinian.wins).toBe(1)
    expect(vsBeinian.losses).toBe(1)

    // 检查世薄情 vs 沐汐 (世薄情 1 胜，沐汐 0 胜)
    const vsMuxi = boqing.h2h.find(x => x.opponentMaster === '沐汐')!
    expect(vsMuxi.wins).toBe(1)
    expect(vsMuxi.losses).toBe(0)
    // 沐汐在世薄情的压制名单 (victims) 中
    expect(boqing.victims.some(v => v.opponentMaster === '沐汐')).toBe(true)

    // 检查沐汐的被克制名单 (nemeses) 包含世薄情
    const muxi = profiles.get('沐汐')!
    expect(muxi.nemeses.some(n => n.opponentMaster === '世薄情')).toBe(true)
  })

  it('evaluateBanImpact 能准确识别禁用阵营对选手体系的致命或利好影响', () => {
    const profiles = buildPlayerMatchupProfiles(mockMatches, true)
    const boqing = profiles.get('世薄情')!
    const yiyuan = profiles.get('遗愿')!

    // 世薄情 唯一胜场来自 逐鹿
    const banZhulu = evaluateBanImpact(boqing, '逐鹿', mockMatches)!
    expect(banZhulu).toBeDefined()
    expect(banZhulu.level).toBe('CRITICAL')
    expect(banZhulu.scoreModifier).toBeLessThan(0)
    expect(banZhulu.description).toContain('逐鹿')

    // 遗愿 胜场来自 三分，禁 逐鹿 对其有益或免疫
    const yiyuanBanZhulu = evaluateBanImpact(yiyuan, '逐鹿', mockMatches)!
    expect(['IMMUNE', 'BENEFITED']).toContain(yiyuanBanZhulu.level)
    expect(yiyuanBanZhulu.scoreModifier).toBeGreaterThanOrEqual(0)

    // 遗愿 禁 三分 会被判定为严重受挫
    const yiyuanBanSanfen = evaluateBanImpact(yiyuan, '三分', mockMatches)!
    expect(yiyuanBanSanfen.level).toBe('CRITICAL')
    expect(yiyuanBanSanfen.scoreModifier).toBeLessThan(0)
  })

  it('evaluate6PlayerMatchup 六人同场推演能综合交锋克制与Ban位得出归一化预测概率', () => {
    const participants = [
      { nickname: '世薄情' },
      { nickname: 'EZ拉丁鱼丶沐汐' },
      { nickname: '北念' },
      { nickname: '抖音小新游' },
      { nickname: '抖音妖柒' },
      { nickname: '遗愿' }
    ]

    const result = evaluate6PlayerMatchup(participants, '逐鹿', mockMatches)

    expect(result.players).toHaveLength(6)
    // 概率和必须为 1.0 (容差 0.001)
    const sumProb = result.players.reduce((s, p) => s + p.adjustedProbability, 0)
    expect(sumProb).toBeCloseTo(1.0, 2)

    // 世薄情在禁逐鹿下受到了 banModifier 负向惩罚
    const boqingResult = result.players.find(p => p.masterName === '世薄情')!
    expect(boqingResult.banModifier).toBeLessThan(0)

    // 包含两两对决描述与 Ban 总结
    expect(result.crossMatchups.length).toBeGreaterThan(0)
    expect(result.banSummary.bannedFaction).toBe('逐鹿')
    expect(result.banSummary.summaryText).toContain('逐鹿')
  })
})

