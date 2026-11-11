// 王牌对决选手同场克制关系 (Head-to-Head)、禁用阵营 (Ban) 与最新游戏版本更迭 (Version Meta) 综合博弈分析引擎
import { getMasterPlayerName } from './player-grouping'

export const CURRENT_LATEST_VERSION = 'v1.9.1'

export interface GameVersionMeta {
  version: string
  effectiveDate: string
  isLatest: boolean
  title: string
  summary: string
  keyChanges: string[]
  lineupImpact: string
  buffedBuilds: string[]
  nerfedBuilds: string[]
}

export const GAME_VERSIONS: GameVersionMeta[] = [
  {
    version: 'v1.9.1',
    effectiveDate: '2026-11-05',
    isLatest: true,
    title: 'v1.9.1 (11月5日 - 官方当前最新版本)',
    summary: '新棋手武凤登场，嬴律复制英雄机制颠覆单核追三，乔汐转瞬3-5阶与潮汐4次大强化，安琪拉法攻125%飞跃',
    keyChanges: [
      '新棋手「武凤」（11/06）：偷取敌方秘技牌机制打破单棋手套路上限',
      '棋手「嬴律」并购红利：合成上限后每回合额外随机获得1张场上英雄复制（极大加速高阶单核追三星）',
      '棋手「乔汐」温柔呼唤：抽取范围收窄为3~5阶转瞬牌；潮汐交响初始触发提升至4次(+20等级)',
      '棋手「安琪拉」打扫战场：飞行器继承法攻提至125%、攻速提至30%（雷霆战机法爆体系大火）',
      '天赋「乘胜追击」优化为回合开始拿战术，胜利拿高阶战术'
    ],
    lineupImpact: '高阶单核追三（逐鹿蒙恬、日落海倒转、长城高费）受嬴律复制机制利好上限激增；雷霆战机与法爆机甲大幅增强；乔汐转瞬中高阶快攻成型更快；三分领袖持续受益。',
    buffedBuilds: ['逐鹿蒙恬', '日落海倒转', '雷霆战机', '三分登场', '三分倒转'],
    nerfedBuilds: []
  },
  {
    version: 'v1.8.1',
    effectiveDate: '2026-10-29',
    isLatest: false,
    title: 'v1.8.1 (10月29日更新)',
    summary: '三分领袖治疗30%升至40%引爆三分潮，乔汐重做，阿离/孙尚香手感优化，新增帝临/勇冠三军',
    keyChanges: [
      '天赋「三分领袖」治疗由30%大幅提升至40%（三分体系大爆发）',
      '新增天赋「帝临」（嬴政+武则天）、「勇冠三军」（马超全队法爆）',
      '乔汐潮汐交响重做、阿离红叶染锋等级保留、孙尚香炮击手感优化'
    ],
    lineupImpact: '三分阵营全面崛起，「三分登场」、「三分倒转」与「养猪三分」胜率飙升，成为主流赛场核心体系。',
    buffedBuilds: ['三分登场', '三分倒转', '传统养猪'],
    nerfedBuilds: []
  },
  {
    version: 'v1.7.1',
    effectiveDate: '2026-10-22',
    isLatest: false,
    title: 'v1.7.1 (10月22日更新)',
    summary: '安琪拉、班叔、昭君、马可数值调整，限制性进化/光棱塔优化',
    keyChanges: [
      '安琪拉、班叔、昭君、马可技能数值平衡',
      '天赋限制性进化、光棱塔机制优化'
    ],
    lineupImpact: '机关与长城过渡增强，法系阵容梯度分化。',
    buffedBuilds: ['河洛木兰'],
    nerfedBuilds: []
  },
  {
    version: 'v1.6.1',
    effectiveDate: '2026-10-15',
    isLatest: false,
    title: 'v1.6.1 (10月15日更新)',
    summary: '王牌对决选人改为门槛随机6人，支持上限由5万降为1万钻石，蒙犽优化',
    keyChanges: [
      '王牌对决支持上限调整为10000钻石',
      '王牌对决改为门槛随机6人选拔机制',
      '蒙犽弹道优化'
    ],
    lineupImpact: '王牌赛事规则重构，支持上限规范化。',
    buffedBuilds: [],
    nerfedBuilds: []
  },
  {
    version: 'v1.5.1',
    effectiveDate: '2026-10-08',
    isLatest: false,
    title: 'v1.5.1 (10月8日版本更迭)',
    summary: '明先生微调、蔡文姬毒奶削弱，早期支持上限5万',
    keyChanges: [
      '明先生微调、蔡文姬毒奶削弱',
      '王牌对决早期每人支持上限50000钻石'
    ],
    lineupImpact: '早期纯续航养猪体系受到抑制。',
    buffedBuilds: [],
    nerfedBuilds: ['传统养猪']
  }
]

export function getVersionByDate(dateStr: string): GameVersionMeta {
  if (!dateStr) return GAME_VERSIONS[0]
  const clean = dateStr.slice(0, 10)
  for (const v of GAME_VERSIONS) {
    if (clean >= v.effectiveDate) {
      return v
    }
  }
  return GAME_VERSIONS[GAME_VERSIONS.length - 1]
}

export interface VersionLineupAdaptation {
  version: string
  isLatest: boolean
  fitLevel: 'BUFFED' | 'STABLE' | 'OUTDATED'
  fitLabel: string
  summary: string
  bonus: number // 战力增益 (-0.1 ~ +0.15)
  details: string[]
}

export function evaluateVersionLineupAdaptation(
  playerCommonBuilds: string[],
  targetVersion: string = CURRENT_LATEST_VERSION
): VersionLineupAdaptation {
  const ver = GAME_VERSIONS.find(v => v.version === targetVersion) || GAME_VERSIONS[0]
  const buildsStr = playerCommonBuilds.join(' ')
  
  let fitLevel: 'BUFFED' | 'STABLE' | 'OUTDATED' = 'STABLE'
  let bonus = 0
  const details: string[] = []

  if (ver.version === 'v1.9.1') {
    if (buildsStr.includes('逐鹿') || buildsStr.includes('蒙恬')) {
      fitLevel = 'BUFFED'
      bonus += 0.08
      details.push('嬴律「并购红利」额外复制场上英雄，逐鹿蒙恬追三星上限质变')
    }
    if (buildsStr.includes('雷霆') || buildsStr.includes('战机')) {
      fitLevel = 'BUFFED'
      bonus += 0.09
      details.push('安琪拉飞行器法攻继承提升至125%、攻速30%，雷霆机甲爆发大幅增强')
    }
    if (buildsStr.includes('日落海') || buildsStr.includes('倒转')) {
      fitLevel = 'BUFFED'
      bonus += 0.06
      details.push('倒转追梦体系受嬴律复制机制利好，成型速度大幅提升')
    }
    if (buildsStr.includes('三分')) {
      fitLevel = 'BUFFED'
      bonus += 0.05
      details.push('持续享受 v1.8.1「三分领袖」40% 治疗加成，赛场高胜率常客')
    }
  } else if (ver.version < 'v1.8.1' && buildsStr.includes('三分')) {
    fitLevel = 'OUTDATED'
    bonus -= 0.05
    details.push('该历史版本尚未实装三分领袖 40% 治疗加成，阵容强度受限')
  }

  const fitLabel = fitLevel === 'BUFFED' ? '版本红利' : (fitLevel === 'OUTDATED' ? '版本滞后' : '版本平稳')
  const summary = details.length
    ? details.join('；')
    : `在 ${ver.version} 版本下阵容环境平稳，无剧烈版本震荡`

  return {
    version: ver.version,
    isLatest: ver.isLatest,
    fitLevel,
    fitLabel,
    summary,
    bonus: Number(bonus.toFixed(3)),
    details
  }
}

export type FactionType = '三分' | '逐鹿' | '日落海' | '河洛' | '大河' | '通用/其他'

export type BanImpactLevel = 'CRITICAL' | 'MODERATE' | 'IMMUNE' | 'BENEFITED'

export interface CommanderMeta {
  name: string
  aliases: string[]
  title: string
  tier: 'T0' | 'T1' | 'T2'
  mechanism: string // 棋手核心机制说明
  v191Bonus: number // 版本机制强度增益
  synergizedPlaystyles: string[] // 该棋手机制能显著强化的流派关键词（如 '蒙恬', '坦射', '机甲', '倒转', '养猪' 等）
}

/** 官方完整 21 位万象棋棋手库与当前版本机制定义 */
export const OFFICIAL_COMMANDERS: readonly CommanderMeta[] = [
  // --- T0 梯队 (当前 v1.9.1 版本三巨头) ---
  {
    name: '嬴律',
    aliases: ['嬴律'],
    title: '并购红利 / 单核追三特权',
    tier: 'T0',
    mechanism: '合成上限后每回合额外随机复制场上英雄，极大加速单核追三星，大幅拔高单核阵容上限',
    v191Bonus: 0.18,
    synergizedPlaystyles: ['逐鹿蒙恬', '稷下坦射', '坦射', '传统养猪', '日落海倒转', '蒙恬']
  },
  {
    name: '安琪拉',
    aliases: [],
    title: '打扫战场 / 法爆狂潮',
    tier: 'T0',
    mechanism: 'v1.9.1官方大加强：飞行器继承法攻提至125%、攻速30%，引爆法术爆发与机甲狂潮',
    v191Bonus: 0.16,
    synergizedPlaystyles: ['雷霆战机', '雷霆机甲', '稷下雷霆', '法天象地', '五法', '法系']
  },
  {
    name: '玉环',
    aliases: ['玉环'],
    title: '霓裳羽衣 / 刷牌登顶第一',
    tier: 'T0',
    mechanism: '霓裳曲刷牌神技，每打出非觉醒牌触发连击增益，高分段登顶率榜首，单核快速成型',
    v191Bonus: 0.16,
    synergizedPlaystyles: ['日落海倒转', '日落海整备', '快攻', '核心C位', '倒转']
  },

  // --- T1 梯队 (强势热门与机制专精) ---
  {
    name: '乔汐',
    aliases: ['乔汐'],
    title: '温柔呼唤 / 潮汐交响',
    tier: 'T1',
    mechanism: 'v1.9.1转瞬抽取收窄至3~5阶高质牌，潮汐交响初始4次，法系倒转与转瞬快攻成型神速',
    v191Bonus: 0.12,
    synergizedPlaystyles: ['日落海倒转', '三分倒转', '倒转', '法天象地']
  },
  {
    name: '武凤',
    aliases: ['武凤'],
    title: '偷取秘技 / 全能博弈',
    tier: 'T1',
    mechanism: '11月6日新棋手登场：偷取敌方秘技牌打破单套路上限，万鸟朝凤博弈对抗性极强',
    v191Bonus: 0.11,
    synergizedPlaystyles: ['全能', '对抗', '变阵', '逐鹿蒙恬', '三分登场']
  },
  {
    name: '庄小鱼',
    aliases: ['庄小鱼'],
    title: '梦蝶逍遥 / 免控护体',
    tier: 'T1',
    mechanism: '灵感馈赠升级获效果牌，梦境商店逆风翻盘，全队免控坦度极大保障养猪与坦克核心',
    v191Bonus: 0.10,
    synergizedPlaystyles: ['传统养猪', '稷下坦克', '养猪', '坦射', '肉装保核']
  },
  {
    name: '孙小宾',
    aliases: ['孙小宾'],
    title: '时光倒流 / 牌序回溯',
    tier: 'T1',
    mechanism: '时光倒流可回溯上一回合使用过的手牌，对牌序和高频过牌流派形成极致助力',
    v191Bonus: 0.10,
    synergizedPlaystyles: ['三分倒转', '高速过牌', '连击', '日落海倒转', '倒转']
  },
  {
    name: '阿离',
    aliases: ['阿离'],
    title: '红叶染锋 / 灵动连击',
    tier: 'T1',
    mechanism: '红叶染锋等级保留机制，高机动位移与持续输出，强化敏捷射手与尧天机动体系',
    v191Bonus: 0.09,
    synergizedPlaystyles: ['射手', '尧天', '机动突进', '伞半月']
  },
  {
    name: '白歌',
    aliases: ['白歌'],
    title: '即兴创作 / 复制成星',
    tier: 'T1',
    mechanism: '每4次英雄合成获得即兴创作随机复制场上英雄，追求阵容星级质变与刺客高爆发',
    v191Bonus: 0.09,
    synergizedPlaystyles: ['刺客', '高密度合成', '星级追梦', '六影扶桑']
  },
  {
    name: '马可',
    aliases: ['马可', '马可专精'],
    title: '漫游疾射 / 灵动开团',
    tier: 'T1',
    mechanism: '高频真实伤害弹幕与游击位移，强化射手阵容开团火力与穿透输出',
    v191Bonus: 0.09,
    synergizedPlaystyles: ['稷下坦射', '大河开团射', '坦射', '射手']
  },
  {
    name: '昭君',
    aliases: ['王昭君'],
    title: '寒霜转化 / 升阶继承',
    tier: 'T1',
    mechanism: '寒霜转化指定冻结英雄，战斗后高阶升阶并继承等级，利好高费卡提早成型',
    v191Bonus: 0.09,
    synergizedPlaystyles: ['高费卡', '法天象地', '大河开团射', '跳费']
  },
  {
    name: '镜',
    aliases: [],
    title: '无穷镜像 / 镜像复刻',
    tier: 'T1',
    mechanism: '产出铜像自动复刻上一张英雄卡，万镜状态爆发，专精双核与刺客镜像复制',
    v191Bonus: 0.09,
    synergizedPlaystyles: ['刺客', '双核', '镜猪', '镜像复刻']
  },

  // --- T2 梯队 (稳健过渡与特色功能) ---
  {
    name: '明先生',
    aliases: ['明先生'],
    title: '卦象变幻 / 丰节调控',
    tier: 'T2',
    mechanism: '在丰与节两类卦象间动态切换，灵活调控经济与卡牌熟悉度，适合慢速大核',
    v191Bonus: 0.07,
    synergizedPlaystyles: ['河洛木兰', '慢速大核', '长安九五', '养猪']
  },
  {
    name: '小妲己',
    aliases: ['小妲己'],
    title: '怦然心动 / 万能保底',
    tier: 'T2',
    mechanism: '每买4张牌赠送随机效果牌，操作简单无门槛，经济与战力平稳保底',
    v191Bonus: 0.07,
    synergizedPlaystyles: ['通用', '长安九五', '传统养猪', '逐鹿蒙恬']
  },
  {
    name: '香香',
    aliases: ['香香'],
    title: '武器协同 / 重炮轰炸',
    tier: 'T2',
    mechanism: '战斗开局武器协同攻击，初始攻击力随低阶高等级英雄暴增，物理暴击压制',
    v191Bonus: 0.07,
    synergizedPlaystyles: ['三分登场', '暴击射手', '物理重炮']
  },
  {
    name: '瑶妹',
    aliases: ['瑶妹'],
    title: '小鹿庇护 / 稳健防守',
    tier: 'T2',
    mechanism: '开局为随机友方提供随棋手等级成长的护盾，小鹿属性成长，辅助保核防守',
    v191Bonus: 0.06,
    synergizedPlaystyles: ['防守保核', '辅助', '稳健过渡']
  },
  {
    name: '班叔',
    aliases: ['鲁班大师'],
    title: '便携机关 / 阵地布防',
    tier: 'T2',
    mechanism: '随等级解锁热能陷阱（真伤眩晕）与电磁弹簧（弹至后排），擅长阵地防御',
    v191Bonus: 0.06,
    synergizedPlaystyles: ['稷下坦射', '机关布防', '防刺客']
  },
  {
    name: '姜导',
    aliases: ['姜导'],
    title: '主角加冕 / 单核升级',
    tier: 'T2',
    mechanism: '主角加冕指定单核英雄，通过出牌快速为其提升等级与属性，极限养大哥',
    v191Bonus: 0.06,
    synergizedPlaystyles: ['单核', '封神单大哥', '逐鹿蒙恬']
  },
  {
    name: '闹闹',
    aliases: ['闹闹'],
    title: '阵营抉择 / 定向锁定',
    tier: 'T2',
    mechanism: '阵营抉择锁定并稳定获取特定阵营卡牌，纯阵营构筑时过滤杂牌效率极高',
    v191Bonus: 0.06,
    synergizedPlaystyles: ['纯三分', '纯日落海', '纯河洛', '纯大河', '专精过滤']
  },
  {
    name: '弈星',
    aliases: [],
    title: '棋盘演练 / 借力打力',
    tier: 'T2',
    mechanism: '弈局推演与棋盘封锁，大招期间可借力复制敌方高级英雄牌反制敌手',
    v191Bonus: 0.06,
    synergizedPlaystyles: ['战术博弈', '借力打力', '法系']
  },
  {
    name: '常小娥',
    aliases: ['常小娥'],
    title: '月影灵泉 / 法盾续航',
    tier: 'T2',
    mechanism: '提供月光护盾与灵力回复，大幅增强队伍在长线拉扯中的法术承伤与续航',
    v191Bonus: 0.06,
    synergizedPlaystyles: ['法系承伤', '长线拉扯', '法盾']
  }
]

/** 查找或模糊解析棋手档案 */
export function findCommanderMeta(rawName: string | null | undefined): CommanderMeta | undefined {
  if (!rawName || !rawName.trim()) return undefined
  const clean = rawName.trim()
  return OFFICIAL_COMMANDERS.find(c =>
    c.name === clean ||
    c.aliases.includes(clean) ||
    clean.includes(c.name) ||
    c.aliases.some(a => clean.includes(a))
  )
}

/** 棋手立绘与皮肤变体识别档案定义 */
export interface CommanderSkinVariant {
  commander: string
  skinName: string
  isDefault: boolean
  visualClues: string[] // 视觉关键线索（发色、发饰、帽子、衣着特征）
  description: string
}

