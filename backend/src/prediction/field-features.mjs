import {normalizeLabel} from './build-stats.mjs'

const DAY=86400000
const BASE=1/6

// Estimate a category's performance relative to its own parent population.
function winRate(rows, prior, strength) {
 let wins=0, count=0
 for(const row of rows){
  wins+=row.weight*Number(row.winner)
  count+=row.weight
 }
 return (wins+prior*strength)/(count+strength)
}

export function fieldFeatures(history, target, choices, historicalChoice) {
 const past=history.flatMap(game=>{
  const age=(Date.parse(target.day)-Date.parse(game.day))/DAY
  const weight=2**(-age/14)
  const seats=game.seats.map(seat=>({
   ...seat,build:normalizeLabel(seat.build),
   commander:normalizeLabel(historicalChoice(game,seat).commander)
  }))
  return seats.map((seat,index)=>({
   ...seat,weight,age,ban:normalizeLabel(game.ban),
   rivals:seats.filter((_,i)=>i!==index),
   competitionKnown:seat.build&&seats.every(other=>other.build),
   contested:seat.build&&seats.some((other,i)=>i!==index&&other.build===seat.build)
  }))
 })
 const ban=normalizeLabel(target.ban)
 const histories=target.seats.map(seat=>past.filter(row=>row.id===seat.id))
 const strengths=new Map()
 for(const row of past){
  if(!strengths.has(row.id))strengths.set(row.id,[])
  strengths.get(row.id).push(row)
 }
 const strength=new Map([...strengths].map(([id,rows])=>[id,winRate(rows,BASE,8)]))
 const distributions=target.seats.map((seat,index)=>{
  const known=normalizeLabel(choices.get(seat).plan)
  if(known)return new Map([[known,1]])
  const history=histories[index]
  const eligible=ban?history.filter(row=>row.ban===ban&&row.build):[]
  const sample=eligible.length>=3?eligible:history.filter(row=>row.build)
  const total=sample.reduce((sum,row)=>sum+row.weight,0)+3
  const distribution=new Map()
  for(const row of sample)distribution.set(row.build,(distribution.get(row.build)??0)+row.weight/total)
  return distribution
 })
 return target.seats.map((seat,index)=>{
  const history=histories[index]
  const baseline=strength.get(seat.id)??BASE
  const recentStrength=winRate(history.map(row=>({...row,weight:row.weight**2})),BASE,8)
  const commander=normalizeLabel(choices.get(seat).commander)
  const ownCommander=history.filter(row=>commander&&row.commander===commander)
  const commanderRows=past.filter(row=>commander&&row.commander===commander)
  const commanderStrength=winRate(commanderRows,BASE,12)
  const opponentIds=new Set(target.seats.filter((_,i)=>i!==index).map(other=>other.id))
  const opponentCommanders=new Set(target.seats.filter((_,i)=>i!==index)
   .map(other=>normalizeLabel(choices.get(other).commander)).filter(other=>other&&other!==commander))
  function fieldAdjustment(rows, isOpponent, prior) {
   let residual=0, evidence=0
   for(const row of rows){
    const rivals=row.rivals.filter(isOpponent)
    if(!rivals.length)continue
    const expected=prior/(prior+rivals.reduce((sum,rival)=>sum+(strength.get(rival.id)??BASE),0))
    if(!row.winner&&!rivals.some(rival=>rival.winner))continue
    residual+=(Number(row.winner)-expected)*row.weight
    evidence+=row.weight
   }
   return residual/(evidence+6)
  }
  const features={
   baseScore:Math.log(recentStrength/BASE),
   [`player:${seat.id}`]:1,
   championHistory:Math.log1p(history.reduce((sum,row)=>sum+row.weight*Number(row.winner),0)),
   playerForm:baseline-BASE,
   recentTrend:winRate(history.filter(row=>row.age<=7),baseline,6)-baseline,
   sameBanForm:ban?winRate(history.filter(row=>row.ban===ban),baseline,8)-baseline:0,
   commanderForm:commanderStrength-BASE,
   playerCommander:winRate(ownCommander,baseline,8)-baseline,
   commanderUnderBan:ban?winRate(commanderRows.filter(row=>row.ban===ban),commanderStrength,10)-commanderStrength:0,
   playerMatchup:fieldAdjustment(history,rival=>opponentIds.has(rival.id),baseline),
   commanderMatchup:fieldAdjustment(commanderRows,rival=>opponentCommanders.has(rival.commander),commanderStrength),
   buildFit:0,
   buildUnderBan:0,
   buildContention:0
  }
  for(const [build,usage] of distributions[index]){
   const buildRows=past.filter(row=>row.build===build)
   const buildRate=winRate(buildRows,BASE,8)
   const personalRate=winRate(history.filter(row=>row.build===build),baseline,8)
   const collision=1-distributions.reduce((none,other,i)=>i===index?none:none*(1-(other.get(build)??0)),1)
   const competitionRows=buildRows.filter(row=>row.competitionKnown)
   const shared=winRate(competitionRows.filter(row=>row.contested),buildRate,10)
   const solo=winRate(competitionRows.filter(row=>!row.contested),buildRate,10)
   features.buildFit+=usage*((buildRate-BASE)+(personalRate-baseline))
   if(ban)features.buildUnderBan+=usage*(winRate(buildRows.filter(row=>row.ban===ban),buildRate,10)-buildRate)
   features.buildContention+=usage*collision*(shared-solo)
  }
  // Put rate differences on roughly the same scale as the account indicators.
  for(const key of ['playerForm','recentTrend','sameBanForm','commanderForm','playerCommander','commanderUnderBan','playerMatchup','commanderMatchup','buildFit','buildUnderBan','buildContention'])features[key]*=6
  return features
 })
}
