import { readFileSync } from 'node:fs'

const [end, file] = process.argv.slice(2)
const last = new Date(`${end}T00:00:00Z`)
if (!/^\d{4}-\d{2}-\d{2}$/.test(end ?? '') ||
    !Number.isFinite(+last) || last.toISOString().slice(0, 10) !== end) {
  throw new Error('Usage: node backend/tools/prediction-coverage.mjs YYYY-MM-DD [catalog.json]')
}
const catalog = JSON.parse(readFileSync(file ?? new URL('../data/prediction-catalog/ruanshi.json', import.meta.url)))
const days = Array.from({ length: 7 }, (_, i) => new Date(+last - (6 - i) * 86400000).toISOString().slice(0, 10))
console.table(days.map(day => {
  const matches = catalog.matches.filter(m => m.day === day)
  return {
    day,
    recorded: new Set(matches.map(m => m.ordinal)).size,
    missingOrdinals: Array.from({ length: 8 }, (_, i) => i + 1)
      .filter(i => !matches.some(m => m.ordinal === i)).join(','),
    withBan: matches.filter(m => m.ban && m.ban !== 'UNKNOWN').length,
    withWinnerBuild: matches.filter(m => m.winnerBuild).length,
  }
}))
console.log('Coverage of source catalog only; absent slots do not imply cancelled games. Eight-slot reference for Wanxiang Cup.')
