import pg from 'pg'
import {createHash} from 'node:crypto'
import {writeFile} from 'node:fs/promises'
import {FIELD_CONFIG,trainContextModel,predictContext,knownChoice} from '../src/prediction/context-model.mjs'
import {metric} from '../src/prediction/winner-model.mjs'
const start='2026-11-08',end='2026-11-14'
const pool=new pg.Pool({host:'127.0.0.1',database:'wanxiangqi_prediction_dev'})
try{
 const {rows:sourceRows}=await pool.query(`SELECT m.id,m.day::text,m.ordinal,m.ban,m.material_sha256,b.content,json_agg(json_build_object('id',p.player_id,'nickname',h.nickname,'winner',p.winner,'build',p.build_label) ORDER BY p.player_id) AS seats
 FROM prediction_catalog_matches m JOIN prediction_catalog_materials b ON b.sha256=m.material_sha256
 JOIN prediction_catalog_plays p ON p.match_id=m.id JOIN prediction_catalog_players h ON h.id=p.player_id
 WHERE m.status='TRANSCRIBED' AND m.day<=$1 GROUP BY m.id,b.sha256 ORDER BY m.day,m.ordinal`,[end])
 const games=sourceRows.filter(g=>g.seats.length===6&&new Set(g.seats.map(s=>s.id)).size===6&&g.seats.filter(s=>s.winner).length===1&&createHash('sha256').update(g.content).digest('hex')===g.material_sha256).map(({content,...g})=>g)
 const days=[...new Set(games.map(g=>g.day))].sort()
 function replay(config, from, to) {
  const rows=[]
  for(const day of days.filter(day=>day>=from&&day<=to)){
   const training=games.filter(game=>game.day<day)
   if(!training.length)continue
   const model=trainContextModel(training,day,config)
   for(const game of games.filter(game=>game.day===day)){
    const probabilities=predictContext(model,training,game)
    const best=game.seats.filter((_,index)=>Math.abs(probabilities[index]-Math.max(...probabilities))<1e-12)
    const winnerIndex=game.seats.findIndex(seat=>seat.winner)
    rows.push({
     id:game.id,day,ordinal:game.ordinal,ban:game.ban,trainingMatches:training.length,
     actual:game.seats[winnerIndex].nickname,actualProbability:probabilities[winnerIndex],
     actualRank:1+probabilities.filter(p=>p>probabilities[winnerIndex]+1e-12).length,
     predicted:best.map(seat=>seat.nickname),strictHit:best.length===1&&best[0].winner,
     metrics:metric(probabilities,game),converged:model.converged,
     probabilities:game.seats.map((seat,index)=>({nickname:seat.nickname,probability:probabilities[index]}))
    })
   }
  }
  return rows
 }
 function summarize(rows) {
  const strictHits=rows.filter(row=>row.strictHit).length
  return {matches:rows.length,strictHits,strictAccuracy:rows.length?strictHits/rows.length:null,
   ...Object.fromEntries(['top1Credit','logLoss','brier'].map(key=>[key,rows.length?rows.reduce((sum,row)=>sum+row.metrics[key],0)/rows.length:null]))}
 }
 const rows=replay(FIELD_CONFIG,start,end)
 const report={
  version:'field-actual-results-v6',database:'wanxiangqi_prediction_dev',start,end,
  dataHash:createHash('sha256').update(JSON.stringify(games)).digest('hex'),
  protocol:'使用截图分析同一套配置。逐日以此前赛果训练，当日预测逐场与真实冠军核对。',
  coverage:{games:games.length,week:rows.length,priorEvidenceCommanderSeats:games.flatMap(g=>g.seats.filter(s=>knownChoice(g,s).commander)).length},
  config:FIELD_CONFIG,actualResults:summarize(rows),rows,
  limitations:'11月8–14日为此前分析过的历史窗口。禁用来自赛果原图，阵容竞争使用此前玩法推估。缺少历史赛前棋手证据。'
 }
 const path=new URL('../../docs/prediction_artifacts/field-actual-results-20261115.json',import.meta.url)
 await writeFile(path,JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({config:FIELD_CONFIG,actualResults:report.actualResults},null,2))
}finally{await pool.end()}
