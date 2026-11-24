import { normalizeLabel } from './build-stats.mjs'
import { derivePersonUid } from '../../../shared/player-registry.mjs'

const DAY_MS = 86400000
const TEAM_SIZE = 6
const SHORT_WEIGHT = 0.7
const LONG_WEIGHT = 0.3
const MAX_LOG_WEIGHT = 0.2
const SHRINKAGE_SAMPLES = 4

const timestamp = value => value instanceof Date ? value.getTime() : Date.parse(value)
const chinaDay = value => new Date(timestamp(value) + 8 * 3600000).toISOString().slice(0, 10)

export async function readRankFeedbackCutoff(pool) {
  // Preserve PostgreSQL's microseconds when a refresh reads back its own writes.
  const {rows:[{cutoff}]} = await pool.query(`
    SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cutoff
  `)
  return cutoff
}

function rosterKey(day, ban, seats) {
  if (seats.length !== TEAM_SIZE || new Set(seats.map(seat => seat.id)).size !== TEAM_SIZE ||
      seats.some(seat => !seat.id || !normalizeLabel(seat.commander))) return null
  const ordered = seats.map(seat => [seat.id, normalizeLabel(seat.commander)])
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify([day, normalizeLabel(ban), ordered])
}

function forecastRanks(players) {
  if (players.some(player => !Number.isFinite(player.probability) || player.probability <= 0 || player.probability >= 1) ||
      Math.abs(players.reduce((sum, player) => sum + player.probability, 0) - 1) > 1e-9) return null
  return new Map(players.map(player => {
    const better = players.filter(other => other.probability - player.probability > 1e-12).length
    const tied = players.filter(other => Math.abs(other.probability - player.probability) <= 1e-12).length
    return [player.id, 1 + better + (tied - 1) / 2]
  }))
}

export function collectRankComparisons(catalog, cutoff, {includeToday = false} = {}) {
  const targetDay = chinaDay(cutoff)
  const evidence = new Map((catalog.rankEvidence ?? []).map(row => [row.matchId, row]))
  const aliases = new Map((catalog.playerAliases ?? []).map(row => [row.alias_id, row.canonical_id]))
  const canonical = id => aliases.get(id) ?? id
  const matchesByKey = new Map()
  const targets = new Map()
  for (const match of catalog.matches ?? []) {
    const age = (Date.parse(targetDay) - Date.parse(match.day)) / DAY_MS
    if (age < (includeToday ? 0 : 1) || age > 7 || !match.ban || !match.scheduledAt ||
        match.seats.length !== TEAM_SIZE || new Set(match.seats.map(seat => seat.slot)).size !== TEAM_SIZE) continue
    const seats = match.seats.map(seat => ({...seat, playerId:canonical(seat.playerId),
      sourceProfileId:seat.sourceProfileId ?? seat.playerId}))
    const key = rosterKey(match.day, match.ban, seats.map(seat => ({
      id:seat.playerId, commander:seat.reviewedCommander,
    })))
    if (!key) continue
    matchesByKey.set(key, [...(matchesByKey.get(key) ?? []), match.id])
    const proof = evidence.get(match.id)
    if (proof && proof.materialSha256 === match.materialSha256 &&
        timestamp(proof.availableAt) <= timestamp(cutoff) &&
        proof.ranks.length === TEAM_SIZE && [1, 2, 3, 4, 5, 6].every(rank => proof.ranks.includes(rank)) &&
        match.seats.every(seat => Boolean(seat.winner) === (proof.ranks[seat.slot - 1] === 1))) {
      targets.set(match.id, {match, seats, proof, age, key})
    }
  }
  const forecasts = [...(catalog.prematchForecasts ?? [])].sort((a, b) =>
    timestamp(a.recordedAt) - timestamp(b.recordedAt) || a.id.localeCompare(b.id))
  const comparisons = new Map()
  for (const forecast of forecasts) {
    if (timestamp(forecast.recordedAt) >= timestamp(cutoff)) continue
    const players = forecast.players.map(player => ({...player, id: canonical(player.id)}))
    const key = rosterKey(chinaDay(forecast.recordedAt), forecast.bannedFaction, players)
    const candidates = key ? matchesByKey.get(key) : null
    if (candidates?.length !== 1) continue
    const [matchId] = candidates
    const target = targets.get(matchId)
    if (!target || comparisons.has(matchId) || timestamp(forecast.recordedAt) >= timestamp(target.match.scheduledAt)) continue
    const ranks = forecastRanks(players)
    if (ranks) comparisons.set(matchId, {ranks, source:'LIVE'})
  }
  for (const replay of catalog.rankReplays ?? []) {
    const target = targets.get(replay.matchId)
    if (!target || comparisons.has(replay.matchId) || replay.materialSha256 !== target.match.materialSha256 ||
        timestamp(replay.generatedAt) > timestamp(cutoff)) continue
    const players = replay.players.map(player => ({...player, id:canonical(player.id)}))
    if (rosterKey(target.match.day,replay.bannedFaction,players) !== target.key) continue
    const ranks = forecastRanks(players)
    if (ranks) comparisons.set(replay.matchId,{ranks,source:'REPLAY'})
  }
  return {targets,comparisons}
}

