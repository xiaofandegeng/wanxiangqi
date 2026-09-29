// v3 P0-B · 合成演示数据生成器（封存版）
// 原 scripts/generate_real_dataset.mjs 与 scripts/sync_camp_official_matches.mjs 的
// 演示用途替代品。任务书 §P0-B：停用生成数据进入业务路径；如保留演示用途，
// 移入独立 fixtures、标记 SYNTHETIC、限制只能写 demo/test 存储。
//
// 与原脚本的差别（红线）：
//   1. 只写 tools/emulator-watcher/fixtures/data/storage.json，绝不触碰业务 storage.json
//   2. 不连接任何 PostgreSQL（原脚本直写业务库并谎称官方同步成功，F03）
//   3. 所有战绩强制 synthetic:true，batchId 一律 synthetic- 前缀
//   4. 需 WXQ_ALLOW_SYNTHETIC=true 显式开启，默认拒绝执行
//   5. 名次仍按剧本编排（本脚本只服务 demo 演示，不代表任何真实历史）
//
// 用法：WXQ_ALLOW_SYNTHETIC=true node fixtures/generate_demo_fixtures.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStorageEngine } from '../storage.mjs'
import { validateCampRawRecord } from '../adapters/camp-adapter.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DATA_DIR = path.join(__dirname, 'data')

if (process.env.WXQ_ALLOW_SYNTHETIC !== 'true') {
  console.error('⛔ [拒绝执行] 本脚本生成合成演示数据。')
  console.error('   v3 整改后合成数据禁止进入业务 storage.json 与业务 PostgreSQL；本脚本只写 fixtures/data。')
  console.error('   确需生成 demo 数据：WXQ_ALLOW_SYNTHETIC=true node fixtures/generate_demo_fixtures.mjs')
  process.exit(1)
}

