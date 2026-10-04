// v6 M3-2 + M4-2 · 术语/规则条目语料（38 条 = 13 新手指引词条 + 2 目录口径词条 + 23 基础规则）
//
// 铁律：
// - statementRaw 为官方原文逐字；默认来源为官网新手指引页（存证
//   record_key='official:newbie-guide'），个别条目带 verifyAgainst 指向其他存证
//   （卡牌图鉴 cards.js / 英雄目录 JSON）——构建脚本对每条按其声明的存证做
//   机械化核查：去标签/折叠空白后必须命中子串，找不到即构建失败。
// - params 只收录 statementRaw 中字面出现的数值/结构；官方未公布的数值一律写
//   '官方未公布…' 字符串，不编造数字。
// - 每条引用对应存证 RAW_MATERIAL（root 级，跨修订共享）。

// 官网新手指引「关键词词典」13 词条（原文逐字）
const KEYWORDS = [
  { term: '登场', statementRaw: '使用此卡牌后，触发效果。' },
  { term: '开团', statementRaw: '战斗开始时，触发效果。' },
  { term: '整备', statementRaw: '回合开始时，触发效果。' },
  { term: '牺牲', statementRaw: '英雄阵亡时，触发效果。' },
  { term: '合成', statementRaw: '使用场上已存在的英雄牌，与场上英雄结合，使其强化。' },
  { term: '闪现', statementRaw: '战斗开始时，英雄会跳跃至敌方战场的镜像位置。' },
  {
    term: '夺取',
    statementRaw: '使用此卡牌时，夺取周围1格随机1名己方英雄的等级 （最多10级，不包含临时等级）。',
    params: { maxStealLevel: 10, range: '周围1格', excludes: '临时等级' }
  },
  { term: '临时等级', statementRaw: '战斗结束时，临时等级将会被清除。' },
  { term: '转瞬', statementRaw: '回合结束时自动销毁，且出售不会获得能量。' },
  {
    term: '复生',
    statementRaw: '英雄在阵亡后会复活，并恢复50%生命值 （每名英雄单回合最多复活10次）。',
    params: { reviveHpPercent: 50, maxRevivesPerRound: 10 }
  },
  { term: '凯旋', statementRaw: '英雄上阵期间若战斗胜利，触发效果。' },
  { term: '败阵', statementRaw: '英雄上阵期间若战斗失败，触发效果。' },
  { term: '退场', statementRaw: '场上的此英雄被出售时，触发效果。' }
]

// M4-2 目录口径词条（新手指引页词典未收录，官方卡牌图鉴口径给出定义）
// - 图腾：专题站 cards.js 关键词清单（存证 official:cards:js）
//   注：cards.js 的「合成」词条 mark 文案与其「凯旋」完全相同，与新手指引页
//   词典的「合成」定义冲突——已按较新来源（新手指引）维持 kw-hecheng，冲突登记 conflictLog。
// - 阿科米亚核心：英雄目录 JSON 全部带此关键词的英雄共用同一段定义（存证
//   official:cards:heroes，脚本断言变体数=1）
const CALIBER_KEYWORDS = [
  {
    term: '图腾', statementRaw: '大河流域阵营专属单位，存活时提供特殊效果。',
    verifyAgainst: 'official:cards:js',
    params: { scope: '大河流域阵营专属单位' }
  },
  {
    term: '阿科米亚核心',
    statementRaw: '战斗开始时，核心的等级会以临时等级的形式，平均分配给己方【日落海】英雄（单英雄分配上限50%）。',
    verifyAgainst: 'official:cards:heroes',
    params: {
      timing: '战斗开始时',
      distribution: '平均分配（以临时等级形式）',
      cap: '单英雄分配上限50%',
      scope: '己方【日落海】英雄'
    }
  }
]

