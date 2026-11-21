import {test} from 'node:test'
import assert from 'node:assert/strict'
import {forecastRoster} from '../src/prediction/screenshot-analysis.mjs'
import {trainWinnerModel,predictWinner,chronologicalDiagnostic,catalogGames,experimentalWinnerEstimate} from '../src/prediction/winner-model.mjs'
const asCatalogMatch=(game, transform=seat=>seat)=>({
 ...game,matchType:'full_transcribed',
 seats:game.seats.map((seat,index)=>({...transform(seat,index),slot:index+1,playerId:seat.id}))
})
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
 const g=game('a','2026-01-01','A')
 const match=asCatalogMatch(g)
 const roster=g.seats.map(s=>({profileId:s.id,nickname:s.id}))
 const catalog={matches:[match,{...match, id:'snapshot', matchType:'winner_snapshot'}]}
 assert.equal(catalogGames(catalog).length,1)
 assert.equal(catalogGames({matches:[{...match,seats:match.seats.slice(1)}]}).length,0)
 const r=experimentalWinnerEstimate(catalog,roster,'2026-01-02')
 assert.equal(r.calibrated,false)
 assert.equal(r.computedBy,'BACKEND_DETERMINISTIC_PROGRAM')
 assert.equal(r.dataHash.length,64)
 assert.deepEqual(r.trainingMatchIds,['a'])
 assert.equal(r.players.length,6)
 const missing=experimentalWinnerEstimate(catalog,roster,'2026-01-01T00:00:00Z')
 assert.equal(missing.trainingMatches,0)
 assert.equal(missing.status,'INSUFFICIENT_DATABASE_HISTORY')
 assert.ok(missing.players.every(player=>player.probability===null))

})

test('综合实验预测使用当场禁用、同场交手和已确认的玩法',()=>{
 const games=Array.from({length:6},(_,i)=>game('g'+i,'2026-01-0'+(i+1),'A'))
 const roster=games[0].seats.map(seat=>({profileId:seat.id,nickname:seat.id}))
 const catalog={matches:games.map(g=>asCatalogMatch({...g,ban:'河洛'},(seat,index)=>({
  ...seat,build:index<2?'三分倒转':'逐鹿嬴政'
 })))}
 const context={bannedFaction:'河洛',players:roster.map((_,index)=>({visiblePlan:index<2?'三分倒转':'逐鹿嬴政'}))}
 const result=experimentalWinnerEstimate(catalog,roster,'2026-01-07',context)
 assert.equal(result.modelVersion,'source-roster-dynamic-v13')
 assert.equal(result.diagnostic.strictHits,5)
 for(const signal of ['ban','opponents','contention']) assert.ok(Math.abs(result.signals[0][signal])>1e-8,signal)
 assert.ok(result.players[0].probability>result.players[1].probability)
 const changed=experimentalWinnerEstimate(catalog,roster,'2026-01-07',{...context,bannedFaction:'日落海'})
 assert.equal(changed.signals[0].ban,0)
 assert.notEqual(changed.players[0].probability,result.players[0].probability)
 const noCollision={...context,players:context.players.map((seat,index)=>index===1?{visiblePlan:'日落海倒转'}:seat)}
 const solo=experimentalWinnerEstimate(catalog,roster,'2026-01-07',noCollision)
 assert.equal(solo.signals[0].contention,0)
 assert.notEqual(solo.players[0].probability,result.players[0].probability)
})

test('极速入口仅关联数据库中唯一同名或指定档案，已选棋手只用核对证据',()=>{
 const names=['甲','乙','丙','丁','戊','己']
 const scoped=game('db-match','2026-01-01','A')
 const players=scoped.seats.map((seat,index)=>({id:seat.id,nickname:names[index]}))
 const catalog={players,matches:[asCatalogMatch(scoped,(seat,index)=>({
  ...seat,build:'日落海倒转',commander:'马可',reviewedCommander:index===0?'白歌':null
 }))]}
 const input={phase:'PREMATCH',mode:'WANXIANG',version:'UNKNOWN',
  players:names.map(nickname=>({nickname,commander:'白哥'})),
  history:[asCatalogMatch(game('client-made-up','2026-01-01','F'))]}
 const ready=forecastRoster(catalog,input,'2026-01-02')
 assert.deepEqual(ready.trainingMatchIds,['db-match'])
 assert.ok(ready.players[0].probability>ready.players[1].probability)
 assert.deepEqual(ready.buildProjections[0].candidates.map(candidate=>candidate.build),['日落海倒转'])
 assert.equal(ready.buildProjections[0].commanderWins,1)
 assert.deepEqual(ready.buildProjections[1].candidates,[])
 const ambiguous={...catalog,players:[...players,{id:'ambiguous',nickname:names[0]}]}
 const limited=forecastRoster(ambiguous,input,'2026-01-02')
 assert.equal(limited.status,'INSUFFICIENT_DATABASE_HISTORY')
 assert.ok(limited.players.every(player=>player.probability===null))
 assert.equal(limited.players[0].profileId,null)
 const confirmed=forecastRoster(ambiguous,{...input,players:input.players.map((player,index)=>({
  ...player,profileId:players[index].id
 }))},'2026-01-02')
 assert.deepEqual(confirmed.players,ready.players)
})
