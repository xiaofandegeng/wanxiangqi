import { ScreenshotService } from './screenshot-analysis.mjs'
import { CatalogService } from './catalog.mjs'
import { ObservationService } from './observations.mjs'
import {randomUUID} from 'node:crypto'
import {normalizeMatch,payloadHash,computeStats,estimate,fail} from './domain.mjs'
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
 async predict(input){const r=estimate(await this.eligible(),input);if(r.status==='RESEARCH_BASELINE'){r.id=randomUUID();await this.pool.query('INSERT INTO prediction_runs(id,payload) VALUES($1,$2)',[r.id,JSON.stringify(r)])}return r}
 async runs(){return (await this.pool.query('SELECT id,created_at,payload FROM prediction_runs ORDER BY created_at DESC LIMIT 50')).rows.map(r=>({...r.payload,createdAt:r.created_at.toISOString()}))}
}
