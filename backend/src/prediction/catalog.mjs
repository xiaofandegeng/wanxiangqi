import {createHash} from 'node:crypto'
import {fail} from './domain.mjs'
import {buildHistoricalSnapshotMatches} from './historical-matches.mjs'
export const catalogHash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex')
export const playerHandle=(author,nickname)=>catalogHash([author,nickname])
const str=(x,max=300)=>typeof x==='string'&&x.trim()&&x.length<=max
export function validateCatalog(data){
 if(data?.schemaVersion!==1||!str(data.author)||data.usageScope!=='INTERNAL_ONLY'||!Array.isArray(data.sources)||!Array.isArray(data.materials)||!Array.isArray(data.matches)||!Array.isArray(data.claims))throw fail('资料集结构或范围无效','CATALOG_INVALID')
 const urls=new Set(data.sources.map(s=>s.url)),materials=new Map(data.materials.map(m=>[m.key,m])),keys=new Set()
 for(const s of data.sources){let u;try{u=new URL(s.url)}catch{throw fail('来源URL无效','CATALOG_INVALID')}if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!str(s.title,5000)||!['DISCOVERED','TRANSCRIBED'].includes(s.status))throw fail('来源信息无效','CATALOG_INVALID')}
 if(urls.size!==data.sources.length||materials.size!==data.materials.length)throw fail('来源或原件键重复','CATALOG_INVALID')
 for(const m of data.materials)if(m.key!==m.sha256||!/^[a-f0-9]{64}$/.test(m.sha256)||!urls.has(m.sourceUrl))throw fail('原件关联无效','CATALOG_INVALID')
 const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s
 for(const m of data.matches){if(!str(m.key)||keys.has(m.key)||!urls.has(m.sourceUrl)||materials.get(m.materialKey)?.sourceUrl!==m.sourceUrl||!date(m.day)||!Number.isInteger(m.ordinal)||m.ordinal<1||!Number.isInteger(m.winnerSlot)||m.winnerSlot<1||m.winnerSlot>6||!Array.isArray(m.seats)||m.seats.length!==6||new Set(m.seats.map(s=>s.slot)).size!==6||new Set(m.seats.map(s=>s.nickname)).size!==6||!m.seats.every(s=>Number.isInteger(s.slot)&&s.slot>=1&&s.slot<=6&&str(s.nickname)&&str(s.build))||!str(m.winnerBuild))throw fail('场次必须六席、唯一胜者、来源原件一致','CATALOG_INVALID');keys.add(m.key)}
 for(const c of data.claims){if(!str(c.key)||keys.has(c.key)||!str(c.nickname)||!str(c.text,2000)||!['COMMANDER_AUTHOR_CLAIM','BUILD_AUTHOR_CLAIM'].includes(c.kind)||!date(c.windowStart)||!date(c.windowEnd)||c.windowEnd<c.windowStart||materials.get(c.materialKey)?.sourceUrl!==c.sourceUrl)throw fail('专长声明关联无效','CATALOG_INVALID');keys.add(c.key)}
 return data
}
export async function importCatalog(pool,data,readMaterial){
 validateCatalog(data)
 // 所有原件先检验，再开启数据库事务；原件不通过时零写入。
 const binaries=new Map()
 for(const m of data.materials){const bytes=await readMaterial(m);if(!Buffer.isBuffer(bytes)||!bytes.length||createHash('sha256').update(bytes).digest('hex')!==m.sha256)throw fail('原图哈希不匹配','CATALOG_HASH_MISMATCH');binaries.set(m.key,bytes)}
 const c=await pool.connect();let insertedMatches=0
 try{await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('prediction-catalog-import'))")
 for(const s of data.sources)await c.query(`INSERT INTO prediction_catalog_sources(url,title,status,note) VALUES($1,$2,$3,$4) ON CONFLICT(url) DO UPDATE SET status=CASE WHEN prediction_catalog_sources.status='TRANSCRIBED' THEN 'TRANSCRIBED' ELSE EXCLUDED.status END,note=COALESCE(EXCLUDED.note,prediction_catalog_sources.note)`,[s.url,s.title,s.status,s.note||null])
 for(const m of data.materials){const bytes=binaries.get(m.key);await c.query(`INSERT INTO prediction_catalog_materials(sha256,source_url,content,size_bytes,mime_type) VALUES($1,$2,$3,$4,'image/webp') ON CONFLICT DO NOTHING`,[m.key,m.sourceUrl,bytes,bytes.length]);const existing=(await c.query('SELECT source_url FROM prediction_catalog_materials WHERE sha256=$1',[m.key])).rows[0];if(existing.source_url!==m.sourceUrl)throw fail('原图被不同来源复用，需人工核对','CATALOG_CONFLICT',409)}
 const player=async nickname=>{const id=playerHandle(data.author,nickname);await c.query('INSERT INTO prediction_catalog_players(id,author,nickname) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,data.author,nickname]);return id}
 for(const m of data.matches){const hash=catalogHash(m),res=await c.query(`INSERT INTO prediction_catalog_matches(id,source_url,material_sha256,payload_hash,day,ordinal,author,ban,winner_build) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING RETURNING id`,[m.key,m.sourceUrl,m.materialKey,hash,m.day,m.ordinal,data.author,m.ban||null,m.winnerBuild]);const existing=(await c.query('SELECT payload_hash FROM prediction_catalog_matches WHERE id=$1',[m.key])).rows[0];if(existing.payload_hash!==hash)throw fail('已有场次内容冲突，不覆盖','CATALOG_CONFLICT',409)
 if(res.rowCount){insertedMatches++;for(const s of m.seats)await c.query('INSERT INTO prediction_catalog_plays(match_id,slot,player_id,build_label,winner) VALUES($1,$2,$3,$4,$5)',[m.key,s.slot,await player(s.nickname),s.build,s.slot===m.winnerSlot])}}
 for(const x of data.claims){const hash=catalogHash(x);await c.query(`INSERT INTO prediction_catalog_claims(id,player_id,source_url,material_sha256,payload_hash,kind,text,window_start,window_end,aggregate) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,[x.key,await player(x.nickname),x.sourceUrl,x.materialKey,hash,x.kind,x.text,x.windowStart,x.windowEnd,x.aggregate?JSON.stringify(x.aggregate):null]);if((await c.query('SELECT payload_hash FROM prediction_catalog_claims WHERE id=$1',[x.key])).rows[0].payload_hash!==hash)throw fail('已有声明冲突，不覆盖','CATALOG_CONFLICT',409)}
 await c.query('COMMIT');return {insertedMatches,totalSubmittedMatches:data.matches.length}
 }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
export class CatalogService {
 constructor(pool){this.pool=pool}
 async list({cutoff=new Date().toISOString()}={}){
 if(!Number.isFinite(Date.parse(cutoff)))throw fail('截止时间无效','INVALID_CUTOFF')
 const client=await this.pool.connect()
 try{
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
 const [players,plays,claims,sources]=[
 await client.query('SELECT id,author,nickname,identity_status FROM prediction_catalog_players WHERE available_at<=$1 ORDER BY nickname',[cutoff]),
 await client.query(`SELECT p.*,m.day::text,m.ordinal,m.source_url,m.material_sha256,m.ban,m.winner_build FROM prediction_catalog_plays p JOIN prediction_catalog_matches m ON m.id=p.match_id JOIN prediction_catalog_materials b ON b.sha256=m.material_sha256 WHERE m.status='TRANSCRIBED' AND octet_length(b.content)=b.size_bytes AND m.available_at<=$1 AND m.day<($1::timestamptz AT TIME ZONE 'Asia/Shanghai')::date ORDER BY m.day DESC,m.ordinal,p.slot`,[cutoff]),
 await client.query(`SELECT c.*,c.window_start::text AS start,c.window_end::text AS finish FROM prediction_catalog_claims c JOIN prediction_catalog_materials b ON b.sha256=c.material_sha256 WHERE octet_length(b.content)=b.size_bytes AND c.available_at<=$1 AND c.window_end<($1::timestamptz AT TIME ZONE 'Asia/Shanghai')::date ORDER BY c.window_end DESC,c.id`,[cutoff]),
 await client.query(`SELECT s.*, (SELECT count(*)::int FROM prediction_catalog_matches m WHERE m.source_url=s.url AND status='TRANSCRIBED' AND m.available_at<=$1 AND m.day<($1::timestamptz AT TIME ZONE 'Asia/Shanghai')::date) AS matches FROM prediction_catalog_sources s WHERE s.created_at<=$1 ORDER BY url DESC`,[cutoff])]
 await client.query('COMMIT')
 const playerMap=new Map(players.rows.map(p=>[p.id,p.nickname]))
 const matchMap=new Map()
 for(const r of plays.rows){
  let m=matchMap.get(r.match_id)
  if(!m){
   m={id:r.match_id,day:r.day,ordinal:r.ordinal,sourceUrl:r.source_url,materialSha256:r.material_sha256,ban:r.ban||null,winnerBuild:r.winner_build,winnerSlot:null,winnerNickname:null,seats:[]}
   matchMap.set(r.match_id,m)
  }
  const nick=playerMap.get(r.player_id)||'未知'
  if(r.winner){m.winnerSlot=r.slot;m.winnerNickname=nick}
  m.seats.push({slot:r.slot,playerId:r.player_id,nickname:nick,build:r.build_label,winner:Boolean(r.winner)})
 }
 for(const m of matchMap.values()){m.seats.sort((a,b)=>a.slot-b.slot);m.matchType='full_transcribed'}
 const transcribedMatches=[...matchMap.values()]
 const snapshotMatches=buildHistoricalSnapshotMatches()
 const matches=[...transcribedMatches,...snapshotMatches].sort((a,b)=>b.day.localeCompare(a.day)||(b.ordinal-a.ordinal))
 const profiles=players.rows.map(p=>{const history=plays.rows.filter(x=>x.player_id===p.id),group=new Map();for(const h of history){const entry=group.get(h.build_label)||{label:h.build_label,observations:0,winsOnSelectedBuild:0,winsForSourceLabel:0};entry.observations++;if(h.winner)entry.winsForSourceLabel++;entry.observedWinShare=entry.winsForSourceLabel/entry.observations;if(h.winner&&h.build_label===h.winner_build)entry.winsOnSelectedBuild++;group.set(h.build_label,entry)}return {id:p.id,nickname:p.nickname,author:p.author,identityStatus:p.identity_status,uid:null,observedMatches:history.length,observedWins:history.filter(x=>x.winner).length,builds:[...group.values()].sort((a,b)=>b.observations-a.observations),commonBuilds:history.length>=3?[...group.values()].filter(x=>x.observations>=2&&x.observations/history.length>=.5).map(x=>x.label):[],expertBuilds:[],claims:claims.rows.filter(x=>x.player_id===p.id).map(x=>({id:x.id,kind:x.kind,text:x.text,sourceUrl:x.source_url,materialSha256:x.material_sha256,windowStart:x.start,windowEnd:x.finish,aggregate:x.aggregate})),history:history.map(h=>({matchId:h.match_id,day:h.day,ordinal:h.ordinal,slot:h.slot,build:h.build_label,rank:h.winner?1:null,winnerBuild:h.winner?h.winner_build:null,sourceUrl:h.source_url,materialSha256:h.material_sha256}))}})
 return {usageScope:'INTERNAL_ONLY',status:'TRANSCRIBED_NOT_VERIFIED_MATCHES',contributesToModel:false,contributesToVerifiedModel:false,availableForExperimentalModel:true,counts:{players:profiles.length,matches:new Set(plays.rows.map(x=>x.match_id)).size,totalMatches:matches.length,totalDays:new Set(matches.map(m=>m.day)).size,plays:plays.rowCount,claims:claims.rowCount,sources:sources.rowCount},matches,players:profiles,sources:sources.rows,notice:'昵称检索档案，未确认UID；频次仅限已采集标签，跨版本未知；专长为来源作者评价。不计入已核验完整赛果或正式模型；可显式启用未校准的来源实验概率。'}
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
 }
}
