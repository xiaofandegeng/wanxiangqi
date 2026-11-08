// 王牌对决选手同场克制关系 (Head-to-Head)、禁用阵营 (Ban) 与最新游戏版本更迭 (Version Meta) 综合博弈分析引擎
import { getMasterPlayerName } from './player-grouping'

export const CURRENT_LATEST_VERSION = 'v1.9.1'

export interface GameVersionMeta {
  version: string
  effectiveDate: string
  isLatest: boolean
  title: string
  summary: string
  keyChanges: string[]
  lineupImpact: string
  buffedBuilds: string[]
  nerfedBuilds: string[]
}

export const GAME_VERSIONS: GameVersionMeta[] = [
  {
    version: 'v1.9.1',
    effectiveDate: '2026-11-05',
    isLatest: true,
    title: 'v1.9.1 (11月5日 - 官方当前最新版本)',
    summary: '新棋手武凤登场，嬴律复制英雄机制颠覆单核追三，乔汐转瞬3-5阶与潮汐4次大强化，安琪拉法攻125%飞跃',
    keyChanges: [
      '新棋手「武凤」（11/06）：偷取敌方秘技牌机制打破单棋手套路上限',
      '棋手「嬴律」并购红利：合成上限后每回合额外随机获得1张场上英雄复制（极大加速高阶单核追三星）',
      '棋手「乔汐」温柔呼唤：抽取范围收窄为3~5阶转瞬牌；潮汐交响初始触发提升至4次(+20等级)',
      '棋手「安琪拉」打扫战场：飞行器继承法攻提至125%、攻速提至30%（雷霆战机法爆体系大火）',
      '天赋「乘胜追击」优化为回合开始拿战术，胜利拿高阶战术'
    ],
    lineupImpact: '高阶单核追三（逐鹿蒙恬、日落海倒转、长城高费）受嬴律复制机制利好上限激增；雷霆战机与法爆机甲大幅增强；乔汐转瞬中高阶快攻成型更快；三分领袖持续受益。',
    buffedBuilds: ['逐鹿蒙恬', '日落海倒转', '雷霆战机', '三分登场', '三分倒转'],
    nerfedBuilds: []
  },
  {
    version: 'v1.8.1',
    effectiveDate: '2026-10-29',
    isLatest: false,
    title: 'v1.8.1 (10月29日更新)',
    summary: '三分领袖治疗30%升至40%引爆三分潮，乔汐重做，阿离/孙尚香手感优化，新增帝临/勇冠三军',
    keyChanges: [
      '天赋「三分领袖」治疗由30%大幅提升至40%（三分体系大爆发）',
      '新增天赋「帝临」（嬴政+武则天）、「勇冠三军」（马超全队法爆）',
      '乔汐潮汐交响重做、阿离红叶染锋等级保留、孙尚香炮击手感优化'
    ],
    lineupImpact: '三分阵营全面崛起，「三分登场」、「三分倒转」与「养猪三分」胜率飙升，成为主流赛场核心体系。',
    buffedBuilds: ['三分登场', '三分倒转', '传统养猪'],
    nerfedBuilds: []
  },
  {
    version: 'v1.7.1',
    effectiveDate: '2026-10-22',
    isLatest: false,
    title: 'v1.7.1 (10月22日更新)',
    summary: '安琪拉、班叔、昭君、马可数值调整，限制性进化/光棱塔优化',
    keyChanges: [
      '安琪拉、班叔、昭君、马可技能数值平衡',
      '天赋限制性进化、光棱塔机制优化'
    ],
    lineupImpact: '机关与长城过渡增强，法系阵容梯度分化。',
    buffedBuilds: ['河洛木兰'],
    nerfedBuilds: []
  },
  {
    version: 'v1.6.1',
    effectiveDate: '2026-10-15',
    isLatest: false,
    title: 'v1.6.1 (10月15日更新)',
    summary: '王牌对决选人改为门槛随机6人，支持上限由5万降为1万钻石，蒙犽优化',
    keyChanges: [
      '王牌对决支持上限调整为10000钻石',
      '王牌对决改为门槛随机6人选拔机制',
      '蒙犽弹道优化'
    ],
    lineupImpact: '王牌赛事规则重构，支持上限规范化。',
    buffedBuilds: [],
    nerfedBuilds: []
  },
  {
    version: 'v1.5.1',
    effectiveDate: '2026-10-08',
    isLatest: false,
    title: 'v1.5.1 (10月8日版本更迭)',
    summary: '明先生微调、蔡文姬毒奶削弱，早期支持上限5万',
    keyChanges: [
      '明先生微调、蔡文姬毒奶削弱',
      '王牌对决早期每人支持上限50000钻石'
    ],
    lineupImpact: '早期纯续航养猪体系受到抑制。',
    buffedBuilds: [],
    nerfedBuilds: ['传统养猪']
  }
]

