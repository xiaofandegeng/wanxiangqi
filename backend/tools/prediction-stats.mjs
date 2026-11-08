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

