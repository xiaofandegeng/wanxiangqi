// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  getBuildFaction,
  buildPlayerMatchupProfiles,
  evaluateBanImpact,
  evaluate6PlayerMatchup,
  CURRENT_LATEST_VERSION,
  getVersionByDate,
  evaluateVersionLineupAdaptation,
  evaluateCommander,
  OFFICIAL_COMMANDERS,
  COMMANDER_ADAPTED_BUILDS,
  getCommanderAdaptiveBuilds,
  evaluatePlayerCommanderLineupProficiency,
  inferPlayerLineup,
  evaluateCommanderBuildSynergy,
  identifyLineupArchetype,
  evaluate6PlayerLineupCounters,
  isAceDuelMatch
} from '../src/utils/player-matchup'

describe('选手同场克制、Ban位与最新版本更迭分析引擎 (player-matchup)', () => {
  it('官方版本历日对应与最新版本能够正确识别', () => {
    expect(CURRENT_LATEST_VERSION).toBe('v1.9.1')
    expect(getVersionByDate('2026-11-07').version).toBe('v1.9.1')
    expect(getVersionByDate('2026-11-07').isLatest).toBe(true)
    expect(getVersionByDate('2026-10-31').version).toBe('v1.8.1')
    expect(getVersionByDate('2026-10-25').version).toBe('v1.7.1')
    expect(getVersionByDate('2026-10-18').version).toBe('v1.6.1')
  })

  it('最新版本 v1.9.1 能够识别阵容红利与机制加强', () => {
    const zhuluAdapt = evaluateVersionLineupAdaptation(['逐鹿蒙恬'], 'v1.9.1')
    expect(zhuluAdapt.fitLevel).toBe('BUFFED')
    expect(zhuluAdapt.bonus).toBeGreaterThan(0)
    expect(zhuluAdapt.summary).toContain('嬴律')

    const leitingAdapt = evaluateVersionLineupAdaptation(['雷霆战机'], 'v1.9.1')
    expect(leitingAdapt.fitLevel).toBe('BUFFED')
    expect(leitingAdapt.bonus).toBeGreaterThan(0)
    expect(leitingAdapt.summary).toContain('安琪拉')

    const sanfenAdapt = evaluateVersionLineupAdaptation(['三分登场'], 'v1.9.1')
    expect(sanfenAdapt.fitLevel).toBe('BUFFED')
    expect(sanfenAdapt.bonus).toBeGreaterThan(0)
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

  it('结合棋手进行预测：识别T0棋手机制加成与选手阵容协同', () => {
    // 1. 嬴律 + 逐鹿蒙恬/坦射 -> 享有版本T0与单核追三超强协同
    const yinglvEval = evaluateCommander('嬴律', ['逐鹿蒙恬'], CURRENT_LATEST_VERSION)
    expect(yinglvEval).toBeDefined()
    expect(yinglvEval?.tier).toBe('T0')
    expect(yinglvEval?.synergyLevel).toBe('PERFECT')
    expect(yinglvEval?.bonus).toBeGreaterThan(0.2) // 版本 0.18 + 协同 0.14

    // 2. 安琪拉 + 雷霆战机 -> 享有法爆机甲协同
    const angelaEval = evaluateCommander('安琪拉', ['雷霆战机'], CURRENT_LATEST_VERSION)
    expect(angelaEval).toBeDefined()
    expect(angelaEval?.tier).toBe('T0')
    expect(angelaEval?.synergyLevel).toBe('PERFECT')

    // 3. 参与推演：选手配置棋手后获得显著概率提升
    const baseP = [
      { nickname: '世薄情', commander: '小妲己' },
      { nickname: 'EZ拉丁鱼丶沐汐', commander: '乔汐' },
      { nickname: '北念', commander: null },
      { nickname: '抖音小新游', commander: null },
      { nickname: '抖音妖柒', commander: '安琪拉' },
      { nickname: '遗愿', commander: '白歌' }
    ]
    const resWithCmd = evaluate6PlayerMatchup(baseP, null, mockMatches)
    const yiyuanWithCmd = resWithCmd.players.find(p => p.nickname === '遗愿')!
    expect(yiyuanWithCmd.commander).toBe('白歌')
    expect(yiyuanWithCmd.commanderEvaluation?.tier).toBe('T1')
    expect(yiyuanWithCmd.commanderModifier).toBeGreaterThan(0)
    expect(OFFICIAL_COMMANDERS.length).toBe(21)
  })

  it('用户真实战局 6 席位推演：精准排除脏词、输出各选手招牌阵容与交锋克制矩阵', () => {
    const battleParticipants = [
      { nickname: '沐汐', commander: '乔汐' },
      { nickname: '胜天半子嘉誉', commander: '马可' },
      { nickname: 'QT电竞披萨鱼', commander: '嬴律' },
      { nickname: '抖音刺儿', commander: '乔汐' },
      { nickname: '抖音刺痛', commander: '香香' },
      { nickname: 'B站QT逆光', commander: '庄小鱼' }
    ]

    const result = evaluate6PlayerMatchup(battleParticipants, null, mockMatches)

    expect(result.players.length).toBe(6)

    // 1. 验证沐汐阵容绝非“我不后悔”，而是权威招牌“日落海倒转”
    const muxi = result.players.find(p => p.nickname === '沐汐')!
    expect(muxi).toBeDefined()
    expect(muxi.inferredLineup.lineupName).toBe('日落海倒转')
    expect(muxi.inferredLineup.lineupName).not.toContain('我不后悔')

    // 2. 验证嘉誉招牌为镜猪转吕布
    const jiayu = result.players.find(p => p.nickname === '胜天半子嘉誉')!
    expect(jiayu.inferredLineup.lineupName).toBe('镜猪转吕布')

    // 3. 验证刺痛招牌为逐鹿蒙犽或坦射
    const citong = result.players.find(p => p.nickname === '抖音刺痛')!
    expect(['逐鹿蒙犽', '稷下坦射']).toContain(citong.inferredLineup.lineupName)

    // 4. 验证逆光招牌为传统养猪
    const niguang = result.players.find(p => p.nickname === 'B站QT逆光')!
    expect(niguang.inferredLineup.lineupName).toBe('传统养猪')

    // 5. 验证披萨鱼(遗愿)与所选棋手嬴律协同出战逐鹿蒙恬或主力三分
    const yiyuan = result.players.find(p => p.nickname === 'QT电竞披萨鱼')!
    expect(['逐鹿蒙恬', '三分登场']).toContain(yiyuan.inferredLineup.lineupName)

    // 6. 验证同场交手矩阵与压制链结构完整性
    expect(result.crossMatrix).toBeDefined()
    expect(result.crossMatrix.seats.length).toBe(6)
    expect(result.crossMatrix.cells.length).toBe(6)
    expect(result.suppressionChains).toBeDefined()

    // 7. 每位选手的克制信息和席位均已就绪
    result.players.forEach(p => {
      expect(p.slot).toBeGreaterThanOrEqual(1)
      expect(p.slot).toBeLessThanOrEqual(6)
      expect(p.h2hSummary).toBeDefined()
      expect(Array.isArray(p.activeSuppresses)).toBe(true)
      expect(Array.isArray(p.activeSuppressedBy)).toBe(true)
    })
  })

  it('棋手主流适配阵容库完整定义，且在 Ban 位下能够动态剪枝合规流派', () => {
    // 1. 21位棋手适配库校验
    expect(Object.keys(COMMANDER_ADAPTED_BUILDS).length).toBeGreaterThanOrEqual(20)
    expect(COMMANDER_ADAPTED_BUILDS['马可'].length).toBeGreaterThanOrEqual(3)
    expect(COMMANDER_ADAPTED_BUILDS['玉环'].length).toBeGreaterThanOrEqual(3)

    // 2. 马可在未禁选时的流派池
    const makeNoBan = getCommanderAdaptiveBuilds('马可', null)!
    expect(makeNoBan).toBeDefined()
    expect(makeNoBan.eligibleBuilds.some(b => b.buildName === '镜猪转吕布')).toBe(true)
    expect(makeNoBan.eligibleBuilds.some(b => b.buildName === '大河龙蛇')).toBe(true)
    expect(makeNoBan.bannedBuilds.length).toBe(0)

    // 3. 当禁用【大河阵营】时，马可的「大河龙蛇」被精确剪枝剔除
    const makeBanDahe = getCommanderAdaptiveBuilds('马可', '大河')!
    expect(makeBanDahe.bannedBuilds.some(b => b.buildName === '大河龙蛇')).toBe(true)
    expect(makeBanDahe.eligibleBuilds.some(b => b.buildName === '大河龙蛇')).toBe(false)
    expect(makeBanDahe.eligibleBuilds.some(b => b.buildName === '镜猪转吕布')).toBe(true)

    // 4. 当禁用【三分阵营】时，诸葛亮的「三分登场」与「三分倒转」被排除，顺位推荐「牺牲李信」
    const zhugeBanSanfen = getCommanderAdaptiveBuilds('诸葛亮', '三分')!
    expect(zhugeBanSanfen.bannedBuilds.length).toBeGreaterThanOrEqual(2)
    expect(zhugeBanSanfen.eligibleBuilds.some(b => b.buildName.includes('三分'))).toBe(false)
    expect(zhugeBanSanfen.bestAdaptiveBuild?.buildName).toBe('牺牲李信')
  })

  it('选手在同一个棋手下玩不同阵容的专精熟练度差异明显，且对战力进行真实加减修正', () => {
    // 1. 嘉誉用马可：玩「镜猪转吕布」为 5星炉火纯青 (+0.22)
    const jiayuJingzhu = evaluatePlayerCommanderLineupProficiency('嘉誉', '马可', '镜猪转吕布')
    expect(jiayuJingzhu.starLevel).toBe(5)
    expect(jiayuJingzhu.tierKey).toBe('MASTER')
    expect(jiayuJingzhu.modifier).toBeGreaterThan(0.2)
    expect(jiayuJingzhu.levelLabel).toContain('炉火纯青')

    // 2. 世薄情用马可：玩「大河龙蛇」为 5星炉火纯青 (+0.22)
    const boqingDahe = evaluatePlayerCommanderLineupProficiency('世薄情', '马可', '大河龙蛇')
    expect(boqingDahe.starLevel).toBe(5)
    expect(boqingDahe.modifier).toBeGreaterThan(0.2)

    // 3. 刺痛用香香：玩「逐鹿蒙犽」为 5星炉火纯青；玩生疏流派扣分
    const citongZhulu = evaluatePlayerCommanderLineupProficiency('刺痛', '香香', '逐鹿蒙犽')
    expect(citongZhulu.starLevel).toBe(5)
    expect(citongZhulu.modifier).toBeGreaterThan(0.2)

    // 4. 选手选了该棋手非擅长的生疏流派，受到扣分惩罚
    const citongShushou = evaluatePlayerCommanderLineupProficiency('刺痛', '香香', '六法女帝')
    expect(citongShushou.starLevel).toBeLessThanOrEqual(2)
    expect(citongShushou.modifier).toBeLessThan(0)
  })

  it('用户实战对局真实还原：针对截图中的 6 席位与大河禁选，输出精准推导阵容与熟练度加权胜率', () => {
    // 用户实际对局截图场景：
    // #1 沐汐 (玉环) -> 日落海倒转（绝非“我不后悔”）
    // #2 嘉誉 (玉环) -> 牺牲李信（绝活李信）
    // #3 披萨鱼 (马可) -> 猪镜转李信/逐鹿蒙恬（绝非全员三分登场）
    // #4 刺儿 (庄小鱼) -> 镜猪转吕布（绝非三分登场）
    // #5 刺痛 (白歌) -> 传统养猪（绝非三分登场）
    // #6 逆光 (孙小宾) -> 雷霆战机
    // 本场禁选阵营：大河阵营
    const userSeats = [
      { nickname: '沐汐', commander: '玉环' },
      { nickname: '胜天半子嘉誉', commander: '玉环' },
      { nickname: 'QT电竞披萨鱼', commander: '马可' },
      { nickname: '抖音刺儿', commander: '庄小鱼' },
      { nickname: '抖音刺痛', commander: '白歌' },
      { nickname: 'B站QT逆光', commander: '孙小宾' }
    ]

    const result = evaluate6PlayerMatchup(userSeats, '大河', mockMatches)

    // 1. 验证沐汐(玉环)推断为日落海倒转，熟练度5星炉火纯青
    const muxi = result.players[0]
    expect(muxi.inferredLineup.lineupName).toBe('日落海倒转')
    expect(muxi.lineupProficiency?.starLevel).toBe(5)
    expect(muxi.proficiencyModifier).toBeGreaterThan(0.2)

    // 2. 验证嘉誉(玉环)推断为牺牲李信（绝活），熟练度5星
    const jiayu = result.players[1]
    expect(jiayu.inferredLineup.lineupName).toBe('牺牲李信')
    expect(jiayu.lineupProficiency?.starLevel).toBe(5)

    // 3. 验证披萨鱼(马可)推断为猪镜转李信或逐鹿蒙恬，排除大河龙蛇
    const pizza = result.players[2]
    expect(['猪镜转李信', '逐鹿蒙恬', '镜猪转吕布']).toContain(pizza.inferredLineup.lineupName)
    expect(pizza.inferredLineup.lineupName).not.toBe('大河龙蛇')

    // 4. 验证刺儿(庄小鱼)推断为镜猪转吕布，绝非三分登场
    const cier = result.players[3]
    expect(cier.inferredLineup.lineupName).toBe('镜猪转吕布')

    // 5. 验证刺痛(白歌)推断为传统养猪，绝非三分登场
    const citong = result.players[4]
    expect(citong.inferredLineup.lineupName).toBe('传统养猪')

    // 6. 验证逆光(孙小宾)推断为雷霆战机
    const niguang = result.players[5]
    expect(niguang.inferredLineup.lineupName).toBe('雷霆战机')

    // 7. 验证胜率均经过熟练度加权与归一化
    const sumProb = result.players.reduce((sum, p) => sum + p.adjustedProbability, 0)
    expect(sumProb).toBeCloseTo(1.0, 2)
  })

  it('双窗口三维熟练度模型：主要依据近7天战绩推理，同时兼顾全量历史底蕴画像', () => {
    // 模拟近 7 天对局与历史更早对局
    const timeMatches = [
      // 早期更早版本 (超过7天前, 如 10-23)
      {
        key: 'old-1',
        day: '2026-10-23',
        winnerSlot: 1,
        seats: [
          { slot: 1, nickname: '胜天半子嘉誉', commander: '马可', build: '镜猪转吕布', winner: true },
          { slot: 2, nickname: '梦飞大大', commander: '马可', build: '牺牲李信', winner: false }
        ]
      },
      // 近7天窗口内的对局 (如 11-06, 11-08)
      {
        key: 'recent-1',
        day: '2026-11-06',
        winnerSlot: 1,
        seats: [
          { slot: 1, nickname: '梦飞大大', commander: '马可', build: '成年礼三分登场', winner: true },
          { slot: 2, nickname: '胜天半子嘉誉', commander: '马可', build: '镜猪转吕布', winner: false }
        ]
      },
      {
        key: 'recent-2',
        day: '2026-11-08',
        winnerSlot: 1,
        seats: [
          { slot: 1, nickname: '梦飞大大', commander: '马可', build: '成年礼三分登场', winner: true },
          { slot: 2, nickname: '胜天半子嘉誉', commander: '马可', build: '镜猪转吕布', winner: false }
        ]
      }
    ]

    // 1. 梦飞在近 7 天内操盘马可出战「成年礼三分登场」2战2胜 (100%胜率)
    // 根据近7天高权重优先原则，必须评为 5星炉火纯青
    const mengfeiR7 = evaluatePlayerCommanderLineupProficiency('梦飞大大', '马可', '成年礼三分登场', timeMatches)
    expect(mengfeiR7.starLevel).toBe(5)
    expect(mengfeiR7.recent7Matches).toBe(2)
    expect(mengfeiR7.recent7Wins).toBe(2)
    expect(mengfeiR7.recent7WinRate).toBe(1.0)
    expect(mengfeiR7.reasoning).toContain('近7天实战')

    // 2. 嘉誉在近 7 天内虽然未夺冠，但近7天高频出战（2战）且历史底蕴极深（全量3战1冠，权威招牌）
    // 系统兼顾历史底蕴，绝不误判为 1星生疏初试
    const jiayuProf = evaluatePlayerCommanderLineupProficiency('胜天半子嘉誉', '马可', '镜猪转吕布', timeMatches)
    expect(jiayuProf.starLevel).toBeGreaterThanOrEqual(4)
    expect(jiayuProf.recent7Matches).toBe(2)
    expect(jiayuProf.lifetimeMatches).toBe(3)
    expect(jiayuProf.modifier).toBeGreaterThan(0.1)

    // 3. 选手既无近7天战绩，又无历史全量战绩的违和流派 -> 1星生疏初试
    const strangerProf = evaluatePlayerCommanderLineupProficiency('胜天半子嘉誉', '马可', '纯法五法', timeMatches)
    expect(strangerProf.starLevel).toBe(1)
    expect(strangerProf.modifier).toBeLessThan(0)
    expect(strangerProf.recent7Matches).toBe(0)
    expect(strangerProf.lifetimeMatches).toBe(0)
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

  it('【棋手 × 阵容】王牌对决高压赛场胜率模型：严格以王牌赛场强度为准，过滤普通局污染', () => {
    // 构造混合样本：包含王牌对决赛事，以及假冒普通排位局的娱乐数据
    const matchesSample = [
      // 王牌对决赛事（万象大赛）：安琪拉·雷霆战机在高压赛场登顶吃鸡
      {
        key: 'ace-1',
        mode: 'WANXIANG',
        winnerSlot: 1,
        seats: [
          { slot: 1, commander: '安琪拉', build: '雷霆战机', winner: true },
          { slot: 2, commander: '诸葛亮', build: '牺牲李信', winner: false },
          { slot: 3, commander: '庄小鱼', build: '传统养猪', winner: false },
          { slot: 4, commander: '马可', build: '三分登场', winner: false },
          { slot: 5, commander: '白歌', build: '河洛木兰', winner: false },
          { slot: 6, commander: '嬴律', build: '逐鹿蒙恬', winner: false }
        ]
      },
      {
        key: 'ace-2',
        mode: 'DIAMOND',
        winnerSlot: 1,
        seats: [
          { slot: 1, commander: '安琪拉', build: '雷霆战机', winner: true },
          { slot: 2, commander: '镜', build: '三分登场', winner: false },
          { slot: 3, commander: '诸葛亮', build: '牺牲李信', winner: false },
          { slot: 4, commander: '马可', build: '逐鹿蒙犽', winner: false },
          { slot: 5, commander: '乔汐', build: '日落海倒转', winner: false },
          { slot: 6, commander: '武凤', build: '逐鹿蒙恬', winner: false }
        ]
      },
      // 普通娱乐局（CASUAL）：诸葛亮牺牲李信在普通低分段偶然获胜，必须被系统自动过滤！
      {
        key: 'casual-invalid',
        mode: 'CASUAL',
        winnerSlot: 2,
        seats: [
          { slot: 1, commander: '安琪拉', build: '雷霆战机', winner: false },
          { slot: 2, commander: '诸葛亮', build: '牺牲李信', winner: true }
        ]
      }
    ]

    // 1. 安琪拉 + 雷霆战机：王牌对决T0统治级，在王牌快节奏中伤害拉满，获王牌超模评级
    const anqilaEval = evaluateCommanderBuildSynergy('安琪拉', '雷霆战机', matchesSample)
    expect(anqilaEval.isAceContext).toBe(true)
    expect(anqilaEval.smoothedWinRate).toBeGreaterThanOrEqual(0.35)
    expect(['S', 'A']).toContain(anqilaEval.tier)
    expect(anqilaEval.scoreModifier).toBeGreaterThan(0.08)
    expect(anqilaEval.tierLabel).toContain('王牌')
    expect(anqilaEval.reason).toContain('王牌对决')

    // 2. 玉环 + 日落海倒转：王牌高压锁血神器，贝叶斯先验高
    const yuhuanEval = evaluateCommanderBuildSynergy('玉环', '日落海倒转', [])
    expect(yuhuanEval.isAceContext).toBe(true)
    expect(yuhuanEval.smoothedWinRate).toBeGreaterThanOrEqual(0.35)
    expect(yuhuanEval.scoreModifier).toBeGreaterThan(0.08)
    expect(yuhuanEval.tierLabel).toContain('王牌')

    // 3. 诸葛亮 + 牺牲李信：即使在普通娱乐局偶然赢了，但因被过滤，在王牌赛场依然准确识别为高危陷阱！
    const zhugeEval = evaluateCommanderBuildSynergy('诸葛亮', '牺牲李信', matchesSample)
    expect(zhugeEval.isAceContext).toBe(true)
    expect(zhugeEval.sampleWins).toBe(0) // 普通娱乐局的胜场已被严格排除
    expect(zhugeEval.tier).toBe('C')
    expect(zhugeEval.scoreModifier).toBeLessThan(0)
    expect(zhugeEval.tierLabel).toBe('⚠️ 王牌高危陷阱')
    expect(zhugeEval.reason).toContain('王牌对决高危陷阱')
  })

  it('【阵容体系 × 六人生态博弈克制】：准确识别体系，两两相生相克并生成对抗矩阵与净胜分', () => {
    // 1. 验证体系分类识别
    expect(identifyLineupArchetype('镜猪转吕布').key).toBe('BURST_ASSASSIN')
    expect(identifyLineupArchetype('传统养猪').key).toBe('SUSTAIN_TANK')
    expect(identifyLineupArchetype('雷霆战机').key).toBe('MAGIC_AOE')
    expect(identifyLineupArchetype('成年礼三分登场').key).toBe('RANGED_CARRY')
    expect(identifyLineupArchetype('日落海倒转').key).toBe('FAST_CYCLE')
    expect(identifyLineupArchetype('逐鹿蒙恬').key).toBe('BRUISER_MELEE')

    // 2. 模拟 6 人同场对位
    const testRoster = [
      { slot: 1, nickname: '刺客玩家', buildName: '镜猪转吕布' }, // BURST_ASSASSIN
      { slot: 2, nickname: '射手玩家A', buildName: '三分登场' },    // RANGED_CARRY
      { slot: 3, nickname: '射手玩家B', buildName: '逐鹿蒙犽' },    // RANGED_CARRY
      { slot: 4, nickname: '肉坦玩家', buildName: '传统养猪' },    // SUSTAIN_TANK
      { slot: 5, nickname: '法爆机甲', buildName: '雷霆战机' },    // MAGIC_AOE
      { slot: 6, nickname: '重装战士', buildName: '逐鹿蒙恬' }     // BRUISER_MELEE
    ]

    const counterEval = evaluate6PlayerLineupCounters(testRoster)
    expect(counterEval.perPlayer).toHaveLength(6)
    expect(counterEval.cells).toHaveLength(6)

    // 验证刺客玩家 (#1)：
    // 克制 2 家射手 (#2, #3)，但被肉坦 (#4) 与战士 (#6) 克制
    const p1 = counterEval.perPlayer[0]
    expect(p1.counters.map(c => c.targetSeat)).toContain(2)
    expect(p1.counters.map(c => c.targetSeat)).toContain(3)
    expect(p1.counteredBy.map(c => c.targetSeat)).toContain(4)
    expect(p1.counteredBy.map(c => c.targetSeat)).toContain(6)

    // 验证法爆机甲 (#5)：
    // 克制肉坦 (#4) 与重装战士 (#6)
    const p5 = counterEval.perPlayer[4]
    expect(p5.counters.map(c => c.targetSeat)).toContain(4)
    expect(p5.counters.map(c => c.targetSeat)).toContain(6)
    expect(p5.counteredBy.map(c => c.targetSeat)).toContain(1) // 被刺客跳脸秒杀

    // 验证 6 人同场推演 evaluate6PlayerMatchup 完整集成
    const sim6 = evaluate6PlayerMatchup([
      { nickname: '刺客玩家', commander: '镜' },
      { nickname: '射手玩家A', commander: '香香' },
      { nickname: '射手玩家B', commander: '马可' },
      { nickname: '肉坦玩家', commander: '庄小鱼' },
      { nickname: '法爆机甲', commander: '安琪拉' },
      { nickname: '重装战士', commander: '嬴律' }
    ])

    // 每个玩家都包含棋手阵容大盘胜率评估与体系克制评估
    sim6.players.forEach(p => {
      expect(p.commanderBuildSynergy).toBeDefined()
      expect(p.commanderBuildModifier).toBeDefined()
      expect(p.lineupArchetype).toBeDefined()
      expect(p.lineupCounterScore).toBeDefined()
      expect(p.lineupCounters).toBeDefined()
      expect(p.lineupCounteredBy).toBeDefined()
      expect(p.lineupCounterSummary).toBeTruthy()
    })

    // 包含 6x6 体系对抗矩阵
    expect(sim6.lineupMatrix).toBeDefined()
    expect(sim6.lineupMatrix?.cells).toHaveLength(6)
    expect(sim6.lineupMatrix?.ecosystemSummary).toBeTruthy()

    // 胜率总和为 1
    const totalProb = sim6.players.reduce((sum, p) => sum + p.adjustedProbability, 0)
    expect(totalProb).toBeCloseTo(1.0, 2)
  })

  it('支持 customBuild 手动指定变阵并实时联动重算概率与克制关系', () => {
    // 默认推断
    const baseResult = evaluate6PlayerMatchup([
      { nickname: '抖音EGM小谷芷', commander: '小妲己' },
      { nickname: 'QT新一', commander: '白歌' },
      { nickname: '世薄情', commander: '小妲己' },
      { nickname: 'YK丶', commander: '孙小宾' },
      { nickname: '冷酷心机小猫', commander: '嬴律' },
      { nickname: '风喵喵', commander: '白歌' }
    ])

    const seat6Base = baseResult.players[5]
    expect(seat6Base.inferredLineup.lineupName).toBe('三分倒转')

    // 变阵：将席位 6 风喵喵手动切换为「逐鹿蒙恬」
    const customResult = evaluate6PlayerMatchup([
      { nickname: '抖音EGM小谷芷', commander: '小妲己' },
      { nickname: 'QT新一', commander: '白歌' },
      { nickname: '世薄情', commander: '小妲己' },
      { nickname: 'YK丶', commander: '孙小宾' },
      { nickname: '冷酷心机小猫', commander: '嬴律' },
      { nickname: '风喵喵', commander: '白歌', customBuild: '逐鹿蒙恬' }
    ])

    const seat6Custom = customResult.players[5]
    expect(seat6Custom.inferredLineup.lineupName).toBe('逐鹿蒙恬')
    // 预期战力与概率应重新计算产生差异
    expect(seat6Custom.adjustedProbability).not.toBe(seat6Base.adjustedProbability)
    expect(seat6Custom.finalScore).not.toBe(seat6Base.finalScore)
    // 概率归一化依然保持为 1.0
    const totalProb = customResult.players.reduce((sum, p) => sum + p.adjustedProbability, 0)
    expect(totalProb).toBeCloseTo(1.0, 2)
  })
})

