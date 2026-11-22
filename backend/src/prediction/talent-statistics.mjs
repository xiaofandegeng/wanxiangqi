import {normalizeLabel} from './build-stats.mjs'
import {talentImpact} from '../../../shared/talent-impact.mjs'

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

function collectTalentEvidence(matches, evidenceRows) {
  const byMatch = new Map(matches.map(match => [match.id, match]))
  const versions = new Map()
  for (const row of evidenceRows) {
    const match = byMatch.get(row.matchId)
    if (!match?.materialSha256 || match.materialSha256 !== row.materialSha256) continue
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
  return versions
}

export function buildTalentStatistics(matches, evidenceRows) {
  return Object.fromEntries([...collectTalentEvidence(matches, evidenceRows)].map(([version, observations]) => [
    version, versionStatistics(matches, observations)
  ]))
}

export function projectTalents(matches, evidenceRows, target, commanders, buildProjections) {
  const versions = collectTalentEvidence(matches, evidenceRows)
  const latestMatch = [...matches].reverse().find(match =>
    [...versions.values()].some(observations => observations.has(match.id)))
  const version = [...versions.keys()].filter(key => versions.get(key).has(latestMatch?.id))
    .sort((a, b) => b.localeCompare(a, 'en', {numeric: true}))[0] ?? null
  const observations = versions.get(version)
  const statistics = observations ? versionStatistics(matches, observations) : []

  const players = target.seats.map((player, index) => {
    const commander = normalizeLabel(commanders[index])
    const talentCandidates = new Map()
    let buildSamples = 0
    let talentSamples = 0
    let expectedFactor = 1
    for (const candidate of buildProjections[index].candidates) {
      const rows = matches.flatMap(match => match.seats
        .filter(seat => seat.id === player.id && normalizeLabel(seat.reviewedCommander) === commander &&
          normalizeLabel(seat.build) === candidate.build)
        .map(seat => observations?.get(match.id)?.seats[seat.slot - 1]))
      if (!rows.length) continue
      buildSamples += rows.length
      let factorTotal = 0
      for (const names of rows) {
        // No visible talent leaves this historical scenario at its unadjusted weight.
        if (!names?.size) {
          factorTotal += 1
          continue
        }
        talentSamples++
        factorTotal += Math.exp(talentImpact(statistics, candidate.build, [...names]).logWeight)
        for (const talent of names) {
          const key = JSON.stringify([candidate.build, talent])
          const row = talentCandidates.get(key) ?? {
            build: candidate.build, talent, observations: 0, buildSamples: rows.length, observedShare: 0
          }
          row.observations++
          row.observedShare += candidate.share / rows.length
          talentCandidates.set(key, row)
        }
      }
      expectedFactor += candidate.share * (factorTotal / rows.length - 1)
    }
    return {buildSamples, talentSamples, expectedFactor, candidates: [...talentCandidates.values()]
      .sort((a, b) => b.observedShare - a.observedShare || a.talent.localeCompare(b.talent, 'zh-CN'))}
  })
  return {version, players}
}