// ---- 原 generate_real_dataset.mjs 的种子数据（71 位选手 + 36 套阵容，数据原样封存）----
const RAW_PLAYERS = [
  { rank: 1, displayName: "重生模拟战", uid: "1892295749", points: 25, commander: "常小娥", style: "极速爆发流" },
  { rank: 1, displayName: "散修鲤非鱼", uid: "356866150", points: 25, commander: "明先生", style: "神射运营流" },
  { rank: 3, displayName: "半岛的歌姬", uid: "490036347", points: 24, commander: "瑶妹", style: "法系护盾流" },
  { rank: 4, displayName: "从心yyyyy", uid: "198742103", points: 23, commander: "白歌", style: "破阵连斩流" },
  { rank: 4, displayName: "王者帅", uid: "409762869", points: 23, commander: "弈星", style: "天元控场流" },
  { rank: 6, displayName: "多吃猫咪有营养", uid: "2143051937", points: 22, commander: "狄仁杰", style: "大唐护卫流" },
  { rank: 6, displayName: "洛雨霖铃", uid: "215343781", points: 22, commander: "常小娥", style: "连环刺客流" },
  { rank: 6, displayName: "一棋定万象", uid: "95909179", points: 22, commander: "孙策", style: "吴国江东突" },
  { rank: 9, displayName: "抖音王昭君", uid: "192837461", points: 21, commander: "王昭君", style: "冰封聚灵流" },
  { rank: 9, displayName: "小筑踏垛苔长青", uid: "2140737964", points: 21, commander: "明先生", style: "后排狙杀流" },
  { rank: 11, displayName: "曾与影子提及你", uid: "214479459", points: 20, commander: "瑶妹", style: "圣盾稳血流" },
  { rank: 12, displayName: "9178平台", uid: "539957238", points: 20, commander: "白歌", style: "重甲反伤流" },
  { rank: 13, displayName: "白夜弈万象", uid: "417843945", points: 19, commander: "弈星", style: "奇门八卦流" },
  { rank: 14, displayName: "抖音EG兰攸", uid: "123847291", points: 19, commander: "常小娥", style: "夜影暴击流" },
  { rank: 15, displayName: "抖音EG熙梓", uid: "148791048", points: 18, commander: "狄仁杰", style: "双重律法流" },
  { rank: 16, displayName: "弈界行者", uid: "391827462", points: 18, commander: "明先生", style: "连珠穿杨流" },
  { rank: 17, displayName: "棋圣附体", uid: "582910481", points: 17, commander: "孙策", style: "惊涛骇浪流" },
  { rank: 18, displayName: "万象棋老张", uid: "719284019", points: 17, commander: "瑶妹", style: "神鹿庇佑流" },
  { rank: 19, displayName: "梦回汉唐", uid: "829104821", points: 16, commander: "狄仁杰", style: "长安盛世流" },
  { rank: 20, displayName: "弈星本星", uid: "938201948", points: 16, commander: "弈星", style: "黑白落子流" },
  { rank: 21, displayName: "峡谷棋神", uid: "104928174", points: 16, commander: "白歌", style: "锋矢突破流" },
  { rank: 22, displayName: "掌门人", uid: "294810294", points: 15, commander: "常小娥", style: "灵兔突击流" },
  { rank: 23, displayName: "逆风翻盘", uid: "385920194", points: 15, commander: "明先生", style: "千里索敌流" },
  { rank: 24, displayName: "天弈流光", uid: "495820193", points: 15, commander: "瑶妹", style: "护佑反击流" },
  { rank: 25, displayName: "独步青云", uid: "596820192", points: 15, commander: "孙策", style: "破浪先锋流" },
  { rank: 26, displayName: "弈剑听雨", uid: "697820191", points: 15, commander: "白歌", style: "九霄剑气流" },
  { rank: 27, displayName: "棋开得胜", uid: "798820190", points: 14, commander: "狄仁杰", style: "六扇门锁血" },
  { rank: 28, displayName: "醉卧棋盘", uid: "899820189", points: 14, commander: "常小娥", style: "月蚀爆发流" },
  { rank: 29, displayName: "万象更新", uid: "910820188", points: 14, commander: "弈星", style: "乾坤挪移流" },
  { rank: 30, displayName: "棋定乾坤", uid: "101820187", points: 14, commander: "明先生", style: "金乌穿透流" },
  { rank: 31, displayName: "风起万象", uid: "112820186", points: 14, commander: "瑶妹", style: "自然恩赐流" },
  { rank: 32, displayName: "勤劳的小野猪", uid: "138491029", points: 14, commander: "白歌", style: "野蛮冲撞流" },
  { rank: 32, displayName: "DY超叔叔", uid: "1569795287", points: 14, commander: "明先生", style: "极限攻速流" },
  { rank: 32, displayName: "独见青山", uid: "423841322", points: 14, commander: "常小娥", style: "月影迷踪流" },
  { rank: 32, displayName: "博丽灵梦", uid: "447293474", points: 14, commander: "弈星", style: "符文结界流" },
  { rank: 40, displayName: "南柯一梦闯王者", uid: "1502868062", points: 13, commander: "孙策", style: "扬帆远航流" },
  { rank: 41, displayName: "长安不起风", uid: "79101194", points: 12, commander: "狄仁杰", style: "暗影肃清流" },
  { rank: 42, displayName: "云中藏神明", uid: "184920194", points: 11, commander: "瑶妹", style: "神光守护流" },
  { rank: 42, displayName: "大大大大魔王哦", uid: "294820195", points: 11, commander: "白歌", style: "魔王降临流" },
  { rank: 42, displayName: "一根羽毛", uid: "395820196", points: 11, commander: "常小娥", style: "飞羽流星流" },
  { rank: 42, displayName: "知衍呀", uid: "1548217626", points: 11, commander: "明先生", style: "精准锁定流" },
  { rank: 42, displayName: "Sadness小飞飞", uid: "376861506", points: 11, commander: "弈星", style: "飞星入瓮流" },
  { rank: 47, displayName: "北川", uid: "1696352884", points: 10, commander: "瑶妹", style: "冰川破浪流" },
  { rank: 48, displayName: "弈海游龙", uid: "1796352885", points: 10, commander: "白歌", style: "狂龙怒涛流" },
  { rank: 49, displayName: "棋逢对手", uid: "1896352886", points: 10, commander: "狄仁杰", style: "王牌密探流" },
  { rank: 50, displayName: "万古长青", uid: "1996352887", points: 9, commander: "瑶妹", style: "不灭灵鹿流" },
  { rank: 51, displayName: "落笔惊风", uid: "2096352888", points: 9, commander: "弈星", style: "泼墨成阵流" },
  { rank: 52, displayName: "清风徐来", uid: "2196352889", points: 9, commander: "常小娥", style: "灵风疾行流" },
  { rank: 53, displayName: "明月照我", uid: "2296352890", points: 8, commander: "明先生", style: "月华连星流" },
  { rank: 54, displayName: "傲骨铮铮", uid: "2396352891", points: 8, commander: "白歌", style: "金戈铁马流" },
  { rank: 55, displayName: "飞星逐月", uid: "2496352892", points: 8, commander: "孙策", style: "雷霆万钧流" },
  { rank: 56, displayName: "千局不败", uid: "2596352893", points: 8, commander: "狄仁杰", style: "天罗地网流" },
  { rank: 57, displayName: "笑看风云", uid: "2696352894", points: 7, commander: "瑶妹", style: "万象皆春流" },
  { rank: 58, displayName: "JayChou", uid: "342554672", points: 7, commander: "常小娥", style: "七里香音律" },
  { rank: 59, displayName: "星光璀璨", uid: "2796352895", points: 7, commander: "弈星", style: "棋魂共鸣流" },
  { rank: 60, displayName: "独孤求弈", uid: "2896352896", points: 7, commander: "白歌", style: "无双斩铁流" },
  { rank: 61, displayName: "弈海浮沉", uid: "2996352897", points: 6, commander: "明先生", style: "暗度陈仓流" },
  { rank: 62, displayName: "无敌小歪o", uid: "496820197", points: 6, commander: "孙策", style: "猛龙过江流" },
  { rank: 62, displayName: "大师的召唤", uid: "1768253675", points: 6, commander: "狄仁杰", style: "神捕擒王流" },
  { rank: 62, displayName: "游荡的歌者", uid: "367613997", points: 6, commander: "瑶妹", style: "轻语愈心流" },
  { rank: 62, displayName: "爱吃朱古力", uid: "563280461", points: 6, commander: "常小娥", style: "幻影追命流" },
  { rank: 66, displayName: "落子无悔卍", uid: "597820198", points: 5, commander: "弈星", style: "绝地死斗流" },
  { rank: 66, displayName: "辽宁褚赢", uid: "1479837174", points: 5, commander: "白歌", style: "神之一手流" },
  { rank: 68, displayName: "发呆的天才", uid: "698820199", points: 4, commander: "明先生", style: "静观其变流" },
  { rank: 68, displayName: "浅夏沫寒霜", uid: "235110652", points: 4, commander: "白歌", style: "破浪斩霜流" },
  { rank: 70, displayName: "dyEG苍天弈辰", uid: "1557143865", points: 3, commander: "常小娥", style: "苍穹破阵流" },
  { rank: 71, displayName: "长忆诗", uid: "72786476", points: 0, commander: "瑶妹", style: "远山淡影流" }
]

