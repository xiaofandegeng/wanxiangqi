const DAY_MS=86400000
const BASE=1/6
const decay=(elapsed,halfLife)=>2**(-elapsed/(halfLife*DAY_MS))

// All games on one day use the same opening ratings because exact times are missing.
export function rateRosterHistory(games, targetDay, {halfLife=10, learningRate=0.65}={}) {
 const targetTime=Date.parse(targetDay)
 const byDay=new Map()
 for(const game of games){
  if(game.day>=targetDay)continue
  if(!byDay.has(game.day))byDay.set(game.day,[])
  byDay.get(game.day).push(game)
 }
 const state=new Map(), expectations=new Map()
 function ratingAt(id,time){
  const saved=state.get(id)
  return saved?saved.rating*decay(time-saved.time,halfLife):0
 }
 for(const day of [...byDay.keys()].sort()){
  const time=Date.parse(day)
  const daily=new Map()
  for(const game of byDay.get(day)){
   const scores=game.seats.map(seat=>Math.exp(ratingAt(seat.id,time)))
   const total=scores.reduce((sum,value)=>sum+value,0)
   const probabilities=new Map()
   for(const [index,seat] of game.seats.entries()){
    const probability=scores[index]/total
    probabilities.set(seat.id,probability)
    const item=daily.get(seat.id)??{residual:0,appearances:0}
    item.residual+=Number(seat.winner)-probability
    item.appearances++
    daily.set(seat.id,item)
   }
   expectations.set(game.id,probabilities)
  }
  for(const [id,item] of daily){
   const update=learningRate*item.residual/Math.sqrt(item.appearances)
   state.set(id,{time,rating:Math.max(-2,Math.min(2,ratingAt(id,time)+update))})
  }
 }
 return {
  rating:id=>ratingAt(id,targetTime),
  expected:(matchId,id)=>expectations.get(matchId)?.get(id)??BASE
 }
}
