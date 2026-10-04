// v6 M3-5 + M4-2 · 资料实体语料
//
// 构成（M4-2 起实体以官方卡牌目录为基底，同一事实只维护一次）：
//  1. 官方卡牌目录全量 514 实体（corpus-cards.mjs，id=官方目录ID，构建时与
//     raw_materials 存证做 sha256 一致性断言）——品阶/阵营/关键词/技能原文/
//     属性/费用/觉醒/获取说明全部来自目录，不再人工转写。
//  2. 棋手 11 位（目录无棋手数据）：官网新手指引 RAW 5 位 + 官网首页 RAW 2 位
//     + 官方教学图 IMG 4 位。
//  3. 编辑附加事实（阵容角色/阶段指引/装备归属/阵容推荐等）按官方 displayName
//     挂接到目录实体上，与目录事实分键并列，不覆盖目录文本。
//
// 事实来源三类：
//  - RAW:guide  官网新手指引页文字存证（statement 可机械化核查 → guideNorm）
//  - RAW:home   官网首页文字存证（→ homeNorm）
//  - IMG        官方教学图 guide_N_2/3.jpg（vision 逐字转写 + 多轮交叉核对，
//              引用图原件 URL + sha256，人工可按 URL 复核；不写入存证子串核查）
// 铁律：facts 只写官方明示内容；官未公布的不写；教学图为简化表述的以目录文本为准。

import { buildCatalogEntities } from './corpus-cards.mjs'

const GUIDE_BASE = 'https://game.gtimg.cn/images/osgame/cp/a202609xszy'

export const IMAGE_REFS = {
  IMG_1: `${GUIDE_BASE}/guide_1_2.jpg`, // 三分登场流 一图速览
  IMG_2: `${GUIDE_BASE}/guide_1_3.jpg`, // 三分登场流 图文详解
  IMG_2_2: `${GUIDE_BASE}/guide_2_2.jpg`, // 日落海整备流 一图速览
  IMG_2_3: `${GUIDE_BASE}/guide_2_3.jpg`, // 日落海整备流 图文详解
  IMG_3_2: `${GUIDE_BASE}/guide_3_2.jpg`, // 大河图腾流 一图速览
  IMG_3_3: `${GUIDE_BASE}/guide_3_3.jpg`, // 大河图腾流 图文详解
  IMG_4_2: `${GUIDE_BASE}/guide_4_2.jpg`, // 河洛古币流 一图速览
  IMG_4_3: `${GUIDE_BASE}/guide_4_3.jpg`, // 河洛古币流 图文详解
  IMG_5_2: `${GUIDE_BASE}/guide_5_2.jpg`, // 逐鹿战术牌流 一图速览
  IMG_5_3: `${GUIDE_BASE}/guide_5_3.jpg` // 逐鹿战术牌流 图文详解
}

const IMG_NOTE = 'AI 辅助转写自官方教学图（多轮独立提取交叉核对），以引用图原件为准'

// ================================================================
// 编辑附加事实（挂接到目录实体，按官方 displayName 断言唯一命中）
// ================================================================

