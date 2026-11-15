// Offline challenger. All result-derived features use strictly earlier dates.
export const CONTEXT_VERSION='historical-context-softmax-v1'
export const CANDIDATES=Object.freeze([
 {id:'player-only',history:false,builds:false,halfLife:Infinity},
 {id:'recent-player',history:false,builds:false,halfLife:7},
 {id:'recent-form',history:true,builds:false,halfLife:7},
 {id:'history-build-context',history:true,builds:true,halfLife:7}
])
const softmax=a=>{const m=Math.max(...a),e=a.map(x=>Math.exp(x-m)),z=e.reduce((s,x)=>s+x,0);return e.map(x=>x/z)}
const age=(a,b)=>(Date.parse(a)-Date.parse(b))/86400000
const label=x=>typeof x==='string'&&x.trim()&&x!=='UNKNOWN'?x.trim():null
const rate=rows=>(rows.reduce((s,r)=>s+Number(r.seat.winner),0)+1)/(rows.length+6)
// Neither a source's final build nor its winner flag can satisfy this contract.
export function knownChoice(game,seat){
 const p=seat.prematch
 return p?.evidenceId&&Number.isFinite(Date.parse(p.observedAt))&&Number.isFinite(Date.parse(game.startsAt))&&Date.parse(p.observedAt)<Date.parse(game.startsAt)?p:{}
}
export function contextFeatures(history,game,config){
 const past=history.filter(g=>g.day<game.day)
 return game.seats.map(s=>{
  const f={[`player:${s.id}`]:1}
  if(!config.history)return f
  const rows=past.flatMap(g=>g.seats.filter(x=>x.id===s.id).map(seat=>({game:g,seat})))
  const recent=rows.filter(r=>age(game.day,r.game.day)<=7)
  f.recentForm=(rate(recent)-1/6)*6
  f.longForm=(rate(rows)-1/6)*6
  // Same-ban history only; no assertion about unknown hero/faction membership.
  if(label(game.ban))f.sameBanForm=(rate(rows.filter(r=>r.game.ban===game.ban))-1/6)*6
  if(config.builds){
   const total=recent.length+6
   for(const r of recent){
    const b=label(r.seat.build)
    if(b)f[`pastBuild:${b}`]=(f[`pastBuild:${b}`]||0)+1/total
   }
   const choice=knownChoice(game,s)
   if(label(choice.commander)){
    f[`commander:${choice.commander}`]=1
    f[`playerCommander:${s.id}:${choice.commander}`]=1
   }
   if(label(choice.plan)){
    f[`knownPlan:${choice.plan}`]=1
    f[`playerPlan:${s.id}:${choice.plan}`]=1
    if(label(choice.commander))f[`commanderPlan:${choice.commander}:${choice.plan}`]=1
   }
  }
  return f
 })
}
export function trainContextModel(history,day,config){
 const games=history.filter(g=>g.day<day)
 const examples=games.map(g=>({features:contextFeatures(games,g,config),winner:g.seats.findIndex(s=>s.winner),weight:Math.pow(2,-age(day,g.day)/config.halfLife)}))
 const names=[...new Set(examples.flatMap(e=>e.features.flatMap(Object.keys)))].sort(),index=new Map(names.map((s,i)=>[s,i])),weights=names.map(()=>0)
 const sparse=examples.map(e=>({...e,features:e.features.map(f=>Object.entries(f).map(([k,v])=>[index.get(k),v]))}))
 const lambda=2
 const step=1/(lambda+sparse.reduce((sum,e)=>sum+e.weight*Math.max(...e.features.map(f=>f.reduce((a,[,v])=>a+v*v,0))),0))
 let iterations=0,gradientMax=Infinity
 for(let epoch=0;epoch<4000;epoch++){
  const grad=weights.map(x=>lambda*x)
  for(const e of sparse){
   const p=softmax(e.features.map(f=>f.reduce((a,[i,v])=>a+weights[i]*v,0)))
   e.features.forEach((f,j)=>f.forEach(([i,v])=>{grad[i]+=e.weight*(p[j]-Number(j===e.winner))*v}))
  }
  gradientMax=Math.max(0,...grad.map(Math.abs))
  if(gradientMax<1e-8)break
  weights.forEach((_,i)=>{weights[i]-=step*grad[i]})
  iterations++
 }
 return {version:CONTEXT_VERSION,config,day,iterations,converged:gradientMax<1e-8,gradientMax,parameters:Object.fromEntries(names.map((n,i)=>[n,weights[i]])),trainingIds:games.map(g=>g.id)}
}
export function predictContext(model,history,game){
 if(game.day!==model.day)throw Error('Model cutoff must match prediction day')
 const features=contextFeatures(history.filter(g=>model.trainingIds.includes(g.id)),game,model.config)
 return softmax(features.map(f=>Object.entries(f).reduce((sum,[k,v])=>sum+(model.parameters[k]||0)*v,0)))
}
