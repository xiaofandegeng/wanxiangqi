import pg from 'pg'
import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
import {importCatalog,catalogHash} from '../src/prediction/catalog.mjs'

// Scoped import of visually reviewed original posts. No production database option.
const root=fileURLToPath(new URL('../../',import.meta.url))
const json=async p=>JSON.parse(await readFile(root+p,'utf8'))
const packPath='backend/data/prediction-catalog/ruanshi.json'
const base=await json(packPath)
const groups=[['nov9-upper','2026-11-09'],['nov9-lower','2026-11-09'],['nov13-upper','2026-11-13'],['nov13-lower','2026-11-13'],['nov14-upper','2026-11-14']]
const notes={
 'nov9-upper':'日期、场次、六席、冠军标题及复盘交叉核对；昵称仅按来源记录，不跨昵称归并。',
 'nov9-lower':'第5场席6原文“木兰放弃从军了”、第8场席6“三分真的被分完了”为评论性标签，build=UNKNOWN。',
 'nov13-upper':'第1场页头禁大河、过渡说明禁日落海冲突，ban=null；编号不作为完整排名或赛前输入。',
 'nov13-lower':'第8场冠军标题镜猪吕布与名单/牌图/结尾三分冲突，winnerBuild=UNKNOWN。第6场11回合说明疑似复制第5场，不采入。',
 'nov14-upper':'仅第1–4场。第1场席3/5名单标签与复盘冲突，席6标逐鹿嬴政但禁逐鹿且复盘描述司空震，build=UNKNOWN；第3场席5名单大河猪离与复盘三分猪离冲突，build=UNKNOWN。第2场投注策略疑似复制，不采入。'
}
const batch={schemaVersion:1,author:base.author,usageScope:'INTERNAL_ONLY',sources:[],materials:[],matches:[],claims:[]}
const bytes=new Map()
for(const [dir,day] of groups){
 const prefix=`docs/prediction_artifacts/${dir}/`
 const source=await json(prefix+'source.json'),rows=await json(prefix+'transcription.json')
 assert.equal(rows.length,4)
 batch.sources.push({url:source.url,title:`万象棋王牌对决${day} ${dir.endsWith('upper')?'上':'下'}`,status:'TRANSCRIBED',note:notes[dir]})
 for(const [i,[ordinal,ban,winnerBuild,seats]] of rows.entries()){
  const file=prefix+`${i+1}.webp`,content=await readFile(root+file),sha256=createHash('sha256').update(content).digest('hex')
  bytes.set(sha256,content)
  batch.materials.push({file,sha256,key:sha256,sourceUrl:source.url,imageOrdinal:i+1})
  batch.matches.push({key:`ruanshi:${day}:${ordinal}`,day,ordinal,sourceUrl:source.url,materialKey:sha256,ban,winnerSlot:1,winnerBuild,seats:seats.map(([nickname,build],i)=>({slot:i+1,nickname,build}))})
 }
}
const pool=new pg.Pool({host:'127.0.0.1',database:'wanxiangqi_prediction_dev'})
try{
 assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'wanxiangqi_prediction_dev')
 // Preserve the prior source file, including its three unsupported November 9 rows.
 const backup=root+'docs/prediction_artifacts/nov9-14-catalog-before.json'
 try{await writeFile(backup,JSON.stringify(base,null,2)+'\n',{flag:'wx'})}catch(e){if(e.code!=='EEXIST')throw e}
 const before=(await pool.query('SELECT count(*)::int AS matches FROM prediction_catalog_matches')).rows[0]
 const imported=await importCatalog(pool,batch,async m=>bytes.get(m.key))
 // Read back all fields and the actual stored original bytes, not just counters.
 const verified=[]
 for(const m of batch.matches){
  const r=(await pool.query(`SELECT m.*,m.day::text AS iso_day,b.content,b.size_bytes FROM prediction_catalog_matches m JOIN prediction_catalog_materials b ON b.sha256=m.material_sha256 WHERE m.id=$1`,[m.key])).rows[0]
  assert.equal(r.payload_hash,catalogHash(m));assert.equal(r.iso_day,m.day);assert.equal(r.ordinal,m.ordinal)
  assert.equal(r.source_url,m.sourceUrl);assert.equal(r.ban,m.ban);assert.equal(r.winner_build,m.winnerBuild)
  assert.equal(r.material_sha256,m.materialKey);assert.equal(r.size_bytes,r.content.length)
  assert.equal(createHash('sha256').update(r.content).digest('hex'),m.materialKey)
  assert.deepEqual(r.content,bytes.get(m.materialKey))
  const seats=(await pool.query(`SELECT s.slot,p.nickname,s.build_label AS build,s.winner FROM prediction_catalog_plays s JOIN prediction_catalog_players p ON p.id=s.player_id WHERE s.match_id=$1 ORDER BY s.slot`,[m.key])).rows
  assert.deepEqual(seats,m.seats.map(s=>({...s,winner:s.slot===m.winnerSlot})))
  verified.push({id:m.key,sha256:m.materialKey,fieldsAndOriginalBytesMatch:true})
 }
 const keys=new Set(batch.matches.map(m=>m.key))
 base.matches=base.matches.filter(m=>!keys.has(m.key)).concat(batch.matches)
 for(const s of batch.sources){const i=base.sources.findIndex(x=>x.url===s.url);if(i<0)base.sources.push(s);else base.sources[i]=s}
 for(const m of batch.materials)if(!base.materials.some(x=>x.key===m.key))base.materials.push(m)
 await writeFile(root+packPath,JSON.stringify(base,null,2)+'\n')
 const coverage=(await pool.query(`SELECT day::text,count(*)::int AS matches FROM prediction_catalog_matches WHERE day BETWEEN '2026-11-08' AND '2026-11-14' AND status='TRANSCRIBED' GROUP BY day ORDER BY day`)).rows
 const report={at:new Date().toISOString(),database:'wanxiangqi_prediction_dev',before,imported,coverage,verified,notes,missing:['2026-11-12:1-8','2026-11-14:5-8'],limitation:'Single-author original images checked visually and with OCR. Not independently corroborated by official game records. Nickname identities unverified. No final rank or post-match build is a pre-match predictor.'}
 await writeFile(root+'docs/prediction_artifacts/nov9-14-import-verification.json',JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify(report,null,2))
}finally{await pool.end()}