// ---- 英雄：阵容角色 / 阶段指引 / 装备推荐（全部来自官方教学图 IMG）----
const HERO_EDITORIAL = {
  // 三分登场流（guide_1_2/1_3，M3 转写复用）
  吕布: {
    officialBeginnerLineupCore: '三分登场流 核心英雄（官网新手指引·入门阵容，RAW 存证文字）',
    lineupRoles: ['三分登场流 核心C位（官方图文详解标注）'],
    recommendedEquipment: ['炽热支配者（图示短名：炽热）', '无尽巨剑（图示短名：无尽）', '红魔'],
    stageNote: '官方阶段指引：8-11回合寻找吕布，找到后先上场吕布，用换帅将孙尚香等级继承给吕布'
  },
  曹操: {
    lineupRoles: ['三分登场流 核心坦克（官方图文详解标注）'],
    recommendedEquipment: ['近卫荣耀（图示短名：近卫）', '御灵之纱（图示短名：御灵）', '不死鸟之眼（图示短名：不死鸟）'],
    engineNote: '官方阵容逻辑：利用曹操的整备效果，稳定触发三分英雄的登场效果，带动阵容等级成长',
    stageNote: '官方阶段指引：1-3回合优先寻找；4-7回合优先觉醒曹操'
  },
  蔡文姬: {
    lineupRoles: ['三分登场流 核心功能（官方图文详解标注）'],
    growthNote: '官方阵容逻辑：蔡文姬会在三分英雄上场时提供等级加成',
    stageNote: '官方阶段指引：1-3回合优先寻找；4-7回合优先觉醒蔡文姬'
  },
  赵云: {
    lineupRoles: ['三分登场流基础框架成员（官方1-3回合优先寻找）'],
    lateGameNote: '官方阶段指引：12回合后决赛局可卖赵云换太乙真人，复活吕布'
  },
  貂蝉: {
    lineupRoles: ['三分登场流成员（官方4-7回合补齐）'],
    substituteNote: '官方实战技巧：未找到赵云、貂蝉、周瑜时，可用三分或登场类英雄牌（如甄姬、阿轲）上阵'
  },
  小乔: {
    lineupRoles: ['三分登场流成员（官方：升4级后寻找小乔）'],
    growthNote: '官方阵容逻辑：小乔能在己方英雄触发登场效果时，进一步提升多名三分英雄的等级'
  },
  周瑜: {
    lineupRoles: ['三分登场流成员（官方8-11回合寻找）'],
    stageNote: '官方阶段指引：孙尚香等级经换帅继承给吕布后，卖掉孙尚香上阵周瑜',
    equipmentNote: '官方装备推荐按防御装与法源之杯方向标注（图示为装备图标，逐件名称以官方图为准）'
  },
  孙尚香: {
    lineupRoles: ['三分登场流过渡核心（官方1-3回合优先拿）'],
    transitionRole: '官方1-3回合优先拿的过渡核心；没有孙尚香时用弈星或牛魔过渡',
    handoffNote: '官方阶段指引：8-11回合用换帅将孙尚香的等级继承给吕布，再卖掉孙尚香'
  },
  甄姬: {
    substituteNote: '官方实战技巧：未找到赵云、貂蝉、周瑜时，可用三分或登场类英雄牌（如甄姬、阿轲）上阵'
  },
  阿轲: {
    substituteNote: '官方实战技巧：未找到赵云、貂蝉、周瑜时，可用三分或登场类英雄牌（如甄姬、阿轲）上阵'
  },
  // 日落海整备流（guide_2_2/2_3，2026-10-03 转写）
  安琪拉: {
    officialBeginnerLineupCore: '日落海整备流 核心英雄（官网新手指引·入门阵容，RAW 存证文字）',
    lineupRoles: ['日落海整备流 核心C位（官方图文详解标注）'],
    recommendedEquipment: ['法源之杯（图示短名：法源）', '虚无法杖', '炽热支配者（图示短名：炽热）'],
    stageNote: '官方阶段指引：4-7回合寻找关键功能牌朵莉亚和核心C位安琪拉，并将其觉醒'
  },
  朵莉亚: {
    lineupRoles: ['日落海整备流 核心功能（官方图文详解标注）'],
    stageNote: '官方阶段指引：4-7回合寻找'
  },
  狂铁: {
    lineupRoles: ['日落海整备流成员（整备引擎）'],
    stageNote: '官方阶段指引：1-3回合优先购买狂铁，其整备效果可稳定获得阿科米亚核心等级'
  },
  亚连: { lineupRoles: ['日落海整备流成员（整备引擎）'], stageNote: '官方阶段指引：4-7回合购买' },
  米莱狄: { lineupRoles: ['日落海整备流成员（整备引擎）'], stageNote: '官方阶段指引：4-7回合购买' },
  雅典娜: {
    lineupRoles: ['日落海整备流 核心坦克（官方图文详解标注）'],
    recommendedEquipment: ['霸者重铠（图示短名：霸者）', '近卫荣耀（图示短名：近卫）', '不死鸟之眼（图示短名：不死鸟）'],
    logicNote: '官方速览图节点小字：自身【开团】/ 触发队友【整备】',
    stageNote: '官方阶段指引：8-11回合搜索购买并上阵'
  },
  海诺: {
    lineupRoles: ['日落海整备流成员'],
    logicNote: '官方阵容逻辑：后期搭配雅典娜、海诺进一步加强核心等级的提升'
  },
  露娜: {
    lineupRoles: ['日落海整备流 12回合后备选'],
    stageNote: '官方阶段指引：如果提升了人数上限，可以通过打出露娜来触发整备，加速提升全队和核心等级'
  },
  // 大河图腾流（guide_3_2/3_3，2026-10-03 转写）
  敖隐: {
    officialBeginnerLineupCore: '大河图腾流 核心英雄（官网新手指引·入门阵容，RAW 存证文字）',
    lineupRoles: ['大河图腾流 核心C位（官方图文详解标注）'],
    recommendedEquipment: ['寒霜侵袭（图示短名：寒霜）', '破晓', '自然法杖'],
    stageNote: '官方阶段指引：8-11回合上阵敖隐，敖隐开始接管输出，优先将装备从虞姬转给敖隐'
  },
  虞姬: {
    lineupRoles: ['大河图腾流 核心功能（官方图文详解标注）'],
    stageNote: '官方阶段指引：4-7回合利用免费刷新寻找；输出装备优先给虞姬'
  },
  张良: {
    lineupRoles: ['大河图腾流成员'],
    logicNote: '官方阵容逻辑（速览图原文）：虞姬和张良的卡牌效果还能为队伍补等级',
    lateGameNote: '官方实战技巧：决赛圈卖张良，换太乙真人保护敖隐'
  },
  少司缘: { lineupRoles: ['大河图腾流成员（召唤图腾）'], stageNote: '官方阶段指引：4-7回合寻找' },
  鬼谷子: { lineupRoles: ['大河图腾流成员（召唤图腾）'], logicNote: '官方速览图节点小字：先知 / 生命恢复' },
  大司命: { lineupRoles: ['大河图腾流成员（召唤图腾）'], stageNote: '官方阶段指引：升至4级后寻找大司命' },
  东皇太一: {
    lineupRoles: ['大河图腾流 核心坦克（官方图文详解标注）'],
    recommendedEquipment: ['霸者重铠（图示短名：霸者）', '近卫荣耀（图示短名：近卫）', '不死鸟之眼（图示短名：不死鸟）'],
    logicNote: '官方速览图节点小字：保护图腾不优先受到攻击，同时获得图腾部分等级的临时等级',
    stageNote: '官方阶段指引：8-11回合上阵；12回合后人口充足时可上阵太乙真人保护敖隐'
  },
  云中君: { lineupRoles: ['大河图腾流 4-7/8-11回合备选'] },
  // 瑶（英雄，hero-5051）：大河图腾流 8-11回合备选；注意与棋手「瑶/瑶妹」区分
  // 河洛古币流（guide_4_2/4_3，2026-10-03 转写）
  百里玄策: {
    officialBeginnerLineupCore: '河洛古币流 核心英雄（官网新手指引·入门阵容，RAW 存证文字）',
    lineupRoles: ['河洛古币流 核心C位（官方图文详解标注）'],
    recommendedEquipment: ['无尽巨剑（图示短名：无尽）', '炽热支配者（图示短名：炽热）', '影牙'],
    logicNote: '官方速览图：每回合基于上回合击败数给自身加等级',
    stageNote: '官方阶段指引：1-3回合第二回合起寻找关键C位百里玄策，获得的古币都对玄策使用'
  },
  上官婉儿: { lineupRoles: ['河洛古币流成员（产出古币）'], stageNote: '官方阶段指引：8-11回合寻找' },
  李元芳: {
    lineupRoles: ['河洛古币流成员（产出古币）'],
    stageNote: '官方阶段指引：1-3回合优先购买；实战技巧：李元芳需紧挨百里玄策站位，确保古币给到玄策'
  },
  盾山: {
    lineupRoles: ['河洛古币流成员（产出古币）'],
    stageNote: '官方阶段指引：1-3回合看到盾山可以拿一张'
  },
  程咬金: {
    lineupRoles: ['河洛古币流 核心坦克（官方图文详解标注）'],
    recommendedEquipment: ['聚灵水晶', '不死鸟之眼（图示短名：不死鸟）', '不祥征兆（图示写作：不详）'],
    stageNote: '官方阶段指引：4-7回合商店只重点拿程咬金和钟馗，补前排和控制'
  },
  钟馗: {
    lineupRoles: ['河洛古币流成员'],
    logicNote: '官方速览图：降低敌方等级',
    stageNote: '官方阶段指引：4-7回合商店只重点拿程咬金和钟馗，补前排和控制'
  },
  太乙真人: {
    lineupRoles: [
      '三分登场流 12回合后决赛容错（复活吕布）',
      '河洛古币流成员（8-11回合寻找）',
      '大河图腾流 12回合后备选（保护敖隐）',
      '逐鹿战术牌流 12回合后备选（给蒙犽增加容错）'
    ],
    positionNote: '官方实战技巧（河洛古币流）：太乙真人需紧挨百里玄策站位，确保复活效果给到玄策'
  },
  铠: { lineupRoles: ['河洛古币流 4-7回合备选'] },
  武则天: { lineupRoles: ['河洛古币流 8-11回合备选'] },
  李信: { lineupRoles: ['河洛古币流 12回合后转养对象（玄策战力不足时）'] },
  花木兰: { lineupRoles: ['河洛古币流 12回合后转养对象（玄策战力不足时）'] },
  // 逐鹿战术牌流（guide_5_2/5_3，2026-10-03 转写）
  蒙犽: {
    officialBeginnerLineupCore: '逐鹿战术牌流 核心英雄（官网新手指引·入门阵容，RAW 存证文字）',
    lineupRoles: ['逐鹿战术牌流 核心C位（官方图文详解标注）'],
    recommendedEquipment: ['无尽巨剑（图示短名：无尽）', '炽热支配者（图示短名：炽热）', '法源之杯（图示短名：法源）'],
    logicNote: '官方实战技巧：芈月只给装备最多的逐鹿英雄升级——确保蒙犽装备最多，避免其他英雄装备同数量加错等级'
  },
  芈月: {
    lineupRoles: ['逐鹿战术牌流 核心功能（官方图文详解标注）'],
    logicNote: '官方阵容逻辑：通过芈月的卡牌效果，不断打出战术牌来提升装备最多的逐鹿英雄等级',
    stageNote: '官方阶段指引：1-3回合第2回合升到2级优先找到芈月；4-7回合觉醒芈月'
  },
  白起: {
    lineupRoles: ['逐鹿战术牌流 核心坦克（官方图文详解标注）'],
    recommendedEquipment: ['霸者重铠（图示短名：霸者）', '不死鸟之眼（图示短名：不死鸟）', '不祥征兆（图示写作：不详）']
  },
  西施: { lineupRoles: ['逐鹿战术牌流成员（获取战术牌）'], stageNote: '官方阶段指引：4-7回合找齐' },
  老夫子: {
    lineupRoles: ['逐鹿战术牌流成员（获取战术牌）'],
    lateGameNote: '官方实战技巧：决赛圈没有多余上阵人数时，可卖掉老夫子，上阵太乙真人给蒙犽增加容错'
  },
  庄周: { lineupRoles: ['逐鹿战术牌流成员（获取战术牌）'] },
  鲁班七号: {
    lineupRoles: ['逐鹿战术牌流成员（获取战术牌）'],
    logicNote: '官方推荐棋手说明：老夫子、鲁班七号的卡牌效果都可以通过合成来获取战术牌'
  },
  海月: { lineupRoles: ['逐鹿战术牌流 12回合后备选（强力功能牌提高决赛容错）'] },
  // 跨阵容过渡牌（弈星/牛魔/干将莫邪，多套教学图 1-3 回合过渡）
  弈星: {
    transitionRole: '官方阶段指引过渡牌：三分登场流/大河图腾流/河洛古币流/逐鹿战术牌流 1-3回合均可用弈星过渡或备选'
  },
  牛魔: {
    transitionRole: '官方阶段指引过渡牌：三分登场流/大河图腾流（开局过渡）/逐鹿战术牌流（1-3备选）；大河图腾流注明牛魔为暂时过渡使用，后续人口不足可卖掉'
  },
  干将莫邪: { transitionRole: '官方阶段指引过渡牌：大河图腾流 1-3回合开局优先购买（暂时过渡使用，后续人口不足可卖掉）' }
}

