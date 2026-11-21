import { getMasterPlayerName } from './player-grouping'

export const CURRENT_LATEST_VERSION = 'v1.11.1'

export const GAME_VERSIONS = [
  { version: CURRENT_LATEST_VERSION, effectiveDate: '2026-11-19', isLatest: true, title: '11月19日更新' },
  { version: 'v1.10.1', effectiveDate: '2026-11-12', isLatest: false, title: '11月12日更新' },
  { version: 'v1.9.1', effectiveDate: '2026-11-05', isLatest: false, title: '11月5日更新' },
  { version: 'v1.8.1', effectiveDate: '2026-10-29', isLatest: false, title: '10月29日更新' },
  { version: 'v1.7.1', effectiveDate: '2026-10-22', isLatest: false, title: '10月22日更新' },
  { version: 'v1.6.1', effectiveDate: '2026-10-15', isLatest: false, title: '10月15日更新' },
  { version: 'v1.5.1', effectiveDate: '2026-10-08', isLatest: false, title: '10月8日更新' }
]

export function getVersionByDate(day: string) {
  return GAME_VERSIONS.find(release => day >= release.effectiveDate) ?? null
}

export type FactionType = '三分' | '逐鹿' | '日落海' | '河洛' | '大河' | '通用/其他'

export function isAceDuelMatch(match: any): boolean {
  if (!match || match.matchType === 'winner_snapshot') return false
  if (match.mode) {
    const m = String(match.mode).toUpperCase()
    // 排除普通排位、普通娱乐对局
    if (m === 'CASUAL' || m === 'NORMAL' || m === 'RANK' || m === 'PVP_NORMAL') {
      return false
    }
    // 官方王牌对决支持 WANXIANG（万象大赛）和 DIAMOND（钻石狂潮）
    if (m === 'WANXIANG' || m === 'DIAMOND' || m === 'ACE' || m.includes('王牌')) {
      return true
    }
  }
  // 兼顾带王牌赛事前缀标识（ruanshi:/match-/ace-/recent-/old-）的实战或评测样本
  if (match.key && (String(match.key).startsWith('ruanshi:') || String(match.key).startsWith('match-') || String(match.key).includes('ace') || String(match.key).includes('recent') || String(match.key).includes('old'))) {
    return Boolean(Array.isArray(match.seats) && match.seats.length >= 2)
  }
  // 未显式指定 mode 时：王牌对决固定为标准 6 席赛制（排除空局、练习局）
  if (Array.isArray(match.seats)) {
    const realSeats = match.seats.filter((s: any) => s && s.nickname && !String(s.nickname).startsWith('席位'))
    if (realSeats.length >= 5 || match.seats.length === 6) {
      return true
    }
  }
  return false
}

function commanderKey(commander: string | null | undefined): string {
  const name = commander?.trim() ?? ''
  return name === '白哥' ? '白歌' : name === '孙小宾' ? '孙小斌' : name
}

function recordedCommander(match: any, seat: any): string {
  const value = match.isCustom || match.isModified
    ? (seat.commanderConfirmed === true ? seat.commander : null)
    : (Object.hasOwn(seat, 'reviewedCommander') ? seat.reviewedCommander : seat.commander)
  if (typeof value !== 'string') return ''
  const commander = commanderKey(value)
  return commander.toUpperCase() === 'UNKNOWN' ? '' : commander
}

function recordedBuild(value: unknown): string {
  if (typeof value !== 'string') return ''
  const build = value.trim()
  if (['UNKNOWN', '阵容待确认', '常规构筑'].includes(build.toUpperCase())) return ''
  return build === '逐鹿赢政' ? '逐鹿嬴政' : build
}

function ambiguousArchiveNames(matches: any[], nameOf: (nickname: string) => string): Set<string> {
  const idsByName = new Map<string, string>()
  const ambiguous = new Set<string>()
  for (const match of matches) {
    for (const seat of match.seats ?? []) {
      if (!seat.nickname || !seat.playerId) continue
      const name = nameOf(seat.nickname.trim())
      const existing = idsByName.get(name)
      if (existing && existing !== seat.playerId) ambiguous.add(name)
      idsByName.set(name, seat.playerId)
    }
  }
  return ambiguous
}

export interface CommanderBuildDetail {
  buildName: string
  matches: number
  wins: number
  winRate: number
  share: number
}

/** 选手在某个棋手下的出场与常用阵容实战画像 */
export interface CommanderUsageProfile {
  commander: string

  matches: number
  wins: number
  winRate: number
  topBuilds: CommanderBuildDetail[]
  favoriteBuild: string // 该棋手下最常玩的首选阵容
}