/** 官方完整 21 位棋手全量皮肤图鉴与视觉线索库 */
export const COMMANDER_SKIN_VARIANTS: readonly CommanderSkinVariant[] = [
  // 1. 马可
  {
    commander: '马可',
    skinName: '滑板少年',
    isDefault: false,
    visualClues: ['棒球帽', '鸭舌帽', '滑板少年', '反戴帽子', '金发碎发', '红白运动卫衣'],
    description: '深色棒球帽反戴/微偏、金黄色碎发阳光少年脸（丰川祥子实战同款）'
  },
  {
    commander: '马可',
    skinName: '经典牛仔',
    isDefault: true,
    visualClues: ['黑色渔夫帽', '水桶帽', '双手比枪', '双枪牛仔'],
    description: '黑色渔夫帽/水桶帽、金黄碎发、红白运动夹克'
  },

  // 2. 嬴律
  {
    commander: '嬴律',
    skinName: '优雅恋人',
    isDefault: false,
    visualClues: ['银白短发', '偏分刘海', '冷峻凤眼', '立领黑大衣', '现代西装', '黑色手套'],
    description: '银白色偏分短发、暗红内搭衬衣外披黑色现代西装大衣、黑色半指手套（小琳谷芷、搜流儿实战同款）'
  },
  {
    commander: '嬴律',
    skinName: '黑金帝冕',
    isDefault: true,
    visualClues: ['金黑帝冕', '玄色帝袍', '古风秦帝'],
    description: '君临天下玄黑金纹秦王古风帝袍'
  },

  // 3. 镜
  {
    commander: '镜',
    skinName: '无限追猎 / 暗影机能',
    isDefault: false,
    visualClues: ['银灰短发', '幽蓝眼眸', '机甲耳饰', '几何发饰', '金属紧身战斗服'],
    description: '利落银灰超短发、幽蓝眼瞳、金属机甲耳饰、冷艳女刺客（嘉誉、甜卷大王、下雨了下雨了同款）'
  },
  {
    commander: '镜',
    skinName: '经典破镜',
    isDefault: true,
    visualClues: ['黑白灰机能服', '碎镜碎片'],
    description: '黑白灰极简机能战斗服、银短发'
  },

  // 4. 安琪拉
  {
    commander: '安琪拉',
    skinName: '薄荷假期',
    isDefault: false,
    visualClues: ['青蓝短发', '薄荷绿短发', '细框眼镜', '黑框眼镜', '白色立领', '眼镜妹', '学霸风'],
    description: '青浅蓝/薄荷绿微卷短发、戴细框黑眼镜、白色高领清新度假学霸风（抖音EG碎碎圆圆实战同款）'
  },
  {
    commander: '安琪拉',
    skinName: '经典雷霆',
    isDefault: true,
    visualClues: ['亮粉红双马尾', '大红色猫耳眼镜', '粉黑机甲战斗服'],
    description: '亮粉红色巨型双马尾长发、红色猫耳眼镜与机甲战斗服（Yk丶实战同款）'
  },

  // 5. 阿离 (公孙离)
  {
    commander: '阿离',
    skinName: '碎光执事 / 枫糖兔耳',
    isDefault: false,
    visualClues: ['暖橙短发', '长兔耳发带', '双马尾丝带', '执事礼服', '宝石蓝晶伞'],
    description: '暖橙色系灵动双马尾、长长兔耳造型发饰（有局丨白兔、雾与散声慢慢实战同款）'
  },
  {
    commander: '阿离',
    skinName: '经典纸伞',
    isDefault: true,
    visualClues: ['暖橙中长发', '修长橙色大兔耳', '元气红裙'],
    description: '暖橙长发配修长兔耳、元气红裙与枫叶折伞'
  },

  // 6. 武凤
  {
    commander: '武凤',
    skinName: '璇玑·紫微 / 盛世女帝',
    isDefault: false,
    visualClues: ['深黑高盘发', '金簪步摇', '凤冠', '朱红金纹凤袍', '凤眼红唇'],
    description: '墨黑浓发高盘发髻、金簪步摇垂坠、凤仪红袍霸气女皇（抖音湛蓝实战同款）'
  },
  {
    commander: '武凤',
    skinName: '经典神鸟',
    isDefault: true,
    visualClues: ['米白立领西装', '深黑干练短发', '右手托金鸟', '凤凰'],
    description: '米白色立领西装风华服、干练短发、右手托金色神鸟凤凰'
  },

  // 7. 玉环 (杨玉环)
  {
    commander: '玉环',
    skinName: '幻彩音阶 / 盛唐国色',
    isDefault: false,
    visualClues: ['深棕大卷长发', '水滴花钿', '金玉耳坠', '温婉侧颜', '盛唐仕女'],
    description: '丰盈大卷长发如瀑、额心点缀水滴钿花、典雅端庄贵妃（EZ拉丁鱼、B站东方朔实战同款）'
  },
  {
    commander: '玉环',
    skinName: '经典音律',
    isDefault: true,
    visualClues: ['绿色休闲夹克', '微卷长发披肩', '手抱电琵琶'],
    description: '深茶色微卷长发、绿色休闲夹克、手抱白底黑弦科技电琵琶'
  },

  // 8. 乔汐 (大乔)
  {
    commander: '乔汐',
    skinName: '行鲤绯梦 / 纯白贝雷帽',
    isDefault: false,
    visualClues: ['冰蓝短发', '纯白贝雷帽', '毛绒兜帽', '软萌萝莉'],
    description: '顺滑冰蓝短发、纯白色毛绒软萌贝雷帽、冰雪斗篷（WE葫芦呼噜实战同款）'
  },
  {
    commander: '乔汐',
    skinName: '经典行鲤',
    isDefault: true,
    visualClues: ['深棕单侧长麻花辫', '红黄白连衣小斗篷', '手持玻璃水杯'],
    description: '深棕色单侧单麻花长辫、红黄白连衣小斗篷、手拿水杯'
  },

  // 9. 庄小鱼 (庄周)
  {
    commander: '庄小鱼',
    skinName: '梦境遨游 / 奇妙幻梦',
    isDefault: false,
    visualClues: ['青绿卷发', '浅绿睡衣', '微闭双眼', '睡眼惺忪', '小帽子'],
    description: '青翠色微卷蓬松乱发、半睡半醒瞌睡少年脸、浅绿睡衣（B站小祥、小优律实战同款）'
  },
  {
    commander: '庄小鱼',
    skinName: '经典鲨鱼卫衣',
    isDefault: true,
    visualClues: ['蓝色怪兽卫衣', '鲨鱼大嘴连帽衫', '青翠遮眼顺发'],
    description: '青翠色顺滑短发遮住半眼、身穿蓝色大恐龙/鲨鱼张嘴连帽卫衣'
  },

  // 10. 孙小宾 (孙膑)
  {
    commander: '孙小宾',
    skinName: '时光漫步 / 时光机甲',
    isDefault: false,
    visualClues: ['栗棕齐刘海', '大圆眼', '天蓝耳饰', '少年机械服'],
    description: '栗棕色齐刘海正太脸、双耳带有天蓝色科技耳饰（小宇13实战同款）'
  },
  {
    commander: '孙小宾',
    skinName: '经典怀表',
    isDefault: true,
    visualClues: ['金黄色短发', '浅蓝科技大耳机', '胸前金色大怀表', '背带裤', '机械剪刀翼'],
    description: '金黄色短发、头戴浅蓝科技大耳机、胸前挂金色大怀表、背带裤机械剪刀'
  },

  // 11. 白歌 (李白)
  {
    commander: '白歌',
    skinName: '墨世龙尘 (典藏)',
    isDefault: false,
    visualClues: ['雪白长发披肩', '青色长发带', '水墨剑侠', '黑白水墨龙'],
    description: '典藏级水墨风独行剑仙、飘逸雪白披肩长发、青长发带、墨龙环绕'
  },
  {
    commander: '白歌',
    skinName: '经典书生',
    isDefault: true,
    visualClues: ['棕红短发小少年', '白色立领汉服衬衣', '手握书卷卷轴'],
    description: '棕红发色小书生、白色汉服立领衬衣、手持卷轴书册、阳光英武'
  },

  // 12. 瑶妹 (瑶)
  {
    commander: '瑶妹',
    skinName: '棉云甜梦 (星选)',
    isDefault: false,
    visualClues: ['粉色棉云睡衣', '云朵耳饰', '小鹿玩偶'],
    description: '星选级粉白棉云甜美睡衣造型、梦幻小鹿'
  },
  {
    commander: '瑶妹',
    skinName: '朝露晓升 (珍品传说)',
    isDefault: false,
    visualClues: ['朝露神光', '日月行者', '神圣小鹿', '流金幻彩'],
    description: '日月行者系列珍品传说、高规格神圣流光金芒与神圣小鹿'
  },
  {
    commander: '瑶妹',
    skinName: '经典小鹿',
    isDefault: true,
    visualClues: ['粉色卷发', '浅蓝小鹿角棒球帽', '怀抱紫色小鹿玩偶', '背包遮阳帽'],
    description: '粉色卷发、浅蓝小鹿角遮阳帽、怀抱紫色小鹿玩偶、背着背包'
  },

  // 13. 明先生 (明世隐)
  {
    commander: '明先生',
    skinName: '璇玑·浑天',
    isDefault: false,
    visualClues: ['紫金发冠', '神秘星宿长链', '浑天仪卦象', '暗紫玄袍'],
    description: '紫金高冠、神秘星宿长链卦象、深邃莫测'
  },
  {
    commander: '明先生',
    skinName: '经典卦师',
    isDefault: true,
    visualClues: ['银白及腰如雪长发', '额间朱砂印', '白底红边玄道长袍'],
    description: '银白及腰如雪长发、额间一道朱砂红印、白底红边玄奥长袍'
  },

  // 14. 姜导 (姜子牙)
  {
    commander: '姜导',
    skinName: '风雅假期 / 睡眠艺术',
    isDefault: false,
    visualClues: ['导演遮阳帽', '花衬衫度假装', '睡衣艺术袍'],
    description: '休闲度假遮阳帽风、大胡子老学者艺术睡袍'
  },
  {
    commander: '姜导',
    skinName: '经典名导',
    isDefault: true,
    visualClues: ['灰白蓬松卷发胡须', '圆框墨镜', '深绿西装浅棕大衣', '老顽童'],
    description: '灰白蓬松卷发与大胡子、圆框墨镜、深绿西装浅棕大衣老顽童导演'
  },

  // 15. 小妲己
  {
    commander: '小妲己',
    skinName: '海盐橙花',
    isDefault: false,
    visualClues: ['清凉海滩装', '橙花发饰', '海盐蓝裙', '夏日短裙'],
    description: '清凉橙花夏日海滩风裙装、毛茸茸大尾巴'
  },
  {
    commander: '小妲己',
    skinName: '经典萌狐',
    isDefault: true,
    visualClues: ['暖金色长狐狸耳', '金色短发', '金色抹胸短裙', '大狐尾'],
    description: '暖金色大狐狸耳朵、金色短发、金色修身礼服、毛茸茸大狐尾'
  },

  // 16. 香香 (孙尚香)
  {
    commander: '香香',
    skinName: '蔷薇恋人 / 红粉春樱',
    isDefault: false,
    visualClues: ['粉黑蔷薇发带', '粉黑机甲短裙', '重装重炮'],
    description: '粉黑蔷薇专属发带与重装涂装'
  },
  {
    commander: '香香',
    skinName: '经典机甲运动',
    isDefault: true,
    visualClues: ['墨绿色长双马尾', '荧光绿发饰', '荧光绿黑冲锋衣', '双手比枪'],
    description: '墨绿色高扎长双马尾、荧光绿黑拼色运动冲锋衣、帅气比枪'
  },

  // 17. 常小娥 (嫦娥)
  {
    commander: '常小娥',
    skinName: '月中素娥 (中秋珍品传说)',
    isDefault: false,
    visualClues: ['金桂玉兔流苏', '月华霓裳', '仙子绫罗', '明月神光'],
    description: '中秋珍品传说、月华流光飘带、金桂玉兔流苏'
  },
  {
    commander: '常小娥',
    skinName: '经典飞吻仙子',
    isDefault: true,
    visualClues: ['浅紫白如瀑长发', '双小包包发髻', '白色无袖轻纱', '飞吻手势'],
    description: '浅紫白色如瀑长发、双小包包发髻、白色无袖轻纱、侧身回眸飞吻'
  },

  // 18. 昭君 (王昭君)
  {
    commander: '昭君',
    skinName: '冰霜雪女 / 奇妙幻想',
    isDefault: false,
    visualClues: ['冰蓝水晶长发', '水晶发簪', '冰雪披风长裙'],
    description: '冰蓝长发水晶发簪、纯白优雅长裙'
  },
  {
    commander: '昭君',
    skinName: '经典冬日学妹',
    isDefault: true,
    visualClues: ['青蓝顺发齐肩', '米白毛线帽', '浅蓝围巾', '米色羽绒棉服', '怀抱书卷'],
    description: '青蓝色齐肩发、米白毛线帽、浅蓝围巾、米色羽绒服、怀抱书本冬日学妹'
  },

  // 19. 班叔 (鲁班大师)
  {
    commander: '班叔',
    skinName: '重装工匠',
    isDefault: false,
    visualClues: ['机械护目镜', '重型工装铠甲', '重型机械扳手'],
    description: '重装机械工匠工业铠甲风格'
  },
  {
    commander: '班叔',
    skinName: '经典科技大叔',
    isDefault: true,
    visualClues: ['银灰短发', '细框眼镜', '浅灰风衣大褂', '背后巨大机械圆环'],
    description: '银灰短发、细框眼镜、浅灰风衣长袍、背后巨大机械科技圆环装置'
  },

  // 20. 弈星
  {
    commander: '弈星',
    skinName: '万物之道',
    isDefault: false,
    visualClues: ['天元水墨汉服', '素雅青衫黑发', '棋子长发簪', '黑白棋道流光'],
    description: '天元墨韵古代儒雅汉服、棋道流光神采'
  },
  {
    commander: '弈星',
    skinName: '经典棋盘格纹',
    isDefault: true,
    visualClues: ['墨黑长发半扎披肩', '黑白棋盘格纹风衣', '胸前蓝光条纹', '清雅棋士'],
    description: '墨黑长发半扎披肩、黑白棋盘格纹风衣、蓝光能量条纹'
  },

  // 21. 闹闹
  {
    commander: '闹闹',
    skinName: '气泡橘子 (战令限定)',
    isDefault: false,
    visualClues: ['橙色气泡果汁涂装', '萌趣太阳镜', '夏日短裤'],
    description: '赛季战令限定气泡橙汁涂装、萌趣太阳镜'
  },
  {
    commander: '闹闹',
    skinName: '经典太空小兽',
    isDefault: true,
    visualClues: ['紫色大耳朵外星小兽', '龙猫造型', '绿色防风镜', '紫色宇航拉链服'],
    description: '紫色大耳朵外星小龙猫造型、头戴绿色墨镜、身穿紫色拉链宇航服'
  }
]

/**
 * 将视觉线索、皮肤别称或棋手输入，归一化解析为官方标准棋手名
 */
export function resolveCommanderFromSkin(clueOrName: string | null | undefined): string | null {
  if (!clueOrName || !clueOrName.trim()) return null
  const clean = clueOrName.trim()
  const directMeta = findCommanderMeta(clean)
  if (directMeta) return directMeta.name

  for (const variant of COMMANDER_SKIN_VARIANTS) {
    if (variant.skinName.includes(clean) || clean.includes(variant.skinName)) {
      return variant.commander
    }
    if (variant.visualClues.some(c => clean.includes(c) || c.includes(clean))) {
      return variant.commander
    }
  }
  return null
}

/** 棋手与主流阵容适配机制定义 */
export interface CommanderAdaptedBuild {
  buildName: string
  faction: FactionType
  tier: 'PRIMARY' | 'SECONDARY' | 'VARIANT'
  synergyDesc: string
}

/** 棋手在当前禁选规则下的动态流派适配池 */
export interface CommanderAdaptivePool {
  commander: string
  allBuilds: CommanderAdaptedBuild[]
  eligibleBuilds: CommanderAdaptedBuild[]
  bannedBuilds: CommanderAdaptedBuild[]
  bestAdaptiveBuild: CommanderAdaptedBuild | null
  bannedFaction: string | null
}

/** 官方完整 21 位棋手的主流阵容适配矩阵 */
export const COMMANDER_ADAPTED_BUILDS: Record<string, CommanderAdaptedBuild[]> = {
  嬴律: [
    { buildName: '逐鹿蒙恬', faction: '逐鹿', tier: 'PRIMARY', synergyDesc: '并购红利回合额外复制，极大加速蒙恬追三星，上限质变' },
    { buildName: '雷霆战机', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: '并购红利复制孙膑与蒙犽加速三星质变，成型极快' },
    { buildName: '三分登场', faction: '三分', tier: 'PRIMARY', synergyDesc: '成年礼三分快速追三星全员成型' },
    { buildName: '稷下坦射', faction: '通用/其他', tier: 'SECONDARY', synergyDesc: '复制核心射手与高阶前排坦核' },
    { buildName: '日落海倒转', faction: '日落海', tier: 'VARIANT', synergyDesc: '复制倒转核心高费英雄加速锁血' }
  ],
  安琪拉: [
    { buildName: '雷霆战机', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: 'v1.9.1飞行器继承125%法攻与30%攻速，引爆机甲法爆' },
    { buildName: '法天象地', faction: '通用/其他', tier: 'SECONDARY', synergyDesc: '高法攻继承引爆法术大招范围爆发' },
    { buildName: '日落海倒转', faction: '日落海', tier: 'VARIANT', synergyDesc: '高法攻辅助倒转体系后期伤害补足' }
  ],
  玉环: [
    { buildName: '日落海倒转', faction: '日落海', tier: 'PRIMARY', synergyDesc: '霓裳曲打出非觉醒牌连击增益，极速过牌锁血登顶' },
    { buildName: '三分倒转', faction: '三分', tier: 'PRIMARY', synergyDesc: '三分领袖配合连击刷牌高速过牌' },
    { buildName: '牺牲李信', faction: '河洛', tier: 'SECONDARY', synergyDesc: '连击增益加速单核李信狂暴法坦输出' },
    { buildName: '雷霆战机', faction: '通用/其他', tier: 'VARIANT', synergyDesc: '高频刷牌快速检索机甲核心配件' }
  ],
  乔汐: [
    { buildName: '日落海倒转', faction: '日落海', tier: 'PRIMARY', synergyDesc: 'v1.9.1潮汐交响初始4次，法系倒转与转瞬快攻成型神速' },
    { buildName: '三分倒转', faction: '三分', tier: 'PRIMARY', synergyDesc: '转瞬抽取收窄至3~5阶高质牌，三分快速启动' },
    { buildName: '雷霆战机', faction: '通用/其他', tier: 'SECONDARY', synergyDesc: '高阶转瞬牌快速定向检索机甲核心' },
    { buildName: '伞半月', faction: '通用/其他', tier: 'VARIANT', synergyDesc: '转瞬牌支援高机动射手快速位移' }
  ],
  武凤: [
    { buildName: '河洛木兰', faction: '河洛', tier: 'PRIMARY', synergyDesc: '偷取敌方秘技牌打破上限，万鸟朝凤女帝爆发对抗' },
    { buildName: '逐鹿蒙恬', faction: '逐鹿', tier: 'SECONDARY', synergyDesc: '秘技增强前排坦度与反打控制' },
    { buildName: '三分登场', faction: '三分', tier: 'VARIANT', synergyDesc: '全能秘技补强三分阵型对抗容错' }
  ],
  庄小鱼: [
    { buildName: '传统养猪', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: '全队免控与梦境商店保障单核养猪坦度，逆风翻盘' },
    { buildName: '镜猪转吕布', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: '免控护体为吕布刺客提供绝对安全输出环境' },
    { buildName: '日落海倒转', faction: '日落海', tier: 'SECONDARY', synergyDesc: '免控为倒转体系保驾护航免遭切后' },
    { buildName: '逐鹿蒙恬', faction: '逐鹿', tier: 'SECONDARY', synergyDesc: '免控保障蒙恬反伤阵型屹立不倒' },
    { buildName: '逐鹿蒙犽', faction: '逐鹿', tier: 'VARIANT', synergyDesc: '免控保护后排射手持续扫射' }
  ],
  孙小宾: [
    { buildName: '雷霆战机', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: '时光倒流回溯上回合手牌，极致配合关键机甲牌序' },
    { buildName: '三分倒转', faction: '三分', tier: 'SECONDARY', synergyDesc: '手牌回溯配合倒转高频过牌爆发' },
    { buildName: '日落海倒转', faction: '日落海', tier: 'VARIANT', synergyDesc: '回溯关键非觉醒牌延长倒转链路' }
  ],
  阿离: [
    { buildName: '伞半月', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: '红叶染锋等级保留机制，高机动位移与持续输出' },
    { buildName: '日落海倒转', faction: '日落海', tier: 'SECONDARY', synergyDesc: '高机动配合倒转刷牌强化敏捷射手' },
    { buildName: '稷下坦射', faction: '通用/其他', tier: 'VARIANT', synergyDesc: '射手位移提供阵地战自保生存能力' }
  ],
  白歌: [
    { buildName: '三分倒转', faction: '三分', tier: 'PRIMARY', synergyDesc: '即兴创作每4次合成复制，加速追三星与高爆发' },
    { buildName: '河洛木兰', faction: '河洛', tier: 'PRIMARY', synergyDesc: '合成质变增强近战刺客与女帝爆发' },
    { buildName: '传统养猪', faction: '通用/其他', tier: 'SECONDARY', synergyDesc: '高频合成复制单核肉装坦克' },
    { buildName: '逐鹿蒙恬', faction: '逐鹿', tier: 'VARIANT', synergyDesc: '即兴创作复制前排肉核突破星级' }
  ],
  马可: [
    { buildName: '猪镜转李信', faction: '河洛', tier: 'PRIMARY', synergyDesc: '真伤弹幕配合李信霸体爆发，极速破阵清场' },
    { buildName: '镜猪转吕布', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: '高频真伤弹幕掩护刺客突进，后期大吕布接管战局' },
    { buildName: '逐鹿蒙犽', faction: '逐鹿', tier: 'PRIMARY', synergyDesc: '高频真伤弹幕强化射手穿透轰炸' },
    { buildName: '大河龙蛇', faction: '大河', tier: 'SECONDARY', synergyDesc: '大河先手开团接物理爆发输出（世薄情成名招牌）' },
    { buildName: '传统养猪', faction: '通用/其他', tier: 'SECONDARY', synergyDesc: '真伤单核拉满，养猪防守反击' },
    { buildName: '成年礼三分', faction: '三分', tier: 'VARIANT', synergyDesc: '三分阵营快速成型射手推进' },
    { buildName: '稷下坦射', faction: '通用/其他', tier: 'VARIANT', synergyDesc: '前排承伤提供持久开团火力' }
  ],
  昭君: [
    { buildName: '高费大核', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: '寒霜转化指定冻结，战斗后升阶并继承等级' },
    { buildName: '法天象地', faction: '通用/其他', tier: 'SECONDARY', synergyDesc: '升阶继承快速合成高星高级法师' },
    { buildName: '日落海倒转', faction: '日落海', tier: 'VARIANT', synergyDesc: '冰冻升阶加速倒转高费组件成型' }
  ],
  镜: [
    { buildName: '镜猪转吕布', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: '铜像复刻上一张英雄卡，后期大吕布镜像爆发' },
    { buildName: '镜猪转海月', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: '铜像复刻海月瞬发法刺爆发' },
    { buildName: '传统养猪', faction: '通用/其他', tier: 'SECONDARY', synergyDesc: '复刻关键坦核加速三星养成' }
  ],
  明先生: [
    { buildName: '河洛木兰', faction: '河洛', tier: 'PRIMARY', synergyDesc: '丰节卦象调控经济，慢速大核稳健成型' },
    { buildName: '传统养猪', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: '卦象链子持续强化单核坦度与发育' },
    { buildName: '长安九五', faction: '通用/其他', tier: 'SECONDARY', synergyDesc: '丰节卦象贪经济速上高本' }
  ],
  小妲己: [
    { buildName: '传统养猪', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: '每买4张送效果牌，平稳保底单核发育' },
    { buildName: '长安九五', faction: '通用/其他', tier: 'SECONDARY', synergyDesc: '万能经济牌稳过渡上本' },
    { buildName: '逐鹿蒙恬', faction: '逐鹿', tier: 'VARIANT', synergyDesc: '通用保底肉坦前排稳步成型' }
  ],
  香香: [
    { buildName: '逐鹿蒙犽', faction: '逐鹿', tier: 'PRIMARY', synergyDesc: '战斗开局武器协同攻击，物理重炮轰炸' },
    { buildName: '三分登场', faction: '三分', tier: 'PRIMARY', synergyDesc: '武器协同配合三分速攻爆发' },
    { buildName: '稷下坦射', faction: '通用/其他', tier: 'SECONDARY', synergyDesc: '后排物理重炮阵地战' },
    { buildName: '传统养猪', faction: '通用/其他', tier: 'VARIANT', synergyDesc: '单核射手暴击养成' }
  ],
  瑶妹: [
    { buildName: '防守保核', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: '开局小鹿庇护护盾，单核前排极限保活' },
    { buildName: '传统养猪', faction: '通用/其他', tier: 'SECONDARY', synergyDesc: '护盾与属性成长保障养猪肉盾不倒' }
  ],
  班叔: [
    { buildName: '稷下坦射', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: '热能陷阱真伤眩晕与弹簧防刺客，完美保后排射手' },
    { buildName: '逐鹿蒙犽', faction: '逐鹿', tier: 'SECONDARY', synergyDesc: '陷阱控场掩护蒙犽扫射' }
  ],
  姜导: [
    { buildName: '逐鹿蒙恬', faction: '逐鹿', tier: 'PRIMARY', synergyDesc: '主角加冕快速提升蒙恬等级与属性，极限单核' },
    { buildName: '传统养猪', faction: '通用/其他', tier: 'SECONDARY', synergyDesc: '快速提升养猪核心属性' }
  ],
  闹闹: [
    { buildName: '纯三分登场', faction: '三分', tier: 'PRIMARY', synergyDesc: '阵营抉择锁定三分卡牌，过滤杂牌效率极高' },
    { buildName: '日落海倒转', faction: '日落海', tier: 'SECONDARY', synergyDesc: '定向锁定日落海快速齐牌' },
    { buildName: '大河龙蛇', faction: '大河', tier: 'VARIANT', synergyDesc: '锁定大河组件快速成型' }
  ],
  弈星: [
    { buildName: '雷霆战机', faction: '通用/其他', tier: 'PRIMARY', synergyDesc: '棋盘演练借力打力，反制敌手高阶卡' },
    { buildName: '日落海倒转', faction: '日落海', tier: 'SECONDARY', synergyDesc: '大招控场与战术借力' }
  ],
  常小娥: [
    { buildName: '日落海倒转', faction: '日落海', tier: 'PRIMARY', synergyDesc: '月影灵泉法盾与续航，长线承伤拉扯' },
    { buildName: '雷霆战机', faction: '通用/其他', tier: 'SECONDARY', synergyDesc: '法系护盾强化机甲承伤' },
    { buildName: '传统养猪', faction: '通用/其他', tier: 'VARIANT', synergyDesc: '法坦前排增强' }
  ]
}

