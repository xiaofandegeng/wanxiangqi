import {createHash} from 'node:crypto'
export const MODEL_VERSION='source-roster-luce-l2-v1'
const CONFIG={lambda:2,iterations:400,tolerance:1e-8}
const softmax=s=>{const max=Math.max(...s),e=s.map(x=>Math.exp(x-max)),sum=e.reduce((a,b)=>a+b,0);return e.map(x=>x/sum)}
export function catalogGames(catalog){
 const grouped=new Map()
 for(const p of catalog.players)for(const h of p.history||[]){const g=grouped.get(h.matchId)||{id:h.matchId,day:h.day,seats:[]};g.seats.push({id:p.id,winner:h.rank===1});grouped.set(h.matchId,g)}
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
function metric(probabilities,g){const y=g.seats.map(s=>s.winner?1:0),max=Math.max(...probabilities),ties=probabilities.map((p,i)=>({p,i})).filter(x=>Math.abs(x.p-max)<1e-12);return {logLoss:-Math.log(Math.max(1e-15,probabilities[y.indexOf(1)])),brier:probabilities.reduce((s,p,i)=>s+(p-y[i])**2,0),top1Credit:ties.some(t=>y[t.i])?1/ties.length:0}}
export function chronologicalDiagnostic(games){
 const rows=[]
 for(const day of [...new Set(games.map(g=>g.day))].sort()){
  const train=games.filter(g=>g.day<day),test=games.filter(g=>g.day===day);if(!train.length)continue
  const model=trainWinnerModel(train)
  for(const g of test)rows.push({day,matchId:g.id,trainingMatches:train.length,model:metric(predictWinner(model,g.seats.map(s=>s.id)),g),uniform:metric(g.seats.map(()=>1/6),g)})
 }
 const average=key=>rows.length?Object.fromEntries(['logLoss','brier','top1Credit'].map(m=>[m,rows.reduce((s,r)=>s+r[key][m],0)/rows.length])):null
 const model=average('model'),uniform=average('uniform')
 return {kind:'RETROSPECTIVE_DAY_SPLIT_NOT_AVAILABILITY_REPLAY',conclusion:!model?'NO_EVALUATION':model.logLoss<uniform.logLoss&&model.brier<uniform.brier?'LOWER_ERRORS_IN_THIS_SAMPLE':'NOT_BEATING_UNIFORM',evaluatedMatches:rows.length,model,uniform,rows,notice:'按比赛日仅以前日赛果训练；材料为事后采集，不证明历史当时已可获得，也不是独立校准集。并列最高按1/并列人数计命中，避免作者把冠军排第一导致虚假准确率。'}
}
export function experimentalWinnerEstimate(catalog,roster,cutoff){
 const day=new Date(Date.parse(cutoff)+8*3600000).toISOString().slice(0,10)
 const games=catalogGames(catalog).filter(g=>g.day<day),canonical=games.map(g=>({...g,seats:[...g.seats].sort((a,b)=>a.id.localeCompare(b.id))})),model=trainWinnerModel(games)
 const probabilities=predictWinner(model,roster.map(p=>p.profileId||'__UNSEEN__'))
 return {status:games.length?'EXPERIMENTAL_SOURCE_MODEL':'PRIOR_ONLY',modelVersion:MODEL_VERSION,config:CONFIG,computedBy:'BACKEND_DETERMINISTIC_PROGRAM',calibrated:false,cutoff,trainingMatches:games.length,trainingMatchIds:games.map(g=>g.id),dataHash:createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),parameters:model.parameters,iterations:model.iterations,players:roster.map((p,i)=>({profileId:p.profileId,nickname:p.nickname,probability:probabilities[i],coldStart:!p.profileId||!(p.profileId in model.parameters)})),diagnostic:chronologicalDiagnostic(games),notice:'仅来源昵称的实验模型，模式/版本/账号归属未完整核实；未知选手使用零强度先验。只学习同场冠军标签，不使用席位编号、赛后阵容、作者评价或返奖率；未校准，不用于自动分配钻石。'}
}