export interface FactionBreakdown {
  faction: FactionType
  matches: number
  wins: number
  share: number
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
  commanderProfiles: CommanderUsageProfile[] // 选手历史棋手使用画像与常用阵容统计
  factionDistribution: Record<FactionType, { matches: number; wins: number }>
  factions: FactionBreakdown[]
  h2h: HeadToHeadRecord[]
  nemeses: HeadToHeadRecord[] // 天敌/苦主 (losses > wins)
  victims: HeadToHeadRecord[] // 压制对象 (wins > losses)
  topRivals: HeadToHeadRecord[] // 遭遇次数最多宿敌
}

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
  const aceMatches = matches.filter(isAceDuelMatch)
  const ambiguousNames = ambiguousArchiveNames(aceMatches, getName)

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
        commanderProfiles: [],
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
  const playerCommanderCounts = new Map<string, Map<string, Map<string, { matches: number; wins: number }>>>()

  for (const m of aceMatches) {
    if (!m.seats || !Array.isArray(m.seats) || m.seats.length === 0) continue

    const winnerSeat = m.seats.find((s: any) => s.slot === m.winnerSlot || s.winner)
    const winnerName = winnerSeat ? getName(winnerSeat.nickname) : null

    // 统计每位席位选手的阵营分布
    const activeParticipants: { name: string; faction: FactionType; isWinner: boolean }[] = []

    for (const seat of m.seats) {
      if (!seat.nickname || seat.nickname.startsWith('席位') || seat.nickname.startsWith('选手')) continue
      const name = getName(seat.nickname)
      if (ambiguousNames.has(name)) continue
      const isWinner = (seat.slot === m.winnerSlot) || Boolean(seat.winner)
      const faction = getBuildFaction(seat.build)

      const profile = getOrCreate(name)
      profile.totalMatches++
      if (isWinner) profile.totalWins++

      profile.factionDistribution[faction].matches++
      if (isWinner) profile.factionDistribution[faction].wins++

      const build = recordedBuild(seat.build)
      if (build) {
        let bmap = buildCounts.get(name)
        if (!bmap) {
          bmap = new Map<string, number>()
          buildCounts.set(name, bmap)
        }
        bmap.set(build, (bmap.get(build) || 0) + 1)
      }

      // 统计实战棋手，阵容缺失的席位只计入该棋手的总战绩
      const cmdName = recordedCommander(m, seat)
      if (cmdName) {
        let cmdMap = playerCommanderCounts.get(name)
        if (!cmdMap) {
          cmdMap = new Map()
          playerCommanderCounts.set(name, cmdMap)
        }
        let bMap = cmdMap.get(cmdName)
        if (!bMap) {
          bMap = new Map()
          cmdMap.set(cmdName, bMap)
        }
        let bStat = bMap.get(build)
        if (!bStat) {
          bStat = { matches: 0, wins: 0 }
          bMap.set(build, bStat)
        }
        bStat.matches++
        if (isWinner) bStat.wins++
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

    const bmap = buildCounts.get(profile.playerName)
    profile.commonBuilds = bmap ? [...bmap.entries()].sort((a, b) => b[1] - a[1]).map(([build]) => build).slice(0, 4) : []

    const cmdProfiles: CommanderUsageProfile[] = []
    const cmdMap = playerCommanderCounts.get(profile.playerName) ?? new Map()
    for (const [cmdName, bMap] of cmdMap.entries()) {
      let cMatches = 0
      let cWins = 0
      const bDetails: CommanderBuildDetail[] = []

      for (const st of bMap.values()) {
        cMatches += st.matches
        cWins += st.wins
      }

      for (const [bName, st] of bMap.entries()) {
        if (!bName) continue
        bDetails.push({
          buildName: bName,
          matches: st.matches,
          wins: st.wins,
          winRate: st.matches > 0 ? Number((st.wins / st.matches).toFixed(2)) : 0,
          share: cMatches > 0 ? Number((st.matches / cMatches).toFixed(2)) : 0
        })
      }

      bDetails.sort((a, b) => b.matches - a.matches || b.wins - a.wins)

      cmdProfiles.push({
        commander: cmdName,
        matches: cMatches,
        wins: cWins,
        winRate: cMatches > 0 ? Number((cWins / cMatches).toFixed(2)) : 0,
        topBuilds: bDetails,
        favoriteBuild: bDetails[0]?.buildName ?? ''
      })
    }

    profile.commanderProfiles = cmdProfiles.sort((a, b) => b.matches - a.matches || b.wins - a.wins)
  }

  return profileMap
}