export function getVersionByDate(dateStr: string): GameVersionMeta {
  if (!dateStr) return GAME_VERSIONS[0]
  const clean = dateStr.slice(0, 10)
  for (const v of GAME_VERSIONS) {
    if (clean >= v.effectiveDate) {
      return v
    }
  }
  return GAME_VERSIONS[GAME_VERSIONS.length - 1]
}

export interface VersionLineupAdaptation {
  version: string
  isLatest: boolean
  fitLevel: 'BUFFED' | 'STABLE' | 'OUTDATED'
  fitLabel: string
  summary: string
  bonus: number // 战力增益 (-0.1 ~ +0.15)
  details: string[]
}

export function evaluateVersionLineupAdaptation(
  playerCommonBuilds: string[],
  targetVersion: string = CURRENT_LATEST_VERSION
): VersionLineupAdaptation {
  const ver = GAME_VERSIONS.find(v => v.version === targetVersion) || GAME_VERSIONS[0]
  const buildsStr = playerCommonBuilds.join(' ')
  
  let fitLevel: 'BUFFED' | 'STABLE' | 'OUTDATED' = 'STABLE'
  let bonus = 0
  const details: string[] = []

  if (ver.version === 'v1.9.1') {
    if (buildsStr.includes('逐鹿') || buildsStr.includes('蒙恬')) {
      fitLevel = 'BUFFED'
      bonus += 0.08
      details.push('嬴律「并购红利」额外复制场上英雄，逐鹿蒙恬追三星上限质变')
    }
    if (buildsStr.includes('雷霆') || buildsStr.includes('战机')) {
      fitLevel = 'BUFFED'
      bonus += 0.09
      details.push('安琪拉飞行器法攻继承提升至125%、攻速30%，雷霆机甲爆发大幅增强')
    }
    if (buildsStr.includes('日落海') || buildsStr.includes('倒转')) {
      fitLevel = 'BUFFED'
      bonus += 0.06
      details.push('倒转追梦体系受嬴律复制机制利好，成型速度大幅提升')
    }
    if (buildsStr.includes('三分')) {
      fitLevel = 'BUFFED'
      bonus += 0.05
      details.push('持续享受 v1.8.1「三分领袖」40% 治疗加成，赛场高胜率常客')
    }
  } else if (ver.version < 'v1.8.1' && buildsStr.includes('三分')) {
    fitLevel = 'OUTDATED'
    bonus -= 0.05
    details.push('该历史版本尚未实装三分领袖 40% 治疗加成，阵容强度受限')
  }

  const fitLabel = fitLevel === 'BUFFED' ? '版本红利' : (fitLevel === 'OUTDATED' ? '版本滞后' : '版本平稳')
  const summary = details.length
    ? details.join('；')
    : `在 ${ver.version} 版本下阵容环境平稳，无剧烈版本震荡`

  return {
    version: ver.version,
    isLatest: ver.isLatest,
    fitLevel,
    fitLabel,
    summary,
    bonus: Number(bonus.toFixed(3)),
    details
  }
}

export type FactionType = '三分' | '逐鹿' | '日落海' | '河洛' | '大河' | '通用/其他'

export type BanImpactLevel = 'CRITICAL' | 'MODERATE' | 'IMMUNE' | 'BENEFITED'

export interface CommanderMeta {
  name: string
  title: string
  tier: 'T0' | 'T1' | 'T2'
  suitableBuilds: string[]
  description: string
  v191Bonus: number // 版本机制加成
  synergyKeyword: string
}