// ---- 装备：官方教学图装备推荐归属（IMG；短名→目录全名归一映射见 NORMALIZED_EQUIP_NAMES）----
const EQUIP_EDITORIAL = {
  炽热支配者: { lineupEquip: ['三分登场流·吕布', '日落海整备流·安琪拉', '河洛古币流·百里玄策', '逐鹿战术牌流·蒙犽'] },
  无尽巨剑: { lineupEquip: ['三分登场流·吕布', '河洛古币流·百里玄策', '逐鹿战术牌流·蒙犽'] },
  红魔: { lineupEquip: ['三分登场流·吕布'] },
  近卫荣耀: { lineupEquip: ['三分登场流·曹操', '日落海整备流·雅典娜', '大河图腾流·东皇太一'] },
  御灵之纱: {
    lineupEquip: ['三分登场流·曹操'],
    caliberNote: '教学图示名「御灵」为短名，按官方目录全名「御灵之纱」归一（前缀精确匹配）'
  },
  不死鸟之眼: { lineupEquip: ['三分登场流·曹操', '日落海整备流·雅典娜', '大河图腾流·东皇太一', '河洛古币流·程咬金', '逐鹿战术牌流·白起'] },
  法源之杯: { lineupEquip: ['三分登场流·周瑜', '日落海整备流·安琪拉', '逐鹿战术牌流·蒙犽'] },
  虚无法杖: { lineupEquip: ['日落海整备流·安琪拉'] },
  寒霜侵袭: { lineupEquip: ['大河图腾流·敖隐'] },
  破晓: { lineupEquip: ['大河图腾流·敖隐'] },
  自然法杖: { lineupEquip: ['大河图腾流·敖隐'] },
  霸者重铠: { lineupEquip: ['日落海整备流·雅典娜', '大河图腾流·东皇太一', '逐鹿战术牌流·白起'] },
  影牙: { lineupEquip: ['河洛古币流·百里玄策'] },
  聚灵水晶: { lineupEquip: ['河洛古币流·程咬金'] },
  不祥征兆: {
    lineupEquip: ['河洛古币流·程咬金', '逐鹿战术牌流·白起'],
    caliberNote: '教学图写作「不详」，官方目录名「不祥征兆」（近音异形，唯一近似防御装；按近音+坦克定位归一，属编辑归一化推断）'
  },
  阿科米亚之子: {
    caliberNote: '与词条「阿科米亚核心」（kw-akemiya-core，英雄目录关键词定义）为两个不同概念：本条是装备实体，词条是核心等级分配机制——并存登记，不互相冒充'
  }
}