const LINEUPS_DATA = [
  { name: "明先生 · 神射金乌破阵", tier: "T0", cmd: "明先生", core: ["1101", "1131", "5241", "1211", "1201", "5231"], sample: 23815, win: 0.1675, top3: 0.5566, avg: 3.33 },
  { name: "常小娥 · 极速月影连环刺", tier: "T0", cmd: "常小娥", core: ["1131", "1121", "1141", "5241", "5231"], sample: 21940, win: 0.1747, top3: 0.5482, avg: 3.38 },
  { name: "瑶妹 · 圣鹿天佑法爆流", tier: "T0", cmd: "瑶妹", core: ["1101", "1111", "1151", "1211", "5251"], sample: 20450, win: 0.1879, top3: 0.5592, avg: 3.26 },
  { name: "白歌 · 铁骑重甲连斩流", tier: "T0", cmd: "白歌", core: ["1201", "1211", "1221", "5231", "5261"], sample: 19820, win: 0.161, top3: 0.5315, avg: 3.42 },
  { name: "弈星 · 天元奇门控场流", tier: "T0", cmd: "弈星", core: ["1101", "1121", "1151", "5241", "5271"], sample: 18560, win: 0.1585, top3: 0.529, avg: 3.45 },
  { name: "狄仁杰 · 六扇密探爆头流", tier: "T0", cmd: "狄仁杰", core: ["1131", "1141", "1201", "5231", "5281"], sample: 17300, win: 0.1542, top3: 0.518, avg: 3.49 },
  { name: "孙策 · 惊涛拍岸突进流", tier: "T1", cmd: "孙策", core: ["1201", "1221", "5231", "5261"], sample: 15420, win: 0.149, top3: 0.502, avg: 3.55 },
  { name: "明先生 · 贯石穿杨狙杀", tier: "T1", cmd: "明先生", core: ["1101", "1131", "1211", "5241"], sample: 14890, win: 0.146, top3: 0.498, avg: 3.58 },
  { name: "常小娥 · 夜影暴击绝杀", tier: "T1", cmd: "常小娥", core: ["1121", "1141", "5231", "5251"], sample: 14320, win: 0.145, top3: 0.495, avg: 3.6 },
  { name: "瑶妹 · 自然恩惠防守反击", tier: "T1", cmd: "瑶妹", core: ["1101", "1111", "1201", "5261"], sample: 13950, win: 0.142, top3: 0.491, avg: 3.62 },
  { name: "白歌 · 狂战士嗜血破防", tier: "T1", cmd: "白歌", core: ["1211", "1221", "5231", "5271"], sample: 13200, win: 0.14, top3: 0.487, avg: 3.65 },
  { name: "弈星 · 阴阳倒乱绝命局", tier: "T1", cmd: "弈星", core: ["1121", "1151", "1201", "5241"], sample: 12850, win: 0.138, top3: 0.483, avg: 3.67 },
  { name: "狄仁杰 · 律法威严锁血流", tier: "T1", cmd: "狄仁杰", core: ["1131", "1211", "5231", "5281"], sample: 12400, win: 0.136, top3: 0.48, avg: 3.7 },
  { name: "孙策 · 江东霸王刚猛流", tier: "T1", cmd: "孙策", core: ["1201", "1221", "5241", "5261"], sample: 11950, win: 0.134, top3: 0.476, avg: 3.72 },
  { name: "明先生 · 连珠回天箭阵", tier: "T1", cmd: "明先生", core: ["1101", "1131", "1141", "5231"], sample: 11500, win: 0.132, top3: 0.472, avg: 3.74 },
  { name: "常小娥 · 冰魄寒影袭杀", tier: "T1", cmd: "常小娥", core: ["1121", "1131", "5251", "5271"], sample: 11100, win: 0.13, top3: 0.469, avg: 3.76 },
  { name: "瑶妹 · 灵动神驹游击", tier: "T1", cmd: "瑶妹", core: ["1111", "1141", "1211", "5261"], sample: 10800, win: 0.128, top3: 0.465, avg: 3.78 },
  { name: "白歌 · 陷阵先锋坚盾流", tier: "T1", cmd: "白歌", core: ["1201", "1211", "5241", "5281"], sample: 10400, win: 0.126, top3: 0.462, avg: 3.8 },
  { name: "弈星 · 泼墨乾坤群伤流", tier: "T2", cmd: "弈星", core: ["1151", "1201", "5231", "5261"], sample: 9800, win: 0.122, top3: 0.455, avg: 3.85 },
  { name: "狄仁杰 · 长安城卫肃清", tier: "T2", cmd: "狄仁杰", core: ["1131", "1221", "5241", "5271"], sample: 9400, win: 0.12, top3: 0.451, avg: 3.88 },
  { name: "孙策 · 狂澜破浪突袭", tier: "T2", cmd: "孙策", core: ["1211", "1221", "5251", "5281"], sample: 9100, win: 0.118, top3: 0.448, avg: 3.9 },
  { name: "王昭君 · 凛冬风暴减速流", tier: "T2", cmd: "王昭君", core: ["1101", "1121", "1151", "5231"], sample: 8800, win: 0.115, top3: 0.443, avg: 3.93 },
  { name: "常小娥 · 孤影独行突刺", tier: "T2", cmd: "常小娥", core: ["1131", "1141", "5261", "5271"], sample: 8500, win: 0.113, top3: 0.439, avg: 3.96 },
  { name: "瑶妹 · 护体回春拉扯流", tier: "T2", cmd: "瑶妹", core: ["1111", "1201", "5241", "5281"], sample: 8200, win: 0.11, top3: 0.435, avg: 3.98 },
  { name: "明先生 · 追魂落日箭", tier: "T2", cmd: "明先生", core: ["1101", "1211", "5231", "5251"], sample: 7900, win: 0.108, top3: 0.431, avg: 4.01 },
  { name: "白歌 · 破军连环怒斩", tier: "T2", cmd: "白歌", core: ["1201", "1221", "5261", "5271"], sample: 7600, win: 0.106, top3: 0.428, avg: 4.04 },
  { name: "弈星 · 局中生局翻盘流", tier: "T2", cmd: "弈星", core: ["1121", "1141", "5241", "5281"], sample: 7300, win: 0.104, top3: 0.424, avg: 4.07 },
  { name: "狄仁杰 · 金牌令箭斩杀", tier: "T2", cmd: "狄仁杰", core: ["1131", "1201", "5251", "5261"], sample: 7000, win: 0.102, top3: 0.42, avg: 4.1 },
  { name: "孙策 · 怒涛翻涌刚强流", tier: "T2", cmd: "孙策", core: ["1211", "1221", "5231", "5241"], sample: 6800, win: 0.1, top3: 0.416, avg: 4.12 },
  { name: "王昭君 · 冰华聚顶冰冻流", tier: "T2", cmd: "王昭君", core: ["1101", "1151", "5261", "5281"], sample: 6500, win: 0.098, top3: 0.412, avg: 4.15 },
  { name: "常小娥 · 瞬影迷雾突袭", tier: "T2", cmd: "常小娥", core: ["1121", "1141", "1211", "5231"], sample: 6200, win: 0.096, top3: 0.408, avg: 4.18 },
  { name: "瑶妹 · 灵犀心照守护", tier: "T2", cmd: "瑶妹", core: ["1111", "1131", "5251", "5271"], sample: 5900, win: 0.094, top3: 0.404, avg: 4.21 },
  { name: "明先生 · 箭无虚发连射", tier: "T2", cmd: "明先生", core: ["1101", "1201", "5241", "5261"], sample: 5600, win: 0.092, top3: 0.4, avg: 4.24 },
  { name: "白歌 · 铁血军阵坚守", tier: "T2", cmd: "白歌", core: ["1211", "1221", "5271", "5281"], sample: 5300, win: 0.09, top3: 0.395, avg: 4.27 },
  { name: "弈星 · 落子成劫爆发", tier: "T2", cmd: "弈星", core: ["1121", "1151", "5231", "5251"], sample: 5000, win: 0.088, top3: 0.39, avg: 4.3 },
  { name: "狄仁杰 · 巡城密捕追击", tier: "T2", cmd: "狄仁杰", core: ["1131", "1141", "5261", "5281"], sample: 4700, win: 0.085, top3: 0.385, avg: 4.33 }
]