/** 获取棋手在特定禁选阵营下的合规与受禁适配阵容列表（支持别名） */
export function getCommanderAdaptiveBuilds(
  commanderName: string | null | undefined,
  bannedFaction?: string | null
): CommanderAdaptivePool | null {
  if (!commanderName || !commanderName.trim()) return null
  const clean = commanderName.trim()
  const meta = findCommanderMeta(clean)
  const cmdKey = meta?.name || clean

  const rawList = COMMANDER_ADAPTED_BUILDS[cmdKey] || COMMANDER_ADAPTED_BUILDS[clean] || []
  if (!rawList.length) return null

  const bf = bannedFaction ? bannedFaction.trim().replace('阵营', '') : null

  const eligibleBuilds: CommanderAdaptedBuild[] = []
  const bannedBuilds: CommanderAdaptedBuild[] = []

  for (const b of rawList) {
    const isBanned = Boolean(bf && (b.faction === bf || b.buildName.includes(bf)))
    if (isBanned) {
      bannedBuilds.push(b)
    } else {
      eligibleBuilds.push(b)
    }
  }

  return {
    commander: cmdKey,
    allBuilds: rawList,
    eligibleBuilds,
    bannedBuilds,
    bestAdaptiveBuild: eligibleBuilds[0] || null,
    bannedFaction: bf
  }
}

/** 选手对特定棋手该阵容的熟练度三维建模评级定义（区分近7天实战窗口与历史全量底蕴） */
export type ProficiencyStarLevel = 5 | 4 | 3 | 2 | 1

export interface PlayerLineupProficiency {
  starLevel: ProficiencyStarLevel
  levelLabel: string // '⭐⭐⭐⭐⭐ 炉火纯青' | '⭐⭐⭐⭐ 驾轻就熟' | '⭐⭐⭐ 熟练运用' | '⭐⭐ 变阵备选' | '⭐ 生疏初试'
  tierKey: 'MASTER' | 'EXPERT' | 'COMPETENT' | 'SUBSTITUTE' | 'NOVICE'
  modifier: number // -0.20 ~ +0.25 战力加减分
  // 近 7 天真实实战窗口（第一权重核心参考）
  recent7Matches: number
  recent7Wins: number
  recent7WinRate: number
  recent7DateRange: string // 近7天日期范围，如 "10-25 ~ 11-08"
  // 历史全量数据（选手风格与绝活底蕴基准）
  lifetimeMatches: number
  lifetimeWins: number
  lifetimeWinRate: number
  // 综合判定原由
  isSignatureBuild: boolean
  isSignatureCommander: boolean
  description: string
  reasoning: string
}

/** 判定是否为王牌对决高强度赛事实战对局（严格过滤普通排位/娱乐局，保障王牌赛场真实强度） */
export function isAceDuelMatch(match: any): boolean {
  if (!match) return false
  if (match.mode) {
    const m = String(match.mode).toUpperCase()
    // 排除普通排位、普通娱乐对局
    if (m === 'CASUAL' || m === 'NORMAL' || m === 'RANK' || m === 'PVP_NORMAL') {
      return false
    }
    // 官方王牌对决支持 WANXIANG（万象大赛）和 DIAMOND（钻石狂潮）
    if (m === 'WANXIANG' || m === 'DIAMOND' || m === 'ACE' || m.includes('王牌')) {
      return true
    }
  }
  // 未显式指定 mode 时：王牌对决固定为 6 席赛制
  if (Array.isArray(match.seats) && match.seats.length === 6) {
    return true
  }
  // 兼顾带赛事前缀标识（match-/ace-/recent-/old-）的对决样本
  if (match.key && (String(match.key).startsWith('match-') || String(match.key).includes('ace') || String(match.key).includes('recent') || String(match.key).includes('old'))) {
    return Boolean(Array.isArray(match.seats) && match.seats.length >= 2)
  }
  return false
}

/** 核心算法：评估【选手 × 棋手 × 阵容】的王牌对决专精熟练度与战力修正（近7天高权重优先 + 历史全量底蕴画像） */
export function evaluatePlayerCommanderLineupProficiency(
  playerNickname: string | null | undefined,
  commanderName: string | null | undefined,
  targetBuild: string,
  historicalMatches: any[] = []
): PlayerLineupProficiency {
  const masterName = getMasterPlayerName(playerNickname || '')
  const meta = findCommanderMeta(commanderName)
  const cmdName = meta ? meta.name : (commanderName?.trim() || '')
  const masterDef = findPlayerMasterProfile(playerNickname)

  // 1. 严格过滤仅保留王牌对决有效赛果，并动态提取赛事的近 7 天窗口（核心优先级窗口）
  const aceMatches = (historicalMatches || []).filter(isAceDuelMatch)
  const allDays = Array.from(new Set(aceMatches.map((m: any) => m.day).filter(Boolean))).sort()
  let recent7Days: string[] = []
  if (allDays.length > 0) {
    const latestDayStr = allDays[allDays.length - 1]
    const latestTime = new Date(latestDayStr + 'T23:59:59Z').getTime()
    const sevenDaysAgoTime = latestTime - 7 * 24 * 60 * 60 * 1000
    const cutoffDay = new Date(sevenDaysAgoTime).toISOString().slice(0, 10)

    recent7Days = allDays.filter(d => d >= cutoffDay)
    if (recent7Days.length < 2 && allDays.length >= 2) {
      recent7Days = allDays.slice(-3)
    }
  }
  const recentDateRange = recent7Days.length
    ? `${recent7Days[0].slice(5)} ~ ${recent7Days[recent7Days.length - 1].slice(5)}`
    : '近7天'

  // 2. 从历史对局统计中提取选手在【近7天】与【全量历史】的真实战绩
  let r7CmdMatches = 0
  let r7CmdWins = 0
  let r7BuildMatches = 0
  let r7BuildWins = 0

  let lifeCmdMatches = 0
  let lifeCmdWins = 0
  let lifeBuildMatches = 0
  let lifeBuildWins = 0

  if (aceMatches && aceMatches.length) {
    for (const m of aceMatches) {
      const isRecent = recent7Days.includes(m.day)
      const seat = m.seats?.find((s: any) => getMasterPlayerName(s.nickname) === masterName)
      if (seat) {
        const sBuild = seat.build || ''
        const sCmd = seat.commander || ''
        const isWin = seat.slot === m.winnerSlot || seat.winner

        const isTargetBuild = Boolean(
          sBuild && (sBuild === targetBuild || sBuild.includes(targetBuild) || targetBuild.includes(sBuild))
        )

        if (isTargetBuild) {
          lifeBuildMatches++
          if (isWin) lifeBuildWins++
          if (isRecent) {
            r7BuildMatches++
            if (isWin) r7BuildWins++
          }

          const sMeta = findCommanderMeta(sCmd)
          const sCmdName = sMeta ? sMeta.name : sCmd
          const isCmdMatched = Boolean(
            sCmdName && cmdName && (
              sCmdName === cmdName ||
              (meta && meta.aliases.includes(sCmdName)) ||
              sCmd.includes(cmdName) ||
              cmdName.includes(sCmd)
            )
          )

          if (isCmdMatched) {
            lifeCmdMatches++
            if (isWin) lifeCmdWins++
            if (isRecent) {
              r7CmdMatches++
              if (isWin) r7CmdWins++
            }
          }
        }
      }
    }
  }

  const r7WinRate = r7CmdMatches > 0 ? Number((r7CmdWins / r7CmdMatches).toFixed(2)) : 0
  const lifeWinRate = lifeCmdMatches > 0 ? Number((lifeCmdWins / lifeCmdMatches).toFixed(2)) : 0

  // 3. 匹配权威选手档案库（Master Profile）中的招牌棋手与阵容映射（历史底蕴）
  const isSignatureCommander = Boolean(
    masterDef && (masterDef.signatureCommander === cmdName || masterDef.alternativeCommanders.includes(cmdName))
  )
  const isSignatureBuild = Boolean(
    masterDef && masterDef.signatureBuilds.some(b => b === targetBuild || targetBuild.includes(b) || b.includes(targetBuild))
  )

  let rankInCmdMap = -1
  if (masterDef?.commanderBuildMap) {
    for (const [cKey, bList] of Object.entries(masterDef.commanderBuildMap)) {
      const cMeta = findCommanderMeta(cKey)
      const mappedCmd = cMeta ? cMeta.name : cKey
      if (mappedCmd === cmdName || (meta && meta.aliases.includes(cKey)) || cKey.includes(cmdName)) {
        rankInCmdMap = bList.findIndex(b => b === targetBuild || targetBuild.includes(b) || b.includes(targetBuild))
        break
      }
    }
  }

  // 4. 核心研判逻辑：近 7 天战绩作为 75% 核心依据，历史全量底蕴作为 25% 兜底校准
  // ⭐⭐⭐⭐⭐ 5星 · 炉火纯青 (当前版本手感火热 / 近7天实战绝活 / 历史招牌且近况高频)
  const isRecentHotWinner = r7CmdMatches >= 2 && r7WinRate >= 0.35 // 近7天多次出战且胜率优异（如梦飞马可三分3战2胜、小谷芷安琪拉雷霆4战2胜、世薄情马可蒙恬2战1胜）
  const isRecentChampion = r7CmdWins >= 1 && (isSignatureCommander || isSignatureBuild || rankInCmdMap === 0) // 近7天斩获冠军且属于招牌（如沐汐玉环倒转1战1胜、新一嬴律雷霆1战1胜）
  const isRecentHighFreqSignature = r7CmdMatches >= 2 && (rankInCmdMap === 0 || isSignatureCommander) // 近7天高频第一主力首选（如嘉誉马可镜猪、刺痛白歌养猪、白白庄小鱼养猪4战1胜）
  const isLifetimeDominant = lifeCmdMatches >= 2 && lifeWinRate >= 0.40 && (isSignatureCommander || rankInCmdMap === 0)
  const isMasterArchiveDefault = (rankInCmdMap === 0 && (isSignatureCommander || isSignatureBuild)) || (isSignatureCommander && isSignatureBuild)

  if (isRecentHotWinner || isRecentChampion || isRecentHighFreqSignature || isLifetimeDominant || (r7CmdMatches === 0 && isMasterArchiveDefault)) {
    let reasonText = ''
    if (r7CmdMatches > 0) {
      reasonText = `基于近7天实战（${recentDateRange}）：使用棋手「${cmdName}」出战「${targetBuild}」${r7CmdMatches}战${r7CmdWins}冠（近期胜率 ${(r7WinRate * 100).toFixed(0)}%），近期状态极佳；结合历史全量（累计 ${lifeCmdMatches} 战），属当前版本绝对王牌`
    } else {
      reasonText = `权威绝活底蕴：${masterName}历史使用「${cmdName}」首发必选「${targetBuild}」（全量 ${lifeCmdMatches} 战 ${lifeCmdWins} 冠），熟练度炉火纯青`
    }

    return {
      starLevel: 5,
      levelLabel: '⭐⭐⭐⭐⭐ 炉火纯青',
      tierKey: 'MASTER',
      modifier: 0.22,
      recent7Matches: r7CmdMatches,
      recent7Wins: r7CmdWins,
      recent7WinRate: r7WinRate,
      recent7DateRange: recentDateRange,
      lifetimeMatches: lifeCmdMatches,
      lifetimeWins: lifeCmdWins,
      lifetimeWinRate: lifeWinRate,
      isSignatureBuild: true,
      isSignatureCommander,
      description: '近7天手感火热且机制理解已臻化境，胜率极高保障',
      reasoning: reasonText
    }
  }

  // ⭐⭐⭐⭐ 4星 · 驾轻就熟 (近7天有实战操盘 / 近期打过同流派 / 历史常用主力体系)
  const hasRecentExperience = r7CmdMatches >= 1 // 近7天有真实出战对局（如逆光孙小宾雷霆2战、嘉誉诸葛亮李信2战、世薄情马可大河龙蛇）
  const hasRecentBuildPractice = r7BuildMatches >= 1 && (isSignatureBuild || rankInCmdMap >= 0) // 近7天打过该流派且属于招牌
  const isConsistentMastery = rankInCmdMap >= 0 || (isSignatureBuild && isSignatureCommander) || (lifeBuildMatches >= 2 && lifeBuildWins >= 1)

  if (hasRecentExperience || hasRecentBuildPractice || isConsistentMastery) {
    let reasonText = ''
    if (r7CmdMatches > 0) {
      reasonText = `近7天实战操盘（${recentDateRange}）：选用「${cmdName}」出战「${targetBuild}」有实战记录（${r7CmdMatches}战${r7CmdWins}冠），配合生涯底蕴（全量${lifeBuildMatches}战${lifeBuildWins}胜），变阵熟练`
    } else {
      reasonText = `选手核心拿手体系：对「${targetBuild}」理解扎实，配合「${cmdName}」机制具备强竞争实力（全量${lifeBuildMatches}战${lifeBuildWins}胜）`
    }

    return {
      starLevel: 4,
      levelLabel: '⭐⭐⭐⭐ 驾轻就熟',
      tierKey: 'EXPERT',
      modifier: 0.12,
      recent7Matches: r7CmdMatches,
      recent7Wins: r7CmdWins,
      recent7WinRate: r7WinRate,
      recent7DateRange: recentDateRange,
      lifetimeMatches: lifeCmdMatches,
      lifetimeWins: lifeCmdWins,
      lifetimeWinRate: lifeWinRate,
      isSignatureBuild,
      isSignatureCommander,
      description: '近期高频实战体系，变阵熟练，节奏掌控良好',
      reasoning: reasonText
    }
  }

  // 检查是否为棋手官方适配阵容
  const cmdPool = getCommanderAdaptiveBuilds(cmdName)
  const isPrimaryAdapted = cmdPool?.allBuilds.some(b => b.tier === 'PRIMARY' && (b.buildName === targetBuild || targetBuild.includes(b.buildName)))
  const isAdapted = cmdPool?.allBuilds.some(b => b.buildName === targetBuild || targetBuild.includes(b.buildName))

  if (isPrimaryAdapted || (isAdapted && lifeBuildMatches >= 1)) {
    // ⭐⭐⭐ 3星 · 熟练运用 (标准合规模板，近期偶有尝试)
    return {
      starLevel: 3,
      levelLabel: '⭐⭐⭐ 熟练运用',
      tierKey: 'COMPETENT',
      modifier: 0.03,
      recent7Matches: r7CmdMatches,
      recent7Wins: r7CmdWins,
      recent7WinRate: r7WinRate,
      recent7DateRange: recentDateRange,
      lifetimeMatches: lifeCmdMatches,
      lifetimeWins: lifeCmdWins,
      lifetimeWinRate: lifeWinRate,
      isSignatureBuild: false,
      isSignatureCommander,
      description: '棋手标准适配体系，近7天出战频率平稳，具备基础运营熟练度',
      reasoning: `标准契合度：棋手「${cmdName}」与「${targetBuild}」机制适配，选手近7天无重大失误，平稳发挥`
    }
  }

  if (isAdapted) {
    // ⭐⭐ 2星 · 变阵备选 (受阻或次选流派，近7天完全无实战操盘)
    return {
      starLevel: 2,
      levelLabel: '⭐⭐ 变阵备选',
      tierKey: 'SUBSTITUTE',
      modifier: -0.08,
      recent7Matches: r7CmdMatches,
      recent7Wins: r7CmdWins,
      recent7WinRate: r7WinRate,
      recent7DateRange: recentDateRange,
      lifetimeMatches: lifeCmdMatches,
      lifetimeWins: lifeCmdWins,
      lifetimeWinRate: lifeWinRate,
      isSignatureBuild: false,
      isSignatureCommander,
      description: '受禁选影响或临场次要备选，近7天缺乏实战手感，战力稍受折损',
      reasoning: `次级适配变阵：近7天完全无该组合出战记录，临场调牌存在一定生疏度`
    }
  }

  // ⭐ 1星 · 生疏初试 (极度生疏或违和套路)
  return {
    starLevel: 1,
    levelLabel: '⭐ 生疏初试',
    tierKey: 'NOVICE',
    modifier: -0.18,
    recent7Matches: r7CmdMatches,
    recent7Wins: r7CmdWins,
    recent7WinRate: r7WinRate,
    recent7DateRange: recentDateRange,
    lifetimeMatches: lifeCmdMatches,
    lifetimeWins: lifeCmdWins,
    lifetimeWinRate: lifeWinRate,
    isSignatureBuild: false,
    isSignatureCommander: false,
    description: '近7天与历史生涯均无该体系实战胜绩支撑，胜率风险极高',
    reasoning: `生疏初试：近7天与全量生涯均无胜绩记录，且与「${cmdName}」常规套路违和，断节奏风险大`
  }
}

