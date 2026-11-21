import {normalizeLabel} from './build-stats.mjs'

const DAY_MS=86400000

export function projectBuilds(history,target,choices,historicalChoice){
 const ban=normalizeLabel(target.ban)
 const rows=history.filter(game=>game.day<target.day).flatMap(game=>game.seats.map(seat=>({
   id:seat.id,build:normalizeLabel(seat.build),winner:seat.winner,
   ban:normalizeLabel(game.ban),commander:normalizeLabel(historicalChoice(game,seat).commander),
   weight:2**(-(Date.parse(target.day)-Date.parse(game.day))/(14*DAY_MS))
 })))
 return target.seats.map((seat,index)=>{
  const choice=choices[index]??{}
  const plan=normalizeLabel(choice.plan)
  const commander=normalizeLabel(choice.commander)
  const personal=rows.filter(row=>row.id===seat.id&&row.build)
  const excluded=build=>Boolean(build&&ban&&build.startsWith(ban))
  const usable=personal.filter(row=>!excluded(row.build))
  const sameCommander=usable.filter(row=>commander&&row.commander===commander)
  const commanderWins=sameCommander.filter(row=>row.winner).length
  const pool=rows.filter(row=>row.build&&commander&&row.commander===commander&&!excluded(row.build))
  const excludedBuilds=[...new Set([...personal.map(row=>row.build),plan].filter(build=>build&&excluded(build)))]
  if(plan&&!excluded(plan))return {basis:'CONFIRMED_PLAN',personalSamples:personal.length,
   commanderSamples:sameCommander.length,commanderWins,commanderPoolSamples:pool.length,unknownShare:0,
   candidates:[{build:plan,share:1,personalSamples:usable.filter(row=>row.build===plan).length,
    commanderSamples:sameCommander.filter(row=>row.build===plan).length}],excludedBuilds}
  const eligible=commander?sameCommander:usable
  const scores=new Map()
  const weight=row=>row.weight*(ban&&row.ban===ban?1.5:1)*(row.winner?1.5:1)
  for(const row of eligible)scores.set(row.build,(scores.get(row.build)??0)+weight(row))
  const unknownWeight=rows.filter(row=>row.id===seat.id&&!row.build&&(!commander||row.commander===commander))
   .reduce((sum,row)=>sum+weight(row),0)
  const total=[...scores.values()].reduce((sum,score)=>sum+score,unknownWeight)
  return {
   basis:eligible.length?(commander?'PLAYER_COMMANDER_HISTORY':'PLAYER_HISTORY'):'NO_HISTORY',
   personalSamples:personal.length,commanderSamples:sameCommander.length,commanderWins,commanderPoolSamples:pool.length,excludedBuilds,
   unknownShare:total?unknownWeight/total:1,
   candidates:[...scores].map(([build,score])=>({build,share:score/total,
    personalSamples:usable.filter(row=>row.build===build).length,
    commanderSamples:sameCommander.filter(row=>row.build===build).length})).sort((a,b)=>b.share-a.share||a.build.localeCompare(b.build,'zh-CN'))
  }
 })
}
