// 王牌对决真实选手多账号归集与身份映射体系
// 将同属于一个选手的多个游戏账号/战队马甲/小号归集到同一个主选手身份下

export interface MasterPlayerGroup {
  /** 选手主展示名 / 统一称谓 */
  masterName: string
  /** 曾用名、小号、各平台及战队前缀账号列表 */
  aliases: string[]
  /** 选手定位备注，如知名战队/主播/打法特点 */
  note?: string
}

export const MASTER_PLAYER_GROUPS: readonly MasterPlayerGroup[] = [
  // 1. 沐汐 (国一庄小鱼 / 拉丁鱼 / 欧洲鱼：有软柿公报改名考证，绝无披萨鱼遗愿)
  { masterName: '沐汐', aliases: ['沐汐', 'EZ沐汐', 'EZ沐汐嘻嘻嘻', 'EZ抖音沐汐', 'QT鱼沐汐0丶7版', 'EZ拉丁鱼丶沐汐', 'EZ拉丁鱼', '拉丁鱼', 'EZ灬欧洲鱼', '欧洲鱼'], note: 'EZ战队核心 / 原国一欧洲鱼 / 改名拉丁鱼' },
  // 2. 梦飞（仅限主播本人；冻冻与公会车队打手已拆分独立）
  { masterName: '梦飞', aliases: ['梦飞', '梦飞大大', '抖音梦飞'], note: '知名主播梦飞本人' },
  // 3. 冻冻（独立主播/队员，曾与梦飞/梦飞1同场对战）
  { masterName: '冻冻', aliases: ['冻冻', '抖音梦飞冻冻'], note: '梦飞团队核心选手 / 擅长成年礼三分' },
  // 4. 77（选手，曾与冻冻同场，后用公会号梦飞77）
  { masterName: '77', aliases: ['77', '抖音梦飞77', '儒雅随和的77'], note: '选手 77' },
  // 5. 沐小朵（I蟲战队主力；沐小呆为另一独立队员已拆分）
  { masterName: '沐小朵', aliases: ['沐小朵', 'I蟲丶沐小朵', 'I蟲、沐小朵', '华创-沐小朵'], note: 'I蟲 / 华创战队主力' },
  // 6. 沐小呆（I蟲战队独立队员）
  { masterName: '沐小呆', aliases: ['沐小呆', 'I蟲丶沐小呆'], note: 'I蟲战队队员' },
  // 7. 猪葛龟（诸葛龟 / 猪葛龟龟；错别字与战队标合并，事后诸葛亮已拆分独立）
  { masterName: '猪葛龟', aliases: ['猪葛龟', '猪葛龟龟', '抖音猪葛龟龟', '抖音诸葛龟龟', 'I蟲抖音猪葛龟', 'I蟲抖音猪葛龟龟', 'I蟲抖音诸葛龟'], note: '诸葛龟 / I蟲战队核心' },
  // 8. 小新游（三分倒转王，小新U为其简写小号）
  { masterName: '小新游', aliases: ['小新游', '抖音小新游', '小新U'], note: '三分倒转知名高手' },
  // 9. 清辞（仅合并明确带有清辞字样的前缀；武汉EG战队公共名不混入）
  { masterName: '清辞', aliases: ['清辞', 'EG清辞', 'DYEG清辞', '抖音EG清辞', '武汉 EG清辞'], note: 'EG战队核心选手' },
  // 10. 无量怜苓（EGM战队，错格输入合并）
  { masterName: '无量怜苓', aliases: ['无量怜苓', 'EGM无量怜苓', 'EGM I 无量怜苓', '怜苓'], note: 'EGM战队主力' },
  // 11. 小谷芷（曾用名小琳谷芷，后加入EGM）
  { masterName: '小谷芷', aliases: ['小谷芷', 'EGM小谷芷', '抖音EGM小谷芷', '小琳谷芷'], note: 'EGM战队核心 / 雷霆战机高手' },
  // 12. 7D（纯标点差异）
  { masterName: '7D', aliases: ['7D', 'EZ、7D', 'EZ丶7D'], note: 'EZ战队选手' },
  // 13. 皮皮鲨（EGM战队主力）
  { masterName: '皮皮鲨', aliases: ['皮皮鲨', 'EGM皮皮鲨', '抖音EGM皮皮鲨'], note: 'EGM战队主力 / 日落海倒转' },
  // 14. 花归尘（EGM战队）
  { masterName: '花归尘', aliases: ['花归尘', 'EGM抖音花归尘', '万象棋花归尘๑'], note: 'EGM战队' },
  // 15. 画笔（EGM战队）
  { masterName: '画笔', aliases: ['画笔', 'EGM抖音画笔', '抖音画笔'], note: 'EGM战队' },
  // 16. 李由多（运赢王，先后加入EGM与群星）
  { masterName: '李由多', aliases: ['李由多', '运赢王李由多', '抖音EGM李由多', '抖音群星李由多'], note: '知名主播运赢王' },
  // 17. 阿文（倒转王，EZ战队）
  { masterName: '阿文', aliases: ['阿文', 'EZ阿文', '抖音EZ阿文', '阿文倒转王'], note: 'EZ战队 / 倒转王' },
  // 18. 嘉誉（胜天半子，原名刷牌之怪嘉誉）
  { masterName: '嘉誉', aliases: ['嘉誉', '刷牌之怪嘉誉', '胜天半子嘉誉'], note: '胜天半子' },
  // 19. 道无涯（DY与东东电竞）
  { masterName: '道无涯', aliases: ['道无涯', 'DY道无涯', '东东电竞道无涯'], note: 'DY / 东东电竞' },
  // 20. 妖柒（传统养猪高手）
  { masterName: '妖柒', aliases: ['妖柒', '抖音妖柒'], note: '传统养猪流高手' },
  // 21. 66熊（主播）
  { masterName: '66熊', aliases: ['66熊', '我是66熊', '抖音66熊'], note: '知名主播' },
  // 22. 天眷（EZ战队；天誉为另一独立选手已拆分）
  { masterName: '天眷', aliases: ['天眷', 'EZ天眷'], note: 'EZ战队天眷' },
  // 23. 天誉（EZ战队独立选手）
  { masterName: '天誉', aliases: ['天誉', 'EZ天誉'], note: 'EZ战队天誉' },
  // 24. 小超（EZ战队）
  { masterName: '小超', aliases: ['小超', 'EZ小超'], note: 'EZ战队' },
  // 25. 遗愿（原QT披萨鱼，披萨鱼遗愿）
  { masterName: '遗愿', aliases: ['遗愿', 'QT披萨鱼遗愿', 'QT电竞披萨鱼', '抖音遗愿1'], note: 'QT战队 / 三分登场高手' },
  // 26. 喵喵虾条（B站选手，错别字合并）
  { masterName: '喵喵虾条', aliases: ['喵喵虾条', 'BLIBLI喵喵虾条', 'BLIBLI猫猫虾条', '猫猫虾条'], note: 'B站选手' },
  // 27. 马克之母挽星（主播挽星）
  { masterName: '马克之母挽星', aliases: ['马克之母挽星', '马可之母挽星', '马可削0丶7对吗'], note: '主播挽星' },
  // 28. 如昨（EG战队）
  { masterName: '如昨', aliases: ['如昨', 'EG如昨', '抖音EG如昨'], note: 'EG战队' },
  // 29. 福鱼（EG战队）
  { masterName: '福鱼', aliases: ['福鱼', '武汉EG福鱼', '抖音EG福鱼'], note: 'EG战队' },
  // 30. 反骨（EG战队）
  { masterName: '反骨', aliases: ['反骨', '抖音EG反骨'], note: 'EG战队' },
  // 31. 流儿
  { masterName: '流儿', aliases: ['流儿', '抖音流儿', '抖音搜流儿'], note: '选手流儿' },
  // 32. 姚半仙（EZ战队）
  { masterName: '姚半仙', aliases: ['姚半仙', '抖音姚半仙', '抖音EZ姚半仙'], note: 'EZ战队' },
  // 33. 张嘉豪（EZ战队）
  { masterName: '张嘉豪', aliases: ['张嘉豪', '抖音EZ张嘉豪'], note: 'EZ战队' },
  // 34. 泪花（转会选手）
  { masterName: '泪花', aliases: ['泪花', '抖音EG泪花', '抖音EZ泪花'], note: '选手泪花' },
  // 35. 羡鱼儿（EZ战队）
  { masterName: '羡鱼儿', aliases: ['羡鱼儿', '抖音EZ羡鱼儿'], note: 'EZ战队' },
  // 36. 色彩（EZ战队）
  { masterName: '色彩', aliases: ['色彩', '抖音EZ、色彩'], note: 'EZ战队' },
  // 37. 小祥（B站）
  { masterName: '小祥', aliases: ['小祥', 'B站万象棋小祥', '万象棋小祥'], note: 'B站选手' },
  // 38. 逆光（QT战队）
  { masterName: '逆光', aliases: ['逆光', 'B站QT逆光'], note: 'QT战队' },
  // 39. 小优律（QT战队）
  { masterName: '小优律', aliases: ['小优律', 'B站QT小优律'], note: 'QT战队' },
  // 40. 孙悟方（QT战队）
  { masterName: '孙悟方', aliases: ['孙悟方', 'B站QT孙悟方'], note: 'QT战队' },
  // 41. 星光柯基（B站）
  { masterName: '星光柯基', aliases: ['星光柯基', 'BILI星光柯基'], note: 'B站选手' },
  // 42. 小斯（快手）
  { masterName: '小斯', aliases: ['小斯', '快手小斯'], note: '快手选手' },
  // 43. 初心（I蟲战队）
  { masterName: '初心', aliases: ['初心', 'I蟲丶初心'], note: 'I蟲战队' },
  // 44. 佩奇
  { masterName: '佩奇', aliases: ['佩奇', '娇弱的佩奇'], note: '选手佩奇' },
  // 45. 小宇
  { masterName: '小宇', aliases: ['小宇', '小宇13'], note: '选手小宇' },
  // 46. 益笙菌
  { masterName: '益笙菌', aliases: ['益笙菌', '想K益笙菌'], note: '选手益笙菌' },
  // 47. 葫芦呼噜（WE战队）
  { masterName: '葫芦呼噜', aliases: ['葫芦呼噜', 'WE葫芦呼噜'], note: 'WE战队' },
  // 48. 寻心（DY战队）
  { masterName: '寻心', aliases: ['寻心', 'DY寻心'], note: 'DY战队' },
  // 49. 棒教练（DY战队）
  { masterName: '棒教练', aliases: ['棒教练', 'DY棒教练'], note: 'DY战队' },
  // 50. 东方朔（B站）
  { masterName: '东方朔', aliases: ['东方朔', 'B站东方朔'], note: 'B站选手' },
  // 51. 群星YUN落（群星战队）
  { masterName: '群星YUN落', aliases: ['群星YUN落', '群星yun落', '抖音群星YUN落'], note: '群星战队' },
  // 52. 小樾
  { masterName: '小樾', aliases: ['小樾', '风华绝代小樾'], note: '选手小樾' },
  // 53. 所演（与所谓Y已拆分独立）
  { masterName: '所演', aliases: ['所演', '抖音所演'], note: '选手所演' },
  // 54. 所谓Y（独立选手）
  { masterName: '所谓Y', aliases: ['所谓Y', '抖音所谓Y'], note: '选手所谓Y' },
  // 55. 新一（QT战队）
  { masterName: '新一', aliases: ['新一', 'QT新一', '抖音QT新一'], note: 'QT战队主力' },
  // 56. 萌岑（QT战队）
  { masterName: '萌岑', aliases: ['萌岑', 'QT萌岑', '抖音QT萌岑'], note: 'QT战队' },
  // 57. 北念
  { masterName: '北念', aliases: ['北念', '抖音搜索北念'], note: '选手北念' },
  // 58. 刺儿
  { masterName: '刺儿', aliases: ['刺儿', '抖音刺儿'], note: '选手刺儿' },
  // 58b. 刺痛
  { masterName: '刺痛', aliases: ['刺痛', '抖音刺痛', 'QG刺痛', 'Hurt刺痛'], note: '顶级射手高手 / 擅长稷下坦射与养猪' },
  // 59. 呆头鹅
  { masterName: '呆头鹅', aliases: ['呆头鹅', '抖音呆头鹅'], note: '选手呆头鹅' },
  // 60. 区王
  { masterName: '区王', aliases: ['区王', '抖音区王'], note: '选手区王' },
  // 61. 湛蓝
  { masterName: '湛蓝', aliases: ['湛蓝', '抖音湛蓝'], note: '选手湛蓝' },
  // 62. 路边
  { masterName: '路边', aliases: ['路边', '路边 1 条', '抖音路边1条（梦飞团队）'], note: '梦飞团队选手' },
  // 63. 一朵老雏菊
  { masterName: '一朵老雏菊', aliases: ['一朵老雏菊', '抖音一朵老雏菊'], note: '选手一朵老雏菊' },
  // 64. 白起（EG战队）
  { masterName: '白起', aliases: ['白起', '抖音EG白起'], note: 'EG战队' },
  // 65. 龙傲天
  { masterName: '龙傲天', aliases: ['龙傲天', '抖音龙傲天'], note: '选手龙傲天' },
  // 66. 晓枫（RW侠战队职业选手）
  { masterName: '晓枫', aliases: ['晓枫', 'RW侠.晓枫', 'RW侠晓枫', 'RW晓枫'], note: 'RW侠战队选手 / S1赛事冠军' },
  // 67. 白兔（有局战队）
  { masterName: '白兔', aliases: ['白兔', '有局｜白兔', '有局|白兔', '有局丨白兔', '有局白兔'], note: '有局战队 / 全国第十阿离 / 伞半月夺冠选手' },
  // 68. 碎碎圆圆（EG战队）
  { masterName: '碎碎圆圆', aliases: ['碎碎圆圆', '抖音EG碎碎圆圆', 'EG碎碎圆圆', '碎碎'], note: 'EG战队核心 / 全国第二玉环 / 倒转与雷霆高手' },
  // 69. 风喵喵
  { masterName: '风喵喵', aliases: ['风喵喵', '抖音风喵喵', '风喵'], note: '高分段倒转高手 / 白歌即兴创作三分倒转' },
  // 70. 心机猫
  { masterName: '心机猫', aliases: ['心机猫', '冷酷心机小猫', '心机小猫', '冷酷心机猫'], note: '高分段选手 / 嬴律逐鹿蒙恬与雷霆机甲' },
  // 71. 月影孤冰
  { masterName: '月影孤冰', aliases: ['月影孤冰', '抖音月影孤冰', '月影'], note: '稳健防守保核 / 小妲己传统养猪' },
  // 72. Yk
  { masterName: 'Yk', aliases: ['Yk丶', 'Yk', 'YK丶', 'YK', 'yk', 'yk丶'], note: '高爆发法刺与孙小宾牌序回溯' }
]