/** 【棋手 × 阵容】王牌对决高压实战胜率与协同度评估结果 */
export interface CommanderBuildSynergyEval {
  commander: string
  buildName: string
  sampleMatches: number
  sampleWins: number
  realWinRate: number
  smoothedWinRate: number
  winRateFormatted: string
  tier: 'S' | 'A' | 'B' | 'C'
  tierLabel: string
  scoreModifier: number
  isAceContext: boolean // 标明该胜率专属于王牌对决高强度赛场生态
  reason: string
}

/** 评估棋手搭配特定阵容在【王牌对决】高强度赛场环境下的综合实战胜率（结合王牌对决赛事实战样本与贝叶斯平滑） */
export function evaluateCommanderBuildSynergy(
  commanderName: string | null | undefined,
  targetBuild: string,
  historicalMatches: any[] = []
): CommanderBuildSynergyEval {
  const meta = findCommanderMeta(commanderName)
  const cleanCmd = meta ? meta.name : (commanderName?.trim() || '通用棋手')
  const cleanBuild = targetBuild?.trim() || '主流体系'

  // 1. 严格过滤仅保留王牌对决有效赛果（排除普通排位、娱乐局或非6席赛果）
  const aceMatches = (historicalMatches || []).filter(isAceDuelMatch)

  // 2. 王牌对决赛场专属先验胜率 (依据王牌高强度对抗梯队)
  let commanderPrior = 0.18
  if (meta?.tier === 'T0') commanderPrior = 0.25
  else if (meta?.tier === 'T1') commanderPrior = 0.18
  else if (meta?.tier === 'T2') commanderPrior = 0.13

  // 3. 王牌对决赛场阵容适配契合度偏移 (王牌高压对抗下成型速度与终结上限)
  let buildPriorOffset = 0
  const cmdAdapt = getCommanderAdaptiveBuilds(cleanCmd)
  if (cmdAdapt) {
    const matchedBuild = cmdAdapt.allBuilds.find(
      b => b.buildName === cleanBuild || cleanBuild.includes(b.buildName) || b.buildName.includes(cleanBuild)
    )
    if (matchedBuild) {
      if (matchedBuild.tier === 'PRIMARY') buildPriorOffset = +0.12 // 王牌高强官方招牌体系
      else if (matchedBuild.tier === 'SECONDARY') buildPriorOffset = +0.04
      else buildPriorOffset = -0.02
    } else {
      buildPriorOffset = -0.10 // 严重违和或在王牌快节奏中易暴毙的套路 (如明先生牺牲李信非适配、镜玩三分)
    }
  }

  const priorWinRate = Math.min(0.48, Math.max(0.12, commanderPrior + buildPriorOffset))

  // 4. 统计该【棋手 × 阵容】在全量王牌对决赛事中的真实实战战绩
  let sampleMatches = 0
  let sampleWins = 0

  if (aceMatches && aceMatches.length) {
    for (const m of aceMatches) {
      if (m.seats && Array.isArray(m.seats)) {
        for (const s of m.seats) {
          const sCmd = s.commander || ''
          const sBuild = s.build || ''
          const isWin = s.slot === m.winnerSlot || s.winner

          const sMeta = findCommanderMeta(sCmd)
          const sCmdClean = sMeta ? sMeta.name : sCmd

          const isCmdMatched = Boolean(
            sCmdClean && (
              sCmdClean === cleanCmd ||
              (meta && meta.aliases.includes(sCmdClean)) ||
              sCmd.includes(cleanCmd) ||
              cleanCmd.includes(sCmd)
            )
          )

          const isBuildMatched = Boolean(
            sBuild && (
              sBuild === cleanBuild ||
              sBuild.includes(cleanBuild) ||
              cleanBuild.includes(sBuild)
            )
          )

          if (isCmdMatched && isBuildMatched) {
            sampleMatches++
            if (isWin) sampleWins++
          }
        }
      }
    }
  }

  // 5. 贝叶斯平滑胜率计算 (平滑常数 C = 4，避免极小样本噪点)
  const C = 4
  const realWinRate = sampleMatches > 0 ? Number((sampleWins / sampleMatches).toFixed(3)) : priorWinRate
  const smoothedWinRate = Number(((sampleWins + C * priorWinRate) / (sampleMatches + C)).toFixed(3))
  const winRateFormatted = `${(smoothedWinRate * 100).toFixed(1)}%`

  // 6. 王牌对决高压赛场胜率梯度与战力加减分评定
  let tier: 'S' | 'A' | 'B' | 'C' = 'B'
  let tierLabel = '⚖️ 王牌常规抗压'
  let scoreModifier = 0.02
  let reason = ''

  const sampleText = sampleMatches > 0
    ? `（胜率 ${winRateFormatted}，实战${sampleMatches}战${sampleWins}胜）`
    : `（机制先验期望胜率 ${winRateFormatted} · 待新实战样本收录）`

  if (smoothedWinRate >= 0.38) {
    tier = 'S'
    tierLabel = '👑 王牌T0超模'
    scoreModifier = +0.20
    reason = `王牌对决T0：「${cleanCmd}」操盘「${cleanBuild}」在王牌高压赛场极速成型且终结力顶尖${sampleText}`
  } else if (smoothedWinRate >= 0.28) {
    tier = 'A'
    tierLabel = '🔥 王牌主流强势'
    scoreModifier = +0.10
    reason = `王牌对决主流优选：「${cleanCmd}」搭配「${cleanBuild}」为王牌高分段抗压优选${sampleText}，发育成型平稳`
  } else if (smoothedWinRate >= 0.18) {
    tier = 'B'
    tierLabel = '⚖️ 王牌常规抗压'
    scoreModifier = +0.02
    reason = `王牌对决常规抗压：「${cleanCmd}」搭配「${cleanBuild}」在王牌赛场发挥平稳${sampleText}，具有基本吃分能力`
  } else {
    tier = 'C'
    tierLabel = '⚠️ 王牌高危陷阱'
    scoreModifier = -0.18
    reason = `王牌对决高危陷阱：「${cleanCmd}」搭配「${cleanBuild}」在王牌高强度高压对抗中缺乏容错率${sampleText}，极易断节奏暴毙`
  }

  return {
    commander: cleanCmd,
    buildName: cleanBuild,
    sampleMatches,
    sampleWins,
    realWinRate,
    smoothedWinRate,
    winRateFormatted,
    tier,
    tierLabel,
    scoreModifier,
    isAceContext: true,
    reason
  }
}

/** 阵容战术体系分类枚举 */
export type LineupArchetypeKey =
  | 'BURST_ASSASSIN' // 刺客突脸
  | 'SUSTAIN_TANK'   // 免控肉坦
  | 'MAGIC_AOE'      // 法爆机甲
  | 'RANGED_CARRY'   // 阵地射手
  | 'FAST_CYCLE'     // 极速倒转
  | 'BRUISER_MELEE'  // 重装战士
  | 'BALANCED_FLEX'  // 均衡流派

/** 阵容体系特征元数据 */
export interface LineupArchetypeInfo {
  key: LineupArchetypeKey
  name: string
  icon: string
  tactics: string
  strengths: string
  weaknesses: string
}

export const LINEUP_ARCHETYPES: Record<LineupArchetypeKey, LineupArchetypeInfo> = {
  BURST_ASSASSIN: {
    key: 'BURST_ASSASSIN',
    name: '刺客突脸',
    icon: '🗡️',
    tactics: '开局越位突击后排脆皮核心，超高单点瞬间斩杀',
    strengths: '天克阵地射手、打断未成型的极速倒转核心',
    weaknesses: '惧怕免控肉坦吸收伤害反震、难以正面硬撼重装战士'
  },
  SUSTAIN_TANK: {
    key: 'SUSTAIN_TANK',
    name: '免控肉坦',
    icon: '🛡️',
    tactics: '超高抗性免控减伤，多核承伤或养猪单核反打',
    strengths: '完美化解刺客突脸爆发，稳健吃分',
    weaknesses: '被大范围高法穿法爆融化、后期被极速倒转真伤溢出击穿'
  },
  MAGIC_AOE: {
    key: 'MAGIC_AOE',
    name: '法爆机甲',
    icon: '🔮',
    tactics: '大范围法术穿透与高额真伤轰炸，直接融化前排重装',
    strengths: '法穿范围大招天克抱团重装肉坦与近战',
    weaknesses: '机甲身板薄弱且读条启动慢，极度惧怕刺客开局跳脸秒杀'
  },
  RANGED_CARRY: {
    key: 'RANGED_CARRY',
    name: '阵地射手',
    icon: '🏹',
    tactics: '超远射程与高攻速高破甲，阵地拉扯持续物理输出',
    strengths: '持续远程破甲风筝笨重战士、高速压低倒转血线',
    weaknesses: '阵地缺乏位移保命，惧怕刺客突进秒杀'
  },
  FAST_CYCLE: {
    key: 'FAST_CYCLE',
    name: '极速倒转',
    icon: '⚡',
    tactics: '极速经济倒转与卡牌无限过牌，快速全员追三高费大核',
    strengths: '后期高阶大核质量碾压纯肉坦、连续补牌反推法爆',
    weaknesses: '启动前防守薄弱，被高爆发刺客突击或射手速攻强力压血'
  },
  BRUISER_MELEE: {
    key: 'BRUISER_MELEE',
    name: '重装战士',
    icon: '🪓',
    tactics: '半肉近战扎堆，高韧性对抗与强力前排近身绞杀',
    strengths: '身板厚实克制爆发刺客，一套切不掉反被反杀',
    weaknesses: '手短易被阵地射手远程拉扯风筝、抱团易吃满法爆轰炸'
  },
  BALANCED_FLEX: {
    key: 'BALANCED_FLEX',
    name: '均衡流派',
    icon: '⚖️',
    tactics: '多阵营混搭与均衡过渡，各维属性平衡',
    strengths: '无极端天敌，博弈稳定性良好',
    weaknesses: '缺乏极致终结手段'
  }
}

/** 智能识别阵容字符串所属的战术体系 */
export function identifyLineupArchetype(buildName: string | null | undefined): LineupArchetypeInfo {
  if (!buildName) return LINEUP_ARCHETYPES.BALANCED_FLEX
  const b = buildName.trim()

  if (/吕布|海月|刺客|突进|斩杀|阿离|长安刺|司马懿/.test(b)) {
    return LINEUP_ARCHETYPES.BURST_ASSASSIN
  }
  if (/雷霆|战机|法爆|法天|法系|法核|安琪拉/.test(b)) {
    return LINEUP_ARCHETYPES.MAGIC_AOE
  }
  if (/倒转|我不后悔|转瞬|永动/.test(b)) {
    return LINEUP_ARCHETYPES.FAST_CYCLE
  }
  if (/三分|蒙犽|射手|破甲|速攻|坦射|鲁班/.test(b)) {
    return LINEUP_ARCHETYPES.RANGED_CARRY
  }
  if (/养猪|肉坦|前排|保核|防守|护盾|纯肉|庄周/.test(b)) {
    return LINEUP_ARCHETYPES.SUSTAIN_TANK
  }
  if (/蒙恬|李信|木兰|战士|逐鹿|龙蛇|河洛/.test(b)) {
    return LINEUP_ARCHETYPES.BRUISER_MELEE
  }

  return LINEUP_ARCHETYPES.BALANCED_FLEX
}

/** 体系克制规则定义库 */
export const ARCHETYPE_COUNTER_RULES: Record<
  LineupArchetypeKey,
  {
    counters: { target: LineupArchetypeKey; reason: string }[]
    counteredBy: { target: LineupArchetypeKey; reason: string }[]
  }
> = {
  BURST_ASSASSIN: {
    counters: [
      { target: 'RANGED_CARRY', reason: '刺客开局越位突击脆皮后排，令阵地射手无法持续输出' },
      { target: 'FAST_CYCLE', reason: '在极速倒转启动成型前强行突脸压血，瞬秒核心组件' }
    ],
    counteredBy: [
      { target: 'SUSTAIN_TANK', reason: '免控肉坦超高减伤护体，刺客首轮爆发秒不掉反遭单核磨死' },
      { target: 'BRUISER_MELEE', reason: '重装战士身板硬伤害足，刺客刮痧反被近身合围绞杀' }
    ]
  },
  SUSTAIN_TANK: {
    counters: [
      { target: 'BURST_ASSASSIN', reason: '超高减伤免控护体，完美吸收刺客突进爆发并反震反击' }
    ],
    counteredBy: [
      { target: 'MAGIC_AOE', reason: '大范围法术穿透与高额真伤轰炸，无视物理护甲直接融化肉坦' },
      { target: 'FAST_CYCLE', reason: '后期倒转体系全员追三高费大核伤害溢出，纯肉无法抵挡轮番终结' }
    ]
  },
  MAGIC_AOE: {
    counters: [
      { target: 'SUSTAIN_TANK', reason: '范围法穿高爆发直接融化扎堆前排肉坦' },
      { target: 'BRUISER_MELEE', reason: '笨重抱团近战吃满大范围法爆轰炸，难以近身' }
    ],
    counteredBy: [
      { target: 'BURST_ASSASSIN', reason: '法师机甲身板脆弱且读条慢，被刺客先手跳脸瞬秒' }
    ]
  },
  RANGED_CARRY: {
    counters: [
      { target: 'BRUISER_MELEE', reason: '超远射程拉扯风筝笨重近战，高破甲将其击穿在冲锋路上' },
      { target: 'FAST_CYCLE', reason: '前中期高攻速强行压低血线，倒转体系尚未启动已被打残' }
    ],
    counteredBy: [
      { target: 'BURST_ASSASSIN', reason: '阵地射手缺乏后排脱战位移，直接被刺客近身瞬秒' }
    ]
  },
  FAST_CYCLE: {
    counters: [
      { target: 'SUSTAIN_TANK', reason: '后期三星高费大核伤害溢出，纯肉坦无法抗住持续碾压' },
      { target: 'MAGIC_AOE', reason: '依靠非觉醒连击与高频补牌反推法爆机甲' }
    ],
    counteredBy: [
      { target: 'BURST_ASSASSIN', reason: '启动前核心极易被刺客定点击杀' },
      { target: 'RANGED_CARRY', reason: '前中期射手强速攻持续压血容错极低' }
    ]
  },
  BRUISER_MELEE: {
    counters: [
      { target: 'BURST_ASSASSIN', reason: '半肉身板扎实，刺客一套无法秒杀反被战士近战斩杀' }
    ],
    counteredBy: [
      { target: 'RANGED_CARRY', reason: '手短缺乏位移，在射手远程风筝下难以近身' },
      { target: 'MAGIC_AOE', reason: '近战扎堆吃满范围法爆融化' }
    ]
  },
  BALANCED_FLEX: {
    counters: [],
    counteredBy: []
  }
}

/** 阵容生态克制关系项 */
export interface LineupCounterRelation {
  targetSeat: number
  targetPlayer: string
  targetBuild: string
  targetArchetypeKey: LineupArchetypeKey
  targetArchetypeLabel: string
  advantage: 'ADVANTAGE' | 'DISADVANTAGE'
  reason: string
}

/** 6x6 阵容对抗矩阵单元格 */
export interface LineupCounterMatrixCell {
  fromSeat: number
  toSeat: number
  status: 'COUNTER' | 'COUNTERED' | 'TIED'
  label: string
  tooltip: string
}

/** 评估 6 人同场比赛中，所有选手阵容体系间的相互克制关系与博弈得分 */
export function evaluate6PlayerLineupCounters(
  participants: { slot: number; nickname: string; buildName: string }[]
): {
  perPlayer: {
    slot: number
    archetype: LineupArchetypeInfo
    scoreModifier: number
    counters: LineupCounterRelation[]
    counteredBy: LineupCounterRelation[]
    summary: string
  }[]
  cells: LineupCounterMatrixCell[][]
  ecosystemSummary: string
} {
  const n = participants.length
  const archetypes = participants.map(p => identifyLineupArchetype(p.buildName))

  // 初始化 6x6 矩阵网格
  const cells: LineupCounterMatrixCell[][] = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => ({
      fromSeat: 0,
      toSeat: 0,
      status: 'TIED' as const,
      label: '—',
      tooltip: '体系互不相克或自身'
    }))
  )

  const countersList: LineupCounterRelation[][] = Array.from({ length: n }, () => [])
  const counteredByList: LineupCounterRelation[][] = Array.from({ length: n }, () => [])
  const scoreModifiers: number[] = new Array(n).fill(0)

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      cells[i][j].fromSeat = participants[i].slot
      cells[i][j].toSeat = participants[j].slot

      if (i === j) {
        cells[i][j].label = '—'
        cells[i][j].tooltip = `#${participants[i].slot} ${participants[i].nickname}（自身阵容）`
        continue
      }

      const archA = archetypes[i]
      const archB = archetypes[j]
      const rulesA = ARCHETYPE_COUNTER_RULES[archA.key]

      const counterMatch = rulesA?.counters.find(c => c.target === archB.key)
      const counteredMatch = rulesA?.counteredBy.find(c => c.target === archB.key)

      if (counterMatch) {
        cells[i][j].status = 'COUNTER'
        cells[i][j].label = '克制'
        cells[i][j].tooltip = `#${participants[i].slot}「${archA.name}」克制 #${participants[j].slot}「${archB.name}」：${counterMatch.reason}`
        countersList[i].push({
          targetSeat: participants[j].slot,
          targetPlayer: participants[j].nickname,
          targetBuild: participants[j].buildName,
          targetArchetypeKey: archB.key,
          targetArchetypeLabel: archB.name,
          advantage: 'ADVANTAGE',
          reason: counterMatch.reason
        })
        scoreModifiers[i] += 0.06
      } else if (counteredMatch) {
        cells[i][j].status = 'COUNTERED'
        cells[i][j].label = '受制'
        cells[i][j].tooltip = `#${participants[i].slot}「${archA.name}」遭 #${participants[j].slot}「${archB.name}」克制：${counteredMatch.reason}`
        counteredByList[i].push({
          targetSeat: participants[j].slot,
          targetPlayer: participants[j].nickname,
          targetBuild: participants[j].buildName,
          targetArchetypeKey: archB.key,
          targetArchetypeLabel: archB.name,
          advantage: 'DISADVANTAGE',
          reason: counteredMatch.reason
        })
        scoreModifiers[i] -= 0.06
      } else {
        cells[i][j].status = 'TIED'
        cells[i][j].label = '均势'
        cells[i][j].tooltip = `#${participants[i].slot}「${archA.name}」与 #${participants[j].slot}「${archB.name}」：流派均势对抗`
      }
    }
  }

  const perPlayer = participants.map((p, idx) => {
    const arch = archetypes[idx]
    const clampedScore = Number(Math.min(0.24, Math.max(-0.24, scoreModifiers[idx])).toFixed(3))
    const cnt = countersList[idx]
    const cntBy = counteredByList[idx]

    let summary = `王牌体系均势：所选「${arch.name}」在当前 6 人王牌博弈中各体系互有制衡`
    if (cnt.length > 0 && cntBy.length > 0) {
      summary = `王牌博弈胶着：克制 #${cnt.map(c => c.targetSeat).join('、#')} (${cnt.map(c => c.targetArchetypeLabel).join('、')})；遭 #${cntBy.map(c => c.targetSeat).join('、#')} (${cntBy.map(c => c.targetArchetypeLabel).join('、')}) 针对`
    } else if (cnt.length > 0) {
      summary = `王牌体系占优：${arch.name}有效克制场上 #${cnt.map(c => c.targetSeat).join('、#')} (${cnt.map(c => c.targetArchetypeLabel).join('、')})，王牌对决赛场生态占优 (+${(clampedScore * 100).toFixed(0)}%)`
    } else if (cntBy.length > 0) {
      summary = `王牌体系受制：${arch.name}遭场上 #${cntBy.map(c => c.targetSeat).join('、#')} (${cntBy.map(c => c.targetArchetypeLabel).join('、')}) 针对克制，王牌高压对抗下生存压力偏大 (${(clampedScore * 100).toFixed(0)}%)`
    }

    return {
      slot: p.slot,
      archetype: arch,
      scoreModifier: clampedScore,
      counters: cnt,
      counteredBy: cntBy,
      summary
    }
  })

  // 生成整场阵容博弈生态概览
  const advantaged = perPlayer.filter(p => p.scoreModifier > 0).map(p => `#${p.slot} ${p.archetype.name}`)
  const disadvantaged = perPlayer.filter(p => p.scoreModifier < 0).map(p => `#${p.slot} ${p.archetype.name}`)

  let ecosystemSummary = '本场 6 位选手阵容体系百花齐放，各流派克制关系交错，属于王牌对决均衡博弈局。'
  if (advantaged.length && disadvantaged.length) {
    ecosystemSummary = `本场王牌对决体系博弈：顶尖高手对位克制分化显著，【${advantaged.join('、')}】凭借流派相克占得先机，而【${disadvantaged.join('、')}】面临严苛对位压力。`
  }

  return {
    perPlayer,
    cells,
    ecosystemSummary
  }
}

