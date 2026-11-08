// 选手个人头像映射与生成机制（以选手为唯一实体）

export const KNOWN_PLAYERS: readonly string[] = [
  'YK丶',
  'WE葫芦呼噜',
  'QT鱼沐汐0丶7版',
  'QT萌岑',
  'QT电竞披萨鱼',
  'QT新一',
  'QT披萨鱼遗愿',
  'LERO',
  'I蟲抖音诸葛龟',
  'I蟲抖音猪葛龟龟',
  'I蟲抖音猪葛龟',
  'I蟲丶沐小朵',
  'I蟲丶沐小呆',
  'I蟲丶初心',
  'I蟲、沐小朵',
  'EZ阿文',
  'EZ灬欧洲鱼',
  'EZ沐汐嘻嘻嘻',
  'EZ沐汐',
  'EZ拉丁鱼丶沐汐',
  'EZ拉丁鱼',
  'EZ抖音沐汐',
  'EZ小超',
  'EZ天誉',
  'EZ天眷',
  'EZ丶7D',
  'EZ、7D',
  'EG清辞',
  'EG如昨',
  'EGM皮皮鲨',
  'EGM无量怜苓',
  'EGM抖音花归尘',
  'EGM抖音画笔',
  'EGM小谷芷',
  'EGM I 无量怜苓',
  'DY道无涯',
  'DY棒教练',
  'DY寻心',
  'DYEG清辞',
  'B站东方朔',
  'B站万象棋小祥',
  'B站QT逆光',
  'B站QT小优律',
  'B站QT孙悟方',
  'BLIBLI猫猫虾条',
  'BLIBLI喵喵虾条',
  'BILI星光柯基',
  'ASEN',
  '7D',
  '一个打五个',
  '一朵老雏菊',
  '万象棋花归尘๑',
  '下雨了下雨了',
  '世薄情',
  '东东电竞道无涯',
  '丰川祥子',
  '书遇OVO',
  '事后诸葛亮',
  '儒雅随和的77',
  '兰陵笑笑笑',
  '冷酷心机小猫',
  '刷牌之怪嘉誉',
  '刺儿',
  '北念',
  '区王',
  '华创-沐小朵',
  '反骨',
  '君莫',
  '呆头鹅',
  '喵帕斯',
  '墨子',
  '墨宝',
  '夜余',
  '天眷',
  '妖柒',
  '姚半仙',
  '娇弱的佩奇',
  '孙悟方',
  '安逸体面离场',
  '小九',
  '小天使翼',
  '小宇13',
  '小慷',
  '小新U',
  '小新游',
  '小樾',
  '小琳谷芷',
  '小谷芷',
  '小超',
  '尘缘A',
  '张嘉豪',
  '快手小斯',
  '怜苓',
  '想K益笙菌',
  '我是66熊',
  '所演',
  '抖音66熊',
  '抖音DY小凌',
  '抖音EGM小谷芷',
  '抖音EGM断弦',
  '抖音EGM李由多',
  '抖音EGM皮皮鲨',
  '抖音EG万象棋',
  '抖音EG反骨',
  '抖音EG如昨',
  '抖音EG小意',
  '抖音EG未言',
  '抖音EG泪花',
  '抖音EG清辞',
  '抖音EG白起',
  '抖音EG福鱼',
  '抖音EG航迹云',
  '抖音EG许诺1',
  '抖音EZ、色彩',
  '抖音EZ姚半仙',
  '抖音EZ张嘉豪',
  '抖音EZ泪花',
  '抖音EZ羡鱼儿',
  '抖音EZ阿文',
  '抖音QT新一',
  '抖音QT萌岑',
  '抖音XYG懒羊羊',
  '抖音一朵老雏菊',
  '抖音一茗',
  '抖音丶公孙策',
  '抖音刺儿',
  '抖音刺痛',
  '抖音区王',
  '抖音呆头鹅',
  '抖音妖柒',
  '抖音姚半仙',
  '抖音小新游',
  '抖音所演',
  '抖音所谓Y',
  '抖音搜六韬、',
  '抖音搜流儿',
  '抖音搜索北念',
  '抖音梦飞',
  '抖音梦飞1',
  '抖音梦飞11',
  '抖音梦飞22',
  '抖音梦飞7',
  '抖音梦飞77',
  '抖音梦飞冻冻',
  '抖音流儿',
  '抖音清晨',
  '抖音湛蓝',
  '抖音火山羊',
  '抖音猪葛龟龟',
  '抖音瑞梨',
  '抖音群星YUN落',
  '抖音群星李由多',
  '抖音诸葛龟龟',
  '抖音路边1条（梦飞团队）',
  '抖音遗愿1',
  '抖音龙傲天',
  '拉丁鱼',
  '斗鱼奇谋',
  '方屿行',
  '无量大蒜',
  '曹玄德',
  '有局丨白兔',
  '梦飞大大',
  '欧洲鱼',
  '武汉',
  '武汉EG',
  '武汉EG碎碎圆圆',
  '武汉EG福鱼',
  '沐汐',
  '流儿',
  '浪屿',
  '湛蓝',
  '猪葛龟龟',
  '白白白白白3',
  '白起',
  '百川',
  '皮皮鲨',
  '糊涂蛋ZXZ',
  '羡慕无机盐',
  '羡鱼儿',
  '群星yun落',
  '胖狗王',
  '胜天半子嘉誉',
  '舞麟迷弟',
  '色彩',
  '葫芦呼噜',
  '虎牙EGM行乐',
  '路边',
  '运赢王李由多',
  '遗愿',
  '酒酒-',
  '阿九',
  '阿文倒转王',
  '阿震',
  '风华绝代小樾',
  '饼子不高兴',
  '马克之母挽星',
  '马可之母挽星',
  '马可削0丶7对吗',
  '麟音',
  '龙傲天',
] as const

