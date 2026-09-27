import { realMatchHistoryData } from '../mock/match-history'
import { realProPlayersData } from '../mock/pro-players'

export interface SynergyDefinition {
  name: string
  archetype: 'ASSASSIN' | 'ADC' | 'TANK' | 'MAGE' | 'BALANCED_95'
  coreCards: string[] // 公共卡池争抢的关键英雄
  powerspikeRound: 'EARLY_MID' | 'MID_LATE' | 'ULTRA_LATE' // 强势期
}

/**
 * 万象棋主流阵容与核心卡池定义
 */
export const KNOWN_LINEUPS: Record<string, SynergyDefinition> = {
  '九稷下长城射': {
    name: '九稷下长城射',
    archetype: 'BALANCED_95',
    coreCards: ['弈星', '公孙离', '廉颇', '诸葛亮'],
    powerspikeRound: 'ULTRA_LATE'
  },
  '尧天男刺极速切入': {
    name: '尧天男刺极速切入',
    archetype: 'ASSASSIN',
    coreCards: ['裴擒虎', '百里玄策', '李白', '弈星'],
    powerspikeRound: 'MID_LATE'
  },
  '扶桑刺客闪电战': {
    name: '扶桑刺客闪电战',
    archetype: 'ASSASSIN',
    coreCards: ['宫本武藏', '不知火舞', '司空震', '橘右京'],
    powerspikeRound: 'EARLY_MID'
  },
  '坦射玄雍坚韧壁垒': {
    name: '坦射玄雍坚韧壁垒',
    archetype: 'TANK',
    coreCards: ['蒙恬', '庄周', '白起', '项羽'],
    powerspikeRound: 'MID_LATE'
  },
  '尧天纯射极致输出': {
    name: '尧天纯射极致输出',
    archetype: 'ADC',
    coreCards: ['公孙离', '明世隐', '黄忠', '孙尚香'],
    powerspikeRound: 'ULTRA_LATE'
  },
  '稷下群雄元素法': {
    name: '稷下群雄元素法',
    archetype: 'MAGE',
    coreCards: ['诸葛亮', '墨子', '小乔', '王昭君'],
    powerspikeRound: 'MID_LATE'
  }
}

/**
 * 流派之间的食物链相克系数 (Counter Multiplier)
 * 行攻 打 列守：> 1.0 为克制优势，< 1.0 为劣势被克
 */
export const COUNTER_MATRIX: Record<string, Record<string, number>> = {
  ASSASSIN: {
    ADC: 1.35, // 刺客突脸瞬秒脆皮射手主C
    TANK: 0.65, // 刺客切不动高甲重坦反被控死
    MAGE: 1.15, // 刺客打脆皮法师有切入优势
    BALANCED_95: 0.85
  },
  ADC: {
    ASSASSIN: 0.70, // 射手无保命被刺客切死
    TANK: 1.25, // 破军破晓纯射神装融化重坦
    MAGE: 1.05, // 距离拉扯各凭站位
    BALANCED_95: 1.10
  },
  TANK: {
    ASSASSIN: 1.40, // 重装防刺阵地，刺客天敌
    ADC: 0.75, // 面对完全体射手难以近身
    MAGE: 0.70, // 重装魔抗弱，容易被大范围法术蒸发
    BALANCED_95: 0.95
  },
  MAGE: {
    ASSASSIN: 0.85, // 怕刺客跳后排
    ADC: 0.95, // 互相拼爆发
    TANK: 1.35, // 范围法术AOE与诸葛亮斩杀重创坦克
    BALANCED_95: 1.05
  },
  BALANCED_95: {
    ASSASSIN: 1.15, // 9人口质量全面，控制多
    ADC: 0.95,
    TANK: 1.10,
    MAGE: 0.95
  }
}

export interface PlayerContestAnalysis {
  slot: number
  nickname: string
  chosenLineup: string
  archetype: 'ASSASSIN' | 'ADC' | 'TANK' | 'MAGE' | 'BALANCED_95'
  sharedCardPoolWith: string[] // 撞车卡池的对手
  contestStatus: 'EXCLUSIVE' | 'SLIGHT_OVERLAP' | 'SEVERE_CONTEST' // 独家 / 轻微冲突 / 严重内卷
  contestFactor: number // 乘数 (如独家 1.15, 严重内卷 0.78)
  counterAdvantageScore: number // 全局相克攻防得分
  historicalWinRate: number // 历史吃鸡率
  historicalTop3Rate: number // 历史前三率
  powerspikeDesc: string
  analysisSummary: string
}