/** 核心选手权威绝活与招牌棋手档案库定义 */
export interface PlayerMasterProfileDef {
  masterName: string
  aliases: string[]
  signatureCommander: string // 最爱用/胜率最高的官方招牌棋手
  alternativeCommanders: string[] // 常用备选棋手
  signatureBuilds: string[] // 招牌擅长阵容（按熟练度与实战胜率从高到低排序）
  playstyle: string // 打法风格与竞技画像
  commanderBuildMap?: Record<string, string[]> // 棋手与专属常用阵容历史偏好映射
  note?: string
}

/** 明星选手权威知识库（结合国服战报与选手真实流派画像） */
export const PLAYER_MASTER_PROFILES: readonly PlayerMasterProfileDef[] = [
  {
    masterName: '沐汐',
    aliases: ['沐汐', 'EZ沐汐', 'EZ沐汐嘻嘻嘻', 'EZ抖音沐汐', 'QT鱼沐汐0丶7版', 'EZ拉丁鱼丶沐汐', 'EZ拉丁鱼', '拉丁鱼', 'EZ灬欧洲鱼', '欧洲鱼', '沐汐诸葛龟版'],
    signatureCommander: '乔汐',
    alternativeCommanders: ['阿离', '玉环'],
    signatureBuilds: ['日落海倒转', '三分倒转', '伞半月'],
    playstyle: '国一倒转王，日落海与三分倒转天花板，刷牌节奏极快',
    commanderBuildMap: {
      '乔汐': ['日落海倒转', '三分倒转'],
      '阿离': ['伞半月', '日落海倒转'],
      '玉环': ['日落海倒转', '三分倒转'],
      '白歌': ['三分倒转', '日落海倒转'],
      '庄小鱼': ['传统养猪', '日落海倒转']
    }
  },
  {
    masterName: '嘉誉',
    aliases: ['嘉誉', '刷牌之怪嘉誉', '胜天半子嘉誉'],
    signatureCommander: '马可',
    alternativeCommanders: ['玉环', '镜'],
    signatureBuilds: ['镜猪转吕布', '牺牲李信', '雷霆战机'],
    playstyle: '擅长高费大核变阵与镜猪体系，胜天半子后期运营',
    commanderBuildMap: {
      '马可': ['镜猪转吕布', '镜转海月', '雷霆战机'],
      '明先生': ['牺牲李信', '三分登场'],
      '玉环': ['牺牲李信', '雷霆战机'],
      '安琪拉': ['雷霆战机'],
      '镜': ['镜猪转海月', '镜猪转吕布'],
      '庄小鱼': ['传统养猪', '牺牲李信']
    }
  },
  {
    masterName: '遗愿',
    aliases: ['遗愿', 'QT披萨鱼遗愿', 'QT电竞披萨鱼', '披萨鱼', 'QT披萨鱼', '抖音遗愿1'],
    signatureCommander: '嬴律',
    alternativeCommanders: ['白歌', '香香'],
    signatureBuilds: ['三分登场', '逐鹿蒙恬', '河洛木兰'],
    playstyle: '三分登场与逐鹿体系招牌高手，单核追三连胜压制',
    commanderBuildMap: {
      '嬴律': ['逐鹿蒙恬', '三分登场'],
      '香香': ['三分登场', '逐鹿蒙恬'],
      '马可': ['猪镜转李信', '镜猪转吕布', '逐鹿蒙恬'],
      '白歌': ['三分倒转', '逐鹿蒙恬'],
      '庄小鱼': ['镜猪转吕布', '传统养猪'],
      '武凤': ['河洛木兰', '逐鹿蒙恬']
    }
  },
  {
    masterName: '刺儿',
    aliases: ['刺儿', '抖音刺儿'],
    signatureCommander: '乔汐',
    alternativeCommanders: ['镜', '阿离'],
    signatureBuilds: ['日落海倒转', '镜猪转海月', '镜猪转吕布'],
    playstyle: '极速倒转与海月爆发，擅长抓抢节奏',
    commanderBuildMap: {
'乔汐': ['日落海倒转', '三分倒转'],
      '庄小鱼': ['镜猪转吕布', '日落海倒转'],
      '镜': ['镜猪转海月', '镜猪转吕布'],
      '马可': ['镜猪转吕布'],
      '玉环': ['日落海倒转'],
      '阿离': ['日落海倒转']
    }
  },
  {
    masterName: '刺痛',
    aliases: ['刺痛', '抖音刺痛', 'QG刺痛', 'Hurt刺痛'],
    signatureCommander: '香香',
    alternativeCommanders: ['班叔', '马可'],
    signatureBuilds: ['传统养猪', '逐鹿蒙犽', '稷下坦射'],
    playstyle: '顶尖职业射手底蕴，擅长传统养猪、逐鹿蒙犽与坦射推进',
    commanderBuildMap: {
'香香': ['逐鹿蒙犽', '稷下坦射', '传统养猪'],
      '白歌': ['传统养猪', '逐鹿蒙犽'],
      '班叔': ['逐鹿蒙犽', '稷下坦射'],
      '马可': ['传统养猪', '逐鹿蒙犽', '镜猪转吕布'],
      '庄小鱼': ['传统养猪', '逐鹿蒙犽'],
      '镜': ['镜猪转吕布']
    }
  },
  {
    masterName: '逆光',
    aliases: ['逆光', 'B站QT逆光', 'QT逆光'],
    signatureCommander: '庄小鱼',
    alternativeCommanders: ['孙小宾', '白歌'],
    signatureBuilds: ['传统养猪', '三分倒转', '雷霆战机'],
    playstyle: '前排保核运营稳健，传统养猪与雷霆战机专精',
    commanderBuildMap: {
      '庄小鱼': ['传统养猪', '三分倒转'],
      '孙小宾': ['雷霆战机', '三分倒转'],
      '白歌': ['三分倒转', '雷霆战机'],
      '乔汐': ['日落海倒转', '三分倒转'],
      '安琪拉': ['雷霆战机'],
      '玉环': ['三分倒转', '传统养猪']
    }
  },
  {
    masterName: '小谷芷',
    aliases: ['小谷芷', 'EGM小谷芷', '抖音EGM小谷芷', '小琳谷芷'],
    signatureCommander: '嬴律',
    alternativeCommanders: ['安琪拉', '庄小鱼'],
    signatureBuilds: ['雷霆战机', '三分登场', '逐鹿蒙恬', '传统养猪'],
    playstyle: '顶尖多面手，雷霆战机法爆机甲与嬴律三分双绝活',
    commanderBuildMap: {
'嬴律': ['三分登场', '逐鹿蒙恬', '雷霆战机'],
      '安琪拉': ['雷霆战机', '日落海倒转'],
      '庄小鱼': ['传统养猪']
    }
  },
  {
    masterName: '碎碎圆圆',
    aliases: ['碎碎圆圆', '抖音EG碎碎圆圆', 'EG碎碎圆圆', '碎碎'],
    signatureCommander: '玉环',
    alternativeCommanders: ['安琪拉', '乔汐'],
    signatureBuilds: ['日落海倒转', '三分倒转', '雷霆战机'],
    playstyle: '全国第二玉环，擅长霓裳曲刷牌倒转与安琪拉法爆机甲',
    commanderBuildMap: {
'玉环': ['日落海倒转', '三分倒转'],
      '安琪拉': ['雷霆战机', '日落海倒转'],
      '乔汐': ['日落海倒转', '三分倒转']
    }
  },
  {
    masterName: '丰川祥子',
    aliases: ['丰川祥子', '祥子'],
    signatureCommander: '武凤',
    alternativeCommanders: ['白歌', '马可'],
    signatureBuilds: ['河洛木兰', '逐鹿蒙恬', '三分登场'],
    playstyle: '河洛女帝近战爆发与逐鹿前排压制',
    commanderBuildMap: {
'武凤': ['河洛木兰', '逐鹿蒙恬'],
      '白歌': ['河洛木兰', '三分登场'],
      '马可': ['逐鹿蒙恬']
    }
  },
  {
    masterName: '白白白白3',
    aliases: ['白白白白3', '白白白白白3', '白白'],
    signatureCommander: '庄小鱼',
    alternativeCommanders: ['镜', '马可'],
    signatureBuilds: ['传统养猪', '镜猪转吕布', '日落海倒转'],
    playstyle: '多核养猪与后期大吕布换帅',
    commanderBuildMap: {
'庄小鱼': ['传统养猪'],
      '镜': ['镜猪转吕布'],
      '马可': ['传统养猪']
    }
  },
  {
    masterName: '新一',
    aliases: ['新一', 'QT新一', '抖音QT新一'],
    signatureCommander: '嬴律',
    alternativeCommanders: ['安琪拉', '白歌'],
    signatureBuilds: ['三分登场', '成年礼三分', '雷霆战机'],
    playstyle: '成年礼三分与雷霆战机速追三星',
    commanderBuildMap: {
'嬴律': ['三分登场', '成年礼三分', '雷霆战机'],
      '安琪拉': ['雷霆战机'],
      '白歌': ['三分登场', '三分倒转']
    }
  },
  {
    masterName: '猪葛龟',
    aliases: ['猪葛龟', '猪葛龟龟', '抖音猪葛龟龟', '抖音诸葛龟龟', 'I蟲抖音猪葛龟'],
    signatureCommander: '庄小鱼',
    alternativeCommanders: ['乔汐', '白歌', '武凤'],
    signatureBuilds: ['传统养猪', '日落海倒转', '三分倒转', '牺牲李信'],
    playstyle: '庄周免控养猪天花板，兼修日落海与三分倒转',
    commanderBuildMap: {
      '庄小鱼': ['传统养猪', '日落海倒转'],
      '乔汐': ['日落海倒转', '三分倒转'],
      '白歌': ['传统养猪', '三分倒转'],
      '武凤': ['牺牲李信', '传统养猪']
    }
  },
  {
    masterName: '呆头鹅',
    aliases: ['呆头鹅', '抖音呆头鹅'],
    signatureCommander: '乔汐',
    alternativeCommanders: ['阿离', '嬴律'],
    signatureBuilds: ['日落海倒转', '伞半月', '三分倒转'],
    playstyle: '伞半月与日落海倒转高手',
    commanderBuildMap: {
'乔汐': ['日落海倒转', '三分倒转'],
      '阿离': ['伞半月', '日落海倒转'],
      '嬴律': ['三分登场', '逐鹿蒙恬']
    }
  },
  {
    masterName: '世薄情',
    aliases: ['世薄情', '抖音世薄情'],
    signatureCommander: '马可',
    alternativeCommanders: ['嬴律', '白歌'],
    signatureBuilds: ['逐鹿蒙恬', '大河龙蛇', '镜猪转吕布'],
    playstyle: '大河龙蛇与逐鹿变阵专家',
    commanderBuildMap: {
'马可': ['逐鹿蒙恬', '大河龙蛇', '镜猪转吕布'],
      '嬴律': ['逐鹿蒙恬'],
      '白歌': ['大河龙蛇', '逐鹿蒙恬']
    }
  },
  {
    masterName: '小新游',
    aliases: ['小新游', '抖音小新游', '小新U'],
    signatureCommander: '嬴律',
    alternativeCommanders: ['庄小鱼', '白歌'],
    signatureBuilds: ['三分登场', '传统养猪', '雷霆战机'],
    playstyle: '三分速成与低费追三',
    commanderBuildMap: {
'嬴律': ['三分登场', '逐鹿蒙恬'],
      '庄小鱼': ['传统养猪'],
      '白歌': ['三分登场', '雷霆战机']
    }
  },
  {
    masterName: '妖柒',
    aliases: ['妖柒', '抖音妖柒'],
    signatureCommander: '安琪拉',
    alternativeCommanders: ['乔汐', '庄小鱼'],
    signatureBuilds: ['雷霆战机', '日落海倒转', '传统养猪'],
    playstyle: '机甲爆发与雷霆切后',
    commanderBuildMap: {
'安琪拉': ['雷霆战机'],
      '乔汐': ['日落海倒转'],
      '庄小鱼': ['传统养猪']
    }
  },
  {
    masterName: '梦飞',
    aliases: ['梦飞', '梦飞大大', '抖音梦飞', '抖音梦飞冻冻', '抖音梦飞1', '抖音梦飞77'],
    signatureCommander: '马可',
    alternativeCommanders: ['白歌', '庄小鱼', '玉环'],
    signatureBuilds: ['成年礼三分登场', '三分登场', '日落海倒转', '镜猪转吕布', '牺牲李信'],
    playstyle: '大局运营扎实，马可三分登顶与白歌灵活变阵',
    commanderBuildMap: {
'马可': ['成年礼三分登场', '三分登场', '镜猪转吕布'],
      '白歌': ['成年礼三分登场', '日落海倒转'],
      '庄小鱼': ['传统养猪'],
      '玉环': ['牺牲李信', '日落海倒转']
    }
  },
  {
    masterName: '晓枫',
    aliases: ['晓枫', 'RW侠.晓枫', 'RW侠晓枫'],
    signatureCommander: '乔汐',
    alternativeCommanders: ['阿离', '安琪拉'],
    signatureBuilds: ['日落海倒转', '三分倒转', '雷霆战机'],
    playstyle: '极速倒转与机动爆发',
    commanderBuildMap: {
'乔汐': ['日落海倒转', '三分倒转'],
      '阿离': ['日落海倒转', '伞半月'],
      '安琪拉': ['雷霆战机']
    }
  },
  {
    masterName: '清辞',
    aliases: ['清辞', 'EG清辞', 'DYEG清辞', '抖音EG清辞', '武汉 EG清辞'],
    signatureCommander: '白歌',
    alternativeCommanders: ['乔汐', '嬴律'],
    signatureBuilds: ['三分倒转', '日落海倒转', '河洛木兰'],
    playstyle: '倒转控节奏与女帝连招',
    commanderBuildMap: {
'白歌': ['三分倒转', '河洛木兰'],
      '乔汐': ['三分倒转', '日落海倒转'],
      '嬴律': ['三分登场']
    }
  },
  {
    masterName: '湛蓝',
    aliases: ['湛蓝', '抖音湛蓝'],
    signatureCommander: '武凤',
    alternativeCommanders: ['嬴律', '香香', '白歌'],
    signatureBuilds: ['河洛木兰', '三分登场', '成年礼三分', '逐鹿蒙恬'],
    playstyle: '擅长武凤河洛爆发突脸与嬴律三分推进',
    commanderBuildMap: {
'武凤': ['河洛木兰', '逐鹿蒙恬'],
      '嬴律': ['三分登场', '成年礼三分', '逐鹿蒙恬'],
      '香香': ['三分登场', '逐鹿蒙犽'],
      '白歌': ['三分登场']
    }
  },
  {
    masterName: '阿文',
    aliases: ['阿文', 'EZ阿文', '抖音EZ阿文', '阿文倒转王'],
    signatureCommander: '乔汐',
    alternativeCommanders: ['嬴律', '阿离', '白歌'],
    signatureBuilds: ['日落海倒转', '三分倒转', '雷霆战机', '三分登场'],
    playstyle: '公孙离与乔汐极速倒转，兼修嬴律速攻',
    commanderBuildMap: {
'乔汐': ['日落海倒转', '三分倒转'],
      '嬴律': ['三分登场', '日落海倒转'],
      '阿离': ['伞半月', '日落海倒转'],
      '白歌': ['三分倒转']
    }
  },
  {
    masterName: '皮皮鲨',
    aliases: ['皮皮鲨', 'EGM皮皮鲨', '抖音EGM皮皮鲨', '抖音EGM皮皮'],
    signatureCommander: '玉环',
    alternativeCommanders: ['庄小鱼', '乔汐'],
    signatureBuilds: ['日落海倒转', '传统养猪', '大河龙蛇'],
    playstyle: '霓裳连击与倒转大核',
    commanderBuildMap: {
'玉环': ['日落海倒转', '传统养猪'],
      '庄小鱼': ['传统养猪'],
      '乔汐': ['日落海倒转']
    }
  },
  {
    masterName: '色彩',
    aliases: ['色彩', '抖音EZ、色彩', '抖音EZ色彩'],
    signatureCommander: '班叔',
    alternativeCommanders: ['马可', '乔汐'],
    signatureBuilds: ['稷下坦射', '日落海倒转', '逐鹿蒙犽'],
    playstyle: 'EZ战队核心，擅长阵地坦射防御与日落海连招',
    commanderBuildMap: {
'班叔': ['稷下坦射', '逐鹿蒙犽'],
      '马可': ['逐鹿蒙犽', '日落海倒转'],
      '乔汐': ['日落海倒转']
    }
  },
  {
    masterName: '流儿',
    aliases: ['流儿', '抖音流儿', '抖音搜流儿'],
    signatureCommander: '嬴律',
    alternativeCommanders: ['镜', '白歌'],
    signatureBuilds: ['三分登场', '逐鹿蒙恬', '镜猪转吕布'],
    playstyle: '擅长三分速攻推本与刺客大核变阵',
    commanderBuildMap: {
'嬴律': ['三分登场', '逐鹿蒙恬'],
      '镜': ['镜猪转吕布', '三分登场'],
      '白歌': ['三分登场']
    }
  },
  {
    masterName: '白兔',
    aliases: ['白兔', '有局｜白兔', '有局|白兔', '有局丨白兔', '有局白兔'],
    signatureCommander: '阿离',
    alternativeCommanders: ['庄小鱼', '乔汐'],
    signatureBuilds: ['伞半月', '传统养猪', '日落海倒转'],
    playstyle: '全国第十阿离，11-09实战夺冠高手，阿离灵动位移与免控养猪',
    commanderBuildMap: {
'阿离': ['伞半月', '日落海倒转'],
      '庄小鱼': ['传统养猪'],
    }
  },
  {
    masterName: '北念',
    aliases: ['北念', '抖音搜索北念', '抖音北念'],
    signatureCommander: '嬴律',
    alternativeCommanders: ['明先生', '白歌'],
    signatureBuilds: ['牺牲李信', '三分登场', '雷霆战机'],
    playstyle: '实战高胜率大核，单核李信爆发与三分速推',
    commanderBuildMap: {
      '嬴律': ['三分登场', '雷霆战机'],
      '明先生': ['牺牲李信', '三分登场'],
      '白歌': ['三分登场']
    }
  },
  {
    masterName: '甜卷大王',
    aliases: ['甜卷大王'],
    signatureCommander: '镜',
    alternativeCommanders: ['白歌', '马可'],
    signatureBuilds: ['镜猪转吕布', '刺客突脸', '传统养猪'],
    playstyle: '精通镜铜像复制与后期大吕布换帅收割',
    commanderBuildMap: {
'镜': ['镜猪转吕布'],
      '白歌': ['传统养猪'],
      '马可': ['镜猪转吕布']
    }
  },
  {
    masterName: '雾与散声慢慢',
    aliases: ['雾与散声慢慢'],
    signatureCommander: '阿离',
    alternativeCommanders: ['乔汐', '玉环'],
    signatureBuilds: ['伞半月', '日落海倒转'],
    playstyle: '尧天机动突进与高敏捷持续输出',
    commanderBuildMap: {
'阿离': ['伞半月', '日落海倒转'],
      '乔汐': ['日落海倒转'],
      '玉环': ['日落海倒转']
    }
  },
  {
    masterName: '小优律',
    aliases: ['小优律', 'B站QT小优律'],
    signatureCommander: '庄小鱼',
    alternativeCommanders: ['孙小宾', '乔汐'],
    signatureBuilds: ['传统养猪', '三分倒转', '雷霆战机'],
    playstyle: 'QT战队稳健防守，前排免控与手牌回溯',
    commanderBuildMap: {
'庄小鱼': ['传统养猪'],
      '孙小宾': ['雷霆战机', '三分倒转']
    }
  },
  {
    masterName: '风喵喵',
    aliases: ['风喵喵', '抖音风喵喵', '风喵'],
    signatureCommander: '白歌',
    alternativeCommanders: ['玉环', '乔汐'],
    signatureBuilds: ['三分倒转', '日落海倒转', '河洛木兰'],
    playstyle: '高分段倒转绝活哥，擅长即兴创作合成复制与三分极速爆发',
    commanderBuildMap: {
'白歌': ['三分倒转', '河洛木兰', '传统养猪'],
      '玉环': ['三分倒转', '日落海倒转'],
      '乔汐': ['三分倒转', '日落海倒转']
    }
  },
  {
    masterName: '心机猫',
    aliases: ['心机猫', '冷酷心机小猫', '心机小猫', '冷酷心机猫'],
    signatureCommander: '嬴律',
    alternativeCommanders: ['安琪拉', '白歌'],
    signatureBuilds: ['逐鹿蒙恬', '雷霆战机', '三分登场'],
    playstyle: '高分段进攻型选手，擅长嬴律单核追三蒙恬与安琪拉法爆机甲',
    commanderBuildMap: {
'嬴律': ['逐鹿蒙恬', '三分登场', '日落海倒转'],
      '安琪拉': ['雷霆战机', '法天象地'],
      '白歌': ['逐鹿蒙恬', '三分登场']
    }
  },
  {
    masterName: '月影孤冰',
    aliases: ['月影孤冰', '抖音月影孤冰', '月影'],
    signatureCommander: '小妲己',
    alternativeCommanders: ['庄小鱼', '明先生'],
    signatureBuilds: ['传统养猪', '长安九五', '逐鹿蒙恬'],
    playstyle: '稳健防守保底发育，擅长小妲己送牌经济与养猪肉核',
    commanderBuildMap: {
'小妲己': ['传统养猪', '长安九五', '逐鹿蒙恬'],
      '庄小鱼': ['传统养猪'],
      '明先生': ['传统养猪', '长安九五']
    }
  },
  {
    masterName: 'Yk',
    aliases: ['Yk丶', 'Yk', 'YK丶', 'YK', 'yk', 'yk丶'],
    signatureCommander: '安琪拉',
    alternativeCommanders: ['孙小宾', '乔汐'],
    signatureBuilds: ['雷霆战机', '三分倒转', '日落海倒转'],
    playstyle: '法爆狂潮与孙小宾牌序回溯变阵',
    commanderBuildMap: {
'安琪拉': ['雷霆战机', '法天象地'],
      '孙小宾': ['雷霆战机', '三分倒转'],
      '乔汐': ['三分倒转', '日落海倒转']
    }
  }
]

