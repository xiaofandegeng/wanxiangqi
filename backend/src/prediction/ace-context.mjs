import {fail} from './domain.mjs'

export const LATEST_GAME_VERSION = 'v1.9.1'

// Rules are pinned to checked official releases, never extrapolated to unknown versions.
export const ACE_RULE_SOURCES = [
 {title:'10月15日官方公告 v1.6.1',url:'https://www.taptap.cn/moment/859509109601339933?group_id=399839'},
 {title:'10月29日官方公告 v1.8.1',url:'https://www.taptap.cn/moment/864558229898660127'},
 {title:'11月5日官方公告 v1.9.1',url:'https://www.taptap.cn/moment/868153400588669502'},
]

export const GAME_VERSIONS_TIMELINE = [
 {
  version: 'v1.9.1',
  effectiveDate: '2026-11-05',
  isLatest: true,
  perPlayerSupportCap: 10000,
  title: '11月5日不停机更新 (v1.9.1 - 当前官方最新版本)',
  keyFeatures: [
   '新棋手「武凤」11月6日登场（为我所用偷取对手秘技牌机制）',
   '棋手「嬴律」并购红利重磅强化：合成上限后每回合额外随机获得1张场上英雄复制（极大加速高阶单核追三星）',
   '棋手「乔汐」温柔呼唤抽取范围收窄为3~5阶转瞬牌；潮汐交响初始触发次数升至4次(+20等级)',
   '棋手「安琪拉」打扫战场飞行器继承法攻提至125%、攻速提至30%（雷霆战机法爆体系大火）',
   '天赋「乘胜追击」优化为回合开始拿战术，胜利拿高阶战术'
  ],
  lineupImpact: '高阶高费单核流派（逐鹿蒙恬、日落海倒转、河洛高费）受嬴律复制机制利好上限激增；雷霆战机机甲流派大幅增强；乔汐转瞬3-5阶快攻爆发更快；三分领袖持续受益。'
 },
 {
  version: 'v1.8.1',
  effectiveDate: '2026-10-29',
  isLatest: false,
  perPlayerSupportCap: 10000,
  title: '10月29日不停机更新 (v1.8.1)',
  keyFeatures: [
   '乔汐潮汐交响重做、阿离红叶染锋等级保留、孙尚香炮击手感优化',
   '新增天赋「帝临」（嬴政+武则天）、「勇冠三军」（马超全队法爆）、「孙尚香·强化」',
   '天赋「三分领袖」治疗效果由30%大幅提升至40%'
  ],
  lineupImpact: '三分阵营全面崛起，「三分登场」、「三分倒转」与「养猪三分」胜率飙升，成为主流赛场核心体系。'
 },
 {
  version: 'v1.7.1',
  effectiveDate: '2026-10-22',
  isLatest: false,
  perPlayerSupportCap: 10000,
  title: '10月22日平衡更新 (v1.7.1)',
  keyFeatures: [
   '安琪拉、班叔、昭君、马可技能数值平衡',
   '天赋限制性进化、光棱塔机制优化'
  ],
  lineupImpact: '机关与河洛过渡增强，法系阵容梯度分化。'
 },
 {
  version: 'v1.6.1',
  effectiveDate: '2026-10-15',
  isLatest: false,
  perPlayerSupportCap: 10000,
  title: '10月15日规则与平衡更新 (v1.6.1)',
  keyFeatures: [
   '王牌对决支持上限调整为10000钻石',
   '王牌对决改为门槛随机6人选拔机制',
   '蒙犽弹道优化'
  ],
  lineupImpact: '王牌赛事生态重构，选手支持上限下调至1万。'
 },
 {
  version: 'v1.5.1',
  effectiveDate: '2026-10-08',
  isLatest: false,
  perPlayerSupportCap: 50000,
  title: '10月8日版本更迭 (v1.5.1)',
  keyFeatures: [
   '明先生微调、蔡文姬毒奶削弱',
   '王牌对决早期每人支持上限50000钻石'
  ],
  lineupImpact: '早期纯续航养猪体系受到抑制。'
 }
]

const caps={
 'v1.5.1':{cap:50000,since:'2026-10-08T08:00:00+08:00'},
 'v1.6.1':{cap:10000,since:'2026-10-15T08:00:00+08:00'},
 'v1.7.1':{cap:10000,since:'2026-10-22T08:00:00+08:00'},
 'v1.8.1':{cap:10000,since:'2026-10-29T08:00:00+08:00'},
 'v1.9.1':{cap:10000,since:'2026-11-05T08:00:00+08:00'}
}
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