const ALIAS_TO_MASTER_MAP = new Map<string, MasterPlayerGroup>()
for (const g of MASTER_PLAYER_GROUPS) {
  ALIAS_TO_MASTER_MAP.set(g.masterName, g)
  for (const alias of g.aliases) {
    ALIAS_TO_MASTER_MAP.set(alias, g)
  }
}

/**
 * 查询指定账号昵称归属的主选手名
 */
export function getMasterPlayerName(nickname?: string | null): string {
  if (!nickname || typeof nickname !== 'string') return '未知'
  const trimmed = nickname.trim().replace(/^@/, '')
  const group = ALIAS_TO_MASTER_MAP.get(trimmed)
  return group ? group.masterName : trimmed
}

/**
 * 查询某主选手的所有关联账号/小号
 */
export function getPlayerAliases(masterName: string): string[] {
  const group = ALIAS_TO_MASTER_MAP.get(masterName)
  return group ? group.aliases : [masterName]
}

/**
 * 判断某个选手或账号是否有多个归纳账号
 */
export function isMultiAccountPlayer(masterOrAccountName: string): boolean {
  const group = ALIAS_TO_MASTER_MAP.get(masterOrAccountName)
  return Boolean(group && group.aliases.length > 1)
}

/**
 * 获取主选手关联账号总数
 */
