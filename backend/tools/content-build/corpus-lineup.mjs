// v6 M3-3 · 第一套阵容手册：三分登场流（官方入门阵容教学 1/5）
//
// 事实来源（全部官方）：
//  - 官网新手指引页（RAW 存证）：阵容名「三分登场流」、核心英雄「吕布」
//  - 官方教学图 guide_1_2.jpg（一图速览）：阵容逻辑/装备/棋手/天赋/替补
//  - 官方教学图 guide_1_3.jpg（图文详解）：回合阶段操作/觉醒/换帅链/决赛容错
// 站位处理：两图均以棋盘头像呈现站位、无文字行列标注 → 具体到人的站位
// 「未核实」，如实登记（见 positioning.verification 与 conflictLog）。
// 编辑性内容（决策原则）与官方原文分列标注，不冒充官方口径。

export const LINEUP = {
  id: 'lu-sanfen-dengchang',
  slug: 'sanfen-dengchang',
  displayName: '三分登场流',
  oneLineSummary: '官方新手入门阵容①：曹操整备触发三分英雄登场，带动全场等级成长',
  difficulty: 'LOW',
  commanderEntityId: 'cmd-baige',
  newbieFitRationale: '低难度理由（编辑依据官方材料归纳）：① 操作主线单一——按官方阶段指引「找框架→觉醒→换帅继承→补上限」即可，无复杂多线决策；② 核心链路由曹操/蔡文姬/小乔的自动触发效果驱动（整备/登场），不依赖精确手速或时机；③ 替补弹性明确——官方实战技巧给出甄姬/阿轲等三分或登场类替补，缺核心不至于崩盘；④ 官网将其列为五套「入门阵容」之首并配套新手教学。注：这是操作负担与替补弹性判断，不是胜率评价（本站无胜率数据）。',
  components: [
    // 官方标注的阵容构成与角色（图文详解：核心C位/核心坦克/核心功能）
    { entityId: 'hero-lvbu', role: 'CORE_OUTPUT', necessity: 'REQUIRED', notes: { officialLabel: '核心C位', equipment: ['炽热', '无尽', '红魔'] } },
    { entityId: 'hero-caocao', role: 'FRONTLINE', necessity: 'REQUIRED', notes: { officialLabel: '核心坦克', equipment: ['近卫', '御灵', '不死鸟'], engine: '整备触发器：回合开始时触发效果，带动三分英雄登场' } },
    { entityId: 'hero-caiwenji', role: 'GROWTH_ENGINE', necessity: 'REQUIRED', notes: { officialLabel: '核心功能', engine: '三分英雄上场时提供等级加成' } },
    { entityId: 'hero-xiaoqiao', role: 'GROWTH_ENGINE', necessity: 'PREFERRED', notes: { engine: '己方英雄触发登场效果时，进一步提升多名三分英雄等级' } },
    { entityId: 'hero-zhaoyun', role: 'FRONTLINE', necessity: 'PREFERRED', notes: { stage: '1-3回合基础框架' } },
    { entityId: 'hero-diaochan', role: 'PROTECTION', necessity: 'PREFERRED', notes: { stage: '4-7回合补齐' } },
    { entityId: 'hero-zhouyu', role: 'CONTROL', necessity: 'PREFERRED', notes: { stage: '8-11回合寻找，接替孙尚香位置' } },
    // 过渡与替补（官方阶段指引/实战技巧）
    { entityId: 'hero-sunshangxiang', role: 'TRANSITION', necessity: 'PREFERRED', notes: { stage: '1-3回合过渡核心；8-11回合经换帅把等级继承给吕布后出售' } },
    { entityId: 'hero-yixing', role: 'TRANSITION', necessity: 'OPTIONAL', notes: { stage: '1-3回合无孙尚香时过渡' } },
    { entityId: 'hero-niumo', role: 'TRANSITION', necessity: 'OPTIONAL', notes: { stage: '1-3回合无孙尚香时过渡' } },
    { entityId: 'hero-zhenji', role: 'SUBSTITUTE', necessity: 'OPTIONAL', notes: { substituteFor: ['hero-zhaoyun', 'hero-diaochan', 'hero-zhouyu'], officialNote: '未找到赵云、貂蝉、周瑜时可用三分或登场类英雄上阵' } },
    { entityId: 'hero-ake', role: 'SUBSTITUTE', necessity: 'OPTIONAL', notes: { substituteFor: ['hero-zhaoyun', 'hero-diaochan', 'hero-zhouyu'], officialNote: '未找到赵云、貂蝉、周瑜时可用三分或登场类英雄上阵' } },
    { entityId: 'hero-taiyizhenren', role: 'LATE_CEILING', necessity: 'OPTIONAL', notes: { officialNote: '12回合后决赛局卖赵云换太乙真人，复活吕布（容错）' } }
  ],
  sections: {
    playConditions: {
      prefer: [
        '开局能较早拿到孙尚香，或 1-3 回合内出现弈星/牛魔可过渡（官方阶段指引的开局形态）',
        '1-3 回合能集齐蔡文姬、曹操、赵云基础框架（官方：先搭出三分登场流的基础框架）'
      ],
      consider: [
        '蔡文姬/曹操 框架缺一张时：可先用三分或登场类英雄（甄姬、阿轲等）顶位，边打边找（官方实战技巧）',
        '中期（4-7回合）曹操、蔡文姬未觉醒：仍可继续找牌觉醒，不必弃阵（官方阶段指引将该动作列在此阶段）'
      ],
      abandon: [
        '官方材料未给出明确弃阵条件——本站不虚构血量/回合阈值；编辑建议（非官方）：若 8-11 回合后框架核心（曹操/蔡文姬）仍大面积缺席且血量告急，参考替补机制转三分/登场类通用牌稳血，具体界限需玩家结合对局判断'
      ],
      commanderNote: '官方图文详解推荐棋手：白歌（首选，合成获取复制）、马可（打出4张3阶以下英雄牌获得宝藏牌）、常小娥（每回合稳定提升英雄等级；秘技牌上阵4名英雄后使用）',
      dependency: '关键依赖：曹操（整备触发器）与蔡文姬（等级加成）构成引擎；吕布为后期上限。对特定天赋/装备无硬依赖（官方装备推荐为建议项）',
      campBanNote: '禁用阵营处理：官方新手材料未说明禁用机制——未核实内容不写。若对局存在阵营禁用且「三分」被禁，本阵容不适用（该推断为编辑建议，非官方口径）'
    },
    structureLevels: {
      minimal: ['曹操', '蔡文姬', '赵云', '+过渡牌（孙尚香/弈星/牛魔）'],
      mid: ['曹操(觉醒)', '蔡文姬(觉醒)', '赵云', '貂蝉', '小乔', '孙尚香(等级载体)'],
      full: ['吕布', '周瑜', '曹操(觉醒)', '蔡文姬(觉醒)', '貂蝉', '小乔', '+决赛容错：太乙真人']
    },
    stages: [
      {
        stage: '开局（官方：1-3回合）',
        goal: '搭出三分登场流的基础框架（官方原文目标）',
        actions: [
          '优先找到孙尚香；没有就先用弈星或牛魔过渡（官方）',
          '第2回合升到2级（官方）',
          '优先找蔡文姬、曹操、赵云，先搭出三分登场流的基础框架（官方）'
        ],
        budget: '官方未公布各回合能量数值；按通用规则「英雄牌固定3能量、每回合固定获得能量且可累积」安排买牌（规则条目 rule-energy-income / rule-energy-spend）',
        branches: {
          '孙尚香来了': '作为过渡核心上场，等级由其携带，后期经换帅继承给吕布（官方）',
          '孙尚香没来': '用弈星或牛魔过渡，不影响找框架牌（官方）'
        },
        successSignal: '3回合结束时框架三件套（蔡文姬/曹操/赵云）有眉目、场上不断档（编辑归纳：官方阶段的隐含目标是不空场）'
      },
      {
        stage: '中期（官方：4-7回合）',
        goal: '补齐框架并觉醒核心（官方原文目标）',
        actions: [
          '继续补齐蔡文姬、曹操、赵云和貂蝉（官方）',
          '核心牌到位后升到3级（官方）',
          '优先觉醒曹操和蔡文姬（官方）',
          '商店中遇到效果牌「换帅」可以买2张备着（官方）',
          '升4级找小乔（官方）'
        ],
        budget: '官方未公布数值；换帅按官方建议买2张备着（效果牌消耗能量在卡牌右上角查看）',
        branches: {
          '赵云/貂蝉/周瑜未到': '用三分或登场类英雄牌上阵（甄姬、阿轲等，官方实战技巧）',
          '换帅已备': '留到8-11回合执行孙尚香→吕布等级继承，不要提前用掉（官方用途）'
        },
        successSignal: '曹操、蔡文姬觉醒完成，貂蝉到位，换帅在手（官方阶段目标达成）'
      },
      {
        stage: '成型（官方：8-11回合）',
        goal: '升5级，找到吕布和周瑜，完成等级继承（官方原文目标）',
        actions: [
          '尽快将棋手等级提升至5级（官方）',
          '寻找吕布和周瑜（官方）',
          '找到吕布后先上场吕布（官方）',
          '用换帅效果牌将孙尚香的等级继承给吕布（官方）',
          '再卖掉孙尚香上阵周瑜（官方）'
        ],
        budget: '官方未公布数值；5级是官方明示的等级节点',
        branches: {
          '吕布先到': '先上场吕布，等换帅执行继承（官方顺序）',
          '吕布迟迟不来': '保持框架运转，用三分/登场类替补维持战力（官方实战技巧）；复盘案例见情境 scn-sanfen-no-lvbu',
          '周瑜未到': '孙尚香继承完成后先保留其位置给周瑜，暂用替补（编辑归纳官方替补条款）'
        },
        successSignal: '吕布携带继承等级上场、周瑜就位（官方阶段目标达成）'
      },
      {
        stage: '后期（官方：12回合后）',
        goal: '决赛容错（官方原文目标）',
        actions: [
          '决赛局可以卖赵云换太乙真人，复活吕布（官方）'
        ],
        budget: '官方未公布数值',
        branches: {
          '决赛圈': '卖赵云换太乙真人，用复活容错保吕布输出（官方）',
          '非决赛局': '维持现有阵容，无需换太乙真人（编辑归纳：官方将该操作限定在决赛局）'
        },
        successSignal: '决赛对局中吕布阵亡后可被复活续战（官方容错达成）'
      }
    ],
    stabilization: {
      missingCore: {
        situation: '吕布迟迟不来（核心上限缺位）',
        officialAction: '8-11回合保持框架与5级，缺赵云/貂蝉/周瑜时用甄姬、阿轲等三分或登场类英雄上阵（官方实战技巧）',
        editorialNote: '官方未给血量止损阈值——本站不虚构；血量告急时的通用止损逻辑见课程 D（编辑内容，标注非官方）'
      },
      missingFrontline: {
        situation: '前排不足',
        officialAction: '官方框架中曹操为核心坦克；其装备推荐（近卫/御灵/不死鸟）为官方标注的坦度方向',
        editorialNote: '官方未写「前排不足」专项分支——如实登记为官方未覆盖，可参考过渡牌顶位（编辑建议）'
      },
      missingEquipment: {
        situation: '关键装备不来',
        officialAction: '官方装备推荐为建议项（吕布：炽热/无尽/红魔；曹操：近卫/御灵/不死鸟），未设必需装备门槛',
        editorialNote: '装备获取机制官方新手材料未展开——未核实内容不写'
      }
    },
    skillChains: [
      {
        name: '整备→登场 成长主链（官方阵容逻辑原文归纳）',
        precondition: '曹操在场（整备词条：回合开始时触发效果）',
        steps: [
          { step: '回合开始', action: '曹操整备效果触发', effect: '稳定触发三分英雄的登场效果（官方原文）' },
          { step: '登场触发', action: '三分英雄登场效果生效', effect: '带动阵容等级成长（官方原文）' },
          { step: '联动加成', action: '蔡文姬在三分英雄上场时提供等级加成；小乔在登场效果触发时进一步提升多名三分英雄等级（官方原文）' }
        ],
        payoff: '全场等级滚雪球（官方：带动阵容等级成长）',
        interruption: '曹操不在场或整备未触发时链条中断——官方未说明中断补偿，未核实不写'
      },
      {
        name: '换帅等级继承链（官方阶段操作）',
        precondition: '孙尚香在场且已积累等级；持有换帅效果牌（官方建议4-7回合买2张备着）；吕布已找到',
        steps: [
          { step: '8-11回合', action: '先上场吕布', effect: '吕布就位等待继承（官方顺序）' },
          { step: '继承', action: '用换帅将孙尚香的等级继承给吕布', effect: '吕布直接获得孙尚香积累的等级（官方）' },
          { step: '腾位', action: '卖掉孙尚香，上阵周瑜', effect: '完成完全体构成（官方）' }
        ],
        payoff: '核心C位跳过练级时间获得高等级（官方设计意图）',
        interruption: '吕布未到时换帅不可提前消耗（官方将其列在8-11回合动作）；换帅效果牌的完整规则文本官方新手材料未公布——未核实不写'
      }
    ],
    positioning: {
      officialBoard: {
        guideImage: 'https://game.gtimg.cn/images/osgame/cp/a202609xszy/guide_1_3.jpg',
        description: '官方图文详解以棋盘图示给出7人站位（后排3人、中排3人、前排1人的格子布局），并以文字标注角色：吕布=核心C位、曹操=核心坦克、蔡文姬=核心功能'
      },
      verifiedFacts: [
        '吕布：核心C位（官方文字标注）',
        '曹操：核心坦克（官方文字标注）',
        '蔡文姬：核心功能（官方文字标注）',
        '官方图示站位为 3 后排 / 3 中排 / 1 前排 的格子分布（图内呈现）'
      ],
      unverified: '具体到每名英雄的行列坐标：官方图以头像位置呈现且无文字行列标注，图像辨识度不足以逐格转写——按「不伪造」铁律登记为未核实，以官方图原件为准（可按 guideImage 链接人工复核）',
      variantNote: '针对站位变化：官方新手材料未提供——如实登记为未覆盖',
      conflictLog: '构建期间两轮独立视觉提取曾得到两种不同的前排归属读数；定向复核确认图内无文字站位标注、先前读数系对头像的推断而非原文。处理：采用「官方图示布局+文字角色标注」为已核实事实，逐格坐标整体登记未核实。'
    },
    substitutes: [
      {
        who: '甄姬 / 阿轲（三分或登场类英雄）',
        replaces: '赵云 / 貂蝉 / 周瑜',
        officialNote: '官方实战技巧：未找到赵云、貂蝉、周瑜时，也可以用三分或者登场类英雄牌上阵，如甄姬、阿轲等',
        cost: '损失的具体联动官方未逐项说明——如实登记；从阵容逻辑看等级成长链（整备→登场）仍可运转（编辑归纳，非官方）',
        when: '对应成员未到位的任一阶段'
      },
      {
        who: '太乙真人',
        replaces: '赵云（决赛局）',
        officialNote: '官方阶段指引：12回合后决赛局可以卖赵云换太乙真人，复活吕布',
        cost: '减少一名框架成员，换取吕布的复活容错（官方意图）',
        when: '12回合后的决赛局'
      },
      {
        who: '弈星 / 牛魔',
        replaces: '孙尚香（开局过渡位）',
        officialNote: '官方阶段指引：优先找到孙尚香，没有就先用弈星或牛魔过渡',
        cost: '孙尚香作为等级载体的积累会打折（编辑归纳：继承链依赖孙尚香等级），过渡牌练级收益较低',
        when: '1-3回合孙尚香未出现时'
      }
    ],
    practiceCases: {
      scenarios: [
        { id: 'scn-early-no-sunshangxiang', title: '第3回合还没有孙尚香（教学情境）' },
        { id: 'scn-sanfen-no-lvbu', title: '8-11回合吕布迟迟不来（教学情境）' }
      ],
      officialVideos: [
        {
          title: '白歌三分倒转！全员999强力阵容', presenter: '西君',
          note: '官网新手指引·大神教学栏目在列视频；标题与主讲人转写自官网文字，视频内容本站未核验——仅作官方栏目出处登记，不作为事实依据'
        }
      ],
      reviewCases: '带成功与失败的完整复盘 ≥2 套为 M4 交付项（任务书 §10-4）；M3 首批以教学情境 2 例覆盖失败分支（缺孙尚香/缺吕布），如实登记缺口'
    }
  }
}