/** 官方主流棋手库与当前版本机制强度定义 */
export const OFFICIAL_COMMANDERS: readonly CommanderMeta[] = [
  {
    name: '嬴律',
    title: '并购红利 / 单核追三之王',
    tier: 'T0',
    suitableBuilds: ['逐鹿蒙恬', '稷下坦射', '坦射', '传统养猪', '日落海倒转'],
    description: 'v1.9.1重磅加强：合成上限后每回合额外随机复制场上英雄，高阶单核追三星神速，大幅拔高阵容上限',
    v191Bonus: 0.18,
    synergyKeyword: '单核追三'
  },
  {
    name: '安琪拉',
    title: '打扫战场 / 法爆狂潮',
    tier: 'T0',
    suitableBuilds: ['雷霆战机', '雷霆机甲', '稷下雷霆', '法天象地', '日落海倒转'],
    description: 'v1.9.1官方大加强：飞行器继承法攻提至125%、攻速30%，雷霆机甲与法术爆发阵容强度爆表',
    v191Bonus: 0.16,
    synergyKeyword: '法爆机甲'
  },
  {
    name: '乔汐',
    title: '温柔呼唤 / 潮汐交响',
    tier: 'T1',
    suitableBuilds: ['日落海倒转', '三分倒转', '法天象地', '倒转'],
    description: 'v1.9.1转瞬抽取收窄至3~5阶高质量牌，潮汐交响初始4次，法系倒转与转瞬牌体系成型极快',
    v191Bonus: 0.12,
    synergyKeyword: '倒转高阶'
  },
  {
    name: '武凤',
    title: '偷取秘技 / 全能博弈',
    tier: 'T1',
    suitableBuilds: ['全能', '稷下坦射', '逐鹿蒙恬', '传统养猪', '三分登场'],
    description: '11月6日新棋手登场：偷取敌方秘技牌机制打破单棋手套路上限，博弈对抗性极强',
    v191Bonus: 0.10,
    synergyKeyword: '秘技对抗'
  },
  {
    name: '庄周',
    title: '梦蝶逍遥 / 免控护体',
    tier: 'T1',
    suitableBuilds: ['传统养猪', '稷下坦克', '稷下坦射', '养猪', '日落海'],
    description: '全队免控与减伤坦度，极端克制控制爆发流派，是养猪与坦克核心的坚实后盾',
    v191Bonus: 0.08,
    synergyKeyword: '免控保核'
  },
  {
    name: '诸葛亮',
    title: '神机妙算 / 阵营增益',
    tier: 'T1',
    suitableBuilds: ['三分登场', '三分倒转', '三分蜀国'],
    description: '三分蜀国专属棋手，提供强大的阵营技能连环与治疗爆发协同',
    v191Bonus: 0.12,
    synergyKeyword: '三分增益'
  },
  {
    name: '司马懿',
    title: '暗影收割 / 爆发突刺',
    tier: 'T1',
    suitableBuilds: ['刺客', '六影扶桑', '法天象地'],
    description: '提供高额斩杀与爆发机动，专克无护盾脆皮后排阵容',
    v191Bonus: 0.06,
    synergyKeyword: '刺客斩杀'
  },
  {
    name: '小妲己',
    title: '金币收益 / 万金油保底',
    tier: 'T2',
    suitableBuilds: ['长安九五', '传统养猪', '长安倒转'],
    description: '经典棋手，提供稳定的经济成长与利息收益，适合长安及慢速憋高阶阵容',
    v191Bonus: 0.05,
    synergyKeyword: '经济发育'
  },
  {
    name: '鲁班七号',
    title: '机关轰炸 / 射手火力',
    tier: 'T2',
    suitableBuilds: ['稷下坦射', '坦射', '雷霆机甲'],
    description: '重装机关火力压制，强化物理射手阵容的持续输出与穿透',
    v191Bonus: 0.08,
    synergyKeyword: '射手轰炸'
  },
  {
    name: '狄仁杰',
    title: '令牌律法 / 破甲减防',
    tier: 'T2',
    suitableBuilds: ['长安九五', '稷下坦克', '坦射'],
    description: '射手攻速与穿透增益，兼具一定控制效果',
    v191Bonus: 0.07,
    synergyKeyword: '破甲速攻'
  },
  {
    name: '刘备',
    title: '仁义之盾 / 蜀国卫戍',
    tier: 'T2',
    suitableBuilds: ['三分登场', '三分蜀国'],
    description: '为三分阵营提供护盾与保底血量加成',
    v191Bonus: 0.08,
    synergyKeyword: '三分卫戍'
  },
  {
    name: '孙尚香',
    title: '重炮轰鸣 / 物理暴击',
    tier: 'T2',
    suitableBuilds: ['三分登场', '稷下坦射'],
    description: '提供物理暴击与爆发射击加成',
    v191Bonus: 0.06,
    synergyKeyword: '暴击重炮'
  }
]

export interface CommanderEvaluation {
  commander: string
  tier: string
  levelLabel: string
  bonus: number
  synergyScore: number
  summary: string
  synergyLevel: 'PERFECT' | 'GOOD' | 'NEUTRAL' | 'MISMATCH'
}

