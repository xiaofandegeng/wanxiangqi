import {test} from 'node:test'
import assert from 'node:assert/strict'
import {buildAceContext} from '../src/prediction/ace-context.mjs'
const request={mode:'WANXIANG',version:'v1.8.1',players:Array.from({length:6},(_,i)=>({nickname:`TEST-${i}`,commander:i<2?'小妲己':'',visiblePlan:i<2?'河洛木兰':'',returnMultiplier:i===0?'5.6':''})),aceContext:{supportStage:'OPEN',bannedFaction:'日落海',grossReturnConfirmed:true}}
test('王牌对决上下文区分真人、棋手、玩法及报价，保本阈值不是获胜概率',()=>{
 const r=buildAceContext(request,'2026-10-31T00:00:00Z');assert.equal(r.event,'ACE_DUEL');assert.equal(r.ruleset,'WANXIANG');assert.equal(r.rules.perPlayerSupportCap,10000)
 assert.equal(r.players[0].commander,'小妲己');assert.equal(r.players[0].breakEvenProbability,1/5.6);assert.equal(r.players[0].probability,undefined)
 assert.equal(r.players[2].commander,null);assert.equal(r.players[2].returnMultiplier,null);assert.deepEqual(r.sharedPlans[0].seats,[1,2]);assert.equal(r.bannedFaction,'日落海')
 assert.ok(r.warnings.includes('MISSING_RETURN_QUOTES'))
})
test('旧规则不套用当前或未知版本，返奖口径未确认不计算阈值',()=>{
 assert.equal(buildAceContext({...request,version:'v1.5.1'},'2026-10-10').rules.perPlayerSupportCap,50000)
 assert.equal(buildAceContext(request,'2026-10-10').rules.perPlayerSupportCap,null)
 const r=buildAceContext({...request,version:'FUTURE',aceContext:{}},'2026-11-01');assert.equal(r.rules.perPlayerSupportCap,null);assert.equal(r.players[0].breakEvenProbability,null);assert.ok(r.warnings.includes('SUPPORT_NOT_CONFIRMED_OPEN'))
 for(const returnMultiplier of [-1,Infinity,'oops',true,[]])assert.throws(()=>buildAceContext({...request,players:[{nickname:'TEST',returnMultiplier}]},'2026-10-31'),/返奖率/)
})
