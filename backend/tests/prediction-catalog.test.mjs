import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {validateCatalog,importCatalog,CatalogService,playerHandle} from '../src/prediction/catalog.mjs'
import {PredictionService} from '../src/prediction/service.mjs'
import {runMigrations} from '../src/migrate.mjs'
import {createApiServer} from '../src/http-server.mjs'
import {isLocalPgAvailable,recreateNamedTestDb,connectNamedTestDb} from './helpers/pg-test.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),data=JSON.parse(await fs.readFile(path.join(root,'backend/data/prediction-catalog/ruanshi.json'),'utf8'))
const read=m=>fs.readFile(path.join(root,m.file))
test('档案拒绝名单序号重复、不同帖子原件错接；昵称句柄不猜测归并',()=>{
 assert.equal(validateCatalog(data),data)
 const bad=structuredClone(data);bad.matches[0].seats[1].slot=1;assert.throws(()=>validateCatalog(bad),/六席/)
 const crossed=structuredClone(data);crossed.matches[0].materialKey=data.matches.at(-1).materialKey;assert.throws(()=>validateCatalog(crossed),/来源原件一致/)
 assert.notEqual(playerHandle(data.author,'抖音梦飞'),playerHandle(data.author,'抖音梦飞1'))
})
test('来源资料真实PG：持久存原件、玩法/专长分离、幂等与事务冲突、匿名不可见、零模型污染',async t=>{
 if(!await isLocalPgAvailable()){t.skip('PG不可达，未验证实际数据库');return}
 const db='wanxiangqi_catalog_test';await recreateNamedTestDb(db);const pool=await connectNamedTestDb(db);t.after(()=>pool.end());const c=await pool.connect();try{await runMigrations(c,{logger:{log(){}}})}finally{c.release()}
 await assert.rejects(importCatalog(pool,data,async()=>Buffer.from('broken image')),/哈希/)
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM prediction_catalog_sources')).rows[0].n,0)
 const result=await importCatalog(pool,data,read);assert.equal(result.insertedMatches,data.matches.length)
 assert.equal((await importCatalog(pool,data,read)).insertedMatches,0)
 const service=new CatalogService(pool),catalog=await service.list();assert.equal(catalog.counts.matches,data.matches.length);assert.equal(catalog.counts.plays,6*data.matches.length)
 assert.equal((await pool.query('SELECT count(*)::int AS n FROM prediction_catalog_materials WHERE octet_length(content)=size_bytes')).rows[0].n,data.materials.length)
 const shi=catalog.players.find(x=>x.nickname==='世薄情');assert.equal(shi.observedMatches,7);assert.equal(shi.observedWins,3);assert.deepEqual(shi.commonBuilds,['逐鹿蒙恬']);assert.equal(shi.builds.find(b=>b.label==='逐鹿蒙恬').observedWinShare,.5);assert.equal(shi.builds.find(b=>b.label==='逐鹿蒙恬').winsForSourceLabel,2);assert.deepEqual(shi.expertBuilds,[]);assert.ok(shi.claims.some(c=>c.kind==='COMMANDER_AUTHOR_CLAIM'&&c.text==='小妲己'))
 const changed=structuredClone(data);changed.sources.push({url:'https://example.com/should-rollback',title:'TEST rollback',status:'DISCOVERED'});changed.matches[0].winnerBuild='TEST conflict';await assert.rejects(importCatalog(pool,changed,read),/冲突/);assert.equal((await pool.query("SELECT count(*)::int AS n FROM prediction_catalog_sources WHERE url='https://example.com/should-rollback'")).rows[0].n,0)
 const p=new PredictionService(pool);assert.equal((await p.stats()).eligibleMatches,0);assert.equal((await p.list()).length,0)
 const server=createApiServer({services:{prediction:p},adminToken:'TEST-ONLY'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const url=`http://127.0.0.1:${server.address().port}/api/v1/admin/prediction/catalog`;assert.equal((await fetch(url)).status,401);const response=await fetch(url,{headers:{Authorization:'Bearer TEST-ONLY'}});assert.equal(response.status,200);assert.equal((await response.json()).data.contributesToModel,false)
 assert.equal((await new CatalogService(pool).list()).counts.matches,data.matches.length)
})

test('七日来源资料包保持54个独立场次、完整六席与两处明确缺号',()=>{
 const base7Days = ['2026-10-23','2026-10-24','2026-10-25','2026-10-26','2026-10-27','2026-10-28','2026-10-29']
 const baseMatches = data.matches.filter(m => base7Days.includes(m.day))
 const days = new Map()
 for (const m of baseMatches) {
   const list = days.get(m.day) || []
   list.push(m.ordinal)
   days.set(m.day, list)
 }
 assert.equal(days.size, 7)
 assert.equal(baseMatches.length, 54)
 assert.equal(new Set(data.matches.map(m => m.key)).size, data.matches.length)
 assert.equal(days.get('2026-10-24').includes(5), false)
 assert.equal(days.get('2026-10-28').includes(2), false)
 for (const [day, ordinals] of days) {
   assert.deepEqual(
     [...ordinals].sort((a,b)=>a-b),
     Array.from({length:8},(_,i)=>i+1).filter(i=>!(day==='2026-10-24'&&i===5)&&!(day==='2026-10-28'&&i===2))
   )
 }
 assert.ok(data.materials.length >= 55)
 assert.ok(data.sources.filter(s=>s.status==='TRANSCRIBED').length >= 12)
 const switched=data.matches.find(m=>m.day==='2026-10-25'&&m.ordinal===6)
 assert.equal(switched.seats[0].build,'河洛木兰')
 assert.equal(switched.winnerBuild,'牺牲李信')
})
