// 深度万象棋局内推演与 EV 决策求解器 (Node.js Watcher Service)
// 彻底摒弃简单分数假设，融合：真实历史对局流水、公共卡池撞车内卷惩罚、流派食物链相克矩阵与赔率精算

export const PLAYER_PROFILES_KNOWLEDGE = {
  '白白白白3': {
    categoryName: '全能控血运营流',
    baseWinRate: 0.35, // 真实历史吃鸡率
    top3Rate: 0.80,
    favoriteLineups: ['九稷下长城射', '尧天射手大核'],
    coreCards: ['弈星', '公孙离', '廉颇', '诸葛亮'],
    archetype: 'BALANCED_95',
    powerspikeDesc: '控血运营天花板，大后期九五阵容锁血吃鸡能力极强'
  },
  '抖音一茗': {
    categoryName: '极致经济九五流',
    baseWinRate: 0.30,
    top3Rate: 0.85,
    favoriteLineups: ['尧天男刺极速切入', '长城守卫射手阵'],
    coreCards: ['裴擒虎', '百里玄策', '李白', '弈星'],
    archetype: 'ASSASSIN',
    powerspikeDesc: '理财拉人口极快，前三率全场最高，但容易与同行在公共卡池争抢核心'
  },
  '抖音EZ流儿': {
    categoryName: '激进刺客快攻流',
    baseWinRate: 0.10, // 吃鸡率低
    top3Rate: 0.75, // 吃烂分率高
    favoriteLineups: ['扶桑刺客闪电战', '长安六刺暴杀流'],
    coreCards: ['宫本武藏', '不知火舞', '司空震', '橘右京'],
    archetype: 'ASSASSIN',
    powerspikeDesc: '6~7人口提速抽卡，前期压制力强保前三，大后期决战吃鸡上限不足'
  },
  'Asen': {
    categoryName: '稳健重装阵地流',
    baseWinRate: 0.20,
    top3Rate: 0.70,
    favoriteLineups: ['坦射玄雍坚韧壁垒', '楚汉争霸重甲坦'],
    coreCards: ['蒙恬', '庄周', '白起', '项羽'],
    archetype: 'TANK',
    powerspikeDesc: '防刺客站位极强，全场独享重坦卡池，但面对大后期完全体输出稍乏力'
  },
  '抖音刺痛': {
    categoryName: '极限大核射手流',
    baseWinRate: 0.25, // 单核吃鸡率高
    top3Rate: 0.55, // 前期容易暴毙
    favoriteLineups: ['尧天纯射极致输出', '长城守卫狙击大阵'],
    coreCards: ['公孙离', '明世隐', '黄忠', '孙尚香'],
    archetype: 'ADC',
    powerspikeDesc: '前职业射手(Hurt)极限走位，成型后毁天灭地，高赔率下具备极佳正期望'
  },
  'DY道无涯': {
    categoryName: '变种法核控制流',
    baseWinRate: 0.15,
    top3Rate: 0.60,
    favoriteLineups: ['稷下群雄元素法', '长安法刺理财流'],
    coreCards: ['诸葛亮', '墨子', '小乔', '王昭君'],
    archetype: 'MAGE',
    powerspikeDesc: '冷门法核破局者，克制物理重装，但畏惧刺客多人口切入'
  }
}

// 流派相克矩阵 (Counter Matrix)
const COUNTER_MATRIX = {
  ASSASSIN: { ADC: 1.35, TANK: 0.65, MAGE: 1.15, BALANCED_95: 0.85 },
  ADC: { ASSASSIN: 0.70, TANK: 1.25, MAGE: 1.05, BALANCED_95: 1.10 },
  TANK: { ASSASSIN: 1.40, ADC: 0.75, MAGE: 0.70, BALANCED_95: 0.95 },
  MAGE: { ASSASSIN: 0.85, ADC: 0.95, TANK: 1.35, BALANCED_95: 1.05 },
  BALANCED_95: { ASSASSIN: 1.15, ADC: 0.95, TANK: 1.10, MAGE: 0.95 }
}

/**
 * 依据自走棋卡池争抢与流派相克，推导 6 人真正登顶概率
 */
