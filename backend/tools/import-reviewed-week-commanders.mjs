import pg from 'pg'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile,writeFile} from 'node:fs/promises'
import {CatalogService} from '../src/prediction/catalog.mjs'

const root=new URL('../../',import.meta.url)
const artifact=name=>new URL('docs/prediction_artifacts/'+name,root)
const readJson=async url=>JSON.parse(await readFile(url,'utf8'))
const transcription=await readJson(artifact('nov08-14-commander-transcription.json'))
const pack=await readJson(new URL('backend/data/prediction-catalog/ruanshi.json',root))
const pool=new pg.Pool({host:'127.0.0.1',database:'wanxiangqi_prediction_dev'})
const client=await pool.connect()
try{
 assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name,'wanxiangqi_prediction_dev')
 const {rows}=await client.query(`SELECT m.id,m.day::text,m.ordinal,m.ban,m.material_sha256,m.winner_build,b.content,
 json_agg(json_build_object('slot',p.slot,'nickname',h.nickname,'playerId',h.id,'build',p.build_label,'winner',p.winner) ORDER BY p.slot) AS seats
 FROM prediction_catalog_matches m JOIN prediction_catalog_materials b ON b.sha256=m.material_sha256
 JOIN prediction_catalog_plays p ON p.match_id=m.id JOIN prediction_catalog_players h ON h.id=p.player_id
 WHERE m.day BETWEEN '2026-11-08' AND '2026-11-14' AND m.status='TRANSCRIBED'
 GROUP BY m.id,b.sha256 ORDER BY m.day,m.ordinal`)
 assert.equal(rows.length,transcription.length)
 const reviewed=[]
 for(const row of rows){
  const decision=transcription.find(match=>match.day===row.day&&match.ordinal===row.ordinal)
  const match=pack.matches.find(match=>match.key===row.id)
  const original=pack.materials.find(item=>item.key===row.material_sha256)
  assert.equal(decision?.commanders.length,6,row.id)
  assert.equal(row.seats.length,6,row.id)
  assert.equal(match.materialKey,row.material_sha256,row.id)
  assert.equal(createHash('sha256').update(row.content).digest('hex'),row.material_sha256)
  assert.deepEqual(await readFile(new URL(original.file,root)),row.content)
  const seats=row.seats.map((seat,index)=>{
   const planned=match.seats.find(item=>item.slot===seat.slot)
   assert.equal(seat.slot,index+1)
   assert.equal(seat.nickname,planned.nickname,row.id)
   assert.equal(seat.build,planned.build,row.id)
   assert.equal(seat.winner,seat.slot===match.winnerSlot,row.id)
   return {...seat,commander:decision.commanders[index]}
  })
  reviewed.push({id:row.id,day:row.day,ordinal:row.ordinal,ban:row.ban,winnerBuild:row.winner_build,
   materialSha256:row.material_sha256,original:original.file,seats})
 }
 await client.query('BEGIN')
 let inserted=0
 for(const match of reviewed)for(const seat of match.seats){
  if(!seat.commander)continue
  const note='按原件六席编号对照棋手立绘，用同款立绘及原帖复盘交叉辨认。仅登记清楚的对应。'
  const result=await client.query(`INSERT INTO prediction_catalog_commander_evidence
   (match_id,slot,material_sha256,commander,review_note) VALUES($1,$2,$3,$4,$5)
   ON CONFLICT(match_id,slot) DO NOTHING`,[match.id,seat.slot,match.materialSha256,seat.commander,note])
  inserted+=result.rowCount
  const {rows:[stored]}=await client.query('SELECT commander,material_sha256 FROM prediction_catalog_commander_evidence WHERE match_id=$1 AND slot=$2',[match.id,seat.slot])
  assert.deepEqual(stored,{commander:seat.commander,material_sha256:match.materialSha256})
 }
 if(inserted)await client.query('REFRESH MATERIALIZED VIEW prediction_player_build_profiles')
 await client.query('COMMIT')
 const catalog=await new CatalogService(pool).list()
 for(const match of reviewed){
  const actual=catalog.matches.find(row=>row.id===match.id)
  for(const seat of match.seats){
   if(!seat.commander)continue
   const read=actual.seats.find(row=>row.slot===seat.slot)
   assert.equal(read.reviewedCommander,seat.commander)
   assert.equal(read.playerId,seat.playerId)
   assert.equal(read.build,seat.build)
   assert.equal(read.winner,seat.winner)
  }
 }
 const coverage=Object.fromEntries([...new Set(transcription.map(row=>row.day))].map(day=>{
  const matches=reviewed.filter(row=>row.day===day)
  return [day,{matches:matches.length,reviewedSeats:matches.flatMap(row=>row.seats).filter(s=>s.commander).length}]
 }))
 const seats=reviewed.flatMap(row=>row.seats)
 const report={database:'wanxiangqi_prediction_dev',at:new Date().toISOString(),inserted,coverage,
  matches:reviewed.length,seats:seats.length,reviewedSeats:seats.filter(s=>s.commander).length,
  reviewedWinners:seats.filter(s=>s.commander&&s.winner).length,
  reviewedCommanderAndBuild:seats.filter(s=>s.commander&&s.build&&s.build!=='UNKNOWN').length,
  method:'按席位核对 41 张原图，保留不能可靠判断的棋手及冲突玩法。新核对记录按实际入库时间可见。',
  rows:reviewed}
 await writeFile(artifact('nov08-14-commander-db-verified.json'),JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({...report,rows:undefined},null,2))
}catch(error){await client.query('ROLLBACK');throw error}finally{client.release();await pool.end()}