export interface MatchupDeductionResult {
  probabilities: Record<number, number> // 局内最终推演胜率 (和为 100%)
  contestedAnalysis: PlayerContestAnalysis[]
  overallInsights: string[]
}

/**
 * 核心：万象棋对局机制沙盘推演
 */
export function simulateMatchupMechanics(participants: Array<{
  slot: number
  nickname: string
  rankScore?: number
  commander?: string
}>): MatchupDeductionResult {
  // 1. 匹配选手的打法画像与本局拟选流派
  const playerProfiles = participants.map((p) => {
    const history = realMatchHistoryData[p.nickname]
    const meta = realProPlayersData[p.nickname] || Object.values(realProPlayersData).find(m => m.lastNickname === p.nickname)
    
    // 确定本局偏好阵容
    let chosenLineup = history?.lineupProficiencies[0]?.lineupName || '九稷下长城射'
    if (p.nickname === '抖音刺痛') chosenLineup = '尧天纯射极致输出'
    if (p.nickname === '抖音EZ流儿') chosenLineup = '扶桑刺客闪电战'
    if (p.nickname === 'Asen') chosenLineup = '坦射玄雍坚韧壁垒'
    if (p.nickname === 'DY道无涯') chosenLineup = '稷下群雄元素法'
    if (p.nickname === '抖音一茗') chosenLineup = '尧天男刺极速切入'
    if (p.nickname === '白白白白3') chosenLineup = '九稷下长城射'
    if (p.nickname === 'EZ夜余') chosenLineup = '九稷下长城射'
    if (p.nickname === 'DY校长神Gin') chosenLineup = '尧天男刺极速切入'
    if (p.nickname === '抖音李由多') chosenLineup = '扶桑刺客闪电战'
    if (p.nickname === '抖音EGM皮皮鲨') chosenLineup = '坦射玄雍坚韧壁垒'
    if (p.nickname === '想k益笙菌') chosenLineup = '稷下群雄元素法'
    if (p.nickname === 'B站小优律') chosenLineup = '尧天纯射极致输出'

    const lineupDef = KNOWN_LINEUPS[chosenLineup] || {
      name: chosenLineup,
      archetype: 'BALANCED_95',
      coreCards: ['通用'],
      powerspikeRound: 'MID_LATE'
    }

    return {
      slot: p.slot,
      nickname: p.nickname,
      rankScore: p.rankScore || 10000,
      history,
      meta,
      chosenLineup,
      lineupDef
    }
  })

  // 2. 检测全场公共卡池抢牌与同行撞车内卷 (Contested Card Pool)
  const contestAnalyses: PlayerContestAnalysis[] = playerProfiles.map((curr, _idx, arr) => {
    const sharedWith: string[] = []
    let overlapCardCount = 0

    arr.forEach((other) => {
      if (other.slot === curr.slot) return
      // 计算核心关键卡牌重合度
      const overlap = curr.lineupDef.coreCards.filter(card => other.lineupDef.coreCards.includes(card))
      if (overlap.length > 0) {
        sharedWith.push(`${other.nickname} (抢:${overlap.join(',')})`)
        overlapCardCount += overlap.length
      }
    })

    let contestStatus: 'EXCLUSIVE' | 'SLIGHT_OVERLAP' | 'SEVERE_CONTEST' = 'EXCLUSIVE'
    let contestFactor = 1.15 // 独家红利：无卡池竞争，追三平滑，成型率提升 15%

    if (overlapCardCount >= 2) {
      contestStatus = 'SEVERE_CONTEST'
      contestFactor = 0.80 // 严重内卷：核心卡牌被对手分流，拖慢三星成型节奏，吃鸡率打八折
    } else if (overlapCardCount === 1) {
      contestStatus = 'SLIGHT_OVERLAP'
      contestFactor = 0.92 // 轻度重叠
    }

    // 3. 计算本局流派互啄攻防矩阵 (Comp Counter Matrix)
    let counterAdvantageScore = 1.0
    arr.forEach((other) => {
      if (other.slot === curr.slot) return
      const mult = COUNTER_MATRIX[curr.lineupDef.archetype]?.[other.lineupDef.archetype] || 1.0
      counterAdvantageScore *= mult
    })
    // 归一化相克系数至合理区间 (0.80 ~ 1.25)
    counterAdvantageScore = Math.max(0.80, Math.min(1.25, Math.pow(counterAdvantageScore, 1 / (arr.length - 1))))

    const histWinRate = curr.history?.firstPlaceRate || curr.meta?.winRate || 0.25
    const histTop3Rate = curr.history?.top3Rate || curr.meta?.top3Rate || 0.70

    // 生成生动专业的自走棋推演诊断
    let powerspikeDesc = ''
    let analysisSummary = ''

    if (curr.lineupDef.powerspikeRound === 'EARLY_MID') {
      powerspikeDesc = '前期速攻节奏点，前三保分极稳，大后期大招决战乏力'
    } else if (curr.lineupDef.powerspikeRound === 'ULTRA_LATE') {
      powerspikeDesc = '大后期九五完全体，毁天灭地，但需防范中期血量被压低暴毙'
    } else {
      powerspikeDesc = '攻守平衡，中期提速转阵锁血'
    }

    if (contestStatus === 'SEVERE_CONTEST') {
      analysisSummary = `⚠️【核心卡池撞车】与 ${sharedWith.join('、')} 严重互抢主C核心牌，抽卡内卷严重，成型节奏被大幅拖慢！`
    } else if (contestStatus === 'EXCLUSIVE') {
      analysisSummary = `🌟【独家流派红利】全场独占该体系公共卡池，无同行卡牌，追关键三星极其顺畅，吃鸡上限大增！`
    } else {
      analysisSummary = `⚖️【卡池轻度争抢】存在小幅卡牌交叉，但自身可通过转阵或经济优势平稳过渡。`
    }

    return {
      slot: curr.slot,
      nickname: curr.nickname,
      chosenLineup: curr.chosenLineup,
      archetype: curr.lineupDef.archetype,
      sharedCardPoolWith: sharedWith,
      contestStatus,
      contestFactor,
      counterAdvantageScore,
      historicalWinRate: histWinRate,
      historicalTop3Rate: histTop3Rate,
      powerspikeDesc,
      analysisSummary
    }
  })

  // 4. 综合推演计算登顶实力权值 (Gameplay-driven Win Potential)
  // 权值 = 历史吃鸡登顶基准 × 卡池内卷系数 × 局内克制系数 × (1 + MMR微调)
  const rawPotentials = contestAnalyses.map((item, idx) => {
    const p = playerProfiles[idx]
    const mmrAdjustment = 1.0 + ((p.rankScore - 10000) / 10000) * 0.15 // MMR 仅作为 15% 局势微调，不再是主导因
    const potential = item.historicalWinRate * item.contestFactor * item.counterAdvantageScore * mmrAdjustment
    return Math.max(potential, 0.03)
  })

  // 5. 归一化至 100% 概率
  const totalPotential = rawPotentials.reduce((sum, val) => sum + val, 0)
  const probabilities: Record<number, number> = {}
  let runningSum = 0

  for (let i = 0; i < contestAnalyses.length; i++) {
    const slot = contestAnalyses[i].slot
    if (i === contestAnalyses.length - 1) {
      probabilities[slot] = Number((1.0 - runningSum).toFixed(3))
    } else {
      const prob = Number((rawPotentials[i] / totalPotential).toFixed(3))
      probabilities[slot] = prob
      runningSum += prob
    }
  }

  // 6. 生成全场局势诊断洞察
  const overallInsights: string[] = [
    `【卡池内卷态势】全场尧天/长城体系热度极高，核心弈星与公孙离竞争激烈；独家重坦与法核流派获得极高搜牌自由度。`,
    `【局内食物链】刺客流(EZ流儿)对后排射手产生极大压制，但遭遇全场唯一重装(Asen)防刺阵型反克；大后期完全体九五神装具备终结统治力。`,
    `【吃鸡vs前三博弈】快攻流保前三率虽高达75%，但在终极冠亚决战时吃鸡胜率仅为低概率事件，应优先支持具备大后期上限的正期望选手。`
  ]

  return {
    probabilities,
    contestedAnalysis: contestAnalyses,
    overallInsights
  }
}