// 官网新手指引「基础规则介绍」各版块（原文逐字，按事实粒度拆条）
const RULES = [
  {
    id: 'rule-match-structure', slug: 'rule-match-structure', title: '规则：万象大赛对局结构（6 人 60 血）',
    statementRaw: '万象大赛将有6位棋手同台竞技，每位棋手初始拥有60生命值。',
    params: { players: 6, initialHp: 60 },
    appliesTo: { scope: '万象大赛模式' }
  },
  {
    id: 'rule-match-pairing', slug: 'rule-match-pairing', title: '规则：每回合随机匹配与胜负扣血',
    statementRaw: '玩家通过购买卡牌组建自己的阵容，每回合随机匹配一位棋手进行对战，战斗胜利，将扣除对方生命值；战斗失败，则扣除自身生命值。',
    params: { pairing: '每回合随机匹配一位棋手', hpChange: '胜方扣对方血 / 败方扣自身血（数值未公布）' },
    appliesTo: { scope: '万象大赛模式' }
  },
  {
    id: 'rule-match-elimination', slug: 'rule-match-elimination', title: '规则：淘汰与获胜条件',
    statementRaw: '获胜规则：生命值为0的棋手会被淘汰，存活到最后的棋手获得胜利。',
    params: { eliminationAtHp: 0, winCondition: '存活到最后' },
    appliesTo: { scope: '万象大赛模式' }
  },
  {
    id: 'rule-commander-skill', slug: 'rule-commander-skill', title: '规则：棋手专属技能',
    statementRaw: '每位棋手都有专属技能，点击技能按钮可查看技能详情。',
    appliesTo: { scope: '棋手' }
  },
  {
    id: 'rule-secret-art', slug: 'rule-secret-art', title: '规则：秘技任务与秘技牌',
    statementRaw: '每位棋手都有其秘技任务，完成后可获得秘技牌奖励。',
    appliesTo: { scope: '棋手' }
  },
  {
    id: 'rule-commander-level6-talent', slug: 'rule-commander-level6-talent', title: '规则：6 级专属天赋',
    statementRaw: '棋手升至6级后，可领取专属天赋，获得强力效果。',
    params: { level: 6 },
    appliesTo: { scope: '棋手' }
  },
  {
    id: 'rule-commander-levelup', slug: 'rule-commander-levelup', title: '规则：棋手升级（能量换等级/天赋/上阵人数/高阶概率）',
    statementRaw: '棋手可花费能量提升等级，每次升级后可免费解锁1个天赋。部分等级会带有人数标志，升至该等级时可获得+1上阵人数。棋手等级提升，获得高阶英雄牌的概率也将随之提升。',
    params: {
      talentsPerLevel: 1,
      unitSlotBonus: '+1上阵人数（仅部分带人数标志的等级）',
      higherTierHeroProbability: '随棋手等级提升（官方未公布概率表）'
    },
    appliesTo: { scope: '棋手' }
  },
  {
    id: 'rule-limited-commanders', slug: 'rule-limited-commanders', title: '规则：限免棋手解锁与刷新',
    statementRaw: '铂金段位之前，将会根据当前段位情况解锁对应限免棋手。达到铂金段位后，限免棋手组将会在第二周更换为常规限免棋手，每周进行刷新。',
    appliesTo: { scope: '棋手（限免机制）' }
  },
  {
    id: 'rule-hero-drag-merge', slug: 'rule-hero-drag-merge', title: '规则：拖动生成英雄与打出合成',
    statementRaw: '拖动卡牌至战场可在对应位置生成英雄。打出已在场上的英雄牌会与其合成，同时提升等级。',
    appliesTo: { scope: '英雄牌' }
  },
  {
    id: 'rule-hero-level-range', slug: 'rule-hero-level-range', title: '规则：英雄等级区间（1–999）',
    statementRaw: '英雄上阵时，初始等级为1级，最高等级为999级。',
    params: { initialLevel: 1, maxLevel: 999 },
    appliesTo: { scope: '英雄' }
  },
  {
    id: 'rule-hero-inspect', slug: 'rule-hero-inspect', title: '规则：查看英雄详情',
    statementRaw: '点击英雄可以查看英雄的详细信息，包括英雄的属性值、英雄技能等。',
    appliesTo: { scope: '英雄' }
  },
  {
    id: 'rule-card-effects', slug: 'rule-card-effects', title: '规则：卡牌效果各不相同',
    statementRaw: '英雄牌的卡牌效果各不相同，合理利用可以更快强化阵容，赢得胜利。',
    appliesTo: { scope: '英雄牌' }
  },
  {
    id: 'rule-hero-camp', slug: 'rule-hero-camp', title: '规则：英雄专属阵营',
    statementRaw: '每个英雄都有其专属阵营，不同阵营有不同的玩法特色。',
    appliesTo: { scope: '英雄' }
  },
  {
    id: 'rule-hero-position-info', slug: 'rule-hero-position-info', title: '规则：卡牌右侧可查定位与适合站位',
    statementRaw: '在卡牌右侧可以查看英雄的定位和适合的站位。',
    appliesTo: { scope: '英雄牌' }
  },
  {
    id: 'rule-talent-choice', slug: 'rule-talent-choice', title: '规则：天赋三选一与品阶（铜/银/金）',
    statementRaw: '①每次提升棋手等级，都可从3个天赋中免费选择1个。天赋分为1阶（铜）、2阶（银）、3阶（金）三种品阶，品阶越高效果越强。',
    params: { choices: 3, cost: '免费', tiers: ['1阶（铜）', '2阶（银）', '3阶（金）'] },
    appliesTo: { scope: '天赋' }
  },
  {
    id: 'rule-talent-tier-fairness', slug: 'rule-talent-tier-fairness', title: '规则：同等级玩家天赋品阶相同',
    statementRaw: '②每场对局的6名玩家，在相同等级时获得的天赋品阶是相同的。',
    params: { players: 6 },
    appliesTo: { scope: '天赋' }
  },
  {
    id: 'rule-talent-refresh', slug: 'rule-talent-refresh', title: '规则：白银段位后每局 1 次天赋刷新',
    statementRaw: '③当玩家达到白银段位后，每场对局会获得1次天赋刷新次数。',
    params: { refreshesPerMatch: 1, unlockRank: '白银段位' },
    appliesTo: { scope: '天赋' }
  },
  {
    id: 'rule-energy-income', slug: 'rule-energy-income', title: '规则：能量获取四途径',
    statementRaw: '①每个回合固定获得能量，未使用的能量可累积到下一回合；②出售英雄牌获得1能量；③出售已上阵英雄获得1能量；④部分天赋和效果牌也可提供能量。',
    params: {
      perRound: '固定获得（每回合数值官方未公布），未用可累积',
      sellHeroCard: 1,
      sellFieldedHero: 1,
      other: '部分天赋和效果牌'
    },
    appliesTo: { scope: '能量' }
  },
  {
    id: 'rule-energy-spend', slug: 'rule-energy-spend', title: '规则：能量消耗（英雄牌 3 能量）',
    statementRaw: '①购买卡牌会消耗能量，英雄牌固定消耗3能量，效果牌消耗能量在卡牌右上角查看；②提升棋手等级会消耗能量，升级按钮处即为当前升级所需能量。',
    params: { heroCardCost: 3, effectCardCost: '卡牌右上角标注', levelUpCost: '升级按钮处显示当前所需' },
    appliesTo: { scope: '能量' }
  },
  {
    id: 'rule-auction-flow', slug: 'rule-auction-flow', title: '规则：竞拍环节进入与操作',
    statementRaw: '在固定回合，参赛者会共同进入竞拍环节，竞拍可获得英雄牌、效果牌等丰厚奖励。点击选择想要的拍品，点击出价按钮进行出价。',
    params: { entryRounds: '固定回合（具体回合数官方未公布）', rewards: ['英雄牌', '效果牌等'] },
    appliesTo: { scope: '竞拍' }
  },
  {
    id: 'rule-auction-bidding', slug: 'rule-auction-bidding', title: '规则：竞价规则（无上限/失败不消耗/先出优先）',
    statementRaw: '①出价无上限，价格最高者可以获得拍品，如果竞拍失败，不会消耗能量。②出价相同时，先出价者会获得拍品。',
    params: { bidCap: '无上限', failedBidCost: 0, tieBreak: '先出价者优先' },
    appliesTo: { scope: '竞拍' }
  },
  {
    id: 'rule-auction-dividend', slug: 'rule-auction-dividend', title: '规则：分红池（低血量分红比例更大）',
    statementRaw: '竞拍时每位玩家的有效出价会进入分红池。竞拍结束时，分红池中的能量会分配给所有玩家，生命值越低的玩家获得的分红比例越大。',
    params: { poolSource: '每位玩家的有效出价', distribution: '所有玩家', lowHpBonus: '生命值越低分红比例越大（比例公式官方未公布）' },
    appliesTo: { scope: '竞拍' }
  },
  {
    id: 'rule-auction-wait-drops', slug: 'rule-auction-wait-drops', title: '规则：等待掉落（能量固定 1 点/英雄牌仅 1–2 阶）',
    statementRaw: '在等待竞拍时，每隔几秒地面上会掉落随机数量的道具（等待人数越多，掉落数量越多）。掉落内容包括互动道具、能量、英雄牌：互动道具掉落概率最高；能量与卡牌的掉落概率较低。能量每次固定掉落 1 点，英雄牌只会掉落 1 阶或 2 阶。',
    params: { dropInterval: '每隔几秒（官方未公布精确秒数）', dropScaling: '等待人数越多掉落越多', energyPerDrop: 1, heroCardTiers: [1, 2] },
    appliesTo: { scope: '竞拍等待阶段' }
  }
]

