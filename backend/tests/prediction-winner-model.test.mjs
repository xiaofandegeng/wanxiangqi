import {test} from 'node:test'
import assert from 'node:assert/strict'
import {trainWinnerModel,predictWinner,chronologicalDiagnostic,catalogGames,experimentalWinnerEstimate} from '../src/prediction/winner-model.mjs'
const game=(id,day,winner)=>({id,day,seats:['A','B','C','D','E','F'].map(id=>({id,winner:id===winner}))})
test('同场冠军模型确定性、概率归一、冷启动先验与席位置换等价',()=>{
 const games=Array.from({length:10},(_,i)=>game('TEST'+i,'2026-01-01','A')),m=trainWinnerModel(games),p=predictWinner(m,['A','B','C','D','E','F']);assert.ok(p[0]>p[1]);assert.ok(p.every(x=>x>0&&x<1));assert.ok(Math.abs(p.reduce((a,b)=>a+b,0)-1)<1e-12)
 assert.deepEqual(m,trainWinnerModel(games));predictWinner(m,['F','E','D','C','B','A']).forEach((v,i)=>assert.ok(Math.abs(v-p[5-i])<1e-12));assert.deepEqual(predictWinner(trainWinnerModel([]),['X','Y','Z','A','B','C']),Array(6).fill(1/6))
 const reversed=games.map(g=>({...g,seats:[...g.seats].reverse()}));const other=predictWinner(trainWinnerModel(reversed),['A','B','C','D','E','F']);p.forEach((v,i)=>assert.ok(Math.abs(v-other[i])<1e-12))
})
test('时间诊断不以同日/未来赛果训练，不利用作者冠军在第一席的排序',()=>{
 const games=[game('a','2026-01-01','A'),game('b','2026-01-02','B'),game('c','2026-01-02','C'),game('d','2026-01-03','D')],r=chronologicalDiagnostic(games);assert.equal(r.evaluatedMatches,3);assert.deepEqual(r.rows.map(x=>x.trainingMatches),[1,1,3]);assert.ok(Math.abs(r.uniform.top1Credit-1/6)<1e-12);assert.ok(Math.abs(r.uniform.logLoss-Math.log(6))<1e-12)
})
test('资料样本只接收完整六人唯一冠军，记录可复算的参数及数据指纹',()=>{
 const g=game('a','2026-01-01','A'),catalog={players:g.seats.map(s=>({id:s.id,history:[{matchId:g.id,day:g.day,rank:s.winner?1:null}]}))},roster=g.seats.map(s=>({profileId:s.id,nickname:s.id}))
 assert.equal(catalogGames(catalog).length,1);assert.equal(catalogGames({players:catalog.players.slice(1)}).length,0)
 const r=experimentalWinnerEstimate(catalog,roster,'2026-01-02');assert.equal(r.calibrated,false);assert.equal(r.computedBy,'BACKEND_DETERMINISTIC_PROGRAM');assert.equal(r.dataHash.length,64);assert.deepEqual(r.trainingMatchIds,['a']);assert.equal(r.players.length,6);assert.equal(experimentalWinnerEstimate(catalog,roster,'2026-01-01T00:00:00Z').trainingMatches,0)
})

test('综合实验预测使用当场禁用、同场交手和已确认的玩法',()=>{
 const games=Array.from({length:6},(_,i)=>game('g'+i,'2026-01-0'+(i+1),'A'))
 const roster=games[0].seats.map(seat=>({profileId:seat.id,nickname:seat.id}))
 const catalog={
  matches:games.map(g=>({id:g.id,ban:'河洛'})),
  players:roster.map((player,index)=>({
   id:player.profileId,
   history:games.map(g=>({matchId:g.id,day:g.day,rank:index===0?1:null,build:index<2?'三分倒转':'逐鹿嬴政'}))
  }))
 }
 const context={bannedFaction:'河洛',players:roster.map((_,index)=>({visiblePlan:index<2?'三分倒转':'逐鹿嬴政'}))}
 const result=experimentalWinnerEstimate(catalog,roster,'2026-01-07',context)
 assert.equal(result.modelVersion,'source-roster-field-v6')
 assert.equal(result.diagnostic.strictHits,5)
 for(const signal of ['ban','opponents','contention']) assert.ok(Math.abs(result.signals[0][signal])>1e-8,signal)
 assert.ok(result.players[0].probability>result.players[1].probability)
 const changed=experimentalWinnerEstimate(catalog,roster,'2026-01-07',{...context,bannedFaction:'日落海'})
 assert.equal(changed.signals[0].ban,0)
 assert.notEqual(changed.players[0].probability,result.players[0].probability)
 const noCollision={...context,players:context.players.map((seat,index)=>index===1?{visiblePlan:'河洛木兰'}:seat)}
 const solo=experimentalWinnerEstimate(catalog,roster,'2026-01-07',noCollision)
 assert.equal(solo.signals[0].contention,0)
 assert.notEqual(solo.players[0].probability,result.players[0].probability)
})
