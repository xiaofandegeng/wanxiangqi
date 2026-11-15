import fs from 'node:fs'
import {createHash} from 'node:crypto'
import pg from 'pg'
import {catalogHash, validateCatalog} from '../src/prediction/catalog.mjs'

const root = new URL('../../', import.meta.url)
const catalog = validateCatalog(JSON.parse(fs.readFileSync(new URL('backend/data/prediction-catalog/ruanshi.json', root))))
const audit = JSON.parse(fs.readFileSync(new URL('docs/prediction_artifacts/ruanshi-2026-11-07/correction-audit.json', root)))
const pool = new pg.Pool({host:'127.0.0.1', database:'wanxiangqi_prediction_dev'})
const c = await pool.connect()
try {
 await c.query('BEGIN')
 await c.query("SELECT pg_advisory_xact_lock(hashtext('prediction-catalog-import'))")
 const changes = []
 for (const reviewed of audit.after) {
  const m = catalog.matches.find(m => m.key === reviewed.key)
  if (m?.day !== '2026-11-06' || catalogHash(m) !== catalogHash(reviewed)) throw Error('Reviewed correction mismatch')
  const {rows:[old]} = await c.query('SELECT m.*, b.content FROM prediction_catalog_matches m JOIN prediction_catalog_materials b ON b.sha256=m.material_sha256 WHERE m.id=$1 FOR UPDATE OF m',[m.key])
  if (!old || old.status !== 'TRANSCRIBED' || old.source_url !== m.sourceUrl || old.material_sha256 !== m.materialKey || createHash('sha256').update(old.content).digest('hex') !== m.materialKey) throw Error('Original evidence mismatch: '+m.key)
  delete old.content
  const {rows:seats} = await c.query('SELECT p.*, h.nickname FROM prediction_catalog_plays p JOIN prediction_catalog_players h ON h.id=p.player_id WHERE p.match_id=$1 ORDER BY p.slot FOR UPDATE OF p',[m.key])
  if (seats.length !== 6 || m.seats.some(s=>!seats.some(p=>p.slot===s.slot && p.nickname===s.nickname && p.winner===(s.slot===m.winnerSlot)))) throw Error('Roster or winner mismatch: '+m.key)
  changes.push({before:{match:old,seats},after:m})
  await c.query('UPDATE prediction_catalog_matches SET ban=$2,winner_build=$3,payload_hash=$4 WHERE id=$1',[m.key,m.ban,m.winnerBuild,catalogHash(m)])
  for(const s of m.seats)await c.query('UPDATE prediction_catalog_plays SET build_label=$3 WHERE match_id=$1 AND slot=$2',[m.key,s.slot,s.build])
 }
 if (changes.length !== 8) throw Error('Expected eight reviewed matches')
 const apply = process.argv.includes('--apply')
 if (apply) {
  fs.writeFileSync(new URL('docs/prediction_artifacts/ruanshi-2026-11-07/postgres-before-'+Date.now()+'.json',root),JSON.stringify(changes,null,2)+'\n',{flag:'wx'})
  await c.query('COMMIT')
 } else await c.query('ROLLBACK')
 console.log(JSON.stringify({mode:apply?'committed':'dry-run',matches:changes.length,seats:changes.reduce((a,x)=>a+x.before.seats.length,0)}))
} catch(e) {
 await c.query('ROLLBACK')
 throw e
} finally { c.release(); await pool.end() }
