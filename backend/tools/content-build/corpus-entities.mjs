// v6 M3-5 · 资料实体语料（第一套阵容必需集 + 官网棋手推荐）
//
// 分两类来源：
//  - RAW（官网新手指引页 HTML 存证）：5 位棋手全文、其余入门阵容核心英雄、
//    全部词条原文 —— statement 类事实可机械化核查（构建脚本断言子串命中）。
//  - IMG（官方教学图 guide_1_2.jpg / guide_1_3.jpg）：三分登场流的角色标注/
//    装备/阶段指引/替补/天赋/另两位推荐棋手 —— 官方图以图片呈现，事实经
//    多轮独立视觉提取交叉核对，统一标注 verificationNote 并引用图原件 URL，
//    人工可按 URL 复核。不做无图无文的推断。
//
// 铁律：facts 只写官方图/官方页明示内容；官未公布的（如英雄技能数值）不写。

const IMG_1 = 'https://game.gtimg.cn/images/osgame/cp/a202609xszy/guide_1_2.jpg' // 一图速览
const IMG_2 = 'https://game.gtimg.cn/images/osgame/cp/a202609xszy/guide_1_3.jpg' // 图文详解

const IMG_NOTE = 'AI 辅助转写自官方教学图（多轮独立提取交叉核对），以引用图原件为准'

export const IMAGE_REFS = { IMG_1, IMG_2 }