/** 评估棋手机制、版本增益与选手主力流派的协同效果 */
export function evaluateCommander(
  commanderName: string | null | undefined,
  commonBuilds: string[] = [],
  version: string = CURRENT_LATEST_VERSION
): CommanderEvaluation | null {
  if (!commanderName || !commanderName.trim()) return null
  const clean = commanderName.trim()
  const meta = OFFICIAL_COMMANDERS.find(c => c.name === clean || clean.includes(c.name))
  if (!meta) {
    return {
      commander: clean,
      tier: 'T2',
      levelLabel: '自定义棋手',
      bonus: 0.04,
      synergyScore: 0,
      summary: `选用棋手「${clean}」，提供常规战术机制支持。`,
      synergyLevel: 'NEUTRAL'
    }
  }

  // 1. 版本机制加成
  const isLatest = version === 'v1.9.1'
  const versionBonus = isLatest ? meta.v191Bonus : 0.05

  // 2. 选手阵容与棋手的协同加成
  let synergyLevel: CommanderEvaluation['synergyLevel'] = 'NEUTRAL'
  let synergyScore = 0
  let synergyNote = ''

  const matchesBuild = commonBuilds.some(b =>
    meta.suitableBuilds.some(sb => b.includes(sb) || sb.includes(b))
  )

  if (matchesBuild) {
    synergyLevel = 'PERFECT'
    synergyScore = 0.14
    synergyNote = `与选手主力流派高度契合（${meta.synergyKeyword}超强协同）`
  } else if (meta.suitableBuilds.includes('全能')) {
    synergyLevel = 'GOOD'
    synergyScore = 0.08
    synergyNote = '棋手机制通用全能，平稳增幅阵容战力'
  } else if (commonBuilds.length > 0) {
    synergyLevel = 'NEUTRAL'
    synergyScore = 0.02
    synergyNote = '棋手与选手主力构筑平稳互补'
  }

  const totalBonus = Number((versionBonus + synergyScore).toFixed(3))
  const summary = `【${meta.name} (${meta.tier})】${meta.description}。${synergyNote}。`

  return {
    commander: meta.name,
    tier: meta.tier,
    levelLabel: meta.tier === 'T0' ? '版本 T0 强力棋手' : (meta.tier === 'T1' ? '强势热门棋手' : '常规棋手'),
    bonus: totalBonus,
    synergyScore,
    summary,
    synergyLevel
  }
}

export interface FactionBreakdown {
  faction: FactionType
  matches: number
  wins: number
  share: number
}

export interface BanImpactEvaluation {
  banFaction: string
  level: BanImpactLevel
  levelLabel: string
  factionShare: number
  historicalRecord: { matches: number; wins: number; winRate: number }
  description: string
  advice: string
  scoreModifier: number // 战力修正系数 (-0.3 ~ +0.2)
}

export interface HeadToHeadRecord {
  opponent: string
  opponentMaster: string
  encounters: number
  wins: number // 我夺冠
  losses: number // 对方夺冠
  neither: number // 双方均未夺冠（其他人夺冠）
  suppressionRate: number // 净压制率 (wins - losses) / encounters
  summary: string
}

export interface PlayerMatchupProfile {
  playerName: string
  masterName: string
  totalMatches: number
  totalWins: number
  commonBuilds: string[]
  versionAdaptation?: VersionLineupAdaptation
  factionDistribution: Record<FactionType, { matches: number; wins: number }>
  factions: FactionBreakdown[]
  h2h: HeadToHeadRecord[]
  nemeses: HeadToHeadRecord[] // 天敌/苦主 (losses > wins)
  victims: HeadToHeadRecord[] // 压制对象 (wins > losses)
  topRivals: HeadToHeadRecord[] // 遭遇次数最多宿敌
}

export interface SixPlayerMatchupResult {
  players: {
    nickname: string
    masterName: string
    commander: string | null
    commanderEvaluation: CommanderEvaluation | null
    baseScore: number
    h2hBonus: number
    banModifier: number
    versionModifier: number
    commanderModifier: number
    finalScore: number
    adjustedProbability: number
    banEvaluation: BanImpactEvaluation | null
    versionAdaptation: VersionLineupAdaptation
    suppressedBy: string[] // 被本场哪些选手历史压制
    suppresses: string[] // 本场克制哪些选手
  }[]
  crossMatchups: {
    winner: string
    loser: string
    wins: number
    losses: number
    encounters: number
    description: string
  }[]
  targetVersion: string
  versionMeta: GameVersionMeta
  versionSummary: {
    version: string
    isLatest: boolean
    summaryText: string
    buffedPlayers: string[]
  }
  banSummary: {
    bannedFaction: string | null
    criticalPlayers: string[]
    benefitedPlayers: string[]
    summaryText: string
  }
}

/**
 * 根据阵容玩法字符串解析所属核心阵营
 */
export function getBuildFaction(buildLabel?: string | null): FactionType {
  if (!buildLabel) return '通用/其他'
  const b = buildLabel.trim()
  if (b.includes('三分') || b.includes('成年礼三分')) return '三分'
  if (b.includes('逐鹿')) return '逐鹿'
  if (b.includes('日落海') || b.includes('伞苏烈') || b.includes('伞刘邦') || b.includes('伞艾琳')) return '日落海'
  if (b.includes('河洛') || b.includes('木兰') || b.includes('李信') || b.includes('帝临')) return '河洛'
  if (b.includes('大河') || b.includes('山鬼') || b.includes('龙蛇')) return '大河'
  return '通用/其他'
}

