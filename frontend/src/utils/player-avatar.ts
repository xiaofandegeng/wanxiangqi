// 选手个人头像映射与生成机制（以选手为唯一实体）

const KNOWN_PLAYERS: string[] = [
  '世薄情',
  '抖音梦飞',
  '抖音梦飞1',
  '抖音梦飞7',
  '抖音梦飞77',
  '抖音梦飞冻冻',
  '抖音小新游',
  '抖音妖柒',
  '遗愿',
  'EGM皮皮鲨',
  '抖音EGM皮皮鲨',
  '抖音EGM小谷芷',
  'EGM小谷芷',
  '胜天半子嘉誉',
  '抖音搜索北念',
  '抖音湛蓝',
  '娇弱的佩奇',
  '抖音猪葛龟龟',
  'BLIBLI喵喵虾条',
  'BILI星光柯基',
  'B站QT孙悟方',
  '抖音EZ羡鱼儿',
  'EZ拉丁鱼',
  'EZ天眷',
  'EZ、7D',
  'EZ灬欧洲鱼',
  '白白白白白3',
  '兰陵笑笑笑',
  'EG清辞',
  '抖音EG如昨',
  '抖音EG反骨',
  '抖音EG泪花',
  '风华绝代小樾',
  'I蟲、沐小朵',
  '抖音刺痛',
  '抖音搜流儿',
  '抖音EGM李由多',
  '丰川祥子',
  'QT新一',
  '抖音QT新一',
  '姚半仙',
  '抖音EZ姚半仙',
  '阿九',
  '张嘉豪',
  '抖音EZ张嘉豪',
  '呆头鹅',
  '色彩',
  '抖音EZ、色彩',
  '龙傲天',
  '抖音龙傲天',
  'DY道无涯',
  'EZ小超',
  '区王',
  '抖音区王',
  'WE葫芦呼噜',
  '舞麟迷弟',
  '墨子',
]

/**
 * 获取选手的个人头像 URL
 * @param nickname 选手昵称
 */
export function getPlayerAvatar(nickname?: string | null): string {
  if (!nickname || typeof nickname !== 'string') {
    return '/avatars/default.svg'
  }

  const clean = nickname.trim()
  if (KNOWN_PLAYERS.includes(clean)) {
    return `/avatars/players/${encodeURIComponent(clean)}.svg`
  }

  // 尝试匹配已知选手的别名或简写
  for (const known of KNOWN_PLAYERS) {
    if (clean.includes(known) || known.includes(clean)) {
      return `/avatars/players/${encodeURIComponent(known)}.svg`
    }
  }

  // 动态生成兜底的高品质选手 SVG 头像
  const initials = clean.replace(/^(抖音|B站|BILI|QT|EG|EZ|I蟲[、丨]|DY)/g, '').slice(0, 2) || clean.slice(0, 2)
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