// ---- 天赋：官方教学图推荐归属（IMG）+ 教学图简化口径说明 ----
const TALENT_EDITORIAL = {
  乐善好施: {
    lineupRecommendation: '三分登场流推荐天赋（官方图文详解）',
    guideEffectText: '登场效果触发时，随机2名三分英雄等级+2'
  },
  挂帅上阵: {
    lineupRecommendation: '三分登场流推荐天赋（官方图文详解）',
    guideEffectText: '挂帅——指定1名三分英雄，其等级等同最近1名三分英雄（用于等级转移）',
    caliberNote: '两轮图面提取在表述细节上略有差异，以图原件为准（已登记冲突处理记录）'
  },
  能量汲取: { lineupRecommendation: '日落海整备流推荐天赋（官方图文详解）' },
  智能装甲: {
    lineupRecommendation: '日落海整备流推荐天赋（官方图文详解）',
    caliberNote: '教学图为简化表述（图：随机获得1件日落海专属装备，穿戴后整备效果额外触发1次）；精确文本以卡牌目录 effectText 为准（每穿戴1件【日落海专属装备】，整备效果额外触发1次）'
  },
  复印机: {
    lineupRecommendation: '大河图腾流推荐天赋（官方图文详解）',
    caliberNote: '教学图为简化表述（图：复制场上英雄，加快核心牌觉醒）；精确文本以卡牌目录 effectText 为准'
  },
  大河新援: {
    lineupRecommendation: '大河图腾流推荐天赋（官方图文详解）',
    caliberNote: '教学图为简化表述（图：获得大河流域英雄，帮助阵容更快成型）；精确文本以卡牌目录 effectText 为准（获得2能量，以及随机1张2-3阶【大河流域】英雄牌）'
  },
  瞬影连斩: { lineupRecommendation: '河洛古币流推荐天赋（官方图文详解）' },
  微弱优势: { lineupRecommendation: '河洛古币流推荐天赋（官方图文详解）' },
  春风化雨: {
    lineupRecommendation: '逐鹿战术牌流推荐天赋（官方图文详解）',
    caliberNote: '教学图为简化表述；精确文本以卡牌目录 effectText 为准（回合开始时获得场上【逐鹿】英雄同名牌，上场战斗胜利则获得2张）'
  },
  令行如流: {
    lineupRecommendation: '逐鹿战术牌流推荐天赋（官方图文详解）',
    caliberNote: '教学图为简化表述；精确文本以卡牌目录 effectText 为准'
  }
}