/** 词条 → 统一 mechanic 记录（id/slug/title/statementRaw/params/appliesTo/verifyAgainst） */
export const MECHANICS = [
  ...KEYWORDS.map(k => ({
    id: `kw-${pinyinSlug(k.term)}`,
    slug: `kw-${pinyinSlug(k.term)}`,
    title: `词条：${k.term}`,
    statementRaw: k.statementRaw,
    params: k.params || {},
    appliesTo: { scope: '卡牌词条' }
  })),
  ...CALIBER_KEYWORDS.map(k => ({
    id: `kw-${pinyinSlug(k.term)}`,
    slug: `kw-${pinyinSlug(k.term)}`,
    title: `词条：${k.term}`,
    statementRaw: k.statementRaw,
    params: k.params || {},
    appliesTo: { scope: '卡牌词条' },
    verifyAgainst: k.verifyAgainst
  })),
  ...RULES
]

// 15 个词条的稳定 slug（手工拼音映射，避免引入依赖）
function pinyinSlug(term) {
  const map = {
    登场: 'dengchang', 开团: 'kaituan', 整备: 'zhengbei', 牺牲: 'xisheng',
    合成: 'hecheng', 闪现: 'shanxian', 夺取: 'duoqu', 临时等级: 'linshi-dengji',
    转瞬: 'zhuanshun', 复生: 'fusheng', 凯旋: 'kaixuan', 败阵: 'baizhen', 退场: 'tuichang',
    图腾: 'tuteng', 阿科米亚核心: 'akemiya-core'
  }
  if (!map[term]) throw new Error(`词条 [${term}] 缺少拼音 slug 映射`)
  return map[term]
}