/** 查找选手权威核心档案 */
export function findPlayerMasterProfile(nameOrAlias: string | null | undefined): PlayerMasterProfileDef | null {
  if (!nameOrAlias || !nameOrAlias.trim()) return null
  const clean = nameOrAlias.trim()
  const master = getMasterPlayerName(clean)
  return (
    PLAYER_MASTER_PROFILES.find(
      p =>
        p.masterName === master ||
        p.masterName === clean ||
        p.aliases.some(a => a.toLowerCase() === clean.toLowerCase() || clean.toLowerCase().includes(a.toLowerCase()))
    ) || null
  )
}

/** 棋手下对应的常用流派细分统计 */
export interface CommanderBuildDetail {
  buildName: string
  matches: number
  wins: number
  winRate: number
  share: number
}

/** 选手在某个棋手下的出场与常用阵容实战画像 */
export interface CommanderUsageProfile {
  commander: string
  tier: 'T0' | 'T1' | 'T2'
  matches: number
  wins: number
  winRate: number
  topBuilds: CommanderBuildDetail[]
  favoriteBuild: string // 该棋手下最常玩的首选阵容
  isSignature: boolean // 是否为官方权威招牌棋手
}

/** 选手出战阵容推断结构体 */
export interface PlayerInferredLineup {
  lineupName: string // 本场推断阵容名称
  isFallback: boolean // 是否因 Ban 位受阻而被迫切换备选流派
  primaryBuild: string // 选手平时最擅长的第一招牌流派
  reason: string // 推断依据
  bannedWarning?: string // 若第一流派被 Ban，给出告警提示
  commanderProfile?: CommanderUsageProfile | null // 该选手在所选棋手下的历史实战画像
  commanderAdaptation?: CommanderAdaptivePool | null // 棋手在当前禁选下的适配池
  proficiency?: PlayerLineupProficiency | null // 选手对该棋手该阵容的专精熟练度画像
  commanderBuildSynergy?: CommanderBuildSynergyEval | null // 棋手与该阵容的大盘胜率评估
  lineupArchetype?: LineupArchetypeInfo | null // 阵容所属战术流派体系
  eligibleCommanderBuilds?: CommanderAdaptedBuild[] // 当前合规的适配阵容列表
}

/** 核心推断逻辑：根据【棋手适配流派池 ➔ 禁选阵营动态剪枝 ➔ 选手在各阵容熟练度 ➔ 权威绝活】，精准推断本场选手的出战阵容 */
export function inferPlayerLineup(
  commonBuilds: string[] = [],
  bannedFaction: string | null = null,
  commanderName: string | null = null,
  playerNickname?: string | null,
  commanderProfiles?: CommanderUsageProfile[] | null,
  historicalMatches: any[] = []
): PlayerInferredLineup {
  const masterDef = findPlayerMasterProfile(playerNickname)
  const bf = bannedFaction ? bannedFaction.trim().replace('阵营', '') : null
  const cmdAdaptation = getCommanderAdaptiveBuilds(commanderName, bannedFaction)
  const eligibleBuilds = cmdAdaptation?.eligibleBuilds || []

  // 1. 【核心优先依据】：若选手选定了棋手，根据棋手官方适配库与选手在该棋手下的专精熟练度推断
  if (commanderName && commanderName.trim() && cmdAdaptation) {
    const cleanCmd = cmdAdaptation.commander

    // 寻找选手使用该棋手的统计记录（优先查传入的实战画像，其次查权威档案中的棋手映射）
    const cmdMeta = findCommanderMeta(cleanCmd)
    let matchedCmd = commanderProfiles?.find(
      c => c.commander === cleanCmd || (cmdMeta && cmdMeta.aliases.includes(c.commander))
    )

    // 若无实战动态画像，从权威档案的棋手映射中提取
    if (!matchedCmd && masterDef?.commanderBuildMap) {
      const aliasKey = Object.keys(masterDef.commanderBuildMap).find(
        k => k === cleanCmd || (findCommanderMeta(k)?.name === cleanCmd)
      )
      if (aliasKey && masterDef.commanderBuildMap[aliasKey]?.length) {
        const builds = masterDef.commanderBuildMap[aliasKey]
        matchedCmd = {
          commander: cleanCmd,
          tier: findCommanderMeta(cleanCmd)?.tier || 'T1',
          matches: 4,
          wins: 3,
          winRate: 0.75,
          topBuilds: builds.map((b, bIdx) => ({
            buildName: b,
            matches: 4 - bIdx,
            wins: 3 - bIdx,
            winRate: 0.75,
            share: bIdx === 0 ? 0.7 : 0.3
          })),
          favoriteBuild: builds[0],
          isSignature: true
        }
      }
    }

    // 查找选手的最爱阵容（Primary Favorite）
    const primaryFavorite = matchedCmd?.favoriteBuild || matchedCmd?.topBuilds[0]?.buildName || masterDef?.signatureBuilds[0] || commonBuilds[0] || cmdAdaptation.allBuilds[0]?.buildName

    // 检查选手的第一偏好是否属于该棋手适配池，且是否被当前 Ban 封锁
    const isPrimaryBanned = Boolean(
      bf && primaryFavorite && (primaryFavorite.includes(bf) || cmdAdaptation.bannedBuilds.some(b => b.buildName === primaryFavorite || primaryFavorite.includes(b.buildName)))
    )

    // 尝试在【合规的棋手适配阵容池 eligibleBuilds】中寻找最优匹配
    let chosenBuildName = ''
    let isFallback = false

    if (!isPrimaryBanned && primaryFavorite && eligibleBuilds.some(b => b.buildName === primaryFavorite || primaryFavorite.includes(b.buildName))) {
      // 核心第一偏好合规，直接选用
      const found = eligibleBuilds.find(b => b.buildName === primaryFavorite || primaryFavorite.includes(b.buildName))
      chosenBuildName = found ? found.buildName : primaryFavorite
      isFallback = false
    } else if (matchedCmd && matchedCmd.topBuilds.length > 0) {
      // 核心偏好受 Ban 或不适配，从该选手在该棋手下的备选阵容中挑选合规流派
      const validTopBuild = matchedCmd.topBuilds.find(b =>
        (!bf || !b.buildName.includes(bf)) &&
        eligibleBuilds.some(eb => eb.buildName === b.buildName || b.buildName.includes(eb.buildName))
      )
      if (validTopBuild) {
        chosenBuildName = validTopBuild.buildName
        isFallback = true
      }
    }

    // 若仍未匹配，在 eligibleBuilds 中比对选手的全部擅长池（signatureBuilds ➔ commonBuilds）
    if (!chosenBuildName && eligibleBuilds.length > 0) {
      const allPlayerFavs = Array.from(new Set([...(masterDef?.signatureBuilds || []), ...commonBuilds]))
      const matchedFav = eligibleBuilds.find(eb => allPlayerFavs.some(pf => pf.includes(eb.buildName) || eb.buildName.includes(pf)))
      if (matchedFav) {
        chosenBuildName = matchedFav.buildName
        isFallback = Boolean(isPrimaryBanned)
      } else {
        // 无重合，取棋手当前禁选下官方推荐度最高的合规阵容
        chosenBuildName = eligibleBuilds[0].buildName
        isFallback = Boolean(isPrimaryBanned)
      }
    }

    if (chosenBuildName) {
      // 评估选手对该棋手该阵容的熟练度
      const prof = evaluatePlayerCommanderLineupProficiency(playerNickname, cleanCmd, chosenBuildName, historicalMatches)
      const adaptedMeta = eligibleBuilds.find(b => b.buildName === chosenBuildName)

      let reason = ''
      if (isFallback) {
        reason = bf
          ? `受「${bf}」禁选封锁，主力「${primaryFavorite}」无法出战；根据棋手「${cleanCmd}」适配池顺位变阵「${chosenBuildName}」（选手熟练度：${prof.levelLabel}）`
          : `主力偏好「${primaryFavorite}」与棋手「${cleanCmd}」不适配；根据棋手适配池顺位选用「${chosenBuildName}」（选手熟练度：${prof.levelLabel}）`
      } else if (matchedCmd && matchedCmd.topBuilds.length > 0) {
        reason = `依据历史对局与擅长偏好：选手选用棋手「${cleanCmd}」最常出战「${chosenBuildName}」（${prof.reasoning}）`
      } else {
        reason = `棋手「${cleanCmd}」与「${chosenBuildName}」机制高度协同（${adaptedMeta?.synergyDesc || '契合度极佳'}），选手熟练度达 ${prof.levelLabel}`
      }

      const synergy = evaluateCommanderBuildSynergy(cleanCmd, chosenBuildName, historicalMatches)
      const archetype = identifyLineupArchetype(chosenBuildName)

      return {
        lineupName: chosenBuildName,
        isFallback,
        primaryBuild: primaryFavorite || chosenBuildName,
        reason,
        bannedWarning: isFallback ? `主力「${primaryFavorite}」受禁选封锁！` : undefined,
        commanderProfile: matchedCmd || null,
        commanderAdaptation: cmdAdaptation,
        proficiency: prof,
        commanderBuildSynergy: synergy,
        lineupArchetype: archetype,
        eligibleCommanderBuilds: eligibleBuilds
      }
    }
  }

  // 2. 若未选棋手或棋手不在官方库中：结合选手历史高频与权威绝活画像推断
  let candidateBuilds = [...commonBuilds]
  if (masterDef) {
    candidateBuilds = Array.from(new Set([...masterDef.signatureBuilds, ...candidateBuilds]))
  }

  // 若选手无任何流派样本，中性推断
  if (candidateBuilds.length === 0) {
    const meta = findCommanderMeta(commanderName)
    const fallbackName = meta ? `${meta.name}常规构筑` : '多流派平衡'
    const prof = evaluatePlayerCommanderLineupProficiency(playerNickname, commanderName, fallbackName, historicalMatches)
    const synergy = evaluateCommanderBuildSynergy(commanderName, fallbackName, historicalMatches)
    const archetype = identifyLineupArchetype(fallbackName)

    return {
      lineupName: fallbackName,
      isFallback: false,
      primaryBuild: '自由发挥',
      reason: '选手战绩尚无固定流派样本，根据临场对局构建',
      commanderAdaptation: cmdAdaptation,
      proficiency: prof,
      commanderBuildSynergy: synergy,
      lineupArchetype: archetype,
      eligibleCommanderBuilds: eligibleBuilds
    }
  }

  const primary = candidateBuilds[0]

  // 3. 检查选手的第 1 擅长流派是否受当前禁选 Ban 位封锁
  if (bf) {
    if (primary.includes(bf)) {
      const fallback = candidateBuilds.find(b => !b.includes(bf))
      const target = fallback || `非${bf}过渡阵容`
      const prof = evaluatePlayerCommanderLineupProficiency(playerNickname, commanderName, target, historicalMatches)
      const synergy = evaluateCommanderBuildSynergy(commanderName, target, historicalMatches)
      const archetype = identifyLineupArchetype(target)

      return {
        lineupName: target,
        isFallback: true,
        primaryBuild: primary,
        reason: `主力擅长「${primary}」受「${bf}」禁选封锁，转用备选招牌「${target}」（熟练度：${prof.levelLabel}）`,
        bannedWarning: `主力「${primary}」受禁选封锁！`,
        commanderAdaptation: cmdAdaptation,
        proficiency: prof,
        commanderBuildSynergy: synergy,
        lineupArchetype: archetype,
        eligibleCommanderBuilds: eligibleBuilds
      }
    }
  }

  // 4. 第一擅长未被 Ban
  const prof = evaluatePlayerCommanderLineupProficiency(playerNickname, commanderName, primary, historicalMatches)
  const synergy = evaluateCommanderBuildSynergy(commanderName, primary, historicalMatches)
  const archetype = identifyLineupArchetype(primary)

  return {
    lineupName: primary,
    isFallback: false,
    primaryBuild: primary,
    reason: masterDef
      ? `选手核心招牌绝活流派（${masterDef.playstyle} · 熟练度 ${prof.levelLabel}）`
      : `选手个人历史招牌流派（擅长率最高 · 熟练度 ${prof.levelLabel}）`,
    commanderAdaptation: cmdAdaptation,
    proficiency: prof,
    commanderBuildSynergy: synergy,
    lineupArchetype: archetype,
    eligibleCommanderBuilds: eligibleBuilds
  }
}

export interface CommanderEvaluation {
  commander: string
  tier: 'T0' | 'T1' | 'T2'
  levelLabel: string
  bonus: number
  synergyScore: number
  summary: string
  synergyLevel: 'PERFECT' | 'GOOD' | 'NEUTRAL'
  inferredLineup: PlayerInferredLineup
}

/** 评估棋手机制、版本增益与选手擅长流派的协同效果 */
export function evaluateCommander(
  commanderName: string | null | undefined,
  commonBuilds: string[] = [],
  version: string = CURRENT_LATEST_VERSION,
  bannedFaction: string | null = null,
  playerNickname?: string | null
): CommanderEvaluation | null {
  if (!commanderName || !commanderName.trim()) return null
  const clean = commanderName.trim()
  const meta = findCommanderMeta(clean)
  const inferred = inferPlayerLineup(commonBuilds, bannedFaction, commanderName, playerNickname)

  if (!meta) {
    return {
      commander: clean,
      tier: 'T2',
      levelLabel: '自定义棋手',
      bonus: 0.04,
      synergyScore: 0,
      summary: `选用棋手「${clean}」，提供常规战术机制支持。`,
      synergyLevel: 'NEUTRAL',
      inferredLineup: inferred
    }
  }

  // 1. 版本机制加成
  const isLatest = version === 'v1.9.1'
  const versionBonus = isLatest ? meta.v191Bonus : 0.05

  // 2. 结合选手根据擅长推断的出战阵容，计算棋手协同分
  let synergyLevel: CommanderEvaluation['synergyLevel'] = 'NEUTRAL'
  let synergyScore = 0
  let synergyNote = ''

  const targetLineup = inferred.lineupName
  const matchesBuild = meta.synergizedPlaystyles.some(sp =>
    targetLineup.includes(sp) || sp.includes(targetLineup)
  )

  if (matchesBuild) {
    synergyLevel = 'PERFECT'
    synergyScore = 0.14
    synergyNote = `棋手特性与选手出战阵容「${targetLineup}」形成质变协同（${meta.mechanism}）`
  } else if (meta.synergizedPlaystyles.includes('全能') || meta.synergizedPlaystyles.includes('通用')) {
    synergyLevel = 'GOOD'
    synergyScore = 0.08
    synergyNote = '棋手机制通用全能，平稳增幅选手阵容发挥'
  } else if (commonBuilds.length > 0) {
    synergyLevel = 'NEUTRAL'
    synergyScore = 0.02
    synergyNote = `棋手为选手阵容「${targetLineup}」提供平稳机制补充`
  }

  // 3. 选手本命/招牌棋手额外契合加成 (Signature Commander Affinity)
  const masterDef = findPlayerMasterProfile(playerNickname)
  let signatureBonus = 0
  let signatureNote = ''
  if (masterDef) {
    if (masterDef.signatureCommander === meta.name || findCommanderMeta(masterDef.signatureCommander)?.name === meta.name) {
      signatureBonus = 0.06
      signatureNote = `（选手专属第一本命棋手 +0.06）`
    } else if (masterDef.alternativeCommanders.some(ac => ac === meta.name || findCommanderMeta(ac)?.name === meta.name)) {
      signatureBonus = 0.03
      signatureNote = `（选手常用主力棋手 +0.03）`
    }
  }

  const totalBonus = Number((versionBonus + synergyScore + signatureBonus).toFixed(3))
  const summary = `【${meta.name} (${meta.tier})】${meta.mechanism}。${synergyNote}${signatureNote}。`

  return {
    commander: meta.name,
    tier: meta.tier,
    levelLabel: meta.tier === 'T0' ? '版本 T0 强力棋手' : (meta.tier === 'T1' ? '强势热门棋手' : '常规实用棋手'),
    bonus: totalBonus,
    synergyScore,
    summary,
    synergyLevel,
    inferredLineup: inferred
  }
}