const KNOWN_PLAYERS_SET = new Set<string>(KNOWN_PLAYERS)

/**
 * 常见别名/前缀/符号归一化对照表
 */
export const PLAYER_ALIASES: Record<string, string> = {
  'I蟲丶沐小朵': 'I蟲、沐小朵',
  '华创-沐小朵': 'I蟲、沐小朵',
  'EZ丶7D': 'EZ、7D',
  '7D': 'EZ、7D',
  '马可之母挽星': '马克之母挽星',
  '小琳谷芷': 'EGM小谷芷',
  '刷牌之怪嘉誉': '胜天半子嘉誉',
  '阿文倒转王': 'EZ阿文',
  '东东电竞道无涯': 'DY道无涯',
  '梦飞大大': '抖音梦飞',
  '运赢王李由多': '抖音EGM李由多',
  'BLIBLI猫猫虾条': 'BLIBLI喵喵虾条',
  'I蟲抖音诸葛龟': 'I蟲抖音猪葛龟龟',
  'I蟲抖音猪葛龟': 'I蟲抖音猪葛龟龟',
  '抖音诸葛龟龟': '抖音猪葛龟龟',
  '武汉': '武汉 EG清辞',
  '武汉EG': '武汉 EG清辞',
}

/**
 * 清理昵称中的平台备注、作者补充括号等噪音
 */
export function normalizeNickname(nickname: string): string {
  let s = nickname.trim().replace(/^@/, '')
  // 移除诸如 (王者万象棋)、（王者万象棋夺冠版）、【万象棋国一庄小鱼】等注记
  s = s.replace(/[（(【][^）)】]*[）)】]/g, '').trim()
  // 移除尾部未闭合或孤立的 王者万象棋
  s = s.replace(/王者万象棋.*$/, '').trim()
  return s
}

/**
 * 获取选手的个人头像 URL
 * @param nickname 选手昵称
 */
export function getPlayerAvatar(nickname?: string | null): string {
  if (!nickname || typeof nickname !== 'string') {
    return '/avatars/default.svg'
  }

  const clean = nickname.trim()
  if (!clean) {
    return '/avatars/default.svg'
  }

  // 1. 完全精确匹配
  if (KNOWN_PLAYERS_SET.has(clean)) {
    return `/avatars/players/${encodeURIComponent(clean)}.svg`
  }

  // 2. 别名表直接映射
  if (PLAYER_ALIASES[clean] && KNOWN_PLAYERS_SET.has(PLAYER_ALIASES[clean])) {
    return `/avatars/players/${encodeURIComponent(PLAYER_ALIASES[clean])}.svg`
  }

  // 3. 去括号与备注后匹配
  const normalized = normalizeNickname(clean)
  if (normalized && KNOWN_PLAYERS_SET.has(normalized)) {
    return `/avatars/players/${encodeURIComponent(normalized)}.svg`
  }
  if (normalized && PLAYER_ALIASES[normalized] && KNOWN_PLAYERS_SET.has(PLAYER_ALIASES[normalized])) {
    return `/avatars/players/${encodeURIComponent(PLAYER_ALIASES[normalized])}.svg`
  }

  // 4. 符号变体替换（顿号与点号互换）
  const dotVariant = clean.replace(/、/g, '丶')
  if (KNOWN_PLAYERS_SET.has(dotVariant)) {
    return `/avatars/players/${encodeURIComponent(dotVariant)}.svg`
  }
  const commaVariant = clean.replace(/丶/g, '、')
  if (KNOWN_PLAYERS_SET.has(commaVariant)) {
    return `/avatars/players/${encodeURIComponent(commaVariant)}.svg`
  }

  // 5. 尝试已知选手子串匹配（按长度降序优先匹配长名称）
  const sorted = [...KNOWN_PLAYERS].sort((a, b) => b.length - a.length)
  for (const known of sorted) {
    if (clean === known || normalized === known) {
      return `/avatars/players/${encodeURIComponent(known)}.svg`
    }
  }
  for (const known of sorted) {
    if (known.length >= 2 && (clean.includes(known) || (normalized && normalized.includes(known)))) {
      return `/avatars/players/${encodeURIComponent(known)}.svg`
    }
  }

  // 6. 动态生成高品质 SVG 头像兜底
  const initials = clean.replace(/^(抖音|B站|BILI|QT|EG|EZ|I蟲[、丨丶]|DY)/g, '').slice(0, 2) || clean.slice(0, 2)
  const colors = [
    ['#1E463A', '#2A5A4B'],
    ['#311B92', '#512DA8'],
    ['#880E4F', '#C2185B'],
    ['#004D40', '#00796B'],
    ['#E65100', '#F57C00'],
    ['#263238', '#455A64'],
  ]
  const idx = Math.abs(clean.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % colors.length
  const [c1, c2] = colors[idx]

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="56" fill="${c1}" stroke="${c2}" stroke-width="4"/><text x="60" y="70" fill="#FFFFFF" font-size="24" font-weight="900" font-family="sans-serif" text-anchor="middle">${initials}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
