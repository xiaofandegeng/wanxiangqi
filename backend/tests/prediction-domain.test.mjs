import {test} from 'node:test'
import assert from 'node:assert/strict'
import {normalizeMatch,computeStats,estimate,identityKey} from '../src/prediction/domain.mjs'
const base=()=>({sourceKey:'FIXTURE:1',mode:'WANXIANG',playedAt:'2026-01-01T12:00:00+08:00',platform:'TEST',region:'TEST',version:'TEST-v1',evidenceId:'fixture',evidenceLocator:'FIXTURE ONLY',seats:Array.from({length:6},(_,i)=>({rank:i+1,nickname:'FIXTURE'+i,uid:String(i)}))})
const verified=()=>({...normalizeMatch(base()),status:'VERIFIED',verifiedAt:'2026-01-02T00:00:00Z'})
test('完整六席、明确时区；拒绝冠军表和重复名次/UID及空席位',()=>{
 assert.equal(normalizeMatch(base()).seats.length,6)
 for(const change of [m=>m.seats.pop(),m=>m.seats[1].rank=1,m=>m.seats[1].uid='0',m=>m.playedAt='2026-01-01',m=>m.seats[1]=null]){const m=base();change(m);assert.throws(()=>normalizeMatch(m),{status:422})}
})
test('未来赛果拒绝、昵称不作跨场身份',()=>{const m=base();m.playedAt='2099-01-01T00:00:00Z';assert.throws(()=>normalizeMatch(m));m.seats[0].uid=null;assert.equal(identityKey(m,m.seats[0]),null)})
test('待核验、未来比赛和后来核验均不污染过去截点',()=>{
 const m=verified();assert.equal(computeStats([m],{cutoff:'2026-01-01T18:00:00Z'}).eligibleMatches,0)
 assert.equal(computeStats([{...m,status:'PENDING'}]).eligibleMatches,0)
 assert.equal(computeStats([m],{cutoff:'2025-12-31T00:00:00Z'}).eligibleMatches,0)
})
test('胜率复算按完整对局；缺UID不合并，同UID跨平台及版本分组',()=>{
 const a=verified(),b=verified();b.seats=[...b.seats].reverse().map((s,i)=>({...s,rank:i+1}));const s=computeStats([a,b]);assert.equal(s.players[0].matches,2);assert.equal(s.players[0].avgRank,3.5);assert.equal(s.players[0].winRate,.5)
 const c=verified();c.platform='OTHER';assert.equal(computeStats([a,c]).players.length,12)
 c.platform=a.platform;c.version='v2';assert.equal(computeStats([a,c]).players.length,12)
 c.seats[0].uid=null;assert.equal(computeStats([c]).unlinkedSeats,1)
})
test('不足样本不生成概率，六席去重；足够时基线概率和为1且明确未校准',()=>{
 const m=verified(),keys=m.seats.map(s=>identityKey(m,s)),input={mode:m.mode,version:m.version,players:keys}
 assert.equal(estimate([],input).status,'INSUFFICIENT_DATA')
 assert.throws(()=>estimate([],{...input,players:Array(6).fill(keys[0])}))
 const r=estimate([m,m,m],input);assert.equal(r.calibrated,false);assert.ok(Math.abs(r.players.reduce((s,p)=>s+p.probability,0)-1)<1e-12)
})
