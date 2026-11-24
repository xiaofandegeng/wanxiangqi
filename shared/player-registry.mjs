// 经过全库对局同场互斥校验（0 同场冲突）的选手改名归并与官方唯一编号称号名册
export const CREDENTIAL_TYPES = Object.freeze({
  GAME_UID: { code: 'GAME_UID', label: '游戏数字 UID', defaultRegion: '全服' },
  FOUNDER_BADGE: { code: 'FOUNDER_BADGE', label: '开服奠基人', defaultRegion: '开服奠基人' },
  PIONEER_BADGE: { code: 'PIONEER_BADGE', label: '荣耀先驱者', defaultRegion: '荣耀先驱者' },
  ANGEL_BADGE: { code: 'ANGEL_BADGE', label: '天使投资人', defaultRegion: '天使投资人' },
  COFOUNDER_BADGE: { code: 'COFOUNDER_BADGE', label: '联合创始人', defaultRegion: '联合创始人' },
})

export function derivePersonUid(profileId) {
  if (typeof profileId !== 'string' || !profileId.trim()) return null
  const clean = profileId.trim()
  if (clean.startsWith('WXQP-')) return clean.toUpperCase()
  return `WXQP-${clean.slice(0, 10).toUpperCase()}`
}

export const VERIFIED_PLAYER_IDENTITY_GROUPS = Object.freeze([
  {
    canonical: '抖音EG清辞',
    aliases: ['EG清辞', 'DYEG清辞', '清辞', '我要打王牌18', '抖音清辞4连6', '抖音清辞四连6'],
    badge: { credentialType: 'FOUNDER_BADGE', platform: '王者万象棋', region: '开服奠基人', uid: '0014' },
    note: '结算原图核实开服奠基人 0014 及同头像十冠无双改名记录'
  },
  {
    canonical: '猫脑过载',
    aliases: ['给我发个机器头', '想玩猫条', '猫猫雪团粉丝', '井上坚二的主人'],
    badge: { credentialType: 'FOUNDER_BADGE', platform: '王者万象棋', region: '开服奠基人', uid: '0025' },
    note: '结算原图连续核实开服奠基人 0025 同一账号改名'
  },
  {
    canonical: '抖音湛蓝',
    aliases: ['湛蓝', '抖音湛蓝怀孕版', '抖音湛蓝丢兔版'],
    badge: { credentialType: 'PIONEER_BADGE', platform: '王者万象棋', region: '荣耀先驱者', uid: '0289' },
    note: '多场结算原图核实荣耀先驱者 0289 同一账号改名'
  },
  {
    canonical: 'DOUYIN小猪柒宝',
    aliases: ['douyin小猪柒宝', 'douyin小猪染宝'],
    badge: { credentialType: 'ANGEL_BADGE', platform: '王者万象棋', region: '天使投资人', uid: '0770' },
    note: '结算原图核实天使投资人 0770 及大小写/错字转录归并'
  },
  {
    canonical: 'B站东方朔',
    aliases: ['东方朔'],
    badge: { credentialType: 'COFOUNDER_BADGE', platform: '王者万象棋', region: '联合创始人', uid: '0626' },
    note: '结算原图核实联合创始人 0626'
  },
  {
    canonical: 'BILI星光柯基',
    aliases: ['bili星光柯基', '星光柯基'],
    badge: null,
    note: '大小写与平台前缀统一（零同场冲突）'
  },
  {
    canonical: '抖音CC',
    aliases: ['抖音cc'],
    badge: null,
    note: '大小写变体统一（零同场冲突）'
  },
  {
    canonical: '抖音群星YUN落',
    aliases: ['抖音群星yun落', '群星YUN落', '群星yun落'],
    badge: null,
    note: '大小写与平台前缀统一（零同场冲突）'
  },
  {
    canonical: 'i蟲、初心',
    aliases: ['I蟲、初心', 'I蟲丶初心', '初心'],
    badge: null,
    note: '战队前缀大小写与标点统一（零同场冲突）'
  },
  {
    canonical: '抖音EGM小谷芷',
    aliases: ['EGM小谷芷', '小琳谷芷', '小谷芷'],
    badge: null,
    note: 'EGM 战队核心选手曾用名归并（零同场冲突）'
  },
  {
    canonical: '抖音EGM皮皮鲨',
    aliases: ['EGM皮皮鲨', '皮皮鲨'],
    badge: null,
    note: 'EGM 战队前缀归并（零同场冲突）'
  },
  {
    canonical: 'EZ拉丁鱼',
    aliases: ['EZ拉丁鱼7D版', 'EZ拉丁鱼丶沐汐', 'EZ沐汐', 'EZ沐汐嘻嘻嘻', 'EZ抖音沐汐', 'QT鱼沐汐0丶7版', 'EZ灬欧洲鱼', '沐汐'],
    badge: null,
    note: '沐汐 / 欧洲鱼 / 拉丁鱼改名链路（零同场冲突）'
  },
  {
    canonical: '抖音EZ嘉誉',
    aliases: ['胜天半子嘉誉', '刷牌之怪嘉誉', '嘉誉'],
    badge: null,
    note: '嘉誉曾用名与前缀归并（零同场冲突）'
  },
  {
    canonical: '抖音EZ姚半仙',
    aliases: ['EZ姚半仙', 'ez姚半仙7D版', '抖音姚半仙', '姚半仙'],
    badge: null,
    note: '姚半仙后缀与大小写改名归并（零同场冲突）'
  },
  {
    canonical: '抖音搜天眷',
    aliases: ['EZ天眷', '天眷', '33能量1个大'],
    badge: null,
    note: '天眷改名与战队前缀归并（零同场冲突）'
  },
  {
    canonical: '抖音搜道无涯',
    aliases: ['抖音道无涯', 'DY道无涯', '东东电竞道无涯', '道无涯好运版', '道无涯'],
    badge: null,
    note: '道无涯同头像独狼称号改名归并（零同场冲突）'
  },
  {
    canonical: '抖音EG碎碎圆圆',
    aliases: ['EG碎碎圆圆', '武汉EG碎碎圆圆', '老退勿念', '碎碎圆圆'],
    badge: null,
    note: '同头像全国第四玉环改名归并（零同场冲突）'
  },
  {
    canonical: '985第一环',
    aliases: ['985第一环如昨'],
    badge: null,
    note: '同头像框与玉环代言人改名归并（零同场冲突）'
  },
  {
    canonical: '抖音QT新一',
    aliases: ['QT新一', '新一且好运', '新一'],
    badge: null,
    note: '同头像与等级改名归并（零同场冲突）'
  },
  {
    canonical: '好运且喜忠犬壹',
    aliases: ['好运且爱忠犬1'],
    badge: null,
    note: '同头像国服明先生改名归并（零同场冲突）'
  },
  {
    canonical: '小暖贴贴',
    aliases: ['好运小暖'],
    badge: null,
    note: '同头像全国第三嬴律改名归并（零同场冲突）'
  },
  {
    canonical: '娇弱的佩奇',
    aliases: ['娇弱的佩奇7D版', '佩奇'],
    badge: null,
    note: '同头像全国第二庄小鱼改名归并（零同场冲突）'
  },
  {
    canonical: '抖音EZ小九',
    aliases: ['EZ、小九7D版'],
    badge: null,
    note: '同头像玉环代言人改名归并（零同场冲突）'
  },
  {
    canonical: '抖音所演ii',
    aliases: ['抖音所演II', '抖音所演'],
    badge: null,
    note: '嬴律代言人组大小写与前缀归并（零同场冲突）'
  },
  {
    canonical: '抖音所演11',
    aliases: ['抖音所演1'],
    badge: null,
    note: '金色头像框数字组归并（零同场冲突）'
  },
  {
    canonical: '抖音猪葛龟龟',
    aliases: ['抖音诸葛龟龟', 'I蟲抖音猪葛龟', 'I蟲抖音猪葛龟龟', 'I蟲抖音诸葛龟', '猪葛龟', '猪葛龟龟'],
    badge: null,
    note: '猪葛龟战队前缀与同音字归并（零同场冲突）'
  },
  {
    canonical: '抖音EZ阿文',
    aliases: ['EZ阿文', '阿文倒转王', '阿文'],
    badge: null,
    note: '阿文前缀归并（零同场冲突）'
  },
  {
    canonical: '抖音QT萌岑',
    aliases: ['QT萌岑', '萌岑'],
    badge: null,
    note: '萌岑前缀归并（零同场冲突）'
  },
  {
    canonical: '抖音EZ、色彩',
    aliases: ['色彩'],
    badge: null,
    note: '色彩前缀归并（零同场冲突）'
  },
  {
    canonical: 'B站万象棋小祥',
    aliases: ['万象棋小祥', '小祥'],
    badge: null,
    note: '小祥前缀归并（零同场冲突）'
  },
  {
    canonical: 'EGM抖音画笔',
    aliases: ['抖音画笔', '画笔'],
    badge: null,
    note: '画笔前缀归并（零同场冲突）'
  },
  {
    canonical: 'WE葫芦呼噜',
    aliases: ['葫芦呼噜'],
    badge: null,
    note: '葫芦呼噜前缀归并（零同场冲突）'
  },
  {
    canonical: '有局丨白兔',
    aliases: ['有局｜白兔', '有局|白兔', '有局白兔', '白兔'],
    badge: null,
    note: '白兔标点变体归并（零同场冲突）'
  }
])
