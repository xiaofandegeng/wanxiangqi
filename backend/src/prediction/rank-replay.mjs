import { CatalogService } from './catalog.mjs'
import { collectRankComparisons, readRankFeedbackCutoff } from './rank-feedback.mjs'
import { forecastRoster } from './screenshot-analysis.mjs'

export async function generateRankReplays(pool) {
  const cutoff = await readRankFeedbackCutoff(pool)
  const catalog = await new CatalogService(pool).list({
    cutoff, includeTalentEvidence:true, includeRankFeedback:true, includeCurrentDayResults:true,
  })
  const {targets,comparisons} = collectRankComparisons(catalog,cutoff,{includeToday:true})
  const knownPlayers = new Set(catalog.players.map(player => player.id))
  const pending = []
  const invalidated = []
  const live = [...comparisons.values()].filter(row => row.source==='LIVE').length
  const skipped = (catalog.rankEvidence ?? []).filter(proof => !targets.has(proof.matchId))
    .map(proof => ({matchId:proof.matchId,reason:'INCOMPLETE_RESULT_CONTEXT'}))
  for (const [matchId,{match}] of targets) {
    const source = comparisons.get(matchId)?.source
    if (source==='LIVE') continue
    const scheduled = Date.parse(match.scheduledAt)
    if (scheduled > Date.parse(cutoff)) {
      skipped.push({matchId,reason:'SCHEDULED_START_IN_FUTURE'})
      continue
    }
    const replayCutoff = new Date(scheduled - 1).toISOString()
    const seats = [...match.seats].sort((a,b) => a.playerId.localeCompare(b.playerId))
    if (seats.some(seat => !knownPlayers.has(seat.playerId))) {
      skipped.push({matchId,reason:'PROFILE_UNAVAILABLE'})
      if (source==='REPLAY') invalidated.push(match)
      continue
    }
    const input = {bannedFaction:match.ban,players:seats.map(seat => ({
      profileId:seat.playerId,commander:seat.reviewedCommander,
    }))}
    const matches = catalog.matches.filter(row => row.day < match.day)
    // Reconstruct a pre-game forecast from prior match dates. Use the unadjusted
    // model for replays so generated feedback does not train itself.
    const result = forecastRoster({
      players:catalog.players,playerAliases:catalog.playerAliases,matches,talentEvidence:catalog.talentEvidence,
    },input,replayCutoff)
    if (!result.players.every(player => Number.isFinite(player.probability))) {
      skipped.push({matchId,reason:'INSUFFICIENT_DATABASE_HISTORY'})
      if (source==='REPLAY') invalidated.push(match)
      continue
    }
    const players = result.players.map((player,index) => ({
      id:player.profileId,commander:input.players[index].commander,probability:player.probability,
    }))
    pending.push({match,players,result})
  }
  let generated = 0
  let withdrawn = 0
  if (!pending.length && !invalidated.length) {
    return {generated,withdrawn,unchanged:0,live,existing:comparisons.size,skipped}
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const {match,players,result} of pending) {
      const saved = await client.query(`
        INSERT INTO prediction_rank_replays(match_id,material_sha256,model_version,training_hash,banned_faction,players)
        SELECT m.id,m.material_sha256,$3,$4,$5,$6 FROM prediction_catalog_matches m
        WHERE m.id=$1 AND m.material_sha256=$2 AND m.status='TRANSCRIBED'
        ON CONFLICT (match_id,material_sha256) DO UPDATE SET model_version=EXCLUDED.model_version,
          training_hash=EXCLUDED.training_hash,banned_faction=EXCLUDED.banned_faction,players=EXCLUDED.players,
          generated_at=clock_timestamp(),invalidated_at=NULL
        WHERE GREATEST(prediction_rank_replays.generated_at,prediction_rank_replays.invalidated_at)<=$7
          AND (prediction_rank_replays.invalidated_at IS NOT NULL OR
            (prediction_rank_replays.model_version,prediction_rank_replays.training_hash,
             prediction_rank_replays.banned_faction,prediction_rank_replays.players)
            IS DISTINCT FROM
            (EXCLUDED.model_version,EXCLUDED.training_hash,EXCLUDED.banned_faction,EXCLUDED.players))
      `,[match.id,match.materialSha256,result.modelVersion,result.dataHash,match.ban,JSON.stringify(players),cutoff])
      generated += saved.rowCount
    }
    for (const match of invalidated) {
      const saved = await client.query(`
        UPDATE prediction_rank_replays SET invalidated_at=clock_timestamp()
        WHERE match_id=$1 AND material_sha256=$2 AND generated_at<=$3 AND invalidated_at IS NULL
      `,[match.id,match.materialSha256,cutoff])
      withdrawn += saved.rowCount
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
  return {generated,withdrawn,unchanged:pending.length-generated,live,existing:comparisons.size,skipped}
}