// ---------------- HERO（17） ----------------
// 三分登场流构成 7 人（来源：官方教学图）+ 过渡/替补 6 人（官方教学图阶段指引）
// + 其余官方入门阵容核心 4 人（官网新手指引页文字）
export const HERO_ENTITIES = [
  {
    id: 'hero-lvbu', slug: 'hero-lvbu', displayName: '吕布', source: 'IMG',
    facts: {
      lineupRole: '三分登场流 核心C位（官方图文详解标注）',
      recommendedEquipment: ['炽热', '无尽', '红魔'],
      stageNote: '官方阶段指引：8-11回合寻找吕布，找到后先上场吕布，用换帅将孙尚香等级继承给吕布',
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'hero-caocao', slug: 'hero-caocao', displayName: '曹操', source: 'IMG',
    facts: {
      lineupRole: '三分登场流 核心坦克（官方图文详解标注）',
      recommendedEquipment: ['近卫', '御灵', '不死鸟'],
      engineNote: '官方阵容逻辑：利用曹操的整备效果（词条「整备」：回合开始时触发效果），稳定触发三分英雄的登场效果，带动阵容等级成长',
      stageNote: '官方阶段指引：1-3回合优先寻找；4-7回合优先觉醒曹操',
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'hero-caiwenji', slug: 'hero-caiwenji', displayName: '蔡文姬', source: 'IMG',
    facts: {
      lineupRole: '三分登场流 核心功能（官方图文详解标注）',
      growthNote: '官方阵容逻辑：蔡文姬会在三分英雄上场时提供等级加成',
      stageNote: '官方阶段指引：1-3回合优先寻找；4-7回合优先觉醒蔡文姬',
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'hero-zhaoyun', slug: 'hero-zhaoyun', displayName: '赵云', source: 'IMG',
    facts: {
      lineupRole: '三分登场流基础框架成员（官方1-3回合优先寻找）',
      lateGameNote: '官方阶段指引：12回合后决赛局可卖赵云换太乙真人，复活吕布',
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'hero-diaochan', slug: 'hero-diaochan', displayName: '貂蝉', source: 'IMG',
    facts: {
      lineupRole: '三分登场流成员（官方4-7回合补齐）',
      substituteNote: '官方实战技巧：未找到赵云、貂蝉、周瑜时，可用三分或登场类英雄牌（如甄姬、阿轲）上阵',
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'hero-xiaoqiao', slug: 'hero-xiaoqiao', displayName: '小乔', source: 'IMG',
    facts: {
      lineupRole: '三分登场流成员（官方：升4级后寻找小乔）',
      growthNote: '官方阵容逻辑：小乔能在己方英雄触发登场效果时，进一步提升多名三分英雄的等级',
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'hero-zhouyu', slug: 'hero-zhouyu', displayName: '周瑜', source: 'IMG',
    facts: {
      lineupRole: '三分登场流成员（官方8-11回合寻找）',
      stageNote: '官方阶段指引：孙尚香等级经换帅继承给吕布后，卖掉孙尚香上阵周瑜',
      equipmentNote: '官方装备推荐按防御装与法源之杯方向标注（图示为装备图标，逐件名称以官方图为准）',
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'hero-sunshangxiang', slug: 'hero-sunshangxiang', displayName: '孙尚香', source: 'IMG',
    facts: {
      transitionRole: '官方1-3回合优先拿的过渡核心；没有孙尚香时用弈星或牛魔过渡',
      handoffNote: '官方阶段指引：8-11回合用换帅将孙尚香的等级继承给吕布，再卖掉孙尚香',
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'hero-yixing', slug: 'hero-yixing', displayName: '弈星', source: 'IMG',
    facts: {
      transitionRole: '官方1-3回合过渡牌（优先找孙尚香，没有就先用弈星或牛魔过渡）',
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'hero-niumo', slug: 'hero-niumo', displayName: '牛魔', source: 'IMG',
    facts: {
      transitionRole: '官方1-3回合过渡牌（优先找孙尚香，没有就先用弈星或牛魔过渡）',
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'hero-taiyizhenren', slug: 'hero-taiyizhenren', displayName: '太乙真人', source: 'IMG',
    facts: {
      lateGameRole: '官方阶段指引：12回合后决赛局可卖赵云换太乙真人，复活吕布（容错手段）',
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'hero-zhenji', slug: 'hero-zhenji', displayName: '甄姬', source: 'IMG',
    facts: {
      substituteRole: '官方实战技巧：未找到赵云、貂蝉、周瑜时，可用三分或登场类英雄牌（如甄姬、阿轲）上阵',
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'hero-ake', slug: 'hero-ake', displayName: '阿轲', source: 'IMG',
    facts: {
      substituteRole: '官方实战技巧：未找到赵云、貂蝉、周瑜时，可用三分或登场类英雄牌（如甄姬、阿轲）上阵',
      verificationNote: IMG_NOTE
    }
  },
  // 官网新手指引页「入门阵容」明示的其余 4 套阵容核心英雄（RAW 存证文字）
  {
    id: 'hero-anqila', slug: 'hero-anqila', displayName: '安琪拉', source: 'RAW',
    facts: { officialBeginnerLineupCore: '日落海整备流 核心英雄（官网新手指引·入门阵容）' }
  },
  {
    id: 'hero-aoyin', slug: 'hero-aoyin', displayName: '敖隐', source: 'RAW',
    facts: { officialBeginnerLineupCore: '大河图腾流 核心英雄（官网新手指引·入门阵容）' }
  },
  {
    id: 'hero-bailixuance', slug: 'hero-bailixuance', displayName: '百里玄策', source: 'RAW',
    facts: { officialBeginnerLineupCore: '河洛古币流 核心英雄（官网新手指引·入门阵容）' }
  },
  {
    id: 'hero-mengkai', slug: 'hero-mengkai', displayName: '蒙犽', source: 'RAW',
    facts: { officialBeginnerLineupCore: '逐鹿战术牌流 核心英雄（官网新手指引·入门阵容）' }
  }
]

// ---------------- COMMANDER（7） ----------------
// 5 位官网棋手推荐全文（RAW 存证）+ 教学图推荐的 2 位（IMG）
export const COMMANDER_ENTITIES = [
  {
    id: 'cmd-xiangxiang', slug: 'cmd-xiangxiang', displayName: '香香', source: 'RAW',
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
      ]
    }
  },
  {
    id: 'cmd-yao', slug: 'cmd-yao', displayName: '瑶', source: 'RAW',
    facts: {
      tagline: '召唤小鹿提供前排承伤，通过胜利来不断强化小鹿',
      skill: {
        name: '可爱小鹿',
        text: '游戏开始时，瑶召唤自己心爱的小鹿前来助阵，小鹿每回合等级+2，如果上回合战斗胜利，等级额外+4。'
      },
      secretProgression: [
        { name: '超绝可爱小鹿', text: '每经过3个回合，获得1张秘技牌 神奇小鹿 。' },
        { name: '神奇小鹿·嘲讽', text: '开战后小鹿会在敌人之间无视碰撞地移动，每 3 秒嘲讽 1 次周围 1 格敌人，等级 + 8。' },
        { name: '神奇小鹿・重装', text: '小鹿可以穿戴装备，且立即穿戴 1 件极寒风暴，等级 + 10。' },
        { name: '神奇小鹿・双生', text: '开战时，小鹿会在附近生成 1 个自身的复制体。如果本局获得过 5 次胜利，小鹿等级 + 12（当前胜利次数：0）。' },
        { name: '神奇小鹿・共鸣', text: '小鹿等级翻倍。' },
        { name: '神奇小鹿・奉献', text: '小鹿阵亡时，会将自身等级以 临时等级均分给你的英雄。' },
        { name: '巨型玩偶', text: '小鹿等级+30，并获得一件 小鹿的庇护 。' },
        { name: '小鹿的庇护', text: '唯一。穿戴者所受伤害的 30% 将转移到小鹿身上。' }
      ]
    }
  },
  {
    id: 'cmd-baige', slug: 'cmd-baige', displayName: '白歌', source: 'RAW',
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
      lineupRecommendation: '三分登场流推荐棋手（官方图文详解）。机制依据官网棋手资料：神来之笔每4次英雄合成获得1张即兴创作（随机获得场上1名英雄的复制），与该阵容频繁合成升星的节奏契合',
      lineupRecommendationVerification: IMG_NOTE
    }
  },
  {
    id: 'cmd-xiaotu', slug: 'cmd-xiaotu', displayName: '小菟', source: 'RAW',
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
      ]
    }
  },
  {
    id: 'cmd-paipaopao', slug: 'cmd-paipaopao', displayName: '派对泡泡', source: 'RAW',
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
  // 教学图推荐（IMG）：文案转写，以图原件为准
  {
    id: 'cmd-make', slug: 'cmd-make', displayName: '马可', source: 'IMG',
    facts: {
      lineupRecommendation: '三分登场流推荐棋手（官方图文详解）：打出4张3阶以下英雄牌获得宝藏牌，与三分登场流低阶牌多的特点配合',
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'cmd-changxiaoer', slug: 'cmd-changxiaoer', displayName: '常小娥', source: 'IMG',
    facts: {
      lineupRecommendation: '三分登场流推荐棋手（官方图文详解）：每回合稳定提升英雄等级；秘技牌上阵4名英雄后使用',
      verificationNote: IMG_NOTE
    }
  }
]

// ---------------- TALENT（2） ----------------
export const TALENT_ENTITIES = [
  {
    id: 'tal-leshaanhaoshi', slug: 'tal-leshaanhaoshi', displayName: '乐善好施', source: 'IMG',
    facts: {
      effect: '官方图文详解（三分登场流推荐天赋）：登场效果触发时，随机2名三分英雄等级+2',
      verificationNote: IMG_NOTE
    }
  },
  {
    id: 'tal-guashuishangzhen', slug: 'tal-guashuishangzhen', displayName: '挂帅上阵', source: 'IMG',
    facts: {
      effect: '官方图文详解（三分登场流推荐天赋）：挂帅——指定1名三分英雄，其等级等同最近1名三分英雄（用于等级转移）',
      verificationNote: 'AI 辅助转写自官方教学图；两轮提取在细节表述上略有差异，以引用图原件为准（已登记冲突处理记录）'
    }
  }
]

// ---------------- EQUIPMENT（7）/ EFFECT_CARD（1） ----------------
// 官方教学图装备推荐栏以「装备图标+名称」呈现，未附数值文本；
// 实体只登记名称/佩戴者/官方出处，数值留空（未核实不写）。
const EQUIPMENT_ENTITIES = [
  { id: 'equip-chire', slug: 'equip-chire', displayName: '炽热', bearer: 'hero-lvbu' },
  { id: 'equip-wujin', slug: 'equip-wujin', displayName: '无尽', bearer: 'hero-lvbu' },
  { id: 'equip-hongmo', slug: 'equip-hongmo', displayName: '红魔', bearer: 'hero-lvbu' },
  { id: 'equip-jinwei', slug: 'equip-jinwei', displayName: '近卫', bearer: 'hero-caocao' },
  { id: 'equip-yuling', slug: 'equip-yuling', displayName: '御灵', bearer: 'hero-caocao' },
  { id: 'equip-businiao', slug: 'equip-businiao', displayName: '不死鸟', bearer: 'hero-caocao' },
  { id: 'equip-fayuanzhibei', slug: 'equip-fayuanzhibei', displayName: '法源之杯', bearer: 'hero-zhouyu' }
]

const HERO_NAME_BY_ID = Object.fromEntries(HERO_ENTITIES.map(h => [h.id, h.displayName]))

export const EFFECT_CARD_ENTITIES = [
  {
    id: 'effcard-huanshuai', slug: 'effcard-huanshuai', displayName: '换帅', source: 'IMG',
    facts: {
      roleInLineup: '三分登场流关键效果牌（官方阶段指引：商店中遇到换帅可以买2张备着；8-11回合用换帅将孙尚香的等级继承给吕布）',
      purchaseAdvice: '官方：买 2 张备着',
      unknownText: '换帅的完整卡牌效果文本官方新手材料未公布——未核实不写',
      verificationNote: IMG_NOTE
    }
  }
]

export const ALL_ENTITIES = [
  ...HERO_ENTITIES.map(e => ({ ...e, kind: 'HERO' })),
  ...COMMANDER_ENTITIES.map(e => ({ ...e, kind: 'COMMANDER' })),
  ...TALENT_ENTITIES.map(e => ({ ...e, kind: 'TALENT' })),
  ...EQUIPMENT_ENTITIES.map(e => ({
    id: e.id, slug: e.slug, kind: 'EQUIPMENT', displayName: e.displayName, source: 'IMG',
    facts: {
      officialRecommendation: `官方教学图装备推荐（三分登场流）`,
      // 展示层可读：英雄名 + 稳定 ID（事实值保持对实体的稳定引用）
      bearerEntity: `${HERO_NAME_BY_ID[e.bearer]}（${e.bearer}）`,
      stats: null, // 官方图未附数值文本；未核实不写
      verificationNote: IMG_NOTE
    }
  })),
  ...EFFECT_CARD_ENTITIES.map(e => ({ ...e, kind: 'EFFECT_CARD' }))
]
