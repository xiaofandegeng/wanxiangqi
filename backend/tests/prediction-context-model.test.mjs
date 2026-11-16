import {test} from 'node:test'
import assert from 'node:assert/strict'
import {projectBuilds} from '../src/prediction/build-projection.mjs'
import {rateRosterHistory} from '../src/prediction/roster-rating.mjs'
import {CANDIDATES,FIELD_CONFIG,contextFeatures,trainContextModel,predictContext,knownChoice} from '../src/prediction/context-model.mjs'
const game=(id,day,winner='a')=>({id,day,ban:'三分',seats:['a','b','c','d','e','f'].map(id=>({id,winner:id===winner,build:'日落海倒转'}))})
const cfg=CANDIDATES[3]
test('跨阵容对位需要历史同场及对照样本，目标场结果不会进入特征',()=>{
 const paired=game('paired','2026-01-01','a')
 paired.seats[0].build='逐鹿嬴政'
 paired.seats[1].build='河洛木兰'
 const control=game('control','2026-01-01','b')
 control.seats[0].build='逐鹿嬴政'
 const target={...game('target','2026-01-02'),ban:'大河'}
 const choices=[{plan:'逐鹿嬴政'},{plan:'河洛木兰'}]
 const value=rows=>contextFeatures(rows,target,FIELD_CONFIG,choices)[0].crossBuildMatchup
 assert.ok(value([paired,control])>0)
 assert.equal(value([paired]),0)
 assert.equal(value([paired,control,target]),value([paired,control]))
})
test('动态实力区分爆冷和热门夺冠，同日预测共用开赛前评分',()=>{
 const opening=game('opening','2026-01-01','a')
 const favoriteWins=game('favorite','2026-01-02','a')
 const upset=game('upset','2026-01-02','b')
 const initial=rateRosterHistory([opening], '2026-01-02')
 const updated=rateRosterHistory([opening,favoriteWins,upset], '2026-01-03')
 const reversed=rateRosterHistory([upset,favoriteWins,opening], '2026-01-03')
 assert.ok(initial.rating('a')>initial.rating('b'))
 assert.ok(updated.expected('upset','b')<updated.expected('favorite','a'))
 assert.equal(updated.expected('upset','a'),updated.expected('favorite','a'))
 assert.equal(updated.rating('a'),reversed.rating('a'))
 assert.equal(rateRosterHistory([opening,upset],upset.day).rating('b'),initial.rating('b'))
})
test('同阵容棋手对位用历史证据，选手自己的表现可抵消棋手平均劣势',()=>{
 const history=Array.from({length:8},(_,i)=>{
  const g=game('old'+i,'2026-01-01',i===0?'a':'b')
  g.startsAt='2026-01-01T09:00:00Z'
  g.seats[0].id=i===0?'a':'other-white'
  g.seats[0].build=g.seats[1].build='三分倒转'
  for(const [j,commander] of ['白歌','孙小宾'].entries()){
   g.seats[j].prematch={commander,evidenceId:g.id,observedAt:'2026-01-01T08:00:00Z'}
  }
  return g
 })
 const future={...game('target','2026-01-02'),ban:'逐鹿'}
 const choices=[{commander:'白歌',plan:'三分倒转'},{commander:'孙小宾',plan:'三分倒转'}]
 const atIssue=contextFeatures(history,future,FIELD_CONFIG,choices)[0]
 assert.notEqual(atIssue.commanderBuildContention,0)
 assert.ok(atIssue.playerCommanderBuildContention>0)
 assert.equal(contextFeatures(history,future,FIELD_CONFIG,[choices[0],{...choices[1],plan:'河洛木兰'}])[0].commanderBuildContention,0)
 assert.equal(contextFeatures(history.map(g=>({...g,startsAt:null})),future,FIELD_CONFIG,choices)[0].playerCommanderBuildContention,0)
})
test('阵容推断优先用同棋手经历，排除明确被禁的标签，忽略同日赛果',()=>{
 const old=game('old','2026-01-01')
 old.seats[0].build='三分倒转'
 old.startsAt='2026-01-01T09:00:00Z'
 old.seats[0].prematch={commander:'白歌',evidenceId:'old',observedAt:'2026-01-01T08:00:00Z'}
 const other=game('other','2026-01-01')
 other.seats[0].build='逐鹿嬴政'
 const target={...game('target','2026-01-02'),ban:'逐鹿'}
 const rows=[old,other,target]
 const projection=projectBuilds(rows,target,[{commander:'白歌'}],knownChoice)[0]
 assert.equal(projection.basis,'PLAYER_COMMANDER_HISTORY')
 assert.deepEqual(projection.excludedBuilds,['逐鹿嬴政'])
 assert.deepEqual(projection.candidates.map(row=>row.build),['三分倒转'])
 assert.equal(projection.personalSamples,2)
 assert.equal(projection.commanderSamples,1)
 assert.ok(Math.abs(projection.candidates[0].share+projection.unknownShare-1)<1e-12)
})
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
test('优先模型按历史夺冠和同禁用表现打分，双方均未夺冠时不判交手胜负',()=>{
 const cfg=CANDIDATES.find(c=>c.id==='priority-full')
 const old=game('old','2026-01-01')
 const target=game('current','2026-01-02')
 const f=contextFeatures([old],target,cfg)
 assert.ok(f[0].championCount>f[1].championCount)
 assert.ok(f[0].sameBanForm>f[1].sameBanForm)
 assert.ok(f[0].playerMatchup>0)
 assert.ok(f[1].playerMatchup<0)
 const otherRoster={...target,seats:target.seats.slice(1).concat({id:'x'})}
 assert.equal(contextFeatures([old],otherRoster,cfg)[0].playerMatchup,0)
 assert.equal(contextFeatures([old],{...target,ban:'河洛'},cfg)[0].sameBanForm,0)
 assert.equal(f[0].playerCommanderChampions,undefined)
})

test('放大综合评分上调首选概率，同时保持并列、总和和无历史先验',()=>{
 const target=game('target','2026-01-02')
 const previous=game('previous','2026-01-01')
 const config=CANDIDATES.find(candidate=>candidate.id==='recent-player')
 const model=trainContextModel([previous],target.day,config)
 const original=predictContext(model,[previous],target)
 const sharpened=predictContext({...model,config:{...config,scoreScale:1.25}},[previous],target)
 assert.ok(sharpened[0]>original[0])
 assert.equal(sharpened[1],sharpened[2])
 assert.ok(Math.abs(sharpened.reduce((sum,p)=>sum+p,0)-1)<1e-12)
 const empty=trainContextModel([],target.day,{...config,scoreScale:1.25})
 assert.deepEqual(predictContext(empty,[],target),Array(6).fill(1/6))
})