export function summarizeRankFeedback(catalog, cutoff) {
  const {targets,comparisons} = collectRankComparisons(catalog,cutoff)
  const playerSamples = new Map()
  const profiles = new Map((catalog.players ?? []).map(player => [player.id,player]))
  const sourceProfiles = new Map((catalog.sourceProfiles ?? []).map(player => [player.id,player]))
  const linkedAccounts = new Map()
  for (const {alias_id,canonical_id} of catalog.playerAliases ?? []) {
    const accounts = linkedAccounts.get(canonical_id) ?? []
    accounts.push(alias_id)
    linkedAccounts.set(canonical_id,accounts)
  }
  const counts = {recent3:{live:0,replayed:0},recent7:{live:0,replayed:0}}
  for (const [matchId,{ranks,source}] of comparisons) {
    const {match, seats, proof, age} = targets.get(matchId)
    const counter = source === 'LIVE' ? 'live' : 'replayed'
    counts.recent7[counter]++
    if (age <= 3) counts.recent3[counter]++
    for (const seat of seats) {
      const actualRank = proof.ranks[seat.slot - 1]
      const predictedRank = ranks.get(seat.playerId)
      const samples = playerSamples.get(seat.playerId) ?? []
      const accountNickname = sourceProfiles.get(seat.sourceProfileId)?.nickname ?? seat.nickname ??
        profiles.get(seat.playerId)?.nickname ?? seat.sourceProfileId
      samples.push({matchId, day:match.day, age, source, predictedRank, actualRank, gap:predictedRank - actualRank,
        accountProfileId:seat.sourceProfileId, accountNickname})
      playerSamples.set(seat.playerId, samples)
    }
  }
  const entries = [...playerSamples].map(([profileId, samples]) => {
    const recent = samples.filter(sample => sample.age <= 3)
    const average = rows => rows.length ? rows.reduce((sum, row) => sum + row.gap, 0) / rows.length : null
    const average3 = average(recent)
    const average7 = average(samples)
    const weightedGap = SHORT_WEIGHT * (average3 ?? 0) + LONG_WEIGHT * average7
    const logWeight = MAX_LOG_WEIGHT * weightedGap / (TEAM_SIZE - 1) *
      (samples.length / (samples.length + SHRINKAGE_SAMPLES))
    const nickname = profiles.get(profileId)?.nickname ?? profileId
    const accountIds = new Set([profileId,...(linkedAccounts.get(profileId) ?? []),...samples.map(row=>row.accountProfileId)])
    const accounts = new Map()
    for (const id of accountIds) {
      const profile = sourceProfiles.get(id) ?? profiles.get(id)
      const rows = samples.filter(sample => sample.accountProfileId === id)
      const {account} = profile ?? {}
      const key = account ? JSON.stringify([account.platform,account.region,account.uid]) : id
      const member = {profileId:id,nickname:profile?.nickname ?? rows[0]?.accountNickname ?? id,
        sourceAuthor:profile?.author ?? null,samples3:rows.filter(row=>row.age <= 3).length,samples7:rows.length}
      const group = accounts.get(key) ?? {key,account:account ?? null,samples3:0,samples7:0,profiles:[]}
      group.samples3 += member.samples3
      group.samples7 += member.samples7
      group.profiles.push(member)
      accounts.set(key,group)
    }
    return {
      profileId, personUid: derivePersonUid(profileId), nickname, accounts:[...accounts.values()],
      samples3: recent.length, samples7: samples.length,
      average3, average7, weightedGap, logWeight, matches: samples,
    }
  }).sort((a, b) => b.logWeight - a.logWeight || a.profileId.localeCompare(b.profileId))
  function split(rows, field) {
    const ranked = [...rows].sort((a,b) => b[field] - a[field] || a.profileId.localeCompare(b.profileId))
    return {red:ranked.filter(row => row[field] > 0),black:ranked.filter(row => row[field] < 0).reverse()}
  }
  const hasReplays = (catalog.rankReplays ?? []).some(replay => timestamp(replay.generatedAt) <= timestamp(cutoff))
  return {cutoff, weights:{recent3:SHORT_WEIGHT,recent7:LONG_WEIGHT}, settledMatches:comparisons.size,
    generated: hasReplays || counts.recent7.replayed > 0,
    ...split(entries,'logWeight'), entries, windows:{
      recent3:{...counts.recent3,...split(entries.filter(row => row.samples3),'average3')},
      recent7:{...counts.recent7,...split(entries,'average7')},
    }}
}
