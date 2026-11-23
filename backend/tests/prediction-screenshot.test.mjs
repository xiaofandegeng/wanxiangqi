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
 assert.equal(r.players[0].recent7.observations,2);assert.deepEqual(r.players[0].recent7Matches.map(match=>match.winner),[true,false]);assert.equal(r.players[0].buildRates[0].observedWinShare,.5);assert.equal(r.players[0].buildRates[0].finalBuildWinRate,null)
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
 const pack=JSON.parse(await fs.readFile(path.join(root,'backend/data/prediction-catalog/ruanshi.json'),'utf8'))
 const matches=pack.matches.filter(m=>m.day==='2026-11-09')
 assert.equal(matches.length,8)
 const data={...pack,matches,claims:[],sources:pack.sources.filter(s=>matches.some(m=>m.sourceUrl===s.url)),materials:pack.materials.filter(b=>matches.some(m=>m.materialKey===b.key))}
 await importCatalog(pool,data,m=>fs.readFile(path.join(root,m.file)))
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
 const review=await post(`screenshots/${draft.id}/analyze`,{...input,phase:'IN_PROGRESS',experimentalProbability:true})
 assert.equal(review.status,200);assert.equal(review.json.data.model,null);assert.equal(review.json.data.status,'DATA_AUDIT_ONLY')
 assert.equal((await fetch(url+'screenshot-analyses/'+review.json.data.id)).status,401)
 assert.equal((await p.screenshots.analysis(review.json.data.id)).model,null)
 const forecast=await post('forecast',{bannedFaction:'日落海',players:profiles.map(profile=>({profileId:profile.id,commander:'TEST棋手'}))})
 assert.equal(forecast.status,200);assert.equal(forecast.json.data.trainingMatches,data.matches.length)
 assert.equal(forecast.json.data.modelVersion,'source-roster-dynamic-v15')
 const forecastSnapshot=(await pool.query('SELECT players FROM prediction_prematch_forecasts WHERE id=$1',[forecast.json.data.forecastId])).rows[0]
 assert.deepEqual(forecastSnapshot.players.map(player=>player.id),profiles.map(profile=>profile.id))
 const board=await fetch(url+'rank-feedback',{headers:{Authorization:'Bearer TEST'}})
 assert.equal(board.status,200)
 assert.equal((await board.json()).data.settledMatches,0)
 assert.ok(Math.abs(forecast.json.data.players.reduce((s,p)=>s+p.probability,0)-1)<1e-12)
 const historical=catalog.matches.find(row=>row.id===matches[0].key)
 const settledRanks=historical.seats.map((seat,index)=>seat.winner?1:
  2+historical.seats.slice(0,index).filter(other=>!other.winner).length)
 await pool.query(`UPDATE prediction_catalog_matches SET day=(now() AT TIME ZONE 'Asia/Shanghai')::date-1,
  ban='大河' WHERE id=$1`,[historical.id])
 for (const seat of historical.seats){
  await pool.query(`INSERT INTO prediction_catalog_commander_evidence(match_id,slot,material_sha256,commander,review_note)
   VALUES($1,$2,$3,'玉环','TEST') ON CONFLICT (match_id,slot) DO UPDATE SET commander=EXCLUDED.commander`,
  [historical.id,seat.slot,historical.materialSha256])
 }
 await pool.query(`INSERT INTO prediction_catalog_rank_evidence(match_id,material_sha256,ranks)
  VALUES($1,$2,$3)`,[historical.id,historical.materialSha256,settledRanks])
 const historicalSnapshot=historical.seats.map((seat,index)=>({id:seat.playerId,commander:'玉环',
  probability:settledRanks[index]/21}))
 await pool.query(`INSERT INTO prediction_prematch_forecasts(id,model_version,banned_faction,players,recorded_at)
  SELECT 'TEST-RANK-FEEDBACK','TEST','大河',$2,scheduled_at-interval '1 minute'
  FROM prediction_catalog_matches WHERE id=$1`,[historical.id,JSON.stringify(historicalSnapshot)])
 const settledBoard=await fetch(url+'rank-feedback',{headers:{Authorization:'Bearer TEST'}})
 assert.equal(settledBoard.status,200)
 const {data:rankFeedback}=await settledBoard.json()
 assert.equal(rankFeedback.settledMatches,1)
 assert.equal(rankFeedback.red[0].matches[0].predictedRank,6)
 assert.equal(rankFeedback.red[0].matches[0].actualRank,1)
 const liveFirst=await post('rank-feedback/generate',{})
 assert.equal(liveFirst.status,200)
 assert.equal(liveFirst.json.data.generation.generated,0)
 assert.equal(liveFirst.json.data.board.windows.recent3.live,1)

 await pool.query(`INSERT INTO prediction_catalog_matches(id,source_url,material_sha256,payload_hash,day,ordinal,author,ban,winner_build)
  SELECT 'TEST-PRIOR-RANK-HISTORY',source_url,material_sha256,payload_hash,day-1,100,author,ban,winner_build
  FROM prediction_catalog_matches WHERE id=$1`,[historical.id])
 await pool.query(`INSERT INTO prediction_catalog_plays(match_id,slot,player_id,build_label,winner)
  SELECT 'TEST-PRIOR-RANK-HISTORY',slot,player_id,build_label,winner FROM prediction_catalog_plays WHERE match_id=$1`,[historical.id])
 await pool.query("DELETE FROM prediction_prematch_forecasts WHERE id='TEST-RANK-FEEDBACK'")
 const backfilled=await post('rank-feedback/generate',{})
 assert.equal(backfilled.status,200)
 assert.equal(backfilled.json.data.generation.generated,1)
 assert.equal(backfilled.json.data.board.windows.recent3.replayed,1)
 const unchanged=await post('rank-feedback/generate',{})
 assert.equal(unchanged.json.data.generation.generated,0)
 assert.equal(unchanged.json.data.generation.unchanged,1)
 const replayQuery='SELECT training_hash,players,invalidated_at FROM prediction_rank_replays WHERE match_id=$1'
 const before=(await pool.query(replayQuery,[historical.id])).rows[0]
 const correctedWinner=historical.seats.find(seat=>!seat.winner)
 await pool.query("UPDATE prediction_catalog_plays SET winner=false WHERE match_id='TEST-PRIOR-RANK-HISTORY' AND winner")
 await pool.query("UPDATE prediction_catalog_plays SET winner=true WHERE match_id='TEST-PRIOR-RANK-HISTORY' AND slot=$1",[correctedWinner.slot])
 const regenerated=await post('rank-feedback/generate',{})
 assert.equal(regenerated.status,200)
 assert.equal(regenerated.json.data.generation.generated,1)
 assert.equal(regenerated.json.data.board.windows.recent3.replayed,1)
 const after=(await pool.query(replayQuery,[historical.id])).rows
 assert.equal(after.length,1)
 assert.notEqual(after[0].training_hash,before.training_hash)
 assert.notDeepEqual(after[0].players,before.players)
 const withReference=structuredClone(catalog)
 withReference.players.find(player=>player.id===profiles[0].id).claims.push({id:'reference-only',text:'该选手擅长传统养猪'})
 const referenceAnalysis=assessRoster(withReference,input,draft)
 assert.equal(referenceAnalysis.players[0].claims.at(-1).id,'reference-only')
 assert.equal(referenceAnalysis.model,null)
 const oldCount=first.json.data.players[0].sourceSample.observations
 await pool.query("UPDATE prediction_catalog_matches SET available_at=now()+interval '1 day'")
 const next=await p.screenshots.analyze(draft.id,input);assert.equal(next.players[0].sourceSample.observations,0)
 const stored=(await pool.query('SELECT result FROM prediction_screenshot_analyses ORDER BY created_at LIMIT 1')).rows[0].result;assert.equal(stored.players[0].sourceSample.observations,oldCount);assert.equal(stored.model,null)
 await pool.query('UPDATE prediction_catalog_matches SET available_at=now(),status=CASE WHEN id=$1 THEN status ELSE \'QUARANTINED\' END',[historical.id])
 const withdrawn=await post('rank-feedback/generate',{})
 assert.equal(withdrawn.status,200)
 assert.equal(withdrawn.json.data.generation.withdrawn,1)
 assert.equal(withdrawn.json.data.board.windows.recent3.replayed,0)
 assert.ok((await pool.query(replayQuery,[historical.id])).rows[0].invalidated_at)
 const registration={profileId:historical.seats[0].playerId,platform:'FIXTURE',region:'TEST',uid:'001',
  evidenceId:'TEST-SCREENSHOT',reviewNote:'TEST 账号原件',identityConfirmed:true}
 assert.equal((await post('account-identities',registration)).status,422)
 await pool.query("UPDATE evidences SET status='VERIFIED' WHERE id='TEST-SCREENSHOT'")
 const owner=await post('account-identities',registration)
 assert.equal(owner.status,200)
 assert.equal(owner.json.data.uid,'001')
 await pool.query(`INSERT INTO prediction_catalog_players(id,author,nickname)
  VALUES('TEST-RENAMED','TEST','TEST 改名档案'),('TEST-ALT','TEST','TEST 另一个账号')`)
 const renamed=await post('account-identities',{...registration,profileId:'TEST-RENAMED'})
 assert.equal(renamed.status,200)
 assert.equal(renamed.json.data.personProfileId,registration.profileId)
 const alternate=await post('account-identities',{...registration,profileId:'TEST-ALT',uid:'002',personProfileId:registration.profileId})
 assert.equal(alternate.status,200)
 assert.equal(alternate.json.data.personProfileId,registration.profileId)
 const lookup=await post('account-identities/lookup',{platform:'fixture',region:'test',uid:'001'})
 assert.deepEqual(lookup.json.data.profiles.map(row=>row.profileId).sort(),[registration.profileId,'TEST-RENAMED'].sort())
 assert.ok(lookup.json.data.profiles.every(row=>row.personProfileId===registration.profileId))
 assert.equal((await post('account-identities',{...registration,profileId:'TEST-RENAMED',uid:'099'})).status,409)
 assert.equal((await post('account-identities',{...registration,profileId:historical.seats[1].playerId})).status,409)
 const withAccounts=await p.catalog.list({includeRankFeedback:true})
 assert.equal(withAccounts.matches.find(m=>m.id===historical.id).seats[0].sourceProfileId,registration.profileId)
 assert.deepEqual(withAccounts.sourceProfiles.filter(p=>['TEST-RENAMED','TEST-ALT'].includes(p.id))
  .map(p=>p.account.uid).sort(),['001','002'])
 assert.equal((await p.stats()).eligibleMatches,0)
 await pool.query("UPDATE evidences SET status='QUARANTINED' WHERE id='TEST-SCREENSHOT'");await assert.rejects(p.screenshots.get(draft.id),/原件/);await assert.rejects(p.screenshots.analysis(review.json.data.id),/原件/)
})
