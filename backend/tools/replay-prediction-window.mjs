import pg from 'pg'
import {createHash} from 'node:crypto'
import {metric,predictWinner,trainWinnerModel} from '../src/prediction/winner-model.mjs'

const [start,end]=process.argv.slice(2)
if (![start,end].every(x=>/^\d{4}-\d{2}-\d{2}$/.test(x??'') && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0,10)===x)||start>end) throw Error('Usage: replay-prediction-window.mjs START_DAY END_DAY')
const pool=new pg.Pool({host:'127.0.0.1',database:'wanxiangqi_prediction_dev'})
try{
 const {rows}=await pool.query(`SELECT m.id,m.day::text,m.ordinal,m.material_sha256,b.content,json_agg(json_build_object('id',p.player_id,'nickname',h.nickname,'winner',p.winner) ORDER BY p.player_id) AS seats
 FROM prediction_catalog_matches m JOIN prediction_catalog_materials b ON b.sha256=m.material_sha256
 JOIN prediction_catalog_plays p ON p.match_id=m.id JOIN prediction_catalog_players h ON h.id=p.player_id
 WHERE m.status='TRANSCRIBED' AND m.day<=$1 GROUP BY m.id,b.sha256 ORDER BY m.day,m.ordinal`,[end])
 const games=rows.filter(g=>g.seats.length===6&&new Set(g.seats.map(x=>x.id)).size===6&&g.seats.filter(s=>s.winner).length===1&&createHash('sha256').update(g.content).digest('hex')===g.material_sha256).map(({content,...g})=>g)
 const result=[]
 for(const day of new Set(games.filter(g=>g.day>=start).map(g=>g.day))){
  const training=games.filter(g=>g.day<day)
  if(!training.length)continue
  const model=trainWinnerModel(training)
  for(const g of games.filter(g=>g.day===day)){
   const p=predictWinner(model,g.seats.map(x=>x.id))
   const tie=g.seats.filter((_,i)=>Math.abs(p[i]-Math.max(...p))<1e-12).map(x=>x.nickname)
   result.push({day,ordinal:g.ordinal,id:g.id,trainingMatches:training.length,actual:g.seats.find(x=>x.winner).nickname,predicted:tie,strictHit:tie.length===1&&tie[0]===g.seats.find(x=>x.winner).nickname,seats:g.seats.map((s,i)=>({nickname:s.nickname,probability:p[i]})),model:metric(p,g),uniform:metric(p.map(()=>1/6),g),shrink50:metric(p.map(x=>(x+1/6)/2),g)})
  }
 }
 const summary=Object.fromEntries(['model','uniform','shrink50'].map(k=>[k,result.length?Object.fromEntries(['logLoss','brier','top1Credit'].map(m=>[m,result.reduce((s,r)=>s+r[k][m],0)/result.length])):null]))
 const coverage=Object.fromEntries(Array.from({length:Math.round((Date.parse(end)-Date.parse(start))/86400000)+1},(_,i)=>{const day=new Date(Date.parse(start)+i*86400000).toISOString().slice(0,10);return [day,result.filter(r=>r.day===day).length]}))
 console.log(JSON.stringify({start,end,coverage,evaluated:result.length,strictHits:result.filter(r=>r.strictHit).length,summary,note:'Retrospective day split, not evidence-availability replay. No same-day results, seat rank, post-match lineup or odds used as input. Shrink50 is an offline comparison only.',rows:result},null,2))
}finally{await pool.end()}
