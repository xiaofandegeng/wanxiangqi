import {normalizeLabel} from './build-stats.mjs'

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
      for (const talent of record.seats[seat.slot - 1]) {
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

export function buildTalentStatistics(matches, evidenceRows) {
  const byMatch = new Map(matches.map(match => [match.id, match]))
  const versions = new Map()
  for (const row of evidenceRows) {
    if (byMatch.get(row.matchId)?.materialSha256 !== row.materialSha256) continue
    if (!Array.isArray(row.seats) || row.seats.length !== 6 ||
      !row.seats.every(names => Array.isArray(names) && names.every(name => typeof name === 'string' && name.trim()))) continue
    const observations = versions.get(row.version) ?? new Map()
    versions.set(row.version, observations)
    const record = observations.get(row.matchId) ?? {
      materialSha256: row.materialSha256,
      seats: Array.from({length: 6}, () => new Set())
    }
    observations.set(row.matchId, record)
    row.seats.forEach((names, index) => names.forEach(name => record.seats[index].add(name)))
  }
  return Object.fromEntries([...versions].map(([version, observations]) => [
    version, versionStatistics(matches, observations)
  ]))
}