// ---- 效果牌：官方教学图中的用法（IMG）----
const EFFCARD_EDITORIAL = {
  换帅: {
    roleInLineup: '三分登场流关键效果牌（官方阶段指引：商店中遇到换帅可以买2张备着；8-11回合用换帅将孙尚香的等级继承给吕布）',
    purchaseAdvice: '官方：买 2 张备着',
    caliberNote: 'M3 时官方新手材料未公布完整效果文本；M4 卡牌目录已公布（effectText=目录原文「指定1名【三分】英雄与其最近的【三分】英雄交换等级。」，能量2，三分之地）——以目录为准'
  },
  遗志: {
    lineupNote: '河洛古币流 12回合后：若玄策战力不足，可用遗志、化铁为金等方式转养高等级李信或花木兰（官方阶段指引）'
  },
  化铁为金: {
    lineupNote: '河洛古币流 12回合后：若玄策战力不足，可用遗志、化铁为金等方式转养高等级李信或花木兰（官方阶段指引）'
  },
  远洋宝藏: {
    lineupNote: '日落海整备流实战技巧：遇到【远洋宝藏】可以购买，它能提供阵营专属装备，提升英雄输出和承伤能力'
  }
}

// ================================================================
// 棋手（11 位，目录无棋手数据；RAW=官网文字存证，IMG=官方教学图转写）
// ================================================================

