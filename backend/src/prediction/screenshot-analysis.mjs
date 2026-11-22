import {randomUUID,createHash} from 'node:crypto'
import {fail} from './domain.mjs'
import {CatalogService} from './catalog.mjs'
import {recognizeImage,suggestPlayers} from './ocr.mjs'
import {experimentalWinnerEstimate} from './winner-model.mjs'
const validText=s=>typeof s==='string'&&s.trim()&&s.length<=160
const chinaDay=timestamp=>new Date(Date.parse(timestamp)+8*3600000).toISOString().slice(0,10)
function sourceSample(history){const n=history.length,wins=history.filter(h=>h.rank===1).length;return {observations:n,wins,observedWinShare:n?wins/n:null}}
function validateAuditRoster(input){
 if(!Array.isArray(input.players)||input.players.length!==6)throw fail('必须填写完整六席','INVALID_ROSTER')
 const ids=input.players.map(x=>x?.profileId).filter(Boolean)
 if(new Set(ids).size!==ids.length||!input.players.every(x=>x&&validText(x.nickname)&&(x.profileId==null||typeof x.profileId==='string')))throw fail('六席昵称必填，档案不能重复选择','INVALID_ROSTER')
 if(new Set(input.players.map(x=>x.nickname.normalize('NFKC').replace(/\s/g,'').toLowerCase())).size!==6)throw fail('存在重复昵称，请复核OCR；同名席位尚无稳定账号依据时不能确认六人','AMBIGUOUS_ROSTER')
}
export function forecastRoster(catalog,input,cutoff){
 if(!input||Object.keys(input).length!==2||!Object.hasOwn(input,'bannedFaction')||
  (input.bannedFaction!==null&&!validText(input.bannedFaction))||
  !Array.isArray(input.players)||input.players.length!==6||
  input.players.some(player=>!player||Object.keys(player).length!==2||!validText(player.profileId)||!validText(player.commander))) {
  throw fail('赛前预测仅接收六位选手的档案 ID、棋手和本场禁用阵营','INVALID_FORECAST_INPUT')
 }
 const profiles=new Map(catalog.players.map(profile=>[profile.id,profile]))
 const links=new Map((catalog.playerAliases??[]).map(row=>[row.alias_id,row.canonical_id]))
 const roster=input.players.map(({profileId})=>{
  const id=profileId.trim()
  const profile=profiles.get(links.get(id)??id)
  if(!profile)throw fail(`未找到选手档案 ID ${id}`,'PROFILE_UNAVAILABLE')
  return {nickname:profile.nickname,profileId:profile.id}
 })
 const ids=roster.map(player=>player.profileId).filter(Boolean)
 if(new Set(ids).size!==ids.length)throw fail('同一档案只能填入一个席位','INVALID_ROSTER')
 return experimentalWinnerEstimate(catalog,roster,cutoff,{
  bannedFaction:input.bannedFaction?.trim()??null,
  commanders:input.players.map(player=>player.commander.trim())
 },{diagnostics:false})
}
export function assessRoster(catalog,input,draft){
 if(!input||input.identityConfirmed!==true||!validText(input.operator))throw fail('必须核对六席并填写复核人','ROSTER_CONFIRMATION_REQUIRED')
 validateAuditRoster(input)
 const day=chinaDay(draft.featureCutoff),start7=new Date(Date.parse(day+'T00:00:00Z')-7*86400000).toISOString().slice(0,10),start30=new Date(Date.parse(day+'T00:00:00Z')-30*86400000).toISOString().slice(0,10)
 const rows=input.players.map(x=>{
 const p=x.profileId?catalog.players.find(p=>p.id===x.profileId):null
 if(x.profileId&&!p)throw fail('档案在截图截止时刻不可用，请重新确认','PROFILE_UNAVAILABLE')
 const history=(p?.history||[]).filter(h=>h.day<day),builds=new Map()
 const recent7Matches=history.filter(h=>h.day>=start7).map(h=>({
  matchId:h.matchId??null,day:h.day,ordinal:h.ordinal??null,build:h.build??null,
  commander:h.reviewedCommander??null,winner:h.rank===1,sourceUrl:h.sourceUrl??null
 })).sort((a,b)=>b.day.localeCompare(a.day)||(b.ordinal??0)-(a.ordinal??0))
 for(const h of history){const row=builds.get(h.build)||{label:h.build,observations:0,wins:0};row.observations++;if(h.rank===1)row.wins++;builds.set(h.build,row)}
 return {nickname:x.nickname,profileId:p?.id||null,profileNickname:p?.nickname||null,identityStatus:p?.identityStatus||'UNMATCHED',recent7:{observations:recent7Matches.length,wins:recent7Matches.filter(match=>match.winner).length,from:start7,toExclusive:day},recent7Matches,recent30:sourceSample(history.filter(h=>h.day>=start30)),sourceSample:sourceSample(history),buildRates:[...builds.values()].map(b=>({...b,observedWinShare:b.wins/b.observations,finalBuildWinRate:null,notice:'仅原图所列选择标签的样本登顶比例；缺所有非胜者最终阵容，不能称最终阵容胜率'})),claims:p?.claims||[],probability:null}
 })
 const blockers=['UNCONFIRMED_HISTORICAL_IDENTITIES','UNVERIFIED_SOURCE_RESULTS']
 if(rows.some(r=>!r.profileId))blockers.push('UNMATCHED_PLAYER')
 if(catalog.sources.some(s=>s.status!=='TRANSCRIBED'))blockers.push('INCOMPLETE_SOURCE_COVERAGE')
 if(draft.ocr.phaseHint==='POSTMATCH_INDICATORS')blockers.push('SCREENSHOT_HAS_POSTMATCH_INDICATORS')
 return {model:null,status:'DATA_AUDIT_ONLY',featureCutoff:draft.featureCutoff,calibrated:false,players:rows,blockers,coverage:{...catalog.counts,transcribedSources:catalog.sources.filter(s=>s.status==='TRANSCRIBED').length},allocation:{status:'ABSTAIN',unit:'VIRTUAL_GAME_POINTS_ONLY',reserveRatio:1,players:rows.map(p=>({nickname:p.nickname,ratio:0})),reason:'截图用于资料核对。'},notice:'截图用于核对和留存资料。已入库的逐局赛果可供后续赛前预测使用。'}
}
export class ScreenshotService {
 constructor(pool,recognizer=recognizeImage){this.pool=pool;this.catalog=new CatalogService(pool);this.recognizer=recognizer}
 async original(id){
 const r=(await this.pool.query(`SELECT e.status,e.captured_at,b.content,b.sha256,b.mime_type,b.size_bytes FROM evidences e JOIN evidence_blobs b ON b.sha256=e.sha256 WHERE e.id=$1`,[id])).rows[0]
 if(!r||r.status==='QUARANTINED'||!['image/png','image/jpeg','image/webp'].includes(r.mime_type)||!r.content?.length||r.content.length!==Number(r.size_bytes)||createHash('sha256').update(r.content).digest('hex')!==r.sha256)throw fail('截图原件不存在、不可恢复或已隔离','EVIDENCE_NOT_READY')
 return r
 }
 async read(evidenceId){
 if(!validText(evidenceId))throw fail('截图证据编号必填','INVALID_SCREENSHOT')
 const original=await this.original(evidenceId),now=(await this.pool.query('SELECT clock_timestamp() AS time')).rows[0].time
 const captured=original.captured_at instanceof Date?original.captured_at.getTime():Date.parse(original.captured_at)
 if(!Number.isFinite(captured)||captured>now.getTime())throw fail('截图采集时间无效或晚于当前时间','INVALID_CAPTURE_TIME')
 const featureCutoff=new Date(Math.min(captured,now.getTime())).toISOString()
 const result=await this.recognizer(original.content),catalog=await this.catalog.list({cutoff:featureCutoff}),suggestions=suggestPlayers(result.lines,catalog.players)
 const ocr={...result,...suggestions},id=randomUUID()
 // OCR耗时期间原件可能被隔离，写入前再次检查；草稿绝不自动放行赛果。
 if((await this.original(evidenceId)).sha256!==original.sha256)throw fail('截图原件在识别期间发生变化','EVIDENCE_CHANGED')
 await this.pool.query('INSERT INTO prediction_screenshot_drafts(id,evidence_id,evidence_sha256,feature_cutoff,ocr) VALUES($1,$2,$3,$4,$5)',[id,evidenceId,original.sha256,featureCutoff,JSON.stringify(ocr)])
 return {id,evidenceId,evidenceSha256:original.sha256,featureCutoff,ocr,status:'NEEDS_HUMAN_REVIEW'}
 }
 async get(id){const row=(await this.pool.query('SELECT * FROM prediction_screenshot_drafts WHERE id=$1',[id])).rows[0];if(!row)throw fail('截图草稿不存在','NOT_FOUND',404);if((await this.original(row.evidence_id)).sha256!==row.evidence_sha256)throw fail('草稿与原图指纹不一致','EVIDENCE_CHANGED');return {id:row.id,evidenceId:row.evidence_id,evidenceSha256:row.evidence_sha256,featureCutoff:row.feature_cutoff.toISOString(),ocr:row.ocr,status:'NEEDS_HUMAN_REVIEW'}}
 async analysis(id){const row=(await this.pool.query('SELECT * FROM prediction_screenshot_analyses WHERE id=$1',[id])).rows[0];if(!row)throw fail('分析记录不存在','NOT_FOUND',404);await this.get(row.draft_id);return {id:row.id,...row.result}}
 async analyze(id,input){const draft=await this.get(id),catalog=await this.catalog.list({cutoff:draft.featureCutoff}),result=assessRoster(catalog,input,draft),analysisId=randomUUID();await this.pool.query('INSERT INTO prediction_screenshot_analyses(id,draft_id,request,result) VALUES($1,$2,$3,$4)',[analysisId,id,JSON.stringify(input),JSON.stringify(result)]);return {id:analysisId,...result}}
}
