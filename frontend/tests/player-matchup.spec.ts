import { describe, it, expect } from 'vitest'
import { buildPlayerMatchupProfiles, CURRENT_LATEST_VERSION, getBuildFaction, getVersionByDate, isAceDuelMatch } from '../src/utils/player-matchup'

describe('已记录的阵营、场次和选手历史', () => {
  it('官方版本历日对应与最新版本能够正确识别', () => {
    expect(CURRENT_LATEST_VERSION).toBe('v1.11.1')
    expect(getVersionByDate('2026-11-19').version).toBe('v1.11.1')
    expect(getVersionByDate('2026-11-18').version).toBe('v1.10.1')
    expect(getVersionByDate('2026-11-07').version).toBe('v1.9.1')
    expect(getVersionByDate('2026-11-07').isLatest).toBe(false)
    expect(getVersionByDate('2026-10-31').version).toBe('v1.8.1')
    expect(getVersionByDate('2026-10-25').version).toBe('v1.7.1')
    expect(getVersionByDate('2026-10-18').version).toBe('v1.6.1')
  })

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
        { slot: 2, nickname: 'EZ拉丁鱼', build: '日落海倒转', winner: false },
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

  it('王牌对决实战过滤机制：严格区分王牌赛事（WANXIANG/DIAMOND）与普通排位/娱乐局', () => {
    // 1. 正向：万象大赛与钻石狂潮为王牌对决正统赛制
    expect(isAceDuelMatch({ mode: 'WANXIANG', seats: [{}, {}, {}, {}, {}, {}] })).toBe(true)
    expect(isAceDuelMatch({ mode: 'DIAMOND', seats: [{}, {}, {}, {}, {}, {}] })).toBe(true)
    expect(isAceDuelMatch({ mode: 'ACE', seats: [{}, {}, {}, {}, {}, {}] })).toBe(true)
    expect(isAceDuelMatch({ seats: [{}, {}, {}, {}, {}, {}] })).toBe(true) // 默认 6 席王牌对决

    // 2. 负向：严格排除普通排位局、娱乐局或非 6 席赛果
    expect(isAceDuelMatch({ mode: 'RANK', seats: [{}, {}, {}, {}, {}, {}] })).toBe(false)
    expect(isAceDuelMatch({ mode: 'CASUAL', seats: [{}, {}, {}, {}, {}, {}] })).toBe(false)
    expect(isAceDuelMatch({ mode: 'NORMAL', seats: [{}, {}, {}, {}, {}, {}] })).toBe(false)
    expect(isAceDuelMatch({ seats: [{}, {}, {}] })).toBe(false)
  })

  it('6席位全量对局链路：准确聚合所有席位出战棋手与流派，形成真实历史胜率、常用阵容并优化赛前推演', () => {
    // 构造一场包含 6 位真实选手的对局，每位选手均指定出战棋手与实战流派
    const full6SeatMatch = {
      id: 'ruanshi_test_full_6',
      day: '2026-11-09',
      ordinal: 99,
      winnerSlot: 1,
      winnerBuild: '逐鹿蒙恬',
      seats: [
        { slot: 1, nickname: '测试选手A', commander: '嬴律', build: '逐鹿蒙恬', winner: true },
        { slot: 2, nickname: '测试选手B', commander: '白歌', build: '三分倒转', winner: false },
        { slot: 3, nickname: '测试选手C', commander: '小妲己', build: '传统养猪', winner: false },
        { slot: 4, nickname: '测试选手D', commander: '安琪拉', build: '雷霆战机', winner: false },
        { slot: 5, nickname: '测试选手E', commander: '镜', build: '镜猪转吕布', winner: false },
        { slot: 6, nickname: '测试选手F', commander: '乔汐', build: '日落海倒转', winner: false },
        // 混入占位符，应被自动过滤
        { slot: 7, nickname: '席位2', commander: '小妲己', build: '三分倒转', winner: false }
      ]
    }

    const profileMap = buildPlayerMatchupProfiles([full6SeatMatch], false)

    // 1. 验证占位符彻底被过滤，未生成假选手画像
    expect(profileMap.has('席位2')).toBe(false)

    // 2. 验证所有 6 席位真实选手均成功聚合历史数据
    const pA = profileMap.get('测试选手A')!
    const pB = profileMap.get('测试选手B')!
    expect(pA).toBeDefined()
    expect(pB).toBeDefined()

    // 选手A 夺冠：1战1胜
    expect(pA.totalMatches).toBe(1)
    expect(pA.totalWins).toBe(1)
    // 选手B 未夺冠：1战0胜，分母真实累加，胜率真实反映为 0
    expect(pB.totalMatches).toBe(1)
    expect(pB.totalWins).toBe(0)

    // 3. 验证选手出战棋手与流派准确记录
    expect(pA.commanderProfiles).toHaveLength(1)
    expect(pA.commanderProfiles[0].commander).toBe('嬴律')
    expect(pA.commanderProfiles[0].favoriteBuild).toBe('逐鹿蒙恬')
    expect(pA.commanderProfiles[0].matches).toBe(1)
    expect(pA.commanderProfiles[0].wins).toBe(1)

    expect(pB.commanderProfiles[0].commander).toBe('白歌')
    expect(pB.commanderProfiles[0].favoriteBuild).toBe('三分倒转')
    expect(pB.commanderProfiles[0].matches).toBe(1)
    expect(pB.commanderProfiles[0].wins).toBe(0)

  })
})
