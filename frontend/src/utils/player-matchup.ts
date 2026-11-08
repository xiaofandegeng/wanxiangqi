// 王牌对决选手同场克制关系 (Head-to-Head) 与禁用阵营 (Ban) 影响分析引擎
import { getMasterPlayerName } from './player-grouping'

export type FactionType = '三分' | '逐鹿' | '日落海' | '河洛' | '大河' | '通用/其他'

export type BanImpactLevel = 'CRITICAL' | 'MODERATE' | 'IMMUNE' | 'BENEFITED'

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
    baseScore: number
    h2hBonus: number
    banModifier: number
    finalScore: number
    adjustedProbability: number
    banEvaluation: BanImpactEvaluation | null
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
 * 综合选手基础战力 + 本场交手克制奖励/减免 + Ban位惩罚/增益，输出校正概率与博弈情报
 */
export function evaluate6PlayerMatchup(
  participants: { nickname: string; profileId?: string | null }[],
  bannedFaction?: string | null,
  allMatches: any[] = []
): SixPlayerMatchupResult {
  const profileMap = buildPlayerMatchupProfiles(allMatches, true)

  const softmax = (scores: number[]) => {
    const max = Math.max(...scores)
    const exps = scores.map(x => Math.exp(x - max))
    const sum = exps.reduce((a, b) => a + b, 0)
    return exps.map(x => (sum > 0 ? x / sum : 1 / scores.length))
  }

  // 1. 获取每位选手的 masterName 与 profile
  const roster = participants.map(p => {
    const master = getMasterPlayerName(p.nickname)
    const prof = profileMap.get(master) || profileMap.get(p.nickname)
    return {
      nickname: p.nickname,
      masterName: master,
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

  // 3. 计算 Ban 位评估与综合得分
  const criticalPlayers: string[] = []
  const benefitedPlayers: string[] = []

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

    if (banEval?.level === 'CRITICAL') criticalPlayers.push(p.masterName)
    if (banEval?.level === 'BENEFITED') benefitedPlayers.push(p.masterName)

    const finalScore = baseScore + h2hBonus + banModifier

    return {
      nickname: p.nickname,
      masterName: p.masterName,
      baseScore: Number(baseScore.toFixed(3)),
      h2hBonus: Number(h2hBonus.toFixed(3)),
      banModifier: Number(banModifier.toFixed(3)),
      finalScore: Number(finalScore.toFixed(3)),
      adjustedProbability: 0,
      banEvaluation: banEval,
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

  return {
    players: preliminary,
    crossMatchups,
    banSummary: {
      bannedFaction: bannedFaction || null,
      criticalPlayers,
      benefitedPlayers,
      summaryText
    }
  }
}
