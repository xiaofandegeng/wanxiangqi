const aliases=new Map([['逐鹿赢政','逐鹿嬴政'],['白哥','白歌'],['孙小宾','孙小斌']])
export function normalizeLabel(raw) {
 const label=raw?.trim()
 return label && label!=='UNKNOWN' ? aliases.get(label) ?? label : null
}

const ratio=(wins,total)=>total?wins/total:null
export function buildStatistics(matches) {
 const builds=new Map()
 function getBuild(label) {
  if(!builds.has(label)) builds.set(label,{label,champions:0,appearances:0,wins:0,contested:{appearances:0,wins:0},solo:{appearances:0,wins:0},commanders:new Map(),commanderMatchups:new Map()})
  return builds.get(label)
 }
 let matchesCount=0,knownChampionBuilds=0,commanderBuildSeats=0
 for(const match of matches) {
  if(match.seats.length!==6 || new Set(match.seats.map(s=>s.playerId)).size!==6 || match.seats.filter(s=>s.winner).length!==1) continue
  matchesCount++
  const championBuild=normalizeLabel(match.winnerBuild)
  if(championBuild){getBuild(championBuild).champions++;knownChampionBuilds++}
  const labels=match.seats.map(s=>normalizeLabel(s.build))
  match.seats.forEach((seat,i)=>{
   const label=labels[i]
   if(!label)return
   const entry=getBuild(label)
   entry.appearances++
   entry.wins+=Number(seat.winner)
   const contenders=labels.filter(x=>x===label).length
   const bucket=contenders>=2?entry.contested:labels.every(Boolean)?entry.solo:null
   if(bucket){bucket.appearances++;bucket.wins+=Number(seat.winner)}
   const commander=normalizeLabel(seat.commander)
   if(!commander)return
   commanderBuildSeats++
   if(!entry.commanders.has(commander))entry.commanders.set(commander,{commander,appearances:0,wins:0})
   const row=entry.commanders.get(commander)
   row.appearances++;row.wins+=Number(seat.winner)
   const rivalCommanders=new Set(match.seats.flatMap((other,j)=>{
    const rival=normalizeLabel(other.commander)
    return j!==i && labels[j]===label && rival && rival!==commander?[rival]:[]
   }))
   for(const rival of rivalCommanders){
    const key=JSON.stringify([commander,rival])
    if(!entry.commanderMatchups.has(key))entry.commanderMatchups.set(key,{commander,rival,appearances:0,wins:0})
    const pair=entry.commanderMatchups.get(key)
    pair.appearances++;pair.wins+=Number(seat.winner)
   }
  })
 }
 const withRate=row=>({...row,winRate:ratio(row.wins,row.appearances)})
 return {matchesCount,knownChampionBuilds,unknownChampionBuilds:matchesCount-knownChampionBuilds,commanderBuildSeats,
  builds:[...builds.values()].map(row=>({...withRate(row),championShare:ratio(row.champions,knownChampionBuilds),
   contested:withRate(row.contested),solo:withRate(row.solo),
   commanders:[...row.commanders.values()].map(withRate).sort((a,b)=>b.appearances-a.appearances),
   commanderMatchups:[...row.commanderMatchups.values()].map(withRate).sort((a,b)=>b.appearances-a.appearances)
  })).sort((a,b)=>b.champions-a.champions||b.appearances-a.appearances||a.label.localeCompare(b.label,'zh-CN'))}
}