/**
 * 从比赛原始数据中，构建全量选手同场交锋与阵营依赖图谱
 */
export function buildPlayerMatchupProfiles(
  matches: any[],
  useMasterIdentity = true
): Map<string, PlayerMatchupProfile> {
  const profileMap = new Map<string, PlayerMatchupProfile>()

  const getName = (nick: string) => useMasterIdentity ? getMasterPlayerName(nick) : nick

  // 初始化档案
  const getOrCreate = (name: string): PlayerMatchupProfile => {
    let p = profileMap.get(name)
    if (!p) {
      p = {
        playerName: name,
        masterName: getMasterPlayerName(name),
        totalMatches: 0,
        totalWins: 0,
        factionDistribution: {
          三分: { matches: 0, wins: 0 },
          逐鹿: { matches: 0, wins: 0 },
          日落海: { matches: 0, wins: 0 },
          河洛: { matches: 0, wins: 0 },
          大河: { matches: 0, wins: 0 },
          '通用/其他': { matches: 0, wins: 0 }
        },
        factions: [],
        commonBuilds: [],
        h2h: [],
        nemeses: [],
        victims: [],
        topRivals: []
      }
      profileMap.set(name, p)
    }
    return p
  }

  // 内部交锋记账表：`${pA}|||${pB}`
  const h2hMatrix = new Map<string, { encounters: number; aWins: number; bWins: number; neither: number }>()
  const buildCounts = new Map<string, Map<string, number>>()

  for (const m of matches) {
    if (!m.seats || !Array.isArray(m.seats) || m.seats.length === 0) continue

    const winnerSeat = m.seats.find((s: any) => s.slot === m.winnerSlot || s.winner)
    const winnerName = winnerSeat ? getName(winnerSeat.nickname) : null

    // 统计每位席位选手的阵营分布
    const activeParticipants: { name: string; faction: FactionType; isWinner: boolean }[] = []

    for (const seat of m.seats) {
      if (!seat.nickname) continue
      const name = getName(seat.nickname)
      const isWinner = (seat.slot === m.winnerSlot) || Boolean(seat.winner)
      const faction = getBuildFaction(seat.build)

      const profile = getOrCreate(name)
      profile.totalMatches++
      if (isWinner) profile.totalWins++

      profile.factionDistribution[faction].matches++
      if (isWinner) profile.factionDistribution[faction].wins++

      if (seat.build && typeof seat.build === 'string' && seat.build.trim()) {
        let bmap = buildCounts.get(name)
        if (!bmap) {
          bmap = new Map<string, number>()
          buildCounts.set(name, bmap)
        }
        bmap.set(seat.build.trim(), (bmap.get(seat.build.trim()) || 0) + 1)
      }

      activeParticipants.push({ name, faction, isWinner })
    }

    // 统计同场 6 人两两之间的胜负交锋
    const uniqueNames = [...new Set(activeParticipants.map(x => x.name))]
    for (let i = 0; i < uniqueNames.length; i++) {
      for (let j = i + 1; j < uniqueNames.length; j++) {
        const a = uniqueNames[i]
        const b = uniqueNames[j]
        const pairKey = a < b ? `${a}|||${b}` : `${b}|||${a}`

        let rec = h2hMatrix.get(pairKey)
        if (!rec) {
          rec = { encounters: 0, aWins: 0, bWins: 0, neither: 0 }
          h2hMatrix.set(pairKey, rec)
        }
        rec.encounters++

        const pA = a < b ? a : b
        const pB = a < b ? b : a

        if (winnerName === pA) rec.aWins++
        else if (winnerName === pB) rec.bWins++
        else rec.neither++
      }
    }
  }

  // 汇总各选手的阵营占比与交锋排行榜
  for (const profile of profileMap.values()) {
    // 阵营占比
    profile.factions = Object.entries(profile.factionDistribution).map(([faction, data]) => ({
      faction: faction as FactionType,
      matches: data.matches,
      wins: data.wins,
      share: profile.totalMatches > 0 ? Number((data.matches / profile.totalMatches).toFixed(3)) : 0
    })).sort((a, b) => b.matches - a.matches || b.wins - a.wins)

    // 解析 H2H
    const h2hList: HeadToHeadRecord[] = []
    for (const [key, data] of h2hMatrix.entries()) {
      const [p1, p2] = key.split('|||')
      if (p1 !== profile.playerName && p2 !== profile.playerName) continue

      const isP1 = p1 === profile.playerName
      const opponent = isP1 ? p2 : p1
      const myWins = isP1 ? data.aWins : data.bWins
      const oppWins = isP1 ? data.bWins : data.aWins

      const suppression = data.encounters > 0 ? (myWins - oppWins) / data.encounters : 0

      let summary = '势均力敌'
      if (myWins > oppWins) {
        summary = `同场压制 (${myWins}胜 ${oppWins}负)`
      } else if (oppWins > myWins) {
        summary = `遭遇劣势 (${myWins}胜 ${oppWins}负)`
      }

      h2hList.push({
        opponent,
        opponentMaster: getMasterPlayerName(opponent),
        encounters: data.encounters,
        wins: myWins,
        losses: oppWins,
        neither: data.neither,
        suppressionRate: Number(suppression.toFixed(2)),
        summary
      })
    }

    profile.h2h = h2hList.sort((a, b) => b.encounters - a.encounters)
    // 天敌（同场被压制次数 > 0，且净胜为负）
    profile.nemeses = h2hList.filter(x => x.losses > x.wins).sort((a, b) => (b.losses - b.wins) - (a.losses - a.wins))
    // 压制对象（同场压制次数 > 0，且净胜为正）
    profile.victims = h2hList.filter(x => x.wins > x.losses).sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses))
    // 最频繁相遇对手
    profile.topRivals = h2hList.slice(0, 5)

    // 常用阵容与版本适应度
    const bmap = buildCounts.get(profile.playerName)
    if (bmap) {
      profile.commonBuilds = [...bmap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(x => x[0])
        .slice(0, 3)
    } else {
      profile.commonBuilds = []
    }
    profile.versionAdaptation = evaluateVersionLineupAdaptation(profile.commonBuilds, CURRENT_LATEST_VERSION)
  }

  return profileMap
}

