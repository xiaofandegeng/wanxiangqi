import {createHash} from 'node:crypto'
import {FIELD_CONFIG,trainContextModel,predictContext,contextFeatures} from './context-model.mjs'
export const MODEL_VERSION='source-roster-field-v6'
const CONFIG={lambda:2,iterations:400,tolerance:1e-8}
const softmax=s=>{const max=Math.max(...s),e=s.map(x=>Math.exp(x-max)),sum=e.reduce((a,b)=>a+b,0);return e.map(x=>x/sum)}
export function catalogGames(catalog){
 const grouped=new Map()
 const matches=new Map((catalog.matches||[]).map(match=>[match.id,match]))
 for(const p of catalog.players)for(const h of p.history||[]){const g=grouped.get(h.matchId)||{id:h.matchId,day:h.day,ban:matches.get(h.matchId)?.ban??null,seats:[]};g.seats.push({id:p.id,winner:h.rank===1,build:h.build??null});grouped.set(h.matchId,g)}
 return [...grouped.values()].filter(g=>g.seats.length===6&&new Set(g.seats.map(s=>s.id)).size===6&&g.seats.filter(s=>s.winner).length===1).sort((a,b)=>a.day.localeCompare(b.day)||a.id.localeCompare(b.id))
}
export function trainWinnerModel(games){
 const ids=[...new Set(games.flatMap(g=>g.seats.map(s=>s.id)))].sort(),index=new Map(ids.map((id,i)=>[id,i])),scores=ids.map(()=>0),counts=ids.map(()=>0)
 for(const g of games)for(const s of g.seats)counts[index.get(s.id)]++
 const step=1/(Math.max(0,...counts)+CONFIG.lambda)
 let completed=0
 for(let epoch=0;epoch<CONFIG.iterations;epoch++){
  const grad=scores.map(s=>CONFIG.lambda*s)
  for(const g of games){const positions=g.seats.map(s=>index.get(s.id)),p=softmax(positions.map(i=>scores[i]));positions.forEach((i,j)=>{grad[i]+=p[j]-(g.seats[j].winner?1:0)})}
  const max=Math.max(0,...grad.map(Math.abs));if(max<CONFIG.tolerance)break
  grad.forEach((v,i)=>{scores[i]-=step*v});completed++
 }
 return {parameters:Object.fromEntries(ids.map((id,i)=>[id,scores[i]])),iterations:completed}
}
export const predictWinner=(model,ids)=>softmax(ids.map(id=>model.parameters[id]||0))
export function metric(probabilities,g){const y=g.seats.map(s=>s.winner?1:0),max=Math.max(...probabilities),ties=probabilities.map((p,i)=>({p,i})).filter(x=>Math.abs(x.p-max)<1e-12);return {logLoss:-Math.log(Math.max(1e-15,probabilities[y.indexOf(1)])),brier:probabilities.reduce((s,p,i)=>s+(p-y[i])**2,0),top1Credit:ties.some(t=>y[t.i])?1/ties.length:0}}
export function chronologicalDiagnostic(games, config=null){
 const rows=[]
 for(const day of [...new Set(games.map(g=>g.day))].sort()){
  const train=games.filter(g=>g.day<day),test=games.filter(g=>g.day===day);if(!train.length)continue
  const model=config?trainContextModel(train,day,config):trainWinnerModel(train)
  for(const game of test){
   const probabilities=config?predictContext(model,train,game):predictWinner(model,game.seats.map(seat=>seat.id))
   const top=game.seats.filter((_,index)=>Math.abs(probabilities[index]-Math.max(...probabilities))<1e-12)
   rows.push({day,matchId:game.id,trainingMatches:train.length,strictHit:top.length===1&&top[0].winner,model:metric(probabilities,game),uniform:metric(game.seats.map(()=>1/6),game)})
  }
 }
 const average=key=>rows.length?Object.fromEntries(['logLoss','brier','top1Credit'].map(m=>[m,rows.reduce((s,r)=>s+r[key][m],0)/rows.length])):null
 const model=average('model'),uniform=average('uniform')
 return {kind:'RETROSPECTIVE_DAY_SPLIT_NOT_AVAILABILITY_REPLAY',conclusion:!model?'NO_EVALUATION':model.logLoss<uniform.logLoss&&model.brier<uniform.brier?'LOWER_ERRORS_IN_THIS_SAMPLE':'NOT_BEATING_UNIFORM',evaluatedMatches:rows.length,strictHits:rows.filter(row=>row.strictHit).length,model,uniform,rows,notice:'按比赛日仅以前日赛果训练；材料为事后采集，不证明历史当时已可获得，也不是独立校准集。并列最高按1/并列人数计命中，避免作者把冠军排第一导致虚假准确率。'}
}
export function experimentalWinnerEstimate(catalog,roster,cutoff,aceContext){
 const day=new Date(Date.parse(cutoff)+8*3600000).toISOString().slice(0,10)
 const games=catalogGames(catalog).filter(game=>game.day<day)
 const canonical=games.map(game=>({...game,seats:[...game.seats].sort((a,b)=>a.id.localeCompare(b.id))}))
 const ids=roster.map(player=>player.profileId||'__UNSEEN__')
 const target={day,ban:aceContext?.bannedFaction??null,seats:ids.map(id=>({id}))}
 const choices=aceContext?.players.map(player=>({commander:player.commander,plan:player.visiblePlan}))
 const model=trainContextModel(games,day,FIELD_CONFIG)
 const probabilities=predictContext(model,games,target,choices)
 const features=contextFeatures(games,target,FIELD_CONFIG,choices)
 return {
  status:games.length?'EXPERIMENTAL_SOURCE_MODEL':'PRIOR_ONLY',
  modelVersion:MODEL_VERSION,
  config:{...FIELD_CONFIG,halfLifeDays:FIELD_CONFIG.halfLife},
  computedBy:'BACKEND_DETERMINISTIC_PROGRAM',
  calibrated:false,
  cutoff,
  trainingMatches:games.length,
  trainingMatchIds:games.map(game=>game.id),
  dataHash:createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),
  parameters:model.parameters,
  iterations:model.iterations,
  players:roster.map((player,index)=>({
   profileId:player.profileId,
   nickname:player.nickname,
   probability:probabilities[index],
   coldStart:!player.profileId||!Object.hasOwn(model.parameters,`player:${player.profileId}`)
  })),
  signals:features.map(row=>{
   const contribution=(...names)=>names.reduce((sum,name)=>sum+(row[name]??0)*(model.parameters[name]??0),0)
   return {
    ban:contribution('sameBanForm','commanderUnderBan','buildUnderBan'),
    opponents:contribution('playerMatchup','commanderMatchup'),
    buildFit:contribution('buildFit'),
    contention:contribution('buildContention')
   }
  }),
  diagnostic:chronologicalDiagnostic(games,FIELD_CONFIG),
  notice:'综合模型根据近期夺冠、禁用条件、对手强弱和阵容竞争重新排序。已确认玩法优先，无确认时按历史玩法分布估算。结果为未校准的实验概率。'
 }
}
