import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {isLocalPgAvailable,recreateNamedTestDb,connectNamedTestDb} from './helpers/pg-test.mjs'
import {runMigrations} from '../src/migrate.mjs'
import {PredictionService} from '../src/prediction/service.mjs'
import {createApiServer} from '../src/http-server.mjs'
test('来源资料PG/HTTP：鉴权、原件、幂等、复核、隔离、重启；永不混入赛果',async t=>{
 if(!await isLocalPgAvailable()){t.skip('PG不可达，来源资料PG链路未验证');return}
 const db='wanxiangqi_observations_test';await recreateNamedTestDb(db);const pool=await connectNamedTestDb(db);t.after(()=>pool.end())
 const c=await pool.connect();try{await runMigrations(c,{logger:{log(){}}})}finally{c.release()}
 const prediction=new PredictionService(pool),server=createApiServer({services:{prediction},adminToken:'TEST-ONLY'})
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const url=`http://127.0.0.1:${server.address().port}/api/v1/admin/prediction/`
 const request=async(action,body)=>{const response=await fetch(url+action,{method:body?'POST':'GET',headers:{Authorization:'Bearer TEST-ONLY','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()}}
 assert.equal((await fetch(url+'observations')).status,401)
 assert.deepEqual((await request('observations')).body.data,[])
 const raw={sourceKey:'TEST:ROSTER',kind:'ROSTER_WINNER',sourceName:'FIXTURE',sourceUrl:'https://example.com/test',windowStart:'2026-01-01',windowEnd:'2026-01-01',mode:'WANXIANG',evidenceId:'TEST-OBS-EV',evidenceLocator:'TEST ONLY',winnerSlot:2,participants:Array.from({length:6},(_,i)=>({nickname:'FIXTURE'+i}))}
 assert.equal((await request('observations',raw)).status,422)
 const bytes=Buffer.from('TEST ONLY NOT REAL IMAGE'),sha=createHash('sha256').update(bytes).digest('hex')
 await pool.query(`INSERT INTO evidence_blobs(sha256,content,mime_type,size_bytes,storage_uri) VALUES($1,$2,'image/png',$3,'TEST ONLY')`,[sha,bytes,bytes.length])
 await pool.query(`INSERT INTO evidences(id,sha256,source_id,captured_at,status,kind,usage_scope) VALUES($1,$2,'src-manual-review',now(),'PENDING','CONTENT_ASSET','INTERNAL_ONLY')`,[raw.evidenceId,sha])
 const first=await request('observations',raw);assert.equal(first.status,200);const id=first.body.data.observation.id
 assert.equal((await request('observations',raw)).body.data.deduplicated,true)
 assert.equal((await request('observations',{...raw,winnerSlot:3})).status,409)
 assert.equal((await request(`observations/${id}/verify`,{operator:'TEST'})).status,422)
 await pool.query(`UPDATE evidences SET status='VERIFIED' WHERE id=$1`,[raw.evidenceId])
 const verified=await request(`observations/${id}/verify`,{operator:'TEST'});assert.equal(verified.status,200);assert.equal(verified.body.data.evidenceReady,true)
 assert.equal((await request(`observations/${id}/verify`,{operator:'TEST'})).status,409)
 const agg=await request('observations',{...raw,kind:'PLAYER_AGGREGATE',sourceKey:'TEST:AGG',rows:[{nickname:'FIXTURE',appearances:5,wins:2,top3:5,avgRank:2}]})
 const aggId=agg.body.data.observation.id;assert.equal((await request(`observations/${aggId}/verify`,{operator:'TEST'})).status,200)
 const list=(await request('observations')).body.data;assert.equal(list.length,2);assert.ok(list.every(x=>x.evidenceReady&&x.contributesToMatchStats===false))
 assert.equal((await prediction.stats()).eligibleMatches,0);assert.equal((await prediction.list()).length,0)
 assert.equal((await new PredictionService(pool).observations.list()).length,2)
 await pool.query(`UPDATE evidences SET status='QUARANTINED' WHERE id=$1`,[raw.evidenceId]);assert.ok((await prediction.observations.list()).every(x=>!x.evidenceReady))
 assert.equal((await request(`observations/${id}/quarantine`,{operator:'TEST'})).status,200)
 assert.equal((await request(`observations/${id}/verify`,{operator:'TEST'})).status,409)
})
