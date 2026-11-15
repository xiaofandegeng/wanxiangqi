import {test} from 'node:test'
import assert from 'node:assert/strict'
import {CANDIDATES,contextFeatures,trainContextModel,predictContext,knownChoice} from '../src/prediction/context-model.mjs'
const game=(id,day,winner='a')=>({id,day,ban:'三分',seats:['a','b','c','d','e','f'].map(id=>({id,winner:id===winner,build:'日落海倒转'}))})
const cfg=CANDIDATES[3]
test('当场结果、成型阵容、同日与未来赛果不能改变概率或特征',()=>{
 const old=game('old','2026-01-01'),target=game('target','2026-01-02'),future=game('future','2026-01-03')
 const model=trainContextModel([old,target,future],target.day,cfg)
 assert.deepEqual(model.trainingIds,['old'])
 const mutated={...target,winnerBuild:'河洛',seats:target.seats.map(s=>({...s,winner:!s.winner,build:'逐鹿',commander:'伪造棋手',rank:1}))}
 assert.deepEqual(contextFeatures([old],target,cfg),contextFeatures([old,target,future],mutated,cfg))
 assert.deepEqual(predictContext(model,[old],target),predictContext(model,[old,target,future],mutated))
})
test('历史结果和阵容生效；冷启动均匀，置换等价，概率归一',()=>{
 const old=game('old','2026-01-01'),target=game('target','2026-01-02')
 const f=contextFeatures([old],target,cfg);assert.ok(f[0].recentForm>f[1].recentForm);assert.ok(f[0]['pastBuild:日落海倒转']>0)
 const model=trainContextModel([old],target.day,cfg),p=predictContext(model,[old],target)
 assert.ok(Math.abs(p.reduce((a,b)=>a+b)-1)<1e-12)
 const reverse=predictContext(model,[old],{...target,seats:[...target.seats].reverse()})
 p.forEach((v,i)=>assert.ok(Math.abs(v-reverse[5-i])<1e-12))
 assert.deepEqual(predictContext(trainContextModel([],target.day,cfg),[],target),Array(6).fill(1/6))
})
test('棋手和计划只接受带证据且早于开赛的输入',()=>{
 const g={...game('g','2026-01-02'),startsAt:'2026-01-02T08:00:00Z'}
 g.seats[0].prematch={commander:'白歌',plan:'三分登场',evidenceId:'proof',observedAt:'2026-01-02T07:59:00Z'}
 assert.equal(contextFeatures([],g,cfg)[0]['commanderPlan:白歌:三分登场'],1)
 g.seats[0].prematch.observedAt=g.startsAt;assert.deepEqual(knownChoice(g,g.seats[0]),{})
 delete g.seats[0].prematch.evidenceId;assert.deepEqual(knownChoice(g,g.seats[0]),{})
})
