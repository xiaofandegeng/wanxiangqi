import {normalizeLabel} from './build-stats.mjs'
import {projectBuilds} from './build-projection.mjs'
import {rateRosterHistory} from './roster-rating.mjs'

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

function crossBuildResidual(rows, opponentBuild) {
 let paired=0, pairedWeight=0, other=0, otherWeight=0
 for(const row of rows){
  const residual=row.weight*(Number(row.winner)-row.expected)
  if(row.rivals.some(rival=>rival.build===opponentBuild)){
   paired+=residual
   pairedWeight+=row.weight
  }else if(row.rivals.every(rival=>rival.build)){
   other+=residual
   otherWeight+=row.weight
  }
 }
 if(!pairedWeight||!otherWeight)return 0
 const baseline=other/(otherWeight+12)
 return (paired-pairedWeight*baseline)/(pairedWeight+12)
}

export function fieldFeatures(history, target, choices, historicalChoice, config) {
 const ratings=rateRosterHistory(history,target.day,config.rating)
 const past=history.flatMap(game=>{
  const age=(Date.parse(target.day)-Date.parse(game.day))/DAY
  const weight=2**(-age/14)
  const seats=game.seats.map(seat=>({
   ...seat,expected:ratings.expected(game.id,seat.id),build:normalizeLabel(seat.build),
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
 const projections=projectBuilds(history,target,target.seats.map(seat=>choices.get(seat)),historicalChoice)
 const distributions=projections.map(projection=>new Map(projection.candidates.map(row=>[row.build,row.share])))
 const byBuild=new Map()
 for(const row of past){
  if(!row.build)continue
  if(!byBuild.has(row.build))byBuild.set(row.build,[])
  byBuild.get(row.build).push(row)
 }
 const pairCache=new Map()
 return target.seats.map((seat,index)=>{
  const history=histories[index]
  const baseline=strength.get(seat.id)??BASE
  const recentStrength=winRate(history.map(row=>({...row,weight:row.weight**2})),BASE,8)
  const commander=normalizeLabel(choices.get(seat).commander)
  const ownCommander=history.filter(row=>commander&&row.commander===commander)
  const personalBuildHistory=commander?ownCommander:history
  const commanderRows=past.filter(row=>commander&&row.commander===commander)
  const commanderStrength=winRate(commanderRows,BASE,12)
  const opponentIds=new Set(target.seats.filter((_,i)=>i!==index).map(other=>other.id))
  const opponentCommanders=new Set(target.seats.filter((_,i)=>i!==index)
   .map(other=>normalizeLabel(choices.get(other).commander)).filter(other=>other&&other!==commander))
  function fieldAdjustment(rows, isOpponent) {
   let residual=0, evidence=0
   for(const row of rows){
    const rivals=row.rivals.filter(isOpponent)
    if(!rivals.length)continue
    const expected=row.expected/(row.expected+rivals.reduce((sum,rival)=>sum+rival.expected,0))
    if(!row.winner&&!rivals.some(rival=>rival.winner))continue
    residual+=(Number(row.winner)-expected)*row.weight
    evidence+=row.weight
   }
   return residual/(evidence+6)
  }
  const banHistory=ban?history.filter(row=>row.ban===ban):[]
  const banResidual=banHistory.reduce((sum,row)=>sum+row.weight*(Number(row.winner)-row.expected),0)
  const banSample=banHistory.reduce((sum,row)=>sum+row.weight,0)
  const features={
   baseScore:0.65*ratings.rating(seat.id)+0.35*Math.log(recentStrength/BASE),
   [`player:${seat.id}`]:1,
   championHistory:Math.log1p(history.reduce((sum,row)=>sum+row.weight*Number(row.winner),0)),
   playerForm:baseline-BASE,
   recentTrend:winRate(history.filter(row=>row.age<=7),baseline,6)-baseline,
   sameBanForm:banResidual/(banSample+8),
   commanderForm:commanderStrength-BASE,
   playerCommander:winRate(ownCommander,baseline,8)-baseline,
   commanderUnderBan:ban?winRate(commanderRows.filter(row=>row.ban===ban),commanderStrength,10)-commanderStrength:0,
   playerMatchup:fieldAdjustment(history,rival=>opponentIds.has(rival.id)),
   commanderMatchup:fieldAdjustment(commanderRows,rival=>opponentCommanders.has(rival.commander)),
   buildFit:0,
   buildUnderBan:0,
   crossBuildMatchup:0,
   buildContention:0,
   commanderBuildContention:0,
   playerCommanderBuildContention:0
  }
  for(const [build,usage] of distributions[index]){
   const buildRows=byBuild.get(build)??[]
   const buildRate=winRate(buildRows,BASE,8)
   const personalRate=winRate(personalBuildHistory.filter(row=>row.build===build),baseline,8)
   const collision=1-distributions.reduce((none,other,i)=>i===index?none:none*(1-(other.get(build)??0)),1)
   const competitionRows=buildRows.filter(row=>row.competitionKnown)
   const shared=winRate(competitionRows.filter(row=>row.contested),buildRate,10)
   const solo=winRate(competitionRows.filter(row=>!row.contested),buildRate,10)
   features.buildFit+=usage*((buildRate-BASE)+(personalRate-baseline))
   if(ban)features.buildUnderBan+=usage*(winRate(buildRows.filter(row=>row.ban===ban),buildRate,10)-buildRate)
   features.buildContention+=usage*collision*(shared-solo)
   const rivalBuilds=new Set(distributions.flatMap((dist,i)=>i===index?[]:[...dist.keys()]))
   for(const rivalBuild of rivalBuilds){
    if(rivalBuild===build)continue
    const pairKey=JSON.stringify([build,rivalBuild])
    if(!pairCache.has(pairKey))pairCache.set(pairKey,crossBuildResidual(buildRows,rivalBuild))
    const chance=1-distributions.reduce((none,dist,i)=>i===index?none:none*(1-(dist.get(rivalBuild)??0)),1)
    features.crossBuildMatchup+=usage*chance*pairCache.get(pairKey)
   }
   if(!commander)continue
   for(const [rivalIndex,rival] of target.seats.entries()){
    if(rivalIndex===index)continue
    const rivalCommander=normalizeLabel(choices.get(rival).commander)
    const rivalUsage=distributions[rivalIndex].get(build)??0
    if(!rivalCommander||!rivalUsage)continue
    const pairRows=buildRows.filter(row=>row.commander===commander&&row.rivals.some(opponent=>
     opponent.commander===rivalCommander&&opponent.build===build))
    if(!pairRows.length)continue
    const commanderBuildRate=winRate(buildRows.filter(row=>row.commander===commander),shared,12)
    const pairRate=winRate(pairRows,commanderBuildRate,12)
    const ownPairRate=winRate(pairRows.filter(row=>row.id===seat.id),pairRate,16)
    features.commanderBuildContention+=usage*rivalUsage*(pairRate-commanderBuildRate)
    features.playerCommanderBuildContention+=usage*rivalUsage*(ownPairRate-pairRate)
   }
  }
  // Put rate differences on roughly the same scale as the account indicators.
  for(const key of ['playerForm','recentTrend','sameBanForm','commanderForm','playerCommander','commanderUnderBan','playerMatchup','commanderMatchup','buildFit','buildUnderBan','crossBuildMatchup','buildContention','commanderBuildContention','playerCommanderBuildContention'])features[key]*=6
  return features
 })
}