export function getPlayerAccountCount(masterName: string): number {
  const group = ALIAS_TO_MASTER_MAP.get(masterName)
  return group ? group.aliases.length : 1
}

export interface AggregatedPlayerProfile {
  id: string
  nickname: string
  masterName: string
  author: string
  observedMatches: number
  observedWins: number
  builds: { label: string; observations: number; winsForSourceLabel: number }[]
  commonBuilds: string[]
  claims: any[]
  history: any[]
  linkedAccounts: string[]
  note?: string
}

/**
 * 将原始 CatalogProfile 列表按真实主选手身份合并归纳
 */
export function aggregateCatalogPlayers(rawPlayers: any[]): AggregatedPlayerProfile[] {
  const map = new Map<string, AggregatedPlayerProfile>()

  for (const p of rawPlayers) {
    const master = getMasterPlayerName(p.nickname)
    let agg = map.get(master)
    if (!agg) {
      const group = ALIAS_TO_MASTER_MAP.get(master)
      agg = {
        id: 'master_' + master,
        nickname: master,
        masterName: master,
        author: p.author || '软柿',
        observedMatches: 0,
        observedWins: 0,
        builds: [],
        commonBuilds: [],
        claims: [],
        history: [],
        linkedAccounts: [],
        note: group?.note
      }
      map.set(master, agg)
    }

    if (!agg.linkedAccounts.includes(p.nickname)) {
      agg.linkedAccounts.push(p.nickname)
    }

    agg.observedMatches += p.observedMatches || 0
    agg.observedWins += p.observedWins || 0

    // 合并流派
    for (const b of (p.builds || [])) {
      const existing = agg.builds.find(x => x.label === b.label)
      if (existing) {
        existing.observations += b.observations || 0
        existing.winsForSourceLabel += b.winsForSourceLabel || 0
      } else {
        agg.builds.push({ ...b })
      }
    }

    // 合并声称与历史
    if (Array.isArray(p.claims)) {
      agg.claims.push(...p.claims)
    }
    if (Array.isArray(p.history)) {
      agg.history.push(...p.history)
    }
  }

  // 整理每个选手的 builds 和 commonBuilds
  for (const agg of map.values()) {
    agg.builds.sort((a, b) => b.observations - a.observations)
    const common = agg.builds
      .filter(b => b.observations >= 2 && agg.observedMatches > 0 && b.observations / agg.observedMatches >= 0.3)
      .map(b => b.label)
    agg.commonBuilds = common.length ? common : agg.builds.slice(0, 2).map(b => b.label)
  }

  return [...map.values()]
}