export const COMMANDER_ENTITIES = [
  // ---- RAW:newbie-guide（官网新手指引「棋手推荐」，M3 已核查）----
  {
    id: 'cmd-xiangxiang', slug: 'cmd-xiangxiang', displayName: '香香', kind: 'COMMANDER', source: 'RAW:guide',
    facts: {
      tagline: '自带武器下场输出，改造武器为不同形态',
      skill: {
        name: '究极弩炮',
        text: '战斗开始时，香香会使用武器攻击敌人。香香初始攻击力为20，每拥有1名不低于10级的1-3阶英雄，香香的攻击力+20。'
      },
      secretProgression: [
        { name: '枪炮艺术', text: '累积造成10/15/20/30点棋手伤害，获得1张秘技牌武器改造。' },
        { name: '武器改造', text: '香香攻击力+20%。进行1次武器改造方案选择。' },
        { name: '火力全开', text: '香香获得（己方英雄等级总和*0.5）%的攻击力提升。' }
      ],
      officialLineupPairing: {
        lineup: '日落海整备流',
        officialText: '以培养阿科米亚核心为主的阵容，操作简单，凑齐阵容英雄后全员自动成长。',
        source: 'RAW:home（官网首页棋手推荐栏）'
      },
      lineupRecommendations: [
        '日落海整备流推荐棋手（官方图文详解）：阵容里的1-3阶英雄越多、等级越高，香香的战力就越高，很适合这套以低阶英雄为主要构成的阵容'
      ]
    }
  },
  {
    id: 'cmd-yao', slug: 'cmd-yao', displayName: '瑶', kind: 'COMMANDER', source: 'RAW:guide',
    facts: {
      aliasNote: '官网首页棋手推荐栏以「瑶妹」呈现（同一棋手：技能文本逐字一致）',
      tagline: '召唤小鹿提供前排承伤，通过胜利来不断强化小鹿',
      skill: {
        name: '可爱小鹿',
        text: '游戏开始时，瑶召唤自己心爱的小鹿前来助阵，小鹿每回合等级+2，如果上回合战斗胜利，等级额外+4。'
      },
      secretProgression: [
        { name: '超绝可爱小鹿', text: '每经过3个回合，获得1张秘技牌 神奇小鹿 。' },
        { name: '神奇小鹿・嘲讽', text: '开战后小鹿会在敌人之间无视碰撞地移动，每 3 秒嘲讽 1 次周围 1 格敌人，等级 + 8。' },
        { name: '神奇小鹿・重装', text: '小鹿可以穿戴装备，且立即穿戴 1 件极寒风暴，等级 + 10。' },
        { name: '神奇小鹿・双生', text: '开战时，小鹿会在附近生成 1 个自身的复制体。如果本局获得过 5 次胜利，小鹿等级 + 12（当前胜利次数：0）。' },
        { name: '神奇小鹿・共鸣', text: '小鹿等级翻倍。' },
        { name: '神奇小鹿・奉献', text: '小鹿阵亡时，会将自身等级以 临时等级均分给你的英雄。' },
        { name: '巨型玩偶', text: '小鹿等级+30，并获得一件 小鹿的庇护 。' },
        { name: '小鹿的庇护', text: '唯一。穿戴者所受伤害的 30% 将转移到小鹿身上。' }
      ],
      officialLineupPairing: {
        lineup: '大河图腾流',
        officialText: '以敖隐为核心输出的阵容，操作简单，凑齐阵容英雄后全员自动成长。',
        source: 'RAW:home（官网首页棋手推荐栏）'
      },
      lineupRecommendations: [
        '大河图腾流推荐棋手（官方图文详解）：瑶妹的小鹿可以算作一个吸收伤害的坦克单位，有效缓解东皇太一的承伤压力防止前排暴毙，将单次战斗时间拖长，极其适合保护敖隐这类越打越强的英雄'
      ]
    }
  },
  {
    id: 'cmd-baige', slug: 'cmd-baige', displayName: '白歌', kind: 'COMMANDER', source: 'RAW:guide',
    facts: {
      tagline: '以合成催生复制，以秘技斩击核心牌',
      skill: {
        name: '神来之笔',
        text: '每进行4次英雄合成，白歌获得1张即兴创作。'
      },
      secretProgression: [
        { name: '即兴创作', text: '随机获得场上1名英雄的复制。' },
        { name: '天生我才', text: '使用6张即兴创作，获得1张秘技牌灵感爆发。' },
        { name: '灵感爆发', text: '释放3道剑气，斩击手牌中随机3张非觉醒英雄牌，将每张牌斩为2张转瞬版复制。' },
        { name: '惊才绝艳', text: '获得一张奇才。' },
        { name: '奇才', text: '指定1名英雄，获得4张该英雄牌。' }
      ],
      officialLineupPairing: {
        lineup: '三分登场流',
        officialText: '这套阵容很多英雄为低阶，养成难度低，适合新手使用。',
        source: 'RAW:home（官网首页棋手推荐栏）'
      },
      lineupRecommendations: [
        '三分登场流推荐棋手（官方图文详解·首选）：合成获取复制（机制依据官网棋手资料：神来之笔每4次英雄合成获得1张即兴创作，即兴创作随机获得场上1名英雄的复制，与该阵容频繁合成升星的节奏契合）',
        '逐鹿战术牌流推荐棋手（官方图文详解）：老夫子、鲁班七号的卡牌效果都可以通过合成来获取战术牌，而白歌的技能能够提供大量场上已有的英雄牌，帮助玩家进行更多英雄合成，并由此获得更多战术牌'
      ]
    }
  },
  {
    id: 'cmd-xiaotu', slug: 'cmd-xiaotu', displayName: '小菟', kind: 'COMMANDER', source: 'RAW:guide',
    facts: {
      tagline: '提供等级成长，越用越强，养成4个精英英雄',
      skill: {
        name: '小菟助力',
        text: '使用技能，小菟随机助力1名英雄，使其等级+2。本场比赛中，小菟每助力过1次，等级提升效果+1。'
      },
      secretProgression: [
        { name: '兔飞猛进', text: '己方英雄等级总和达到50/150/375级，获得1张秘技牌 小菟送福 。' },
        { name: '小菟送福', text: '对场上的随机4名英雄各触发1次小菟助力，使其等级+2。' },
        {
          name: '月之特调',
          text: '小菟提供等级时，每 5 级使其额外获得 1 项随机属性：15% 攻速 / 2% 物理和法术吸血 / 2 点物理和法术防御力。且每通过 小菟助力 提供 65 级时，获得 1 张 小菟送福 。'
        }
      ],
      officialLineupPairing: {
        lineup: '嫦娥四人队',
        officialText: '这套阵容凑齐4个英雄后每回合靠棋手技能成长，操作难度低，但找齐英雄有一定运气成分。',
        source: 'RAW:home（官网首页棋手推荐栏）'
      }
    }
  },
  {
    id: 'cmd-paipaopao', slug: 'cmd-paipaopao', displayName: '派对泡泡', kind: 'COMMANDER', source: 'RAW:guide',
    facts: {
      tagline: '专精单一阵营，还可额外获取阵营天赋',
      skill: {
        name: '派对泡泡',
        text: '使用技能，从随机2个阵营中选择1个，之后技能替换为：花费1点能量，获得1张该阵营的英雄牌。'
      },
      secretProgression: [
        { name: '快乐集结', text: '上阵6名技能所选阵营英雄，获得1张秘技牌 朋友多多 。' },
        { name: '朋友多多', text: '随机抽取4张技能所选阵营的英雄牌。' },
        { name: '狂欢时刻', text: '获得1张 打成一片 。' },
        { name: '打成一片', text: '天赋 3 选 1（技能选择阵营相关的天赋）。' }
      ]
    }
  },
  // ---- RAW:home（官网首页棋手推荐栏，M4-2 新增，全文逐字）----
  {
    id: 'cmd-zhuangxiaoyu', slug: 'cmd-zhuangxiaoyu', displayName: '庄小鱼', kind: 'COMMANDER', source: 'RAW:home',
    facts: {
      skill: {
        name: '梦境游戏',
        text: '庄小鱼 升级 时，会随机获得1张效果牌。'
      },
      secretProgression: [
        { name: '美梦成真', text: '升到5级和6级，获得1张秘技牌 如梦似幻 。' },
        { name: '如梦似幻', text: '基于场上阵容获取一套梦幻手牌。' },
        { name: '引擎升级', text: '获得1张梦幻引擎。' },
        { name: '梦幻引擎', text: '根据场上的阵容，将商店替换为梦幻商店。' }
      ],
      officialLineupPairing: {
        lineup: '河洛古币流',
        officialText: '以百里玄策为单核的阵容，随着百里玄策的等级提升，后期非常强力。',
        source: 'RAW:home（官网首页棋手推荐栏）'
      }
    }
  },
  {
    id: 'cmd-xiaodaji', slug: 'cmd-xiaodaji', displayName: '小妲己', kind: 'COMMANDER', source: 'RAW:home',
    facts: {
      skill: {
        name: '怦然心动',
        text: '每购买4张牌，小妲己随机获得1张效果牌。'
      },
      secretProgression: [
        { name: '心动节拍·秘技', text: '每触发5/4/3次怦然心动，获得1张秘技牌 心之引力 。' },
        { name: '心之引力', text: '获得4次临时刷新。接下来4次刷新时，商店里的牌购买消耗-1。' },
        { name: '魅力无限', text: '每回合打出的第1张效果牌会触发2次。' }
      ],
      officialLineupPairing: {
        lineup: '逐鹿战术牌流',
        officialText: '这是用战术牌提升战力的阵容，操作比较复杂，需频繁使用卡牌，推荐有一定游戏经验后再尝试。',
        source: 'RAW:home（官网首页棋手推荐栏）'
      },
      lineupRecommendations: [
        '逐鹿战术牌流推荐棋手（官方图文详解）：这套阵容主要靠使用效果牌时触发芈月的卡牌效果提升英雄等级，小妲己的技能可以提供更多效果牌并增加效果牌的触发次数，非常适合这套阵容'
      ]
    }
  },
  // ---- IMG（官方教学图推荐，转写以图原件为准）----
  {
    id: 'cmd-changxiaoer', slug: 'cmd-changxiaoer', displayName: '常小娥', kind: 'COMMANDER', source: 'IMG',
    facts: {
      lineupRecommendations: [
        '三分登场流推荐棋手（官方图文详解）：每回合稳定提升英雄等级；秘技牌上阵4名英雄后使用',
        '日落海整备流推荐棋手（官方图文详解）：常小娥每回合都能稳定提升英雄等级，操作简单、发挥稳定。秘技牌建议等场上至少有4名英雄后再使用，这样获得收益更高',
        '大河图腾流推荐棋手（官方图文详解）：常小娥的技能能帮我们进一步扩大阵容的等级优势，同时通过她的专属天赋为英雄们提供群体属性加成',
        '河洛古币流推荐棋手（官方图文详解）：常小娥的技能能够帮我们每回合稳定提升玄策的等级，配合古币机制能够快速拉高玄策战力，也是不错的选择'
      ],
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'cmd-naonao', slug: 'cmd-naonao', displayName: '闹闹', kind: 'COMMANDER', source: 'IMG',
    facts: {
      lineupRecommendations: [
        '日落海整备流推荐棋手（官方图文详解）：闹闹的技能是开局可以从随机2个阵营中选择1个，之后每回合稳定获取1张该阵营英雄牌。只要我们开局选到日落海，后续通过每回合使用技能，就能更快找到阵容所需英雄',
        '河洛古币流推荐棋手（官方图文详解）：闹闹在技能抽取到河洛阵营后，可以加速阵容成型速度，避免花费大量能量在搜寻关键英雄上',
        '逐鹿战术牌流推荐棋手（官方图文详解）：闹闹如果在开局抽取到逐鹿阵营，可以帮助我们直接获取逐鹿阵营的英雄，避免浪费大量能量在英雄搜索上，满级时更可选择逐鹿阵营相关天赋，强化整体战力'
      ],
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'cmd-jiangdao', slug: 'cmd-jiangdao', displayName: '姜导', kind: 'COMMANDER', source: 'IMG',
    facts: {
      lineupRecommendations: [
        '河洛古币流推荐棋手（官方图文详解）：姜导技能每打出英雄牌或效果牌，都能为指定英雄升级；棋手满级后还可提供物理和法术吸血，十分适配百里玄策单C阵容'
      ],
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'cmd-make', slug: 'cmd-make', displayName: '马可', kind: 'COMMANDER', source: 'IMG',
    facts: {
      lineupRecommendations: [
        '三分登场流推荐棋手（官方图文详解）：打出4张3阶以下英雄牌获得宝藏牌，与三分登场流低阶牌多的特点配合'
      ],
      verificationNote: IMG_NOTE
    }
  }
]

// ================================================================
// 目录实体 + 编辑事实合并（构建时断言每个编辑名唯一命中同 kind 目录实体）
// ================================================================

function mergeEditorial(entities) {
  const byName = new Map()
  for (const e of entities) {
    if (!byName.has(e.displayName)) byName.set(e.displayName, [])
    byName.get(e.displayName).push(e)
  }
  const attach = (editorial, kind, label) => {
    const attached = []
    for (const [name, facts] of Object.entries(editorial)) {
      const hits = (byName.get(name) || []).filter(e => e.kind === kind)
      if (hits.length !== 1) {
        throw new Error(`[${label}] 编辑事实挂接失败：${name} 在目录中命中 ${hits.length} 个 ${kind} 实体（应恰为 1）`)
      }
      hits[0].facts = { ...hits[0].facts, ...facts }
      attached.push(hits[0].id)
    }
    return attached
  }
  return {
    heroes: attach(HERO_EDITORIAL, 'HERO', '英雄'),
    equips: attach(EQUIP_EDITORIAL, 'EQUIPMENT', '装备'),
    talents: attach(TALENT_EDITORIAL, 'TALENT', '天赋'),
    effcards: attach(EFFCARD_EDITORIAL, 'EFFECT_CARD', '效果牌')
  }
}

const { entities: CATALOG_ENTITIES } = buildCatalogEntities()
export const EDITORIAL_ATTACHED = mergeEditorial(CATALOG_ENTITIES)

export const ALL_ENTITIES = [...CATALOG_ENTITIES, ...COMMANDER_ENTITIES]

// ================================================================
// RAW 事实机械化核查清单（构建脚本对声明存证做子串核查）
// ================================================================

// official:newbie-guide（官网新手指引页）需命中的陈述
export const RAW_GUIDE_STATEMENTS = (() => {
  const out = []
  for (const c of COMMANDER_ENTITIES) {
    if (c.source !== 'RAW:guide') continue
    if (c.facts.tagline) out.push(c.facts.tagline)
    if (c.facts.skill?.text) out.push(c.facts.skill.text)
    for (const s of c.facts.secretProgression || []) out.push(s.text)
  }
  // 官网「入门阵容」公告句（阵容名与核心英雄名）
  out.push('三分登场流', '吕布', '日落海整备流', '安琪拉', '大河图腾流', '敖隐', '河洛古币流', '百里玄策', '逐鹿战术牌流', '蒙犽')
  return out
})()

// official:home（官网首页）需命中的陈述
export const RAW_HOME_STATEMENTS = (() => {
  const out = []
  for (const c of COMMANDER_ENTITIES) {
    if (c.source !== 'RAW:home') continue
    if (c.facts.skill?.text) out.push(c.facts.skill.text)
    for (const s of c.facts.secretProgression || []) out.push(s.text)
    if (c.facts.officialLineupPairing) {
      out.push(c.facts.officialLineupPairing.lineup, c.facts.officialLineupPairing.officialText)
    }
  }
  // 首页对另四位 RAW:guide 棋手的阵容配对文案（编辑事实挂在这些实体上）
  out.push(
    '三分登场流', '这套阵容很多英雄为低阶，养成难度低，适合新手使用。',
    '日落海整备流', '以培养阿科米亚核心为主的阵容，操作简单，凑齐阵容英雄后全员自动成长。',
    '嫦娥四人队', '这套阵容凑齐4个英雄后每回合靠棋手技能成长，操作难度低，但找齐英雄有一定运气成分。',
    '大河图腾流', '以敖隐为核心输出的阵容，操作简单，凑齐阵容英雄后全员自动成长。'
  )
  return out
})()

/** IMG 事实计数（报告用：转写事实以图原件 URL+sha256 引用，不做存证子串核查） */
export const IMG_FACT_STATS = {
  heroes: Object.keys(HERO_EDITORIAL).length,
  equips: Object.keys(EQUIP_EDITORIAL).length,
  talents: Object.keys(TALENT_EDITORIAL).length,
  effcards: Object.keys(EFFCARD_EDITORIAL).length,
  commanders: COMMANDER_ENTITIES.filter(c => c.source === 'IMG').length
}