export function solveDeepMetaProbabilities(participants) {
  // 1. 分析公共卡池撞车与相克
  const analyses = participants.map((curr, idx, arr) => {
    const meta = PLAYER_PROFILES_KNOWLEDGE[curr.nickname] || {
      categoryName: '常规高分流',
      baseWinRate: 0.20,
      top3Rate: 0.65,
      favoriteLineups: ['通用大核'],
      coreCards: [],
      archetype: 'BALANCED_95',
      powerspikeDesc: '常规打法'
    }

    let overlapCount = 0
    arr.forEach(other => {
      if (other.slot === curr.slot) return
      const otherMeta = PLAYER_PROFILES_KNOWLEDGE[other.nickname]
      if (otherMeta) {
        const overlap = meta.coreCards.filter(c => otherMeta.coreCards.includes(c))
        overlapCount += overlap.length
      }
    })

    let contestFactor = 1.15 // 独家红利
    if (overlapCount >= 2) {
      contestFactor = 0.80 // 严重内卷
    } else if (overlapCount === 1) {
      contestFactor = 0.92
    }

    let counterAdvantage = 1.0
    arr.forEach(other => {
      if (other.slot === curr.slot) return
      const otherMeta = PLAYER_PROFILES_KNOWLEDGE[other.nickname]
      if (otherMeta) {
        counterAdvantage *= COUNTER_MATRIX[meta.archetype]?.[otherMeta.archetype] || 1.0
      }
    })
    counterAdvantage = Math.max(0.80, Math.min(1.25, Math.pow(counterAdvantage, 1 / (arr.length - 1))))

    const mmrAdjustment = 1.0 + (((curr.rankScore || 10000) - 10000) / 10000) * 0.15
    const potential = meta.baseWinRate * contestFactor * counterAdvantage * mmrAdjustment

    return {
      slot: curr.slot,
      potential: Math.max(potential, 0.03),
      meta,
      contestFactor,
      counterAdvantage
    }
  })

  // 2. 归一化为 100% 概率
  const totalPotential = analyses.reduce((s, a) => s + a.potential, 0)
  const probabilities = {}
  let runningSum = 0

  for (let i = 0; i < analyses.length; i++) {
    const slot = analyses[i].slot
    if (i === analyses.length - 1) {
      probabilities[slot] = Number((1.0 - runningSum).toFixed(3))
    } else {
      const prob = Number((analyses[i].potential / totalPotential).toFixed(3))
      probabilities[slot] = prob
      runningSum += prob
    }
  }

  return probabilities
}

/**
 * 依据真实盘面返奖率计算净期望收益 EV 与玩法决策分析
 */
export function solveDeepRecommendations(participants, probabilities, oddsMap = {}) {
  return participants.map((p) => {
    const slot = p.slot
    const prob = probabilities[slot] || 0.167
    const odds = oddsMap[slot] || p.oddsDisplay || 5.0
    const meta = PLAYER_PROFILES_KNOWLEDGE[p.nickname] || {
      categoryName: '常规高分流',
      description: '全服高段位王者对决选手。',
      favoriteLineups: ['通用自走棋大核'],
      commander: '弈星',
      baseWinRate: 0.20,
      top3Rate: 0.65,
      powerspikeDesc: '常规打法'
    }

    const testInvest = 100
    const grossReturn = testInvest * odds
    const netEV = Number((prob * grossReturn - testInvest).toFixed(1))
    const roi = Number(((netEV / testInvest) * 100).toFixed(1))

    let recommendation = 'NEUTRAL'
    let decisionReason = ''

    if (netEV > 15) {
      recommendation = 'STRONG_BUY'
      decisionReason = `【绝对正期望 +${roi}%】真实吃鸡率(${Math.round(meta.baseWinRate * 100)}%)配合${meta.powerspikeDesc}，返奖率(${odds}x)被严重低估！`
    } else if (netEV >= -5 && netEV <= 15) {
      recommendation = 'BUY'
      decisionReason = `【大众焦点但利润摊薄】前三稳率极高(${Math.round(meta.top3Rate * 100)}%)，但跟风人数过多导致返奖率(${odds}x)偏低，利润空间被挤压。`
    } else {
      recommendation = 'AVOID'
      decisionReason = `【负收益陷阱 EV: ${netEV}钻】局内吃鸡期望(${Math.round(prob * 100)}%)无法覆盖高倍率风险，切忌盲目博冷。`
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
      playstyleDesc: meta.powerspikeDesc,
      commander: p.commander || meta.commander,
      favoriteLineups: meta.favoriteLineups
    }
  }).sort((a, b) => b.netEV - a.netEV)
}