/**
 * 评估某个 Ban 阵营对特定选手的影响
 */
export function evaluateBanImpact(
  profile: PlayerMatchupProfile | null | undefined,
  bannedFaction?: string | null,
  historicalMatches: any[] = []
): BanImpactEvaluation | null {
  if (!bannedFaction || !bannedFaction.trim() || !profile) return null

  const ban = bannedFaction.trim()
  const matchedFaction: FactionType | null =
    ban.includes('三分') ? '三分' :
    ban.includes('逐鹿') ? '逐鹿' :
    ban.includes('日落海') ? '日落海' :
    ban.includes('河洛') ? '河洛' :
    ban.includes('大河') ? '大河' : null

  if (!matchedFaction) {
    return {
      banFaction: ban,
      level: 'IMMUNE',
      levelLabel: '无明显影响',
      factionShare: 0,
      historicalRecord: { matches: 0, wins: 0, winRate: 0 },
      description: `禁用阵营「${ban}」与当前主流体系无直接冲突`,
      advice: '选手正常执行既定核心流派。',
      scoreModifier: 0
    }
  }

  // 计算选手对该阵营的依赖度
  const factionData = profile.factionDistribution[matchedFaction] || { matches: 0, wins: 0 }
  const totalMatches = Math.max(1, profile.totalMatches)
  const totalWins = Math.max(1, profile.totalWins)

  const matchShare = factionData.matches / totalMatches
  const winShare = factionData.wins / totalWins

  // 计算历史在该 Ban 下的真实表现
  let banMatches = 0
  let banWins = 0
  for (const m of historicalMatches) {
    if (m.ban && m.ban.includes(matchedFaction)) {
      const seat = m.seats?.find((s: any) => getMasterPlayerName(s.nickname) === profile.masterName)
      if (seat) {
        banMatches++
        if (seat.slot === m.winnerSlot || seat.winner) banWins++
      }
    }
  }

  const histWinRate = banMatches > 0 ? banWins / banMatches : 0

  // 综合评级
  if (winShare >= 0.5 || matchShare >= 0.6) {
    return {
      banFaction: ban,
      level: 'CRITICAL',
      levelLabel: '严重受限',
      factionShare: Number((winShare * 100).toFixed(1)),
      historicalRecord: { matches: banMatches, wins: banWins, winRate: Number((histWinRate * 100).toFixed(1)) },
      description: `该选手的核心体系依赖「${matchedFaction}」（占其历史胜场 ${(winShare * 100).toFixed(0)}%）。本场阵营被封锁，被迫选择替补阵容。`,
      advice: `建议谨慎支持；密切观察其是否具备河洛李信或传统养猪等备选英雄池。`,
      scoreModifier: -0.28
    }
  } else if (winShare >= 0.25 || matchShare >= 0.3) {
    return {
      banFaction: ban,
      level: 'MODERATE',
      levelLabel: '中度受限',
      factionShare: Number((winShare * 100).toFixed(1)),
      historicalRecord: { matches: banMatches, wins: banWins, winRate: Number((histWinRate * 100).toFixed(1)) },
      description: `该选手常用流派包含「${matchedFaction}」（占比约 ${(matchShare * 100).toFixed(0)}%），选阵受到一定约束。`,
      advice: '选手具有其他体系可供切换，战力稍受折损但仍具竞争实力。',
      scoreModifier: -0.12
    }
  } else if (winShare === 0 && matchShare <= 0.15) {
    return {
      banFaction: ban,
      level: 'BENEFITED',
      levelLabel: '环境利好',
      factionShare: Number((matchShare * 100).toFixed(1)),
      historicalRecord: { matches: banMatches, wins: banWins, winRate: Number((histWinRate * 100).toFixed(1)) },
      description: `选手核心玩法（如传统养猪、日落海或河洛）避开了「${matchedFaction}」禁用，同时场上其他主玩该阵营的对手被削弱。`,
      advice: '外部竞争对手受到流派封锁，该选手处于极佳的博弈生态位，胜率看涨。',
      scoreModifier: +0.15
    }
  } else {
    return {
      banFaction: ban,
      level: 'IMMUNE',
      levelLabel: '基本免疫',
      factionShare: Number((matchShare * 100).toFixed(1)),
      historicalRecord: { matches: banMatches, wins: banWins, winRate: Number((histWinRate * 100).toFixed(1)) },
      description: `该选手对「${matchedFaction}」依赖较低，禁用对其实战发挥影响有限。`,
      advice: '常规阵容发挥不受影响。',
      scoreModifier: 0
    }
  }
}

