import { readFileSync } from 'node:fs'

const file = process.argv[2] ?? new URL('../data/prediction-catalog/ruanshi.json', import.meta.url)
const catalog = JSON.parse(readFileSync(file, 'utf8'))
const matches = catalog.matches

const playerStats = {}
const buildStats = {}
const banStats = {}
const dayStats = {}

for (const m of matches) {
  dayStats[m.day] = (dayStats[m.day] || 0) + 1

  if (m.ban && m.ban !== 'UNKNOWN') {
    banStats[m.ban] = (banStats[m.ban] || 0) + 1
  }

  for (const s of m.seats) {
    const isWinner = s.slot === m.winnerSlot
    if (!playerStats[s.nickname]) {
      playerStats[s.nickname] = { matches: 0, wins: 0, builds: {} }
    }
    playerStats[s.nickname].matches++
    if (isWinner) playerStats[s.nickname].wins++
    playerStats[s.nickname].builds[s.build] = (playerStats[s.nickname].builds[s.build] || 0) + 1

    if (!buildStats[s.build]) {
      buildStats[s.build] = { picks: 0, wins: 0 }
    }
    buildStats[s.build].picks++
    if (isWinner) buildStats[s.build].wins++
  }
}

console.log('====================================')
console.log('       王牌对决全量数据统计看板       ')
console.log('====================================')
console.log(`总对局场次:   ${matches.length} 场`)
console.log(`总席位人次:   ${matches.length * 6} 人次`)
console.log(`覆盖比赛日:   ${Object.keys(dayStats).length} 天`)
console.log(`独立选手昵称: ${Object.keys(playerStats).length} 位`)
console.log(`独立阵容玩法: ${Object.keys(buildStats).length} 种`)
console.log(`原图存证材料: ${catalog.materials.length} 份`)
console.log(`已登记来源帖: ${catalog.sources.length} 篇`)

console.log('\n--- 1. 每日场次覆盖分布 ---')
console.table(Object.entries(dayStats).sort().map(([day, cnt]) => ({
  日期: day,
  录入场次: cnt,
  状态: cnt >= 7 ? '覆盖完整' : '部分录入'
})))

console.log('\n--- 2. 选手夺冠榜 Top 15 ---')
const topPlayers = Object.entries(playerStats)
  .sort((a, b) => b[1].wins - a[1].wins || b[1].matches - a[1].matches)
  .slice(0, 15)
console.table(topPlayers.map(([name, s]) => ({
  选手昵称: name,
  出场数: s.matches,
  夺冠数: s.wins,
  胜率: `${(s.wins / s.matches * 100).toFixed(1)}%`,
  代表玩法: Object.entries(s.builds)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(x => `${x[0]}(${x[1]})`)
    .join(', ')
})))

console.log('\n--- 3. 主流阵容热度与胜率 Top 15 ---')
const topBuilds = Object.entries(buildStats)
  .sort((a, b) => b[1].picks - a[1].picks)
  .slice(0, 15)
console.table(topBuilds.map(([build, s]) => ({
  阵容体系: build,
  选出次数: s.picks,
  夺冠次数: s.wins,
  夺冠胜率: `${(s.wins / s.picks * 100).toFixed(1)}%`
})))

console.log('\n--- 4. 禁用阵营 (Ban) 分布 ---')
console.table(Object.entries(banStats).sort((a, b) => b[1] - a[1]).map(([ban, cnt]) => ({
  禁选阵营: ban,
  禁用场次: cnt,
  占比: `${(cnt / matches.length * 100).toFixed(1)}%`
})))

// 5. 全时期（25个比赛日）来源胜者图谱统计
const allSourceWinners = {}
const dailyWinnerMap = {}

for (const s of catalog.sources) {
  const match = s.title.match(/恭喜胜者老师[🎉\s]*([\s\S]*?)(?:#|祝大家|今晚|继续|下在做了|前面两局|这两天|刚图片|明天|发烧|其他几个|$)/)
  if (match) {
    const raw = match[1]
    const atMatches = [...raw.matchAll(/@([^@\n#]+?)(?=\s*@|\s*#|\s*$)/g)]
    let dateMatch = s.title.match(/10\d{2}|11\d{2}/)
    let dateStr = dateMatch ? `2026-${dateMatch[0].slice(0, 2)}-${dateMatch[0].slice(2)}` : null
    if (!dateStr && s.url.includes('7696131162137218304')) {
      dateStr = '2026-10-13' // 1013上
    } else if (!dateStr && s.url.includes('7697138941836758312')) {
      dateStr = '2026-10-15' // 1015
    } else if (!dateStr) {
      dateStr = '未标注日期'
    }

    const stopWords = ['描述不出来', '追赶进度中', '拼命赶赶赶', '月末有点太忙了', '这几天生活里', '身体有点不舒服', '下半的下饭局', '小妲己无法无天', '猪葛龟龟老师直接', '不好意思周末', '碎碎圆圆好像', '不知道究竟是', '睡觉！', '昨天这几把', '今天这前四场', '航迹云老师', '久等了', '感冒一直没好', '新一老师11冠', '益笙菌老师', '这后四场都', '马可王朝了', '刚图片有错', '下明天发', '下可能得', '继续看', '下在做了', '前面两局']
    const names = atMatches
      .map(m => {
        let n = m[1].replace(/（[^）]*）|\([^)]*\)|【[^】]*】/g, '').trim()
        for (const sw of stopWords) {
          const idx = n.indexOf(sw)
          if (idx !== -1) n = n.slice(0, idx).trim()
        }
        return n.replace(/[,，。！!、\s]+$/, '').trim()
      })
      .filter(Boolean)

    if (!dailyWinnerMap[dateStr]) dailyWinnerMap[dateStr] = []
    dailyWinnerMap[dateStr].push(...names)

    for (const name of names) {
      allSourceWinners[name] = (allSourceWinners[name] || 0) + 1
    }
  }
}

console.log('\n--- 5. 跨周期（10-11至11-06）全量来源胜者榜 Top 20 ---')
const topSourceWinners = Object.entries(allSourceWinners)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)

console.table(topSourceWinners.map(([name, wins]) => ({
  '选手或主播': name,
  '来源记载夺冠次数': wins
})))

console.log('\n--- 6. 历日战绩覆盖总览（共25个比赛日） ---')
const allDays = Array.from(new Set([...Object.keys(dayStats), ...Object.keys(dailyWinnerMap)])).sort()
console.table(allDays.map(d => ({
  比赛日期: d,
  六席对局转写: dayStats[d] ? `${dayStats[d]} 场完整` : '待导入原图',
  原帖来源胜者: (dailyWinnerMap[d] || []).length ? dailyWinnerMap[d].slice(0, 4).join(', ') + (dailyWinnerMap[d].length > 4 ? ' 等' : '') : '待补录'
})))


