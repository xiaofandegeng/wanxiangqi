import { ScreenshotService, forecastRoster } from './screenshot-analysis.mjs'
import { CatalogService } from './catalog.mjs'
import { ObservationService } from './observations.mjs'
import {randomUUID} from 'node:crypto'
import {normalizeMatch,payloadHash,computeStats,estimate,fail} from './domain.mjs'
import {readRankFeedbackCutoff,summarizeRankFeedback} from './rank-feedback.mjs'
import {generateRankReplays} from './rank-replay.mjs'
import {
 lookupAccountIdentity,
 registerAccountIdentity,
 linkPlayerAlias,
 syncVerifiedPlayerIdentities,
} from './account-identity.mjs'
const wire=r=>({id:r.id,sourceKey:r.source_key,mode:r.mode,playedAt:r.played_at.toISOString(),evidenceId:r.evidence_id,evidenceLocator:r.evidence_locator,version:r.version,platform:r.platform,region:r.region,seats:r.seats,status:r.status,createdAt:r.created_at.toISOString(),verifiedAt:r.verified_at?.toISOString()||null,verifiedBy:r.verified_by})
export class PredictionService {
 constructor(pool){this.pool=pool;this.screenshots=new ScreenshotService(pool);this.catalog=new CatalogService(pool);this.observations=new ObservationService(pool,(c,id,v)=>this.evidence(c,id,v))}
 async evidence(client,id,verified=false){
  const {rows}=await client.query(`SELECT e.status, b.sha256 FROM evidences e LEFT JOIN evidence_blobs b ON b.sha256=e.sha256 AND octet_length(b.content)=b.size_bytes AND b.size_bytes>0 WHERE e.id=$1 FOR SHARE OF e`,[id])
  if(!rows[0]||!rows[0].sha256||rows[0].status==='QUARANTINED'||(verified&&rows[0].status!=='VERIFIED')) throw fail('需要存在且可恢复的原件；放行还要求材料已核验','EVIDENCE_NOT_READY')
 }
 async import(raw){
  const m=normalizeMatch(raw), hash=payloadHash(m), c=await this.pool.connect()
  try{await c.query('BEGIN');await this.evidence(c,m.evidenceId)
   const {rows}=await c.query(`INSERT INTO prediction_matches (id,source_key,payload_hash,mode,played_at,evidence_id,evidence_locator,version,platform,region,seats) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(source_key) DO NOTHING RETURNING *`,[randomUUID(),m.sourceKey,hash,m.mode,m.playedAt,m.evidenceId,m.evidenceLocator,m.version,m.platform,m.region,JSON.stringify(m.seats)])
   const row=rows[0]||(await c.query('SELECT * FROM prediction_matches WHERE source_key=$1',[m.sourceKey])).rows[0]
   if(row.payload_hash!==hash) throw fail('同来源场次键已存在不同内容，请复核，不自动覆盖','MATCH_CONFLICT',409)
   await c.query('COMMIT');return {match:wire(row),deduplicated:!rows.length}
  }catch(e){await c.query('ROLLBACK');if(e.code==='23505')throw fail('相同模式平台区服和时间已有场次，请核对重复记录','MATCH_CONFLICT',409);throw e}finally{c.release()}
 }
 async verify(id,operator){
  if(typeof operator!=='string'||!operator.trim()||operator.length>128) throw fail('请填写核验人','OPERATOR_REQUIRED')
  const c=await this.pool.connect()
  try{await c.query('BEGIN');const row=(await c.query('SELECT * FROM prediction_matches WHERE id=$1 FOR UPDATE',[id])).rows[0]
   if(!row) throw fail('场次不存在','NOT_FOUND',404)
   if(row.status!=='PENDING') throw fail('仅待核验场次可放行','NOT_PENDING',409)
   await this.evidence(c,row.evidence_id,true)
   const updated=(await c.query(`UPDATE prediction_matches SET status='VERIFIED',verified_at=clock_timestamp(),verified_by=$2 WHERE id=$1 RETURNING *`,[id,operator.trim()])).rows[0]
   await c.query('COMMIT');return wire(updated)
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 async quarantine(id,operator){
  if(typeof operator!=='string'||!operator.trim()||operator.length>128)throw fail('请填写操作人','OPERATOR_REQUIRED')
  const r=await this.pool.query(`UPDATE prediction_matches SET status='QUARANTINED',quarantined_at=clock_timestamp(),quarantined_by=$2 WHERE id=$1 RETURNING *`,[id,operator.trim()])
  if(!r.rows[0])throw fail('场次不存在','NOT_FOUND',404)
  return wire(r.rows[0])
 }
 async list(){return (await this.pool.query('SELECT * FROM prediction_matches ORDER BY played_at DESC, id')).rows.map(wire)}
 async eligible(){return (await this.pool.query(`SELECT m.* FROM prediction_matches m JOIN evidences e ON e.id=m.evidence_id JOIN evidence_blobs b ON b.sha256=e.sha256 WHERE m.status='VERIFIED' AND e.status='VERIFIED' AND octet_length(b.content)=b.size_bytes AND b.size_bytes>0 ORDER BY m.played_at`)).rows.map(wire)}
 async stats(){return computeStats(await this.eligible())}
 async forecast(input){
  const cutoff=await readRankFeedbackCutoff(this.pool)
  const catalog=await this.catalog.list({cutoff,includeTalentEvidence:true,includeRankFeedback:true})
  const result=forecastRoster(catalog,input,cutoff)
  if(result.players.every(player=>Number.isFinite(player.probability))){
   const players=result.players.map((player,index)=>({
    id:player.profileId,commander:input.players[index].commander.trim(),probability:player.probability,
   }))
   const id=randomUUID()
   await this.pool.query(`INSERT INTO prediction_prematch_forecasts(id,model_version,banned_faction,players)
    VALUES($1,$2,$3,$4)`,[id,result.modelVersion,input.bannedFaction?.trim()??null,JSON.stringify(players)])
   return {...result,forecastId:id}
  }
  return result
 }
 async rankFeedback(){
  const cutoff=await readRankFeedbackCutoff(this.pool)
  const {entries,...board}=summarizeRankFeedback(await this.catalog.list({cutoff,includeRankFeedback:true}),cutoff)
  return board
 }
 async registerAccountIdentity(input){
  const identity=await registerAccountIdentity(this.pool,input,(client,id,verified)=>this.evidence(client,id,verified))
  if(identity.profileId!==identity.personProfileId) await generateRankReplays(this.pool)
  return identity
 }
 async lookupAccountIdentity(input){return lookupAccountIdentity(this.pool,input)}
 async linkPlayerAlias(input){
  const result=await linkPlayerAlias(this.pool,input)
  if(result.linked) await generateRankReplays(this.pool)
  return result
 }
 async syncVerifiedIdentities(){
  const result=await syncVerifiedPlayerIdentities(this.pool)
  if(result.linkedAliases>0) await generateRankReplays(this.pool)
  return result
 }
 async generateRankFeedback(){
  const existing=(await this.pool.query(
   'SELECT 1 FROM prediction_rank_replays WHERE invalidated_at IS NULL LIMIT 1'
  )).rows[0]
  if(existing) throw fail('红黑榜已生成，不可重复生成','RANK_FEEDBACK_ALREADY_GENERATED',409)
  const generation=await generateRankReplays(this.pool)
  return {generation,board:await this.rankFeedback()}
 }
 async predict(input){const r=estimate(await this.eligible(),input);if(r.status==='RESEARCH_BASELINE'){r.id=randomUUID();await this.pool.query('INSERT INTO prediction_runs(id,payload) VALUES($1,$2)',[r.id,JSON.stringify(r)])}return r}
 async runs(){return (await this.pool.query('SELECT id,created_at,payload FROM prediction_runs ORDER BY created_at DESC LIMIT 50')).rows.map(r=>({...r.payload,createdAt:r.created_at.toISOString()}))}
}
