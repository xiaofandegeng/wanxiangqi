import fs from 'node:fs'
import {createHash} from 'node:crypto'
import pg from 'pg'
import {catalogHash, playerHandle} from '../src/prediction/catalog.mjs'
const root=new URL('../../',import.meta.url)
const d=JSON.parse(fs.readFileSync(new URL('backend/data/prediction-catalog/ruanshi.json',root)))
const m=d.matches.find(m=>m.key==='ruanshi:2026-10-27:8')
const nickname='EZ天眷',oldName='EZ天誉'
const before=structuredClone(m)
const seat=before.seats.find(s=>s.slot===1)
if(seat.nickname!==nickname)throw Error('Correction missing')
seat.nickname=oldName
const db=new pg.Client({host:'127.0.0.1',database:'wanxiangqi_prediction_dev'})
await db.connect()
try{
 await db.query('BEGIN')
 await db.query("SELECT pg_advisory_xact_lock(hashtext('prediction-catalog-import'))")
 const {rows:[r]}=await db.query('SELECT m.payload_hash,m.material_sha256,b.content,p.player_id,p.winner FROM prediction_catalog_matches m JOIN prediction_catalog_materials b ON b.sha256=m.material_sha256 JOIN prediction_catalog_plays p ON p.match_id=m.id AND p.slot=1 WHERE m.id=$1 FOR UPDATE OF m,p',[m.key])
 if(!r||r.material_sha256!==m.materialKey||createHash('sha256').update(r.content).digest('hex')!==m.materialKey||!r.winner)throw Error('Evidence mismatch')
 const id=playerHandle(d.author,nickname)
 if(r.payload_hash===catalogHash(m)&&r.player_id===id){await db.query('ROLLBACK');console.log('Already corrected');}
 else {
  if(r.payload_hash!=='67ee22c5b4128a38da53d63284e184c1068a4dc4be0358dd2cddfab9c8051282'||r.player_id!==playerHandle(d.author,oldName))throw Error('Stored preimage differs')
  const {rows:stored}=await db.query('SELECT p.slot,p.build_label,p.winner,h.nickname FROM prediction_catalog_plays p JOIN prediction_catalog_players h ON h.id=p.player_id WHERE p.match_id=$1 ORDER BY p.slot FOR UPDATE OF p',[m.key])
  if(stored.length!==6||before.seats.some(s=>!stored.some(r=>r.slot===s.slot&&r.nickname===s.nickname&&r.build_label===s.build&&r.winner===(s.slot===before.winnerSlot))))throw Error('Stored seats differ; no changes made')
  fs.writeFileSync(new URL('docs/prediction_artifacts/october-1027-match8-correction.json',root),JSON.stringify({storedHash:r.payload_hash,stored,before,after:m},null,2)+'\n',{flag:'wx'})
  await db.query('INSERT INTO prediction_catalog_players(id,author,nickname) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,d.author,nickname])
  await db.query('UPDATE prediction_catalog_plays SET player_id=$2 WHERE match_id=$1 AND slot=1',[m.key,id])
  await db.query('UPDATE prediction_catalog_matches SET payload_hash=$2 WHERE id=$1',[m.key,catalogHash(m)])
  await db.query('COMMIT')
  console.log('Corrected winner nickname: '+nickname)
 }
}finally{await db.end()}