export interface FactionBreakdown {
  faction: FactionType
  matches: number
  wins: number
  share: number
}

export interface BanImpactEvaluation {
  banFaction: string
  level: BanImpactLevel
  levelLabel: string
  factionShare: number
  historicalRecord: { matches: number; wins: number; winRate: number }
  description: string
  advice: string
  scoreModifier: number // 战力修正系数 (-0.3 ~ +0.2)
}

export interface HeadToHeadRecord {
  opponent: string
  opponentMaster: string
  encounters: number
  wins: number // 我夺冠
  losses: number // 对方夺冠
  neither: number // 双方均未夺冠（其他人夺冠）
  suppressionRate: number // 净压制率 (wins - losses) / encounters
  summary: string
}

export interface PlayerMatchupProfile {
  playerName: string
  masterName: string
  totalMatches: number
  totalWins: number
  commonBuilds: string[]
  commanderProfiles: CommanderUsageProfile[] // 选手历史棋手使用画像与常用阵容统计
  versionAdaptation?: VersionLineupAdaptation
  factionDistribution: Record<FactionType, { matches: number; wins: number }>
  factions: FactionBreakdown[]
  h2h: HeadToHeadRecord[]
  nemeses: HeadToHeadRecord[] // 天敌/苦主 (losses > wins)
  victims: HeadToHeadRecord[] // 压制对象 (wins > losses)
  topRivals: HeadToHeadRecord[] // 遭遇次数最多宿敌
}

export interface ActiveOpponentRelation {
  seat: number // 席位号 1-6
  nickname: string
  masterName: string
  wins: number
  losses: number
  encounters: number
  scoreText: string // 例如 "3-0" 或 "2-1"
}

export interface CrossMatrixCell {
  fromSeat: number
  toSeat: number
  wins: number
  losses: number
  encounters: number
  status: 'WIN' | 'LOSE' | 'TIED' | 'NONE'
  label: string // 例如 "3-0"、"0-2"、"1-1"、"-"
  tooltip: string
}

export interface SixPlayerMatchupResult {
  players: {
    slot: number // 席位号 1-6
    nickname: string
    masterName: string
    commander: string | null
    commanderEvaluation: CommanderEvaluation | null
    inferredLineup: PlayerInferredLineup
    baseScore: number
    h2hBonus: number
    banModifier: number
    versionModifier: number
    commanderModifier: number
    proficiencyModifier: number // 选手对该棋手该阵容专精熟练度修正分 (-0.20 ~ +0.25)
    commanderBuildModifier: number // 棋手搭配该阵容大盘实战胜率修正分 (-0.20 ~ +0.22)
    lineupCounterScore: number // 6人同场阵容体系生态克制修正分 (-0.24 ~ +0.24)
    personalCmdModifier?: number // 选手选用该棋手的专属实战表现加权分 (-0.15 ~ +0.15)
    smoothedWinRate?: number // 贝叶斯平滑历史胜率
    lineupProficiency?: PlayerLineupProficiency | null
    commanderBuildSynergy?: CommanderBuildSynergyEval | null // 棋手搭配该阵容的大盘胜率评估
    lineupArchetype?: LineupArchetypeInfo | null // 预测阵容所属战术体系
    lineupCounters: LineupCounterRelation[] // 本场克制的对手
    lineupCounteredBy: LineupCounterRelation[] // 本场受制的对手
    lineupCounterSummary: string // 体系对抗生态一句话总结
    commanderAdaptivePool?: CommanderAdaptivePool | null
    eligibleCommanderBuilds?: CommanderAdaptedBuild[]
    seatCommanderProfile?: CommanderUsageProfile | null // 该选手本场选用棋手的实战统计与常用阵容
    finalScore: number
    adjustedProbability: number
    banEvaluation: BanImpactEvaluation | null
    versionAdaptation: VersionLineupAdaptation
    suppressedBy: string[] // 被本场哪些选手历史压制
    suppresses: string[] // 本场克制哪些选手
    activeSuppressedBy: ActiveOpponentRelation[] // 本场苦主对手列表（带席位与战绩）
    activeSuppresses: ActiveOpponentRelation[] // 本场克制对手列表（带席位与战绩）
    h2hSummary: string // 同场两两克制一句话摘要
  }[]
  crossMatchups: {
    winner: string
    loser: string
    wins: number
    losses: number
    encounters: number
    description: string
  }[]
  suppressionChains: {
    winnerSeat: number
    winnerName: string
    loserSeat: number
    loserName: string
    wins: number
    losses: number
    encounters: number
    description: string
  }[]
  crossMatrix: {
    seats: { seat: number; nickname: string; masterName: string }[]
    cells: CrossMatrixCell[][]
  }
  lineupMatrix?: {
    seats: { seat: number; nickname: string; buildName: string; archetype: LineupArchetypeInfo }[]
    cells: LineupCounterMatrixCell[][]
    ecosystemSummary: string
  } | null
  targetVersion: string
  versionMeta: GameVersionMeta
  versionSummary: {
    version: string
    isLatest: boolean
    summaryText: string
    buffedPlayers: string[]
  }
  banSummary: {
    bannedFaction: string | null
    criticalPlayers: string[]
    benefitedPlayers: string[]
    summaryText: string
  }
}

export type Player6MatchupEvaluation = SixPlayerMatchupResult['players'][number]

/**
 * 根据阵容玩法字符串解析所属核心阵营
 */
export function getBuildFaction(buildLabel?: string | null): FactionType {
  if (!buildLabel) return '通用/其他'
  const b = buildLabel.trim()
  if (b.includes('三分') || b.includes('成年礼三分')) return '三分'
  if (b.includes('逐鹿')) return '逐鹿'
  if (b.includes('日落海') || b.includes('伞苏烈') || b.includes('伞刘邦') || b.includes('伞艾琳')) return '日落海'
  if (b.includes('河洛') || b.includes('木兰') || b.includes('李信') || b.includes('帝临')) return '河洛'
  if (b.includes('大河') || b.includes('山鬼') || b.includes('龙蛇')) return '大河'
  return '通用/其他'
}

/**
 * 从比赛原始数据中，构建全量选手同场交锋与阵营依赖图谱
 */
export function buildPlayerMatchupProfiles(
  matches: any[],
  useMasterIdentity = true
): Map<string, PlayerMatchupProfile> {
  const profileMap = new Map<string, PlayerMatchupProfile>()

  const getName = (nick: string) => useMasterIdentity ? getMasterPlayerName(nick) : nick

  // 初始化档案
  const getOrCreate = (name: string): PlayerMatchupProfile => {
    let p = profileMap.get(name)
    if (!p) {
      p = {
        playerName: name,
        masterName: getMasterPlayerName(name),
        totalMatches: 0,
        totalWins: 0,
        factionDistribution: {
          三分: { matches: 0, wins: 0 },
          逐鹿: { matches: 0, wins: 0 },
          日落海: { matches: 0, wins: 0 },
          河洛: { matches: 0, wins: 0 },
          大河: { matches: 0, wins: 0 },
          '通用/其他': { matches: 0, wins: 0 }
        },
        factions: [],
        commonBuilds: [],
        commanderProfiles: [],
        h2h: [],
        nemeses: [],
        victims: [],
        topRivals: []
      }
      profileMap.set(name, p)
    }
    return p
  }

  // 内部交锋记账表：`${pA}|||${pB}`
  const h2hMatrix = new Map<string, { encounters: number; aWins: number; bWins: number; neither: number }>()
  const buildCounts = new Map<string, Map<string, number>>()
  const playerCommanderCounts = new Map<string, Map<string, Map<string, { matches: number; wins: number }>>>()

  for (const m of matches) {
    if (!m.seats || !Array.isArray(m.seats) || m.seats.length === 0) continue

    const winnerSeat = m.seats.find((s: any) => s.slot === m.winnerSlot || s.winner)
    const winnerName = winnerSeat ? getName(winnerSeat.nickname) : null

    // 统计每位席位选手的阵营分布
    const activeParticipants: { name: string; faction: FactionType; isWinner: boolean }[] = []

    for (const seat of m.seats) {
      if (!seat.nickname || seat.nickname.startsWith('席位') || seat.nickname.startsWith('选手')) continue
      const name = getName(seat.nickname)
      const isWinner = (seat.slot === m.winnerSlot) || Boolean(seat.winner)
      const faction = getBuildFaction(seat.build)

      const profile = getOrCreate(name)
      profile.totalMatches++
      if (isWinner) profile.totalWins++

      profile.factionDistribution[faction].matches++
      if (isWinner) profile.factionDistribution[faction].wins++

      if (seat.build && typeof seat.build === 'string' && seat.build.trim()) {
        let bmap = buildCounts.get(name)
        if (!bmap) {
          bmap = new Map<string, number>()
          buildCounts.set(name, bmap)
        }
        bmap.set(seat.build.trim(), (bmap.get(seat.build.trim()) || 0) + 1)
      }

      // 统计选手在各棋手下的实战对局与常用阵容细分
      if (seat.commander && typeof seat.commander === 'string' && seat.commander.trim()) {
        const rawCmd = seat.commander.trim()
        const meta = findCommanderMeta(rawCmd)
        const cmdName = meta ? meta.name : rawCmd
        let cmdMap = playerCommanderCounts.get(name)
        if (!cmdMap) {
          cmdMap = new Map()
          playerCommanderCounts.set(name, cmdMap)
        }
        let bMap = cmdMap.get(cmdName)
        if (!bMap) {
          bMap = new Map()
          cmdMap.set(cmdName, bMap)
        }
        const bLabel = (seat.build && typeof seat.build === 'string' && seat.build.trim()) ? seat.build.trim() : '常规构筑'
        let bStat = bMap.get(bLabel)
        if (!bStat) {
          bStat = { matches: 0, wins: 0 }
          bMap.set(bLabel, bStat)
        }
        bStat.matches++
        if (isWinner) bStat.wins++
      }

      activeParticipants.push({ name, faction, isWinner })
    }

    // 统计同场 6 人两两之间的胜负交锋
    const uniqueNames = [...new Set(activeParticipants.map(x => x.name))]
    for (let i = 0; i < uniqueNames.length; i++) {
      for (let j = i + 1; j < uniqueNames.length; j++) {
        const a = uniqueNames[i]
        const b = uniqueNames[j]
        const pairKey = a < b ? `${a}|||${b}` : `${b}|||${a}`

        let rec = h2hMatrix.get(pairKey)
        if (!rec) {
          rec = { encounters: 0, aWins: 0, bWins: 0, neither: 0 }
          h2hMatrix.set(pairKey, rec)
        }
        rec.encounters++

        const pA = a < b ? a : b
        const pB = a < b ? b : a

        if (winnerName === pA) rec.aWins++
        else if (winnerName === pB) rec.bWins++
        else rec.neither++
      }
    }
  }

  // 汇总各选手的阵营占比与交锋排行榜
  for (const profile of profileMap.values()) {
    // 阵营占比
    profile.factions = Object.entries(profile.factionDistribution).map(([faction, data]) => ({
      faction: faction as FactionType,
      matches: data.matches,
      wins: data.wins,
      share: profile.totalMatches > 0 ? Number((data.matches / profile.totalMatches).toFixed(3)) : 0
    })).sort((a, b) => b.matches - a.matches || b.wins - a.wins)

    // 解析 H2H
    const h2hList: HeadToHeadRecord[] = []
    for (const [key, data] of h2hMatrix.entries()) {
      const [p1, p2] = key.split('|||')
      if (p1 !== profile.playerName && p2 !== profile.playerName) continue

      const isP1 = p1 === profile.playerName
      const opponent = isP1 ? p2 : p1
      const myWins = isP1 ? data.aWins : data.bWins
      const oppWins = isP1 ? data.bWins : data.aWins

      const suppression = data.encounters > 0 ? (myWins - oppWins) / data.encounters : 0

      let summary = '势均力敌'
      if (myWins > oppWins) {
        summary = `同场压制 (${myWins}胜 ${oppWins}负)`
      } else if (oppWins > myWins) {
        summary = `遭遇劣势 (${myWins}胜 ${oppWins}负)`
      }

      h2hList.push({
        opponent,
        opponentMaster: getMasterPlayerName(opponent),
        encounters: data.encounters,
        wins: myWins,
        losses: oppWins,
        neither: data.neither,
        suppressionRate: Number(suppression.toFixed(2)),
        summary
      })
    }

    profile.h2h = h2hList.sort((a, b) => b.encounters - a.encounters)
    // 天敌（同场被压制次数 > 0，且净胜为负）
    profile.nemeses = h2hList.filter(x => x.losses > x.wins).sort((a, b) => (b.losses - b.wins) - (a.losses - a.wins))
    // 压制对象（同场压制次数 > 0，且净胜为正）
    profile.victims = h2hList.filter(x => x.wins > x.losses).sort((a, b) => (b.wins - b.losses) - (a.wins - a.losses))
    // 最频繁相遇对手
    profile.topRivals = h2hList.slice(0, 5)

    // 常用阵容与版本适应度：历史提取流派与选手权威绝活档案融合
    const bmap = buildCounts.get(profile.playerName)
    const histBuilds = bmap ? [...bmap.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]) : []
    const masterDef = findPlayerMasterProfile(profile.playerName) || findPlayerMasterProfile(profile.masterName)
    if (masterDef) {
      profile.commonBuilds = Array.from(new Set([...masterDef.signatureBuilds, ...histBuilds])).slice(0, 4)
    } else {
      profile.commonBuilds = histBuilds.slice(0, 3)
    }
    // 汇总该选手在各个棋手下的实战出场与常用阵容细分
    const cmdProfiles: CommanderUsageProfile[] = []
    const cmdMap = playerCommanderCounts.get(profile.playerName) || new Map()

    // 权威招牌补全（仅补全招牌流派偏好，严禁虚构实战场次与胜率）
    if (masterDef?.commanderBuildMap) {
      for (const [cmdKey, bList] of Object.entries(masterDef.commanderBuildMap)) {
        const meta = findCommanderMeta(cmdKey)
        const cmdName = meta ? meta.name : cmdKey
        let bMap = cmdMap.get(cmdName)
        if (!bMap) {
          bMap = new Map()
          cmdMap.set(cmdName, bMap)
          bList.forEach((bName) => {
            bMap.set(bName, { matches: 0, wins: 0 })
          })
        }
      }
    }

    for (const [cmdName, bMap] of cmdMap.entries()) {
      const meta = findCommanderMeta(cmdName)
      let cMatches = 0
      let cWins = 0
      const bDetails: CommanderBuildDetail[] = []

      for (const st of bMap.values()) {
        cMatches += st.matches
        cWins += st.wins
      }

      for (const [bName, st] of bMap.entries()) {
        bDetails.push({
          buildName: bName,
          matches: st.matches,
          wins: st.wins,
          winRate: st.matches > 0 ? Number((st.wins / st.matches).toFixed(2)) : 0,
          share: cMatches > 0 ? Number((st.matches / cMatches).toFixed(2)) : 0
        })
      }

      bDetails.sort((a, b) => b.matches - a.matches || b.wins - a.wins)

      cmdProfiles.push({
        commander: cmdName,
        tier: meta ? meta.tier : 'T1',
        matches: cMatches,
        wins: cWins,
        winRate: cMatches > 0 ? Number((cWins / cMatches).toFixed(2)) : 0,
        topBuilds: bDetails,
        favoriteBuild: bDetails[0]?.buildName || '常规构筑',
        isSignature: Boolean(
          masterDef && (masterDef.signatureCommander === cmdName || masterDef.alternativeCommanders.includes(cmdName))
        )
      })
    }

    profile.commanderProfiles = cmdProfiles.sort((a, b) => {
      if (a.isSignature && !b.isSignature) return -1
      if (!a.isSignature && b.isSignature) return 1
      return b.matches - a.matches || b.wins - a.wins
    })

    profile.versionAdaptation = evaluateVersionLineupAdaptation(profile.commonBuilds, CURRENT_LATEST_VERSION)
  }

  return profileMap
}

/**
 * 独立提取全量选手的【棋手 ➔ 常用阵容】实战历史统计
 */
export function buildPlayerCommanderProfiles(
  matches: any[] = [],
  useMasterIdentity = true
): Map<string, CommanderUsageProfile[]> {
  const profileMap = buildPlayerMatchupProfiles(matches, useMasterIdentity)
  const result = new Map<string, CommanderUsageProfile[]>()
  for (const [name, prof] of profileMap.entries()) {
    result.set(name, prof.commanderProfiles)
  }
  return result
}

/**
 * 评估某个 Ban 阵营对特定选手的影响
 */
export function evaluateBanImpact(
  profile: PlayerMatchupProfile | null | undefined,
  bannedFaction?: string | null,
  historicalMatches: any[] = []
): BanImpactEvaluation | null {
  if (!bannedFaction || !bannedFaction.trim() || !profile) return null

  const ban = bannedFaction.trim()
  const matchedFaction: FactionType | null =
    ban.includes('三分') ? '三分' :
    ban.includes('逐鹿') ? '逐鹿' :
    ban.includes('日落海') ? '日落海' :
    ban.includes('河洛') ? '河洛' :
    ban.includes('大河') ? '大河' : null

  if (!matchedFaction) {
    return {
      banFaction: ban,
      level: 'IMMUNE',
      levelLabel: '无明显影响',
      factionShare: 0,
      historicalRecord: { matches: 0, wins: 0, winRate: 0 },
      description: `禁用阵营「${ban}」与当前主流体系无直接冲突`,
      advice: '选手正常执行既定核心流派。',
      scoreModifier: 0
    }
  }

  // 计算选手对该阵营的依赖度
  const factionData = profile.factionDistribution[matchedFaction] || { matches: 0, wins: 0 }
  const totalMatches = Math.max(1, profile.totalMatches)
  const totalWins = Math.max(1, profile.totalWins)

  const matchShare = factionData.matches / totalMatches
  const winShare = factionData.wins / totalWins

  // 计算历史在该 Ban 下的真实表现
  let banMatches = 0
  let banWins = 0
  for (const m of historicalMatches) {
    if (m.ban && m.ban.includes(matchedFaction)) {
      const seat = m.seats?.find((s: any) => getMasterPlayerName(s.nickname) === profile.masterName)
      if (seat) {
        banMatches++
        if (seat.slot === m.winnerSlot || seat.winner) banWins++
      }
    }
  }

  const histWinRate = banMatches > 0 ? banWins / banMatches : 0

  // 若选手历史上在该禁选下具备成熟的抗 Ban 变阵夺冠记录，减轻减分幅度
  const hasProvenBanAdaptability = banWins >= 1 && histWinRate >= 0.25
  const criticalModifier = hasProvenBanAdaptability ? -0.08 : -0.28
  const moderateModifier = hasProvenBanAdaptability ? -0.04 : -0.12

  // 综合评级
  if (winShare >= 0.5 || matchShare >= 0.6) {
    return {
      banFaction: ban,
      level: 'CRITICAL',
      levelLabel: '严重受限',
      factionShare: Number((winShare * 100).toFixed(1)),
      historicalRecord: { matches: banMatches, wins: banWins, winRate: Number((histWinRate * 100).toFixed(1)) },
      description: `该选手的核心体系依赖「${matchedFaction}」（占其历史胜场 ${(winShare * 100).toFixed(0)}%）。${hasProvenBanAdaptability ? '但历史上在该 Ban 位下具备变阵夺冠经验，抗压能力出色。' : '本场阵营被封锁，被迫选择替补阵容。'}`,
      advice: `建议谨慎支持；密切观察其是否具备河洛李信或传统养猪等备选英雄池。`,
      scoreModifier: criticalModifier
    }
  } else if (winShare >= 0.25 || matchShare >= 0.3) {
    return {
      banFaction: ban,
      level: 'MODERATE',
      levelLabel: '中度受限',
      factionShare: Number((winShare * 100).toFixed(1)),
      historicalRecord: { matches: banMatches, wins: banWins, winRate: Number((histWinRate * 100).toFixed(1)) },
      description: `该选手常用流派包含「${matchedFaction}」（占比约 ${(matchShare * 100).toFixed(0)}%），选阵受到一定约束。`,
      advice: '选手具有其他体系可供切换，战力稍受折损但仍具竞争实力。',
      scoreModifier: moderateModifier
    }
  } else if (winShare === 0 && matchShare <= 0.15) {
    return {
      banFaction: ban,
      level: 'BENEFITED',
      levelLabel: '环境利好',
      factionShare: Number((matchShare * 100).toFixed(1)),
      historicalRecord: { matches: banMatches, wins: banWins, winRate: Number((histWinRate * 100).toFixed(1)) },
      description: `选手核心玩法（如传统养猪、日落海或河洛）避开了「${matchedFaction}」禁用，同时场上其他主玩该阵营的对手被削弱。`,
      advice: '外部竞争对手受到流派封锁，该选手处于极佳的博弈生态位，胜率看涨。',
      scoreModifier: +0.15
    }
  } else {
    return {
      banFaction: ban,
      level: 'IMMUNE',
      levelLabel: '基本免疫',
      factionShare: Number((matchShare * 100).toFixed(1)),
      historicalRecord: { matches: banMatches, wins: banWins, winRate: Number((histWinRate * 100).toFixed(1)) },
      description: `该选手对「${matchedFaction}」依赖较低，禁用对其实战发挥影响有限。`,
      advice: '常规阵容发挥不受影响。',
      scoreModifier: 0
    }
  }
}

