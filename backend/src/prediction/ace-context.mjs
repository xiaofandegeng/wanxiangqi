import {fail} from './domain.mjs'
// Rules are pinned to checked official releases, never extrapolated to unknown versions.
export const ACE_RULE_SOURCES = [
 {title:'10月15日官方公告 v1.6.1',url:'https://www.taptap.cn/moment/859509109601339933?group_id=399839'},
 {title:'10月29日官方公告 v1.8.1',url:'https://www.taptap.cn/moment/864558229898660127'},
]
const caps={'v1.5.1':{cap:50000,since:'2026-10-08T08:00:00+08:00'},'v1.6.1':{cap:10000,since:'2026-10-15T08:00:00+08:00'},'v1.7.1':{cap:10000,since:'2026-10-22T08:00:00+08:00'},'v1.8.1':{cap:10000,since:'2026-10-29T08:00:00+08:00'}}
const optionalText=(value,label)=>{if(value==null||value==='')return null;if(typeof value!=='string'||value.length>160)throw fail(`${label}格式错误`,'INVALID_ACE_CONTEXT');return value.trim()||null}
export function buildAceContext(input,cutoff){
 const c=input.aceContext||{}
 if(typeof c!=='object'||Array.isArray(c))throw fail('比赛上下文格式错误','INVALID_ACE_CONTEXT')
 if(!['UNKNOWN','OPEN','CLOSED'].includes(c.supportStage||'UNKNOWN'))throw fail('支持阶段无效','INVALID_ACE_CONTEXT')
 const release=caps[input.version.trim()]
 const cap=release&&Date.parse(cutoff)>=Date.parse(release.since)?release.cap:null
 const players=input.players.map((p,i)=>{
  const commander=optionalText(p.commander,'棋手'),plan=optionalText(p.visiblePlan,'当时已知玩法')
  const raw=p.returnMultiplier
  const multiplier=raw==null||raw===''?null:Number(raw)
  if(multiplier!==null&&(!['string','number'].includes(typeof raw)||!Number.isFinite(multiplier)||multiplier<=0||multiplier>100000))throw fail('返奖率必须为正数','INVALID_ACE_CONTEXT')
  return {seat:i+1,nickname:p.nickname,commander,visiblePlan:plan,returnMultiplier:multiplier,
   // Algebra conditional on the quote including principal; not a forecast or a bet suggestion.
   breakEvenProbability:c.grossReturnConfirmed===true&&multiplier!==null?1/multiplier:null,
   quoteBasis:'USER_CONFIRMED_AT_SCREENSHOT',commanderEffect:'NOT_SCORED'}
 })
 const plans=new Map();for(const p of players){if(p.visiblePlan){const group=plans.get(p.visiblePlan)||[];group.push(p.seat);plans.set(p.visiblePlan,group)}}
 return {event:'ACE_DUEL',ruleset:input.mode,supportStage:c.supportStage||'UNKNOWN',observedAt:cutoff,
  bannedFaction:optionalText(c.bannedFaction,'禁用阵营'),players,
  rules:{version:input.version,perPlayerSupportCap:cap,capBasis:cap===null?'UNKNOWN_VERSION':'OFFICIAL_RELEASE_REFERENCE_CONFIRM_IN_CLIENT',sources:ACE_RULE_SOURCES},
  sharedPlans:[...plans].filter(([,seats])=>seats.length>1).map(([label,seats])=>({label,seats,notice:'仅当时已知玩法标签相同；未核英雄池与实际持牌，不量化撞牌惩罚'})),
  warnings:[...(cap===null?['UNKNOWN_RULE_VERSION']:[]),...((c.supportStage||'UNKNOWN')!=='OPEN'?['SUPPORT_NOT_CONFIRMED_OPEN']:[]),
   ...(players.some(p=>p.returnMultiplier===null)?['MISSING_RETURN_QUOTES']:[]),
   ...(c.grossReturnConfirmed!==true?['RETURN_BASIS_UNCONFIRMED']:[])],
  notice:'选手是参赛账号，棋手是游戏角色，阵容是局内构筑。返奖率不是胜率；保本概率仅按含本金返奖倍数求倒数，不代表实际获胜概率或支持建议。未知棋手、禁用与玩法不推断。'}
}
