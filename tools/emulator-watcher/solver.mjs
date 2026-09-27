// 深度万象棋实时决策求解器 (Deep Meta & EV Solver)
// 结合选手真实 MMR 段位分 (9000~12000+)、流派克制矩阵与赔率精算

// 选手流派体系与基础特性库
export const PLAYER_PROFILES_KNOWLEDGE = {
  '白白白白3': {
    category: 'BALANCED_MACRO',
    categoryName: '全能控血运营流',
    baseWinRate: 0.385,
    top3Rate: 0.812,
    favoriteLineups: ['九稷下长城射', '尧天射手大核'],
    commander: '弈星',
    description: '全服天花板路人王。控牌细腻，擅长根据发牌灵活转坦射或九五长城，中后期锁血能力极强。'
  },
  '抖音一茗': {
    category: 'OPERATIONAL_95',
    categoryName: '极致经济九五流',
    baseWinRate: 0.362,
    top3Rate: 0.845,
    favoriteLineups: ['尧天男刺极速切入', '长城守卫射手阵'],
    commander: '弈星',
    description: '知名万象主播。极其擅长存钱吃息拉 8/9 人口大羁绊，中后期爆发成型快，大众最狂热追捧选手。'
  },
  '抖音EZ流儿': {
    category: 'AGGRO_ASSASSIN',
    categoryName: '激进刺客快攻流',
    baseWinRate: 0.288,
    top3Rate: 0.720,
    favoriteLineups: ['扶桑刺客闪电战', '长安六刺暴杀流'],
    commander: '司空震',
    description: '前中期提速赌狗流。倾向于 6~7 人口提速抽卡打节奏压制，前期压迫全场血线吃前三极稳。'
  },
  'Asen': {
    category: 'TANK_WALL',
    categoryName: '稳健重装阵地流',
    baseWinRate: 0.265,
    top3Rate: 0.690,
    favoriteLineups: ['坦射玄雍坚韧壁垒', '楚汉争霸重甲坦'],
    commander: '庄周',
    description: '防刺客站位专家。偏好前排高坦度格挡阵容，专门克制刺客冲脸，大后期决胜看对局法伤装备。'
  },
  '抖音刺痛': {
    category: 'HYPER_CARRY_ADC',
    categoryName: '极限大核射手流',
    baseWinRate: 0.310,
    top3Rate: 0.680,
    favoriteLineups: ['尧天纯射极致输出', '长城守卫狙击大阵'],
    commander: '公孙离',
    description: '前职业电竞顶级射手(Hurt)。公孙离/狄仁杰神级走位，成型后大后期毁天灭地，但中期容错率稍低。'
  },
  'DY道无涯': {
    category: 'SPELL_CONTROL',
    categoryName: '变种法核控制流',
    baseWinRate: 0.235,
    top3Rate: 0.640,
    favoriteLineups: ['稷下群雄元素法', '长安法刺理财流'],
    commander: '诸葛亮',
    description: '冷门法系破局者。依靠诸葛亮斩杀与群控法师，擅长针对对手后排打范围法术蒸发。'
  }
}

/**
 * 依据 MMR 段位分与历史战绩，推导 6 人真实相对胜率 (Plackett-Luce 模型)
 */
export function solveDeepMetaProbabilities(participants) {
  // 1. 计算选手的综合实力强度分
  const strengths = participants.map((p) => {
    const meta = PLAYER_PROFILES_KNOWLEDGE[p.nickname]
    // 真实 MMR 分数权重 (基准分 10000 分，每多 100 分产生相对优势)
    const mmr = p.rankScore || 10000
    const mmrScore = (mmr - 9000) / 30 // 11768 分约合 92.2 分，9405 分约合 13.5 分
    
    // 历史登顶率权重
    const winRate = meta ? meta.baseWinRate : (p.winRateRecent || 0.20)
    const winRateScore = winRate * 200 // 38.5% 胜率约合 77 分

    return Math.max(mmrScore * 0.55 + winRateScore * 0.45, 10)
  })

  // 2. Softmax 归一化 (使用适度温度系数 T = 28)
  const temperature = 28.0
  const expScores = strengths.map((s) => Math.exp(s / temperature))
  const totalExp = expScores.reduce((a, b) => a + b, 0)

  const probabilities = {}
  let runningSum = 0

  for (let i = 0; i < participants.length; i++) {
    const slot = participants[i].slot || i + 1
    if (i === participants.length - 1) {
      probabilities[slot] = Number((1.0 - runningSum).toFixed(3))
    } else {
      const prob = Number((expScores[i] / totalExp).toFixed(3))
      probabilities[slot] = prob
      runningSum += prob
    }
  }

  return probabilities
}

/**
 * 依据真实盘面返奖率计算净期望收益 EV 与决策分析
 */
export function solveDeepRecommendations(participants, probabilities, oddsMap = {}) {
  return participants.map((p) => {
    const slot = p.slot
    const prob = probabilities[slot] || 0.167
    const odds = oddsMap[slot] || p.oddsDisplay || 5.0
    const meta = PLAYER_PROFILES_KNOWLEDGE[p.nickname] || {
      categoryName: '常规高分选手',
      description: '全服高段位王者对决选手。',
      favoriteLineups: ['通用自走棋大核'],
      commander: '弈星'
    }

    // 假设 100 钻石单注进行 EV 测算
    const testInvest = 100
    const grossReturn = testInvest * odds
    const netEV = Number((prob * grossReturn - testInvest).toFixed(1))
    const roi = Number(((netEV / testInvest) * 100).toFixed(1))

    let recommendation = 'NEUTRAL'
    let decisionReason = ''

    if (netEV > 10) {
      recommendation = 'STRONG_BUY'
      decisionReason = `【绝对正期望 +${roi}%】全场最高段位分(${p.rankScore})，胜率顶尖，但盘面返奖率(${odds}x)被严重低估！`
    } else if (netEV >= -5 && netEV <= 10) {
      recommendation = 'BUY'
      decisionReason = `【大众焦点但赔率压低】胜率极高，但过多玩家涌入导致返奖率(${odds}x)过低，实际利润空间被摊薄。`
    } else {
      recommendation = 'AVOID'
      decisionReason = `【高危陷阱 EV: ${netEV}钻】胜率(${Math.round(prob * 100)}%)无法覆盖高倍率风险，长期下注期望值大幅亏损。`
    }

    return {
      slot,
      nickname: p.nickname,
      rankText: p.rankText,
      rankScore: p.rankScore,
      supportCount: p.supportCount || 0,
      odds,
      probability: prob,
      netEV,
      roi,
      recommendation,
      decisionReason,
      playstyle: meta.categoryName,
      playstyleDesc: meta.description,
      commander: meta.commander,
      favoriteLineups: meta.favoriteLineups
    }
  }).sort((a, b) => b.netEV - a.netEV)
}