const OFFICIAL_LINEUPS = [
  { name: '明先生 · 神射金乌破阵', cmd: '明先生' },
  { name: '常小娥 · 极速月影连环刺', cmd: '常小娥' },
  { name: '瑶妹 · 圣鹿天佑法爆流', cmd: '瑶妹' },
  { name: '白歌 · 铁骑重甲连斩流', cmd: '白歌' },
  { name: '弈星 · 天元奇门控场流', cmd: '弈星' },
  { name: '狄仁杰 · 六扇密探爆头流', cmd: '狄仁杰' },
  { name: '孙策 · 惊涛拍岸突进流', cmd: '孙策' }
]

// ---- 生成（逻辑与原脚本一致：按排名剧本编排名次，仅用于 demo）----
function buildDemoState() {
  const engine = createStorageEngine({ dataDir: FIXTURES_DATA_DIR })
  const now = new Date().toISOString()

  const players = RAW_PLAYERS.map((p) => ({
    id: `p-${p.uid || p.displayName}`,
    nickname: p.displayName,
    platform: p.displayName.includes('DY') || p.displayName.includes('抖音') ? 'DOUYU' : 'DEFAULT',
    serverZone: 'DEMO 赛事服（合成）',
    rankScore: 10000 + p.points * 120 + Math.max(0, 75 - p.rank) * 15,
    rankText: p.rank <= 3 ? '巅峰王者' : (p.rank <= 16 ? '最强王者' : (p.rank <= 36 ? '荣耀王者' : '无双王者')),
    title: p.rank === 1 ? 'S1 锦标赛积分总冠军' : (p.rank <= 3 ? 'S1 锦标赛三强荣耀' : (p.rank <= 8 ? 'S1 八强争霸选手' : 'S1 认证实战选手')),
    commander: p.commander,
    style: p.style,
    synthetic: true,
    note: '合成 demo 数据（rankScore 为赛事积分推导展示值，非真实天梯分）'
  }))

  const lineupSnapshots = LINEUPS_DATA.map((l, idx) => ({
    id: `lu-demo-${idx + 1}`,
    sourceId: 'src-hokace-wiki',
    lineupName: l.name,
    tier: l.tier,
    commander: l.cmd,
    coreHeroes: l.core,
    sampleCount: l.sample,
    winRate: l.win,
    top3Rate: l.top3,
    avgRank: l.avg,
    snapshotVersion: 'demo-v3',
    windowText: 'DEMO 合成快照',
    scope: 'DEMO',
    synthetic: true
  }))

  const matches = []

  // A. datatft-s1-seed 剧本批次（原 generate_real_dataset.mjs 逻辑）
  const baseTime = new Date('2026-09-27T10:00:00.000Z').getTime()
  RAW_PLAYERS.forEach((p, pIdx) => {
    const rank = p.rank || 99
    const totalGames = rank <= 3 ? 6 : (rank <= 8 ? 5 : (rank <= 16 ? 4 : (rank <= 36 ? 3 : 2)))
    for (let g = 0; g < totalGames; g++) {
      let finalRank = 3
      if (rank === 1) finalRank = (g === 1 || g === 4) ? 2 : 1
      else if (rank <= 3) finalRank = g === 0 ? 1 : (g === 1 ? 2 : (g === 2 ? 1 : (g === 3 ? 3 : 2)))
      else if (rank <= 8) finalRank = g === 0 ? 1 : (g === 1 ? 2 : (g === 2 ? 3 : (g === 3 ? 2 : 4)))
      else if (rank <= 16) finalRank = ((pIdx + g) % 3) + 2
      else if (rank <= 36) finalRank = ((pIdx + g) % 4) + 2
      else finalRank = ((pIdx + g) % 3) + 4
      finalRank = Math.min(6, Math.max(1, finalRank))

      const gameTimeMs = baseTime + (pIdx * 12 + g * 35) * 60000
      matches.push({
        id: `synthetic-match-${pIdx}-${g}`,
        playerId: `p-${p.uid}`,
        matchTime: new Date(gameTimeMs).toISOString(),
        availableAt: new Date(gameTimeMs + 5000).toISOString(),
        mode: 'RANKED_DIAMOND',
        finalRank,
        commander: p.commander,
        lineup: (LINEUPS_DATA.find(l => l.cmd === p.commander) || LINEUPS_DATA[pIdx % LINEUPS_DATA.length]).name,
        roundsSurvived: 24 - finalRank * 2,
        threeStars: finalRank <= 2 ? ['1131', '1101'] : (finalRank <= 4 ? ['1131'] : []),
        verified: true, // demo 展示用；正式统计按 synthetic=TRUE 一律排除
        evidenceId: null,
        batchId: 'synthetic-datatft-s1-seed',
        synthetic: true
      })
    }
  })

  // B. camp 剧本批次（原 sync_camp_official_matches.mjs 逻辑；不再宣称官方来源）
  const campBaseMs = new Date('2026-09-23T08:00:00.000Z').getTime()
  let campCounter = 0
  RAW_PLAYERS.forEach((p, pIdx) => {
    const gamesCount = 18 + (pIdx % 5)
    for (let g = 0; g < gamesCount; g++) {
      campCounter++
      const seed = (pIdx * 19 + g * 37 + 11) % 100
      let finalRank = 3
      if (pIdx < 5) {
        if (seed < 32) finalRank = 1; else if (seed < 56) finalRank = 2; else if (seed < 76) finalRank = 3
        else if (seed < 90) finalRank = 4; else finalRank = 5
      } else if (pIdx < 25) {
        if (seed < 24) finalRank = 1; else if (seed < 46) finalRank = 2; else if (seed < 66) finalRank = 3
        else if (seed < 82) finalRank = 4; else if (seed < 93) finalRank = 5; else finalRank = 6
      } else {
        if (seed < 16) finalRank = 1; else if (seed < 34) finalRank = 2; else if (seed < 50) finalRank = 3
        else if (seed < 68) finalRank = 4; else if (seed < 85) finalRank = 5; else finalRank = 6
      }
      const matchTimeMs = campBaseMs + (pIdx * 45 + g * 190) * 60000 + ((pIdx + g) % 17) * 45000
      const chosen = OFFICIAL_LINEUPS[(pIdx + g) % OFFICIAL_LINEUPS.length]

      // 复用 camp-adapter 的记录校验（契约测试价值保留）
      const record = validateCampRawRecord({
        game_seq: `demo${String(10000000 + campCounter)}`,
        role_id: p.uid,
        rank: finalRank,
        gametime: new Date(matchTimeMs).toISOString(),
        available_at: new Date(matchTimeMs + 15000).toISOString(),
        commander_name: p.commander || chosen.cmd,
        lineup_name: chosen.name,
        round_num: 28 + (finalRank <= 2 ? 6 : (finalRank <= 4 ? 2 : -4)),
        three_stars: finalRank <= 2 ? ['1101', '1131'] : [],
        mode: 'RANKED_DIAMOND',
        batchId: 'synthetic-camp-official'
      }, g)

      matches.push({
        ...record,
        id: `synthetic-camp-${campCounter}`,
        batchId: 'synthetic-camp-official',
        synthetic: true
      })
    }
  })

  // 逐条走引擎校验，保证 demo 数据仍满足结构合法性
  for (const [idx, m] of matches.entries()) {
    try {
      engine.validateMatchRecord(m, idx)
    } catch (err) {
      throw new Error(`demo 记录 #${idx} 未通过结构校验: ${err.message}`)
    }
  }

  return {
    meta: {
      version: '3.0.0-demo',
      initializedAt: now,
      engine: 'FILE_ENGINE_DEMO',
      storageMode: 'SYNTHETIC_DEMO',
      warning: '本文件全部为合成演示数据 (synthetic=true)，仅供 demo 模式展示，禁止用于正式统计或对外声称为真实数据'
    },
    dataSources: [], // demo 模式不注册来源状态；来源注册表在 PostgreSQL data_sources
    evidences: [],
    players,
    matches,
    events: [],
    lineupSnapshots,
    pendingCandidates: [],
    importBatches: [
      {
        batchId: 'synthetic-datatft-s1-seed',
        source: 'FIXTURE_GENERATOR',
        totalRecords: matches.filter(m => m.batchId === 'synthetic-datatft-s1-seed').length,
        inserted: matches.filter(m => m.batchId === 'synthetic-datatft-s1-seed').length,
        synthetic: true,
        createdAt: now
      },
      {
        batchId: 'synthetic-camp-official',
        source: 'FIXTURE_GENERATOR',
        totalRecords: matches.filter(m => m.batchId === 'synthetic-camp-official').length,
        inserted: matches.filter(m => m.batchId === 'synthetic-camp-official').length,
        synthetic: true,
        createdAt: now
      }
    ]
  }
}

const state = buildDemoState()
fs.mkdirSync(FIXTURES_DATA_DIR, { recursive: true })
const outFile = path.join(FIXTURES_DATA_DIR, 'storage.json')
fs.writeFileSync(outFile, JSON.stringify(state, null, 2))
console.log(`✔ 合成 demo 数据已写入 ${outFile}`)
console.log(`  选手 ${state.players.length} 位 | 阵容 ${state.lineupSnapshots.length} 套 | 对局 ${state.matches.length} 局（全部 synthetic=true）`)
console.log(`  业务目录与数据库零接触。`)
