import pg from 'pg'
import {createHash} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {CANDIDATES,trainContextModel,predictContext,knownChoice} from '../src/prediction/context-model.mjs'
import {trainWinnerModel,predictWinner,metric} from '../src/prediction/winner-model.mjs'
const start='2026-11-08',end='2026-11-14'
const pool=new pg.Pool({host:'127.0.0.1',database:'wanxiangqi_prediction_dev'})
try{
 const {rows}=await pool.query(`SELECT m.id,m.day::text,m.ordinal,m.ban,m.material_sha256,b.content,json_agg(json_build_object('id',p.player_id,'nickname',h.nickname,'winner',p.winner,'build',p.build_label) ORDER BY p.player_id) AS seats
 FROM prediction_catalog_matches m JOIN prediction_catalog_materials b ON b.sha256=m.material_sha256
 JOIN prediction_catalog_plays p ON p.match_id=m.id JOIN prediction_catalog_players h ON h.id=p.player_id
 WHERE m.status='TRANSCRIBED' AND m.day<=$1 GROUP BY m.id,b.sha256 ORDER BY m.day,m.ordinal`,[end])
 const games=rows.filter(g=>g.seats.length===6&&new Set(g.seats.map(s=>s.id)).size===6&&g.seats.filter(s=>s.winner).length===1&&createHash('sha256').update(g.content).digest('hex')===g.material_sha256).map(({content,...g})=>g)
 const variants=[{id:'incumbent'},...CANDIDATES,{id:'uniform'}]
 const predictions=[],fits=[]
 for(const day of [...new Set(games.map(g=>g.day))].sort()){
  const training=games.filter(g=>g.day<day);if(!training.length)continue
  for(const config of variants){
   const model=config.id==='incumbent'?trainWinnerModel(training):config.id==='uniform'?null:trainContextModel(training,day,config)
   if(model?.converged!==undefined)fits.push({day,variant:config.id,iterations:model.iterations,converged:model.converged,gradientMax:model.gradientMax})
   for(const g of games.filter(g=>g.day===day)){
    const p=config.id==='incumbent'?predictWinner(model,g.seats.map(s=>s.id)):config.id==='uniform'?g.seats.map(()=>1/6):predictContext(model,training,g)
    const top=g.seats.filter((s,i)=>Math.abs(p[i]-Math.max(...p))<1e-12)
    predictions.push({id:g.id,day,variant:config.id,trainingMatches:training.length,actual:g.seats.find(s=>s.winner).nickname,predicted:top.map(s=>s.nickname),strictHit:top.length===1&&top[0].winner,metrics:metric(p,g),probabilities:g.seats.map((s,i)=>({id:s.id,nickname:s.nickname,p:p[i]}))})
   }
  }
 }
 const summarize=(variant,fn)=>{
  const r=predictions.filter(x=>x.variant===variant&&fn(x.day))
  return {variant,n:r.length,strictHits:r.filter(x=>x.strictHit).length,strictAccuracy:r.length?r.filter(x=>x.strictHit).length/r.length:null,...Object.fromEntries(['top1Credit','logLoss','brier'].map(k=>[k,r.length?r.reduce((s,x)=>s+x.metrics[k],0)/r.length:null]))}
 }
 const validation=variants.map(c=>summarize(c.id,d=>d<start))
 // Fixed choice from pre-November-8 matches. Evaluation-week labels cannot choose it.
 const selected=validation.filter(x=>x.variant!=='uniform'&&x.n>0).sort((a,b)=>b.top1Credit-a.top1Credit||a.logLoss-b.logLoss||a.variant.localeCompare(b.variant))[0]?.variant||'incumbent'
 const evaluation=variants.map(c=>summarize(c.id,d=>d>=start&&d<=end))
 const baseline=evaluation.find(x=>x.variant==='incumbent'),candidate=evaluation.find(x=>x.variant===selected)
 const report={at:new Date().toISOString(),version:'context-experiment-v1',database:'wanxiangqi_prediction_dev',dataHash:createHash('sha256').update(JSON.stringify(games)).digest('hex'),start,end,
  coverage:{games:games.length,week:games.filter(g=>g.day>=start).length,priorEvidenceCommanderSeats:games.flatMap(g=>g.seats.filter(s=>knownChoice(g,s).commander)).length,sourceBuildSeats:games.flatMap(g=>g.seats.filter(s=>s.build&&s.build!=='UNKNOWN')).length},
  protocol:'Every training feature uses days before that training match. Candidate selected only on dates before 2026-11-08 by tie-adjusted top1, then log loss. November 8–14 used for retrospective comparison, already inspected in earlier research; not a pristine holdout or evidence-availability replay.',
  selected,validation,evaluation,decision:selected!=='incumbent'&&candidate.top1Credit>baseline.top1Credit&&candidate.logLoss<baseline.logLoss?'PROMISING_OFFLINE_ONLY_NEEDS_FUTURE_VALIDATION':'KEEP_INCUMBENT',
  limitations:['No verified historical commander/plan timestamps in this catalog: interaction features remain inactive.','Ban is retrospectively transcribed; public availability before play is unproven.','Build means historical source label, not complete final-build win rate. Nickname aliases are not merged.','Missing dates, mode/version and same-author transcription errors remain. No production formula switched.'],
  fits,rows:predictions.filter(r=>r.day>=start)}
 const path=new URL('../../docs/prediction_artifacts/context-model-evaluation-20261115.json',import.meta.url)
 await writeFile(path,JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({...report,rows:undefined},null,2))
}finally{await pool.end()}
