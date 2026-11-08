import {test} from 'node:test'
import assert from 'node:assert/strict'
import {isLocalPgAvailable,recreateNamedTestDb,connectNamedTestDb} from './helpers/pg-test.mjs'
import {runMigrations} from '../src/migrate.mjs'
import {PredictionService} from '../src/prediction/service.mjs'
import {createApiServer} from '../src/http-server.mjs'
const name='wanxiangqi_prediction_v7_test'
test('PG工作台：空态、匿名拒绝、幂等冲突、原件门禁、核验与隔离、截点',async t=>{
 if(!await isLocalPgAvailable()){t.skip('PostgreSQL不可达，PG链路未验证');return}
 await recreateNamedTestDb(name);const pool=await connectNamedTestDb(name);t.after(()=>pool.end())
 const c=await pool.connect();try{await runMigrations(c,{logger:{log(){}}})}finally{c.release()}
 const svc=new PredictionService(pool);assert.equal((await svc.stats()).eligibleMatches,0)
 const server=createApiServer({services:{prediction:svc},adminToken:'TEST-ONLY'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const url=`http://127.0.0.1:${server.address().port}/api/v1/admin/prediction/`
 assert.equal((await fetch(url+'matches')).status,401)
 const req=async(action,body)=>{const r=await fetch(url+action,{method:body?'POST':'GET',headers:{Authorization:'Bearer TEST-ONLY','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()}}
 assert.equal((await req('matches')).data.data.length,0)
 assert.equal((await req('matches',{padding:'x'.repeat(256*1024)})).status,413)
 const m={sourceKey:'TEST-ONLY:1',mode:'WANXIANG',playedAt:'2026-01-01T00:00:00Z',platform:'FIXTURE',region:'FIXTURE',version:'FIXTURE',evidenceId:'TEST-ONLY-EV',evidenceLocator:'FIXTURE NOT REAL',seats:Array.from({length:6},(_,i)=>({rank:i+1,nickname:'FIXTURE'+i,uid:String(i)}))}
 assert.equal((await req('matches',m)).status,422)
 const sha='1'.repeat(64)
 await pool.query(`INSERT INTO evidence_blobs(sha256,content,mime_type,size_bytes,storage_uri) VALUES($1,$2,'image/png',1,'TEST-ONLY')`,[sha,Buffer.from([1])])
 await pool.query(`INSERT INTO evidences(id,sha256,source_id,captured_at,status,kind,usage_scope) VALUES($1,$2,'src-manual-review',now(),'PENDING','CONTENT_ASSET','INTERNAL_ONLY')`,[m.evidenceId,sha])
 const first=await req('matches',m);assert.equal(first.status,200);const id=first.data.data.match.id
 assert.equal((await req('matches',m)).data.data.deduplicated,true)
 assert.equal((await req('matches',{...m,version:'OTHER'})).status,409)
 assert.equal((await req('matches',{...m,sourceKey:'ANOTHER'})).status,409)
 assert.equal((await req(`matches/${id}/verify`,{operator:'TEST'})).status,422)
 await pool.query(`UPDATE evidences SET status='VERIFIED' WHERE id=$1`,[m.evidenceId])
 assert.equal((await req(`matches/${id}/verify`,{operator:'TEST'})).status,200)
 assert.equal((await req(`matches/${id}/verify`,{operator:'TEST'})).status,409)
 assert.equal((await svc.stats()).eligibleMatches,1)
 const {computeStats}=await import('../src/prediction/domain.mjs');assert.equal(computeStats(await svc.eligible(),{cutoff:'2026-01-02T00:00:00Z'}).eligibleMatches,0)
 await pool.query(`UPDATE evidences SET status='QUARANTINED' WHERE id=$1`,[m.evidenceId]);assert.equal((await svc.stats()).eligibleMatches,0)
 await pool.query(`UPDATE evidences SET status='VERIFIED' WHERE id=$1`,[m.evidenceId]);assert.equal((await req(`matches/${id}/quarantine`,{operator:'TEST'})).status,200);assert.equal((await svc.stats()).eligibleMatches,0)
 for(let i=1;i<=3;i++){
  const result=await req('matches',{...m,sourceKey:'TEST-ONLY:'+i+'-NEW',playedAt:`2026-01-0${i+1}T00:00:00Z`})
  assert.equal(result.status,200)
  assert.equal((await req(`matches/${result.data.data.match.id}/verify`,{operator:'TEST'})).status,200)
 }
 const stats=await svc.stats();assert.equal(stats.eligibleMatches,3)
 const prediction=await req('estimate',{mode:'WANXIANG',version:'FIXTURE',players:stats.players.map(p=>p.key)})
 assert.equal(prediction.data.data.status,'RESEARCH_BASELINE');assert.equal(prediction.data.data.calibrated,false)
 assert.equal((await new PredictionService(pool).runs()).length,1)
 assert.equal((await new PredictionService(pool).stats()).eligibleMatches,3)
 assert.equal((await fetch(url+'runs')).status,401)
 await pool.query('DELETE FROM evidence_blobs WHERE sha256=$1',[sha]);assert.equal((await svc.stats()).eligibleMatches,0)
})
