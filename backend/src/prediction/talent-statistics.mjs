import {readFileSync} from 'node:fs'
import {normalizeLabel} from './build-stats.mjs'

const evidence = JSON.parse(readFileSync(new URL('../../data/talent-settlement-observations.json', import.meta.url), 'utf8'))
const TALENT_RULE_VERSIONS = ['v1.10.1', 'v1.11.1']

function rulesForDay(day) {
  if (day >= '2026-11-19') return 'v1.11.1'
  if (day >= '2026-11-12') return 'v1.10.1'
  return null
}

function versionStatistics(matches, observations) {
  const builds = new Map()
  for (const match of matches) {
    const record = observations.get(match.id)
    if (!record || record.materialSha256 !== match.materialSha256 || match.seats?.length !== 6 ||
      new Set(match.seats.map(seat => seat.slot)).size !== 6 ||
      match.seats.filter(seat => seat.winner).length !== 1) continue
    for (const seat of match.seats) {
      const build = normalizeLabel(seat.build)
      if (!build) continue
      const tally = builds.get(build) ?? {appearances: 0, wins: 0, pairs: new Map()}
      builds.set(build, tally)
      tally.appearances++
      tally.wins += Number(seat.winner)
      for (const talent of new Set((record.seats[seat.slot - 1] ?? []).map(([, name]) => name))) {
        const pair = tally.pairs.get(talent) ?? {appearances: 0, wins: 0, matches: new Set()}
        tally.pairs.set(talent, pair)
        pair.appearances++
        pair.wins += Number(seat.winner)
        pair.matches.add(match.id)
      }
    }
  }
  return [...builds].flatMap(([build, tally]) => [...tally.pairs].map(([talent, pair]) => {
    // Compare to the overall same-build sample. Unseen icons never imply absence.
    const baseline = (tally.wins + 1) / (tally.appearances + 6)
    const shrunk = (pair.wins + 12 * baseline) / (pair.appearances + 12)
    const logOdds = p => Math.log(p / (1 - p))
    const canAdjust = pair.matches.size >= 3 && tally.appearances - pair.appearances >= 4
    const logWeight = canAdjust ? Math.max(-0.15, Math.min(0.15, logOdds(shrunk) - logOdds(baseline))) : 0
    return {talent, build, wins: pair.wins, appearances: pair.appearances, distinctMatches: pair.matches.size,
      buildWins: tally.wins, buildAppearances: tally.appearances, logWeight}
  }))
}

export function buildTalentStatistics(matches, cutoff) {
  if (Date.parse(cutoff) < Date.parse(evidence.reviewedAt)) return {}
  const day = new Date(Date.parse(cutoff) + 8 * 3600000).toISOString().slice(0, 10)
  const observations = new Map(evidence.matches.map(match => [match.matchId, match]))
  for (const batch of evidence.additions ?? []) {
    if (Date.parse(batch.reviewedAt) > Date.parse(cutoff)) continue
    for (const match of batch.matches) {
      const prior = observations.get(match.matchId)
      if (!prior || prior.materialSha256 !== match.materialSha256) continue
      const seats = prior.seats.map((icons, seat) => [...icons, ...match.seats[seat]])
      observations.set(match.matchId, {...prior, seats})
    }
  }
  return Object.fromEntries(TALENT_RULE_VERSIONS.map(version => [
    version, versionStatistics(matches.filter(match => match.day < day && rulesForDay(match.day) === version), observations)
  ]))
}
