import crypto from 'node:crypto'
export const fail = (message, code='INVALID_MATCH', status=422) => Object.assign(new Error(message), {code,status})
const text = (v, name, max=160) => {
 if(typeof v!=='string'||!v.trim()||v.length>max) throw fail(`${name}必填且不得超过${max}字`)
 return v.trim()
}
export function normalizeMatch(raw, now=Date.now()) {
 if(!raw || typeof raw!=='object') throw fail('需要场次JSON对象')
 const mode=text(raw.mode,'模式'); if(!['WANXIANG','DIAMOND'].includes(mode)) throw fail('模式必须为WANXIANG或DIAMOND')
 const playedAt=text(raw.playedAt,'比赛时间'); const time=Date.parse(playedAt)
 if(!/(Z|[+-]\d{2}:\d{2})$/.test(playedAt)||!Number.isFinite(time)||time>now) throw fail('赛果时间须带时区且不得晚于当前时间')
 const platform=text(raw.platform,'平台'),region=text(raw.region,'区服')
 if(!Array.isArray(raw.seats)||raw.seats.length!==6) throw fail('必须提供完整六席，冠军列表不能导入')
 if(raw.seats.some(s=>!s||typeof s!=='object')) throw fail('席位必须为对象')
 const seats=raw.seats.map(s=>({rank:s.rank,nickname:text(s.nickname,'昵称'),uid:s.uid==null||s.uid===''?null:text(s.uid,'UID',80)})).sort((a,b)=>a.rank-b.rank)
 if(seats.some((s,i)=>s.rank!==i+1)) throw fail('名次必须为1至6且不重复')
 const ids=seats.map(s=>s.uid).filter(Boolean)
 if(new Set(ids).size!==ids.length) throw fail('同场UID不得重复')
 return {sourceKey:text(raw.sourceKey,'来源唯一场次键'),mode,playedAt:new Date(time).toISOString(),platform,region,version:text(raw.version,'游戏版本'),evidenceId:text(raw.evidenceId,'原件证据编号'),evidenceLocator:text(raw.evidenceLocator,'原件定位',500),seats}
}
export const payloadHash = raw => crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex')
export const identityKey = (match, seat) => seat.uid ? JSON.stringify([match.platform,match.region,seat.uid]) : null
// 输入须为本次读取时仍具有效证据的VERIFIED记录；截止点同时约束比赛与核验可见时间。
export function computeStats(matches, {mode,version,cutoff=new Date().toISOString()}={}) {
 const groups=new Map(); let eligibleMatches=0,unlinkedSeats=0
 const end=Date.parse(cutoff)
 for(const m of matches) {
  if(m.status!=='VERIFIED'||!m.verifiedAt||Date.parse(m.verifiedAt)>end||Date.parse(m.playedAt)>=end||(mode&&m.mode!==mode)||(version&&m.version!==version)) continue
  eligibleMatches++
  for(const s of m.seats) {
   const key=identityKey(m,s); if(!key){unlinkedSeats++;continue}
   const gkey=JSON.stringify([m.mode,m.version,key]); let p=groups.get(gkey)
   if(!p){p={key,mode:m.mode,version:m.version,platform:m.platform,region:m.region,uid:s.uid,nickname:s.nickname,matches:0,wins:0,top3:0,rankSum:0,lastPlayedAt:m.playedAt};groups.set(gkey,p)}
   p.matches++;p.wins+=s.rank===1?1:0;p.top3+=s.rank<=3?1:0;p.rankSum+=s.rank
   if(m.playedAt>=p.lastPlayedAt){p.nickname=s.nickname;p.lastPlayedAt=m.playedAt}
  }
 }
 return {eligibleMatches,unlinkedSeats,players:[...groups.values()].map(p=>({...p,winRate:p.wins/p.matches,top3Rate:p.top3/p.matches,avgRank:p.rankSum/p.matches})).sort((a,b)=>b.matches-a.matches||a.key.localeCompare(b.key))}
}
export function estimate(matches, input, cutoff=new Date().toISOString()) {
 if(!input||!['WANXIANG','DIAMOND'].includes(input.mode)||typeof input.version!=='string'||!input.version.trim()||!Array.isArray(input.players)||input.players.length!==6||input.players.some(x=>typeof x!=='string')||new Set(input.players).size!==6) throw fail('请选择同模式同版本的六名不同选手','INVALID_ROSTER')
 const stats=computeStats(matches,{mode:input.mode,version:input.version,cutoff})
 const roster=input.players.map(key=>stats.players.find(p=>p.key===key))
 if(roster.some(p=>!p||p.matches<3)) return {status:'INSUFFICIENT_DATA',reason:'六名选手均需至少3场已核验且同模式同版本的历史记录；该门槛仅为研究基线条件。',calibrated:false,cutoff}
 if(new Set(roster.map(p=>JSON.stringify([p.platform,p.region]))).size!==1) throw fail('同场选手必须来自相同平台与区服','ROSTER_SCOPE_MISMATCH')
 // 平滑平均名次→softmax，仅为未校准研究基线；不作准确率承诺。
 const scores=roster.map(p=>Math.exp(-(p.rankSum+3.5*3)/(p.matches+3)))
 const sum=scores.reduce((a,b)=>a+b,0)
 return {status:'RESEARCH_BASELINE',modelVersion:'smoothed-average-rank-v1',calibrated:false,cutoff,notice:'未完成独立时间回测，不是经过校准的胜率。实际预测效果未知。',players:roster.map((p,i)=>({key:p.key,nickname:p.nickname,matches:p.matches,avgRank:p.avgRank,probability:scores[i]/sum}))}
}