/**
 * 六人同场推演算法：
 * 综合选手基础战力 + 本场交手克制奖励/减免 + Ban位惩罚/增益 + 所选棋手协同机制 + 官方最新版本更迭适配度，输出校正概率与博弈情报
 */
export function evaluate6PlayerMatchup(
  participants: {
    nickname: string
    profileId?: string | null
    commander?: string | null
    customBuild?: string | null
  }[],
  bannedFaction?: string | null,
  allMatches: any[] = [],
  targetVersion: string = CURRENT_LATEST_VERSION
): SixPlayerMatchupResult {
  const profileMap = buildPlayerMatchupProfiles(allMatches, true)

  const softmax = (scores: number[]) => {
    const max = Math.max(...scores)
    const exps = scores.map(x => Math.exp(x - max))
    const sum = exps.reduce((a, b) => a + b, 0)
    return exps.map(x => (sum > 0 ? x / sum : 1 / scores.length))
  }

  // 1. 获取每位选手的 masterName 与 profile、所选棋手与手动指定阵容
  const roster = participants.map((p, idx) => {
    const master = getMasterPlayerName(p.nickname)
    const prof = profileMap.get(master) || profileMap.get(p.nickname)
    return {
      slot: idx + 1,
      nickname: p.nickname,
      masterName: master,
      commander: p.commander || null,
      customBuild: p.customBuild ? p.customBuild.trim() : null,
      profile: prof
    }
  })

  // 2. 计算两两交锋克制矩阵与压制链
  const crossMatchups: SixPlayerMatchupResult['crossMatchups'] = []
  const suppressionChains: SixPlayerMatchupResult['suppressionChains'] = []
  const h2hAdvantage = new Map<string, number>()
  const suppressedByMap = new Map<string, string[]>()
  const suppressesMap = new Map<string, string[]>()
  const activeSuppressesMap = new Map<string, ActiveOpponentRelation[]>()
  const activeSuppressedByMap = new Map<string, ActiveOpponentRelation[]>()

  // 6x6 矩阵网格初始化
  const matrixCells: CrossMatrixCell[][] = Array.from({ length: roster.length }, () =>
    Array.from({ length: roster.length }, () => ({
      fromSeat: 0,
      toSeat: 0,
      wins: 0,
      losses: 0,
      encounters: 0,
      status: 'NONE' as const,
      label: '-',
      tooltip: '历史无同场记录'
    }))
  )

  for (let i = 0; i < roster.length; i++) {
    for (let j = 0; j < roster.length; j++) {
      matrixCells[i][j].fromSeat = roster[i].slot
      matrixCells[i][j].toSeat = roster[j].slot
      if (i === j) {
        matrixCells[i][j].label = '—'
        matrixCells[i][j].tooltip = '自身席位'
      }
    }
  }

  for (let i = 0; i < roster.length; i++) {
    for (let j = i + 1; j < roster.length; j++) {
      const pA = roster[i]
      const pB = roster[j]

      // 查找 A 在面对 B 时的历史交锋记录
      const recA = pA.profile?.h2h.find(x => x.opponentMaster === pB.masterName)
      if (recA && (recA.wins > 0 || recA.losses > 0)) {
        const netA = recA.wins - recA.losses
        h2hAdvantage.set(pA.masterName, (h2hAdvantage.get(pA.masterName) || 0) + netA * 0.15)
        h2hAdvantage.set(pB.masterName, (h2hAdvantage.get(pB.masterName) || 0) - netA * 0.15)

        // 填充网格
        matrixCells[i][j] = {
          fromSeat: pA.slot,
          toSeat: pB.slot,
          wins: recA.wins,
          losses: recA.losses,
          encounters: recA.encounters,
          status: recA.wins > recA.losses ? 'WIN' : recA.losses > recA.wins ? 'LOSE' : 'TIED',
          label: `${recA.wins}-${recA.losses}`,
          tooltip: `#${pA.slot} ${pA.nickname} 对 #${pB.slot} ${pB.nickname}：${recA.wins}胜 ${recA.losses}负 (共${recA.encounters}战)`
        }
        matrixCells[j][i] = {
          fromSeat: pB.slot,
          toSeat: pA.slot,
          wins: recA.losses,
          losses: recA.wins,
          encounters: recA.encounters,
          status: recA.losses > recA.wins ? 'WIN' : recA.wins > recA.losses ? 'LOSE' : 'TIED',
          label: `${recA.losses}-${recA.wins}`,
          tooltip: `#${pB.slot} ${pB.nickname} 对 #${pA.slot} ${pA.nickname}：${recA.losses}胜 ${recA.wins}负 (共${recA.encounters}战)`
        }

        if (recA.wins > recA.losses) {
          suppressesMap.set(pA.masterName, [...(suppressesMap.get(pA.masterName) || []), pB.masterName])
          suppressedByMap.set(pB.masterName, [...(suppressedByMap.get(pB.masterName) || []), pA.masterName])

          const relA: ActiveOpponentRelation = {
            seat: pB.slot,
            nickname: pB.nickname,
            masterName: pB.masterName,
            wins: recA.wins,
            losses: recA.losses,
            encounters: recA.encounters,
            scoreText: `${recA.wins}-${recA.losses}`
          }
          activeSuppressesMap.set(pA.masterName, [...(activeSuppressesMap.get(pA.masterName) || []), relA])

          const relB: ActiveOpponentRelation = {
            seat: pA.slot,
            nickname: pA.nickname,
            masterName: pA.masterName,
            wins: recA.losses,
            losses: recA.wins,
            encounters: recA.encounters,
            scoreText: `${recA.losses}-${recA.wins}`
          }
          activeSuppressedByMap.set(pB.masterName, [...(activeSuppressedByMap.get(pB.masterName) || []), relB])

          crossMatchups.push({
            winner: pA.masterName,
            loser: pB.masterName,
            wins: recA.wins,
            losses: recA.losses,
            encounters: recA.encounters,
            description: `${pA.nickname} 历史上同场压制 ${pB.nickname} (${recA.wins}胜 ${recA.losses}负 / ${recA.encounters}战)`
          })
          suppressionChains.push({
            winnerSeat: pA.slot,
            winnerName: pA.nickname,
            loserSeat: pB.slot,
            loserName: pB.nickname,
            wins: recA.wins,
            losses: recA.losses,
            encounters: recA.encounters,
            description: `#${pA.slot} ${pA.nickname} 压制 #${pB.slot} ${pB.nickname} (${recA.wins}胜 ${recA.losses}负)`
          })
        } else if (recA.losses > recA.wins) {
          suppressesMap.set(pB.masterName, [...(suppressesMap.get(pB.masterName) || []), pA.masterName])
          suppressedByMap.set(pA.masterName, [...(suppressedByMap.get(pA.masterName) || []), pB.masterName])

          const relB: ActiveOpponentRelation = {
            seat: pA.slot,
            nickname: pA.nickname,
            masterName: pA.masterName,
            wins: recA.losses,
            losses: recA.wins,
            encounters: recA.encounters,
            scoreText: `${recA.losses}-${recA.wins}`
          }
          activeSuppressesMap.set(pB.masterName, [...(activeSuppressesMap.get(pB.masterName) || []), relB])

          const relA: ActiveOpponentRelation = {
            seat: pB.slot,
            nickname: pB.nickname,
            masterName: pB.masterName,
            wins: recA.wins,
            losses: recA.losses,
            encounters: recA.encounters,
            scoreText: `${recA.wins}-${recA.losses}`
          }
          activeSuppressedByMap.set(pA.masterName, [...(activeSuppressedByMap.get(pA.masterName) || []), relA])

          crossMatchups.push({
            winner: pB.masterName,
            loser: pA.masterName,
            wins: recA.losses,
            losses: recA.wins,
            encounters: recA.encounters,
            description: `${pB.nickname} 历史上同场压制 ${pA.nickname} (${recA.losses}胜 ${recA.wins}负 / ${recA.encounters}战)`
          })
          suppressionChains.push({
            winnerSeat: pB.slot,
            winnerName: pB.nickname,
            loserSeat: pA.slot,
            loserName: pA.nickname,
            wins: recA.losses,
            losses: recA.wins,
            encounters: recA.encounters,
            description: `#${pB.slot} ${pB.nickname} 压制 #${pA.slot} ${pA.nickname} (${recA.losses}胜 ${recA.wins}负)`
          })
        }
      }
    }
  }

  // 3. 计算 Ban 位评估、棋手协同增益、版本更迭影响与综合得分
  const criticalPlayers: string[] = []
  const benefitedPlayers: string[] = []
  const buffedPlayers: string[] = []

  // 先统一推断各席位阵容，以进行同场阵容体系生态克制评估（支持手动指定阵容覆盖）
  const inferredList = roster.map(p => {
    if (p.customBuild) {
      const chosenBuild = p.customBuild
      const profEval = evaluatePlayerCommanderLineupProficiency(
        p.nickname,
        p.commander,
        chosenBuild,
        allMatches
      )
      const synergyEval = evaluateCommanderBuildSynergy(p.commander, chosenBuild, allMatches)
      const archetype = identifyLineupArchetype(chosenBuild)
      return {
        lineupName: chosenBuild,
        isFallback: false,
        primaryBuild: chosenBuild,
        reason: `手动指定变阵：切换为「${chosenBuild}」（选手熟练度：${profEval.levelLabel}，棋手胜率：${synergyEval.winRateFormatted}）`,
        proficiency: profEval,
        commanderBuildSynergy: synergyEval,
        lineupArchetype: archetype
      }
    }
    return inferPlayerLineup(
      p.profile?.commonBuilds || [],
      bannedFaction,
      p.commander,
      p.nickname,
      p.profile?.commanderProfiles,
      allMatches
    )
  })

  const lineupParticipants = roster.map((p, idx) => ({
    slot: p.slot,
    nickname: p.nickname,
    buildName: inferredList[idx].lineupName
  }))
  const lineupCounterEval = evaluate6PlayerLineupCounters(lineupParticipants)

  const preliminary = roster.map((p, idx) => {
    const prof = p.profile
    const wins = prof?.totalWins || 0
    const matches = prof?.totalMatches || 0

    // 经验贝叶斯平滑历史胜率模型（Empirical Bayes Smoothed Win Rate）
    // 在 6 人王牌对决中，随机平均期望胜率为 1/6 (≈16.67%)
    // 引入先验置信度 M = 3，彻底消除“小样本1战1胜虚高为100%”或“多战低胜率被1战选手压制”的采样偏差
    const smoothedWinRate = (wins + 0.5) / (matches + 3)
    const baseScore = (smoothedWinRate - (1 / 6)) * 2.2

    // 交手修正分
    const h2hBonus = h2hAdvantage.get(p.masterName) || 0

    // Ban 位修正分
    const banEval = evaluateBanImpact(prof, bannedFaction, allMatches)
    const banModifier = banEval ? banEval.scoreModifier : 0

    // 最新游戏版本阵容适应度修正分
    const versionAdapt = evaluateVersionLineupAdaptation(
      prof?.commonBuilds || [],
      targetVersion
    )
    const versionModifier = versionAdapt.bonus

    // 所选棋手机制强度与流派协同修正分（结合选手专属绝活画像与棋手协同）
    const cmdEval = evaluateCommander(p.commander, prof?.commonBuilds || [], targetVersion, bannedFaction, p.nickname)
    const inferred = inferredList[idx]
    const commanderModifier = cmdEval ? cmdEval.bonus : 0
    const proficiencyModifier = inferred.proficiency ? inferred.proficiency.modifier : 0

    // 选手选用该棋手的专属实战胜率与偏好加权（结合其历史使用该棋手的实战战绩）
    let personalCmdModifier = 0
    const cmdMeta = findCommanderMeta(p.commander)
    const matchedCmd = prof?.commanderProfiles?.find(
      c => c.commander === p.commander || (cmdMeta && cmdMeta.aliases.includes(c.commander))
    )
    if (matchedCmd && matchedCmd.matches > 0) {
      const personalWinRate = (matchedCmd.wins + 0.5) / (matchedCmd.matches + 3)
      personalCmdModifier = Number(((personalWinRate - (1 / 6)) * 0.4).toFixed(3))
    }

    // 棋手搭配该阵容大盘实战胜率模型
    const cmdBuildSynergy = inferred.commanderBuildSynergy || evaluateCommanderBuildSynergy(p.commander, inferred.lineupName, allMatches)
    const commanderBuildModifier = cmdBuildSynergy.scoreModifier

    // 6人同场阵容体系生态克制模型
    const playerLineupCounter = lineupCounterEval.perPlayer[idx]
    const lineupCounterScore = playerLineupCounter.scoreModifier
    const lineupCounters = playerLineupCounter.counters
    const lineupCounteredBy = playerLineupCounter.counteredBy
    const lineupCounterSummary = playerLineupCounter.summary
    const lineupArchetype = playerLineupCounter.archetype

    if (banEval?.level === 'CRITICAL') criticalPlayers.push(p.masterName)
    if (banEval?.level === 'BENEFITED') benefitedPlayers.push(p.masterName)
    if (versionAdapt.fitLevel === 'BUFFED') buffedPlayers.push(p.masterName)

    const finalScore = baseScore + h2hBonus + banModifier + versionModifier + commanderModifier + proficiencyModifier + personalCmdModifier + commanderBuildModifier + lineupCounterScore

    const activeSupp = activeSuppressesMap.get(p.masterName) || []
    const activeSuppBy = activeSuppressedByMap.get(p.masterName) || []

    let h2hSummary = '同场交锋均势 / 历史首战'
    if (activeSupp.length > 0 && activeSuppBy.length > 0) {
      h2hSummary = `压制 #${activeSupp.map(x => `${x.seat} ${x.nickname}(${x.scoreText})`).join('、')}；遭 #${activeSuppBy.map(x => `${x.seat} ${x.nickname}(${x.scoreText})`).join('、')} 苦主克制`
    } else if (activeSupp.length > 0) {
      h2hSummary = `压制同场对手：${activeSupp.map(x => `#${x.seat} ${x.nickname} (${x.scoreText})`).join('、')}`
    } else if (activeSuppBy.length > 0) {
      h2hSummary = `遭遇克星苦主：${activeSuppBy.map(x => `#${x.seat} ${x.nickname} (${x.scoreText})`).join('、')}`
    }

    return {
      slot: p.slot,
      nickname: p.nickname,
      masterName: p.masterName,
      commander: p.commander,
      commanderEvaluation: cmdEval,
      inferredLineup: inferred,
      baseScore: Number(baseScore.toFixed(3)),
      smoothedWinRate: Number(smoothedWinRate.toFixed(3)),
      personalCmdModifier: Number(personalCmdModifier.toFixed(3)),
      h2hBonus: Number(h2hBonus.toFixed(3)),
      banModifier: Number(banModifier.toFixed(3)),
      versionModifier: Number(versionModifier.toFixed(3)),
      commanderModifier: Number(commanderModifier.toFixed(3)),
      proficiencyModifier: Number(proficiencyModifier.toFixed(3)),
      commanderBuildModifier: Number(commanderBuildModifier.toFixed(3)),
      lineupCounterScore: Number(lineupCounterScore.toFixed(3)),
      lineupProficiency: inferred.proficiency || null,
      commanderBuildSynergy: cmdBuildSynergy,
      lineupArchetype,
      lineupCounters,
      lineupCounteredBy,
      lineupCounterSummary,
      commanderAdaptivePool: inferred.commanderAdaptation || null,
      eligibleCommanderBuilds: inferred.eligibleCommanderBuilds || [],
      seatCommanderProfile: inferred.commanderProfile || prof?.commanderProfiles?.find(c => c.commander === p.commander) || null,
      finalScore: Number(finalScore.toFixed(3)),
      adjustedProbability: 0,
      banEvaluation: banEval,
      versionAdaptation: versionAdapt,
      suppressedBy: suppressedByMap.get(p.masterName) || [],
      suppresses: suppressesMap.get(p.masterName) || [],
      activeSuppressedBy: activeSuppBy,
      activeSuppresses: activeSupp,
      h2hSummary
    }
  })

  // 4. Softmax 归一化计算最终胜率
  const rawScores = preliminary.map(x => x.finalScore)
  const probabilities = softmax(rawScores)

  preliminary.forEach((item, idx) => {
    item.adjustedProbability = Number(probabilities[idx].toFixed(4))
  })

  // 5. 组织 Ban 总结文案
  let summaryText = '本场未指定禁用阵营，选手各展所长。'
  if (bannedFaction && bannedFaction.trim()) {
    if (criticalPlayers.length > 0 && benefitedPlayers.length > 0) {
      summaryText = `本场禁用「${bannedFaction}」对【${criticalPlayers.join('、')}】构成严重限制，而【${benefitedPlayers.join('、')}】因流派错位获得显著环境利好。`
    } else if (criticalPlayers.length > 0) {
      summaryText = `本场禁用「${bannedFaction}」重点限制了【${criticalPlayers.join('、')}】的招牌阵容。`
    } else if (benefitedPlayers.length > 0) {
      summaryText = `本场禁用「${bannedFaction}」使得【${benefitedPlayers.join('、')}】所处博弈环境更为舒适。`
    } else {
      summaryText = `本场禁用「${bannedFaction}」对 6 名参赛选手的主力体系未造成单边冲击。`
    }
  }

  // 6. 版本更迭综合研判文案
  const verMeta = GAME_VERSIONS.find(v => v.version === targetVersion) || GAME_VERSIONS[0]
  let versionSummaryText = `当前推演基于官方最新版本【${verMeta.version}】（${verMeta.effectiveDate}生效）。`
  if (buffedPlayers.length > 0) {
    versionSummaryText += `选手【${buffedPlayers.join('、')}】的主力体系受到当前版本机制（嬴律复制/安琪拉法爆/三分增益）利好支持。`
  } else {
    versionSummaryText += `场上 6 位选手主力体系在当前版本表现平稳。`
  }

  return {
    players: preliminary,
    crossMatchups,
    suppressionChains,
    crossMatrix: {
      seats: roster.map(r => ({ seat: r.slot, nickname: r.nickname, masterName: r.masterName })),
      cells: matrixCells
    },
    lineupMatrix: {
      seats: roster.map((r, idx) => ({
        seat: r.slot,
        nickname: r.nickname,
        buildName: lineupParticipants[idx].buildName,
        archetype: lineupCounterEval.perPlayer[idx].archetype
      })),
      cells: lineupCounterEval.cells,
      ecosystemSummary: lineupCounterEval.ecosystemSummary
    },
    targetVersion,
    versionMeta: verMeta,
    versionSummary: {
      version: targetVersion,
      isLatest: verMeta.isLatest,
      summaryText: versionSummaryText,
      buffedPlayers
    },
    banSummary: {
      bannedFaction: bannedFaction || null,
      criticalPlayers,
      benefitedPlayers,
      summaryText
    }
  }
}

