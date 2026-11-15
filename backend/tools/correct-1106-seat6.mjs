import fs from 'node:fs'
import {createHash} from 'node:crypto'
import pg from 'pg'
import {catalogHash, playerHandle} from '../src/prediction/catalog.mjs'
const root=new URL('../../',import.meta.url)
const d=JSON.parse(fs.readFileSync(new URL('backend/data/prediction-catalog/ruanshi.json',root)))
const m=d.matches.find(m=>m.key==='ruanshi:2026-11-06:1')
const nickname='抖音所演Y',oldName='抖音所谓Y'
const before=structuredClone(m)
const seat=before.seats.find(s=>s.slot===6)
if(seat.nickname!==nickname)throw Error('Correction missing')
seat.nickname=oldName
const db=new pg.Client({host:'127.0.0.1',database:'wanxiangqi_prediction_dev'})
await db.connect()
try{
 await db.query('BEGIN')
 await db.query("SELECT pg_advisory_xact_lock(hashtext('prediction-catalog-import'))")
 const {rows:[r]}=await db.query('SELECT m.payload_hash,m.material_sha256,b.content,p.player_id,p.winner FROM prediction_catalog_matches m JOIN prediction_catalog_materials b ON b.sha256=m.material_sha256 JOIN prediction_catalog_plays p ON p.match_id=m.id AND p.slot=6 WHERE m.id=$1 FOR UPDATE OF m,p',[m.key])
 if(!r||r.material_sha256!==m.materialKey||createHash('sha256').update(r.content).digest('hex')!==m.materialKey||r.winner)throw Error('Evidence mismatch')
 const id=playerHandle(d.author,nickname)
 if(r.payload_hash===catalogHash(m)&&r.player_id===id){await db.query('ROLLBACK');console.log('Already corrected');}
 else {
  if(r.payload_hash!==catalogHash(before)||r.player_id!==playerHandle(d.author,oldName))throw Error('Stored preimage differs')
  fs.writeFileSync(new URL('docs/prediction_artifacts/ruanshi-2026-11-07/seat6-nickname-correction.json',root),JSON.stringify({before,after:m},null,2)+'\n',{flag:'wx'})
  await db.query('INSERT INTO prediction_catalog_players(id,author,nickname) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,d.author,nickname])
  await db.query('UPDATE prediction_catalog_plays SET player_id=$2 WHERE match_id=$1 AND slot=6',[m.key,id])
  await db.query('UPDATE prediction_catalog_matches SET payload_hash=$2 WHERE id=$1',[m.key,catalogHash(m)])
  await db.query('COMMIT')
  console.log('Corrected 1 seat: '+nickname)
 }
}finally{await db.end()}
