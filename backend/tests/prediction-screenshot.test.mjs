import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {assessRoster,ScreenshotService} from '../src/prediction/screenshot-analysis.mjs'
import {suggestPlayers} from '../src/prediction/ocr.mjs'
import {importCatalog,CatalogService} from '../src/prediction/catalog.mjs'
import {runMigrations} from '../src/migrate.mjs'
import {isLocalPgAvailable,recreateNamedTestDb,connectNamedTestDb} from './helpers/pg-test.mjs'
import {createApiServer} from '../src/http-server.mjs'
import {PredictionService} from '../src/prediction/service.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const fixture={counts:{matches:2},sources:[{status:'DISCOVERED'}],players:[{id:'TEST-A',nickname:'TEST选手',identityStatus:'SOURCE_NICKNAME_ONLY',claims:[],history:[{day:'2026-10-28',rank:1,build:'A'},{day:'2026-10-27',rank:null,build:'A'}]}]}
const request={phase:'PREMATCH',identityConfirmed:true,operator:'TEST',mode:'WANXIANG',version:'TEST-V',players:Array.from({length:6},(_,i)=>({nickname:'TEST'+i,profileId:i===0?'TEST-A':null}))}
test('胜者模型资料口径：六席+冠军可提供二元胜负；汇总不重复累计，不填排名与校准概率',()=>{
 const r=assessRoster(fixture,request,{featureCutoff:'2026-10-31T00:00:00Z',ocr:{phaseHint:'UNKNOWN'}})
 assert.equal(r.players[0].recent7.observations,2);assert.equal(r.players[0].buildRates[0].observedWinShare,.5);assert.equal(r.players[0].buildRates[0].finalBuildWinRate,null)
 assert.ok(r.players.every(p=>p.probability===null));assert.equal(r.allocation.status,'ABSTAIN');assert.equal(r.allocation.reserveRatio,1);assert.equal(r.allocation.players.reduce((s,p)=>s+p.ratio,0),0)
 assert.throws(()=>assessRoster(fixture,{...request,players:request.players.slice(1)},{featureCutoff:'2026-10-31T00:00:00Z',ocr:{}}),/六席/)
 const repeated=structuredClone(request);repeated.players[1].profileId='TEST-A';assert.throws(()=>assessRoster(fixture,repeated,{featureCutoff:'2026-10-31T00:00:00Z',ocr:{}}),/重复/)
 const repeatedText=structuredClone(request);repeatedText.players[1].nickname=repeatedText.players[0].nickname;assert.throws(()=>assessRoster(fixture,repeatedText,{featureCutoff:'2026-10-31T00:00:00Z',ocr:{}}),/重复昵称/)
})
test('OCR仅给候选，相似度不绑定身份；赛后标记独立拦截',()=>{
 const lines=[{text:'参赛者',x:.2,y:.1,width:.1,height:.03,confidence:1},{text:'TEST选手',x:.21,y:.2,width:.2,height:.03,confidence:.8},{text:'回放',x:.8,y:.9,width:.1,height:.03,confidence:1}]
 const s=suggestPlayers(lines,fixture.players);assert.equal(s.phaseHint,'POSTMATCH_INDICATORS');assert.equal(s.rows.length,1);assert.equal(s.rows[0].candidates[0].id,'TEST-A');assert.equal(s.rows[0].profileId,undefined)
 const r=assessRoster(fixture,request,{featureCutoff:'2026-10-31T00:00:00Z',ocr:s});assert.ok(r.blockers.includes('SCREENSHOT_HAS_POSTMATCH_INDICATORS'));assert.equal(assessRoster(fixture,{...request,experimentalProbability:true},{featureCutoff:'2026-10-31T00:00:00Z',ocr:s}).model,null)
})
test('截图PG全链路：原件、截止快照、OCR草稿/分析持久化、匿名鉴权及晚收录排除',async t=>{
 if(!await isLocalPgAvailable()){t.skip('本地PG不可达');return}
 await recreateNamedTestDb('wanxiangqi_screenshots_test');const pool=await connectNamedTestDb('wanxiangqi_screenshots_test');t.after(()=>pool.end())
 const c=await pool.connect();try{await runMigrations(c,{logger:{log(){}}})}finally{c.release()}
 const data=JSON.parse(await fs.readFile(path.join(root,'backend/data/prediction-catalog/ruanshi.json'),'utf8'));await importCatalog(pool,data,m=>fs.readFile(path.join(root,m.file)))
 const material=data.materials[0],bytes=await fs.readFile(path.join(root,material.file))
 await pool.query(`INSERT INTO evidence_blobs(sha256,content,mime_type,size_bytes,storage_uri) VALUES($1,$2,'image/webp',$3,'TEST ONLY')`,[material.sha256,bytes,bytes.length])
 await pool.query(`INSERT INTO evidences(id,sha256,source_id,captured_at,status,kind,usage_scope) VALUES('TEST-SCREENSHOT',$1,'src-manual-review',now(),'PENDING','CONTENT_ASSET','INTERNAL_ONLY')`,[material.sha256])
 const p=new PredictionService(pool);p.screenshots=new ScreenshotService(pool,async()=>({engine:'TEST-STUB-NOT-REAL-OCR',lines:[{text:'小琳谷芷',x:.2,y:.2,width:.1,height:.03,confidence:1}]}))
 const server=createApiServer({services:{prediction:p},adminToken:'TEST'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)))
 const url=`http://127.0.0.1:${server.address().port}/api/v1/admin/prediction/`
 const post=async(action,body)=>{const r=await fetch(url+action,{method:'POST',headers:{Authorization:'Bearer TEST','Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,json:await r.json()}}
 assert.equal((await fetch(url+'screenshots',{method:'POST'})).status,401)
 assert.equal((await post('screenshots',{evidenceId:'MISSING'})).status,422)
 const saved=await post('screenshots',{evidenceId:'TEST-SCREENSHOT'});assert.equal(saved.status,200);const draft=saved.json.data
 const catalog=await new CatalogService(pool).list({cutoff:draft.featureCutoff}),profiles=catalog.players.filter(p=>p.history.length).slice(0,6)
 assert.equal(profiles.length,6,'截图采集时刻应保留毫秒，不得误截断到导入之前')
 const input={...request,version:'v1.8.1',aceContext:{supportStage:'OPEN',bannedFaction:'日落海',grossReturnConfirmed:true},players:profiles.map(p=>({nickname:p.nickname,profileId:p.id,commander:'TEST棋手',returnMultiplier:5.6}))}
 const first=await post(`screenshots/${draft.id}/analyze`,input);assert.equal(first.status,200);assert.equal(first.json.data.status,'DATA_AUDIT_ONLY');assert.equal(first.json.data.allocation.status,'ABSTAIN')
 const experimental=await post(`screenshots/${draft.id}/analyze`,{...input,experimentalProbability:true});assert.equal(experimental.status,200);assert.equal(experimental.json.data.model.trainingMatches,data.matches.length);assert.ok(Math.abs(experimental.json.data.players.reduce((s,p)=>s+p.probability,0)-1)<1e-12);assert.equal(experimental.json.data.calibrated,false);assert.equal((await fetch(url+'screenshot-analyses/'+experimental.json.data.id)).status,401);assert.deepEqual((await p.screenshots.analysis(experimental.json.data.id)).model,experimental.json.data.model)
 const oldCount=first.json.data.players[0].sourceSample.observations
 await pool.query("UPDATE prediction_catalog_matches SET available_at=now()+interval '1 day'")
 const next=await p.screenshots.analyze(draft.id,input);assert.equal(next.players[0].sourceSample.observations,0)
 const stored=(await pool.query('SELECT result FROM prediction_screenshot_analyses ORDER BY created_at LIMIT 1')).rows[0].result;assert.equal(stored.players[0].sourceSample.observations,oldCount);assert.equal(stored.aceContext.rules.perPlayerSupportCap,10000);assert.equal(stored.aceContext.players[0].breakEvenProbability,1/5.6);assert.equal(stored.aceContext.bannedFaction,'日落海')
 assert.equal((await p.stats()).eligibleMatches,0)
 await pool.query("UPDATE evidences SET status='QUARANTINED' WHERE id='TEST-SCREENSHOT'");await assert.rejects(p.screenshots.get(draft.id),/原件/);await assert.rejects(p.screenshots.analysis(experimental.json.data.id),/原件/)
})
