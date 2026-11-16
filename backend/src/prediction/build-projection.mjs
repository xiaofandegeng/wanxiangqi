import {normalizeLabel} from './build-stats.mjs'

const DAY_MS=86400000
const FACTIONS=new Set(['三分','逐鹿','河洛','日落海','大河'])

export function projectBuilds(history,target,choices,historicalChoice){
 const ban=normalizeLabel(target.ban)
 const rows=history.filter(game=>game.day<target.day).flatMap(game=>game.seats.flatMap(seat=>{
  const build=normalizeLabel(seat.build)
  if(!build)return []
  return [{
   id:seat.id,build,ban:normalizeLabel(game.ban),commander:normalizeLabel(historicalChoice(game,seat).commander),
   weight:2**(-(Date.parse(target.day)-Date.parse(game.day))/(14*DAY_MS))
  }]
 }))
 return target.seats.map((seat,index)=>{
  const choice=choices[index]??{}
  const plan=normalizeLabel(choice.plan)
  const commander=normalizeLabel(choice.commander)
  const personal=rows.filter(row=>row.id===seat.id)
  const excluded=build=>FACTIONS.has(ban)&&build.startsWith(ban)
  const usable=personal.filter(row=>!excluded(row.build))
  const sameCommander=usable.filter(row=>commander&&row.commander===commander)
  const pool=rows.filter(row=>commander&&row.commander===commander&&!excluded(row.build))
  const excludedBuilds=[...new Set([...personal.map(row=>row.build),plan].filter(build=>build&&excluded(build)))]
  if(plan&&!excluded(plan))return {basis:'CONFIRMED_PLAN',personalSamples:personal.length,
   commanderSamples:sameCommander.length,commanderPoolSamples:pool.length,unknownShare:0,
   candidates:[{build:plan,share:1,personalSamples:usable.filter(row=>row.build===plan).length,
    commanderSamples:sameCommander.filter(row=>row.build===plan).length}],excludedBuilds}
  const scores=new Map()
  const add=(row,multiplier)=>scores.set(row.build,(scores.get(row.build)??0)+multiplier*row.weight*(ban&&row.ban===ban?1.5:1))
  for(const row of usable)add(row,1)
  for(const row of sameCommander)add(row,3)
  // Commander-wide history is a small fallback when the account has few direct samples.
  for(const row of pool.filter(row=>row.id!==seat.id))add(row,1/(4+pool.length))
  const fieldFallback=!scores.size&&FACTIONS.has(ban)
   ?rows.filter(row=>row.ban===ban&&!excluded(row.build)):[]
  for(const row of fieldFallback)add(row,1/(4+fieldFallback.length))
  const total=[...scores.values()].reduce((sum,score)=>sum+score,0)+3
  return {
   basis:sameCommander.length?'PLAYER_COMMANDER_HISTORY':usable.length?'PLAYER_HISTORY':pool.length?'COMMANDER_HISTORY':fieldFallback.length?'FIELD_SAME_BAN':'NO_HISTORY',
   personalSamples:personal.length,commanderSamples:sameCommander.length,commanderPoolSamples:pool.length,excludedBuilds,
   unknownShare:3/total,
   candidates:[...scores].map(([build,score])=>({build,share:score/total,
    personalSamples:usable.filter(row=>row.build===build).length,
    commanderSamples:sameCommander.filter(row=>row.build===build).length})).sort((a,b)=>b.share-a.share||a.build.localeCompare(b.build,'zh-CN'))
  }
 })
}