/**
 * 六人同场推演算法：
 * 综合选手基础战力 + 本场交手克制奖励/减免 + Ban位惩罚/增益 + 所选棋手协同机制 + 官方最新版本更迭适配度，输出校正概率与博弈情报
 */
export function evaluate6PlayerMatchup(
  participants: { nickname: string; profileId?: string | null; commander?: string | null }[],
  bannedFaction?: string | null,
  allMatches: any[] = [],
  targetVersion: string = CURRENT_LATEST_VERSION
): SixPlayerMatchupResult {
  const profileMap = buildPlayerMatchupProfiles(allMatches, true)

  const softmax = (scores: number[]) => {
    const max = Math.max(...scores)
    const exps = scores.map(x => Math.exp(x - max))
    const sum = exps.reduce((a, b) => a + b, 0)
    return exps.map(x => (sum > 0 ? x / sum : 1 / scores.length))
  }

  // 1. 获取每位选手的 masterName 与 profile、所选棋手
  const roster = participants.map(p => {
    const master = getMasterPlayerName(p.nickname)
    const prof = profileMap.get(master) || profileMap.get(p.nickname)
    return {
      nickname: p.nickname,
      masterName: master,
      commander: p.commander || null,
      profile: prof
    }
  })

  // 2. 计算两两交锋克制矩阵
  const crossMatchups: SixPlayerMatchupResult['crossMatchups'] = []
  const h2hAdvantage = new Map<string, number>()
  const suppressedByMap = new Map<string, string[]>()
  const suppressesMap = new Map<string, string[]>()

  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const pA = roster[i]
      const pB = roster[j]

      // 查找 A 在面对 B 时的记录
      const recA = pA.profile?.h2h.find(x => x.opponentMaster === pB.masterName)
      if (recA && (recA.wins > 0 || recA.losses > 0)) {
        const netA = recA.wins - recA.losses
        h2hAdvantage.set(pA.masterName, (h2hAdvantage.get(pA.masterName) || 0) + netA * 0.15)
        h2hAdvantage.set(pB.masterName, (h2hAdvantage.get(pB.masterName) || 0) - netA * 0.15)

        if (recA.wins > recA.losses) {
          suppressesMap.set(pA.masterName, [...(suppressesMap.get(pA.masterName) || []), pB.masterName])
          suppressedByMap.set(pB.masterName, [...(suppressedByMap.get(pB.masterName) || []), pA.masterName])
          crossMatchups.push({
            winner: pA.masterName,
            loser: pB.masterName,
            wins: recA.wins,
            losses: recA.losses,
            encounters: recA.encounters,
            description: `${pA.masterName} 历史上同场压制 ${pB.masterName} (${recA.wins}胜 ${recA.losses}负 / ${recA.encounters}战)`
          })
        } else if (recA.losses > recA.wins) {
          suppressesMap.set(pB.masterName, [...(suppressesMap.get(pB.masterName) || []), pA.masterName])
          suppressedByMap.set(pA.masterName, [...(suppressedByMap.get(pA.masterName) || []), pB.masterName])
          crossMatchups.push({
            winner: pB.masterName,
            loser: pA.masterName,
            wins: recA.losses,
            losses: recA.wins,
            encounters: recA.encounters,
            description: `${pB.masterName} 历史上同场压制 ${pA.masterName} (${recA.losses}胜 ${recA.wins}负 / ${recA.encounters}战)`
          })
        }
      }
    }
  }

  // 3. 计算 Ban 位评估、棋手协同增益、版本更迭影响与综合得分
  const criticalPlayers: string[] = []
  const benefitedPlayers: string[] = []
  const buffedPlayers: string[] = []

  const preliminary = roster.map(p => {
    const prof = p.profile
    const wins = prof?.totalWins || 0
    const matches = prof?.totalMatches || 1
    const baseWinRate = wins / matches

    // 基础得分基于对局胜率（平滑拉开差距）
    const baseScore = Math.log(Math.max(0.05, baseWinRate + 0.1))

    // 交手修正分
    const h2hBonus = h2hAdvantage.get(p.masterName) || 0

    // Ban 位修正分
    const banEval = evaluateBanImpact(prof, bannedFaction, allMatches)
    const banModifier = banEval ? banEval.scoreModifier : 0

    // 最新游戏版本阵容适应度修正分
    const versionAdapt = evaluateVersionLineupAdaptation(
      prof?.commonBuilds || [],
      targetVersion
    )
    const versionModifier = versionAdapt.bonus

    // 所选棋手机制强度与流派协同修正分
    const cmdEval = evaluateCommander(p.commander, prof?.commonBuilds || [], targetVersion)
    const commanderModifier = cmdEval ? cmdEval.bonus : 0

    if (banEval?.level === 'CRITICAL') criticalPlayers.push(p.masterName)
    if (banEval?.level === 'BENEFITED') benefitedPlayers.push(p.masterName)
    if (versionAdapt.fitLevel === 'BUFFED') buffedPlayers.push(p.masterName)

    const finalScore = baseScore + h2hBonus + banModifier + versionModifier + commanderModifier

    return {
      nickname: p.nickname,
      masterName: p.masterName,
      commander: p.commander,
      commanderEvaluation: cmdEval,
      baseScore: Number(baseScore.toFixed(3)),
      h2hBonus: Number(h2hBonus.toFixed(3)),
      banModifier: Number(banModifier.toFixed(3)),
      versionModifier: Number(versionModifier.toFixed(3)),
      commanderModifier: Number(commanderModifier.toFixed(3)),
      finalScore: Number(finalScore.toFixed(3)),
      adjustedProbability: 0,
      banEvaluation: banEval,
      versionAdaptation: versionAdapt,
      suppressedBy: suppressedByMap.get(p.masterName) || [],
      suppresses: suppressesMap.get(p.masterName) || []
    }
  })

  // 4. Softmax 归一化计算最终胜率
  const rawScores = preliminary.map(x => x.finalScore)
  const probabilities = softmax(rawScores)

  preliminary.forEach((item, idx) => {
    item.adjustedProbability = Number(probabilities[idx].toFixed(4))
  })

  // 5. 组织 Ban 总结文案
  let summaryText = '本场未指定禁用阵营，选手各展所长。'
  if (bannedFaction && bannedFaction.trim()) {
    if (criticalPlayers.length > 0 && benefitedPlayers.length > 0) {
      summaryText = `本场禁用「${bannedFaction}」对【${criticalPlayers.join('、')}】构成严重限制，而【${benefitedPlayers.join('、')}】因流派错位获得显著环境利好。`
    } else if (criticalPlayers.length > 0) {
      summaryText = `本场禁用「${bannedFaction}」重点限制了【${criticalPlayers.join('、')}】的招牌阵容。`
    } else if (benefitedPlayers.length > 0) {
      summaryText = `本场禁用「${bannedFaction}」使得【${benefitedPlayers.join('、')}】所处博弈环境更为舒适。`
    } else {
      summaryText = `本场禁用「${bannedFaction}」对 6 名参赛选手的主力体系未造成单边冲击。`
    }
  }

  // 6. 版本更迭综合研判文案
  const verMeta = GAME_VERSIONS.find(v => v.version === targetVersion) || GAME_VERSIONS[0]
  let versionSummaryText = `当前推演基于官方最新版本【${verMeta.version}】（${verMeta.effectiveDate}生效）。`
  if (buffedPlayers.length > 0) {
    versionSummaryText += `选手【${buffedPlayers.join('、')}】的主力体系受到当前版本机制（嬴律复制/安琪拉法爆/三分增益）利好支持。`
  } else {
    versionSummaryText += `场上 6 位选手主力体系在当前版本表现平稳。`
  }

  return {
    players: preliminary,
    crossMatchups,
    targetVersion,
    versionMeta: verMeta,
    versionSummary: {
      version: targetVersion,
      isLatest: verMeta.isLatest,
      summaryText: versionSummaryText,
      buffedPlayers
    },
    banSummary: {
      bannedFaction: bannedFaction || null,
      criticalPlayers,
      benefitedPlayers,
      summaryText
    }
  }
}

