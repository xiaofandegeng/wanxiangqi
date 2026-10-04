// 官方图片链接逐张核查（UI 图文改版补验）—— 不编造、不猜测，全部实访留档
//
// 背景：docs/UI图文改版实施说明_2026-10-04.md 如实声明「12 个场景验证了关键图文页面……
// 不代表逐张检查全部 514 个图片链接」。本工具补上这一步：
//   1) frontend/src/data/official-art.json（build-official-art.mjs 从官方存证目录生成）——
//      全部 portrait/thumb/card/skills[].icon 字符串 URL；
//   2) TeachingMedia.vue 硬编码的官方新手指引图（界面示意图 swiper*.png + 阵容图解 guide_N_3.jpg）。
//      模板串无法直接 grep，此处显式列出并注明来源；组件改表时需同步本清单。
//
// 方法：HEAD 优先（零正文传输）；非 2xx 或无图片 Content-Type 再 Range GET（bytes=0-0）确认；
//       网络类错误重试 1 次。ok = 最终 2xx 且 Content-Type 为 image/*
//       （防「200 返回 HTML 错误页」被误计为可用）。
// 产物：docs/v6_artifacts/official-art-links-<ts>.json（失败逐条含实体归属；成功按域计数）。
// 退出：任一失败 → 1（不凑数）。
//
// 运行：node tools/official-art-link-check.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..')
const INDEX = path.join(REPO, 'frontend/src/data/official-art.json')
const ARTIFACTS = path.join(REPO, 'docs/v6_artifacts')
const UA = 'wxq-site-linkcheck/1.0' // 纯 ASCII（M3-1 教训：非 ASCII UA 会被 CDN 拒绝）
const CONCURRENCY = 8
const TIMEOUT_MS = 15_000

// TeachingMedia.vue 运行时会拼接的全部图解/界面图（basicMap 5 文件 × 去重 + guide 5 张）
const GUIDE_URLS = [
  ...['swiper1_1.png', 'swiper2_1.png', 'swiper3_1.png', 'swiper4_1.png', 'swiper5_1.png']
    .map(f => `https://game.gtimg.cn/images/osgame/cp/a202609xszy/${f}`),
  ...[1, 2, 3, 4, 5].map(i => `https://game.gtimg.cn/images/osgame/cp/a202609xszy/guide_${i}_3.jpg`)
]

function collectIndexUrls(art) {
  const byUrl = new Map() // url -> Set(entityId)
  const walk = (node, entityId) => {
    if (typeof node === 'string') {
      if (/^https?:\/\//.test(node)) {
        if (!byUrl.has(node)) byUrl.set(node, new Set())
        byUrl.get(node).add(entityId)
      }
    } else if (Array.isArray(node)) {
      node.forEach(n => walk(n, entityId))
    } else if (node && typeof node === 'object') {
      for (const v of Object.values(node)) walk(v, entityId)
    }
  }
  for (const [id, v] of Object.entries(art)) walk(v, id)
  return byUrl
}

async function fetchWithTimeout(url, init) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { 'user-agent': UA, ...(init.headers || {}) } })
  } finally {
    clearTimeout(t)
  }
}

async function checkUrl(url) {
  // 1) HEAD 零正文
  let res
  try {
    res = await fetchWithTimeout(url, { method: 'HEAD' })
  } catch (err) {
    // 网络类错误重试 1 次
    try {
      res = await fetchWithTimeout(url, { method: 'HEAD' })
    } catch (err2) {
      return { ok: false, method: 'HEAD', error: String(err2?.cause?.code || err2?.message || err2) }
    }
  }
  const type = res.headers.get('content-type') || ''
  if (res.ok && type.startsWith('image/')) {
    return { ok: true, method: 'HEAD', status: res.status, contentType: type, bytes: res.headers.get('content-length') }
  }
  // 2) HEAD 不可判定（405/403/无类型等）→ Range GET 取首字节确认
  let res2
  try {
    res2 = await fetchWithTimeout(url, { method: 'GET', headers: { range: 'bytes=0-0' } })
  } catch (err) {
    return { ok: false, method: 'RANGE-GET', headStatus: res.status, error: String(err?.cause?.code || err?.message || err) }
  }
  const type2 = res2.headers.get('content-type') || ''
  const ok = res2.ok && type2.startsWith('image/')
  return {
    ok, method: 'RANGE-GET', status: res2.status, contentType: type2,
    ...(res2.status === 206 ? { rangeConfirmed: true } : {}), headStatus: res.status
  }
}

async function runPool(items, worker) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await worker(items[i])
    }
  }))
  return out
}

const startedAt = new Date().toISOString()
const art = JSON.parse(fs.readFileSync(INDEX, 'utf8'))
const indexUrls = collectIndexUrls(art)
const guideSet = new Set(GUIDE_URLS)
const allUrls = [...new Set([...indexUrls.keys(), ...GUIDE_URLS])].sort()

console.log(`[link-check] 索引实体 ${Object.keys(art).length} → ${indexUrls.size} 个唯一 URL；图解/界面图 ${GUIDE_URLS.length} 个；合计核查 ${allUrls.length} 个`)

const results = await runPool(allUrls, async url => {
  const r = await checkUrl(url)
  return { url, source: guideSet.has(url) ? 'guide' : 'index', ...r }
})

const failures = results.filter(r => !r.ok)
const byHost = {}
for (const r of results) {
  const h = new URL(r.url).host
  byHost[h] = byHost[h] || { total: 0, ok: 0 }
  byHost[h].total++
  if (r.ok) byHost[h].ok++
}

const report = {
  ranAt: startedAt,
  tool: 'tools/official-art-link-check.mjs',
  method: 'HEAD 优先（零正文）；非 2xx 或非 image/* Content-Type 再 Range GET(bytes=0-0) 确认；网络错误重试 1 次；ok = 2xx ∧ image/*（防 HTML 错误页误计）',
  sources: {
    index: { file: 'frontend/src/data/official-art.json', entities: Object.keys(art).length, uniqueUrls: indexUrls.size },
    guide: { file: 'frontend/src/components/TeachingMedia.vue（模板串，显式列出）', urls: GUIDE_URLS.length }
  },
  summary: { total: results.length, ok: results.length - failures.length, failed: failures.length, byHost },
  failures: failures.map(f => ({
    url: f.url, source: f.source,
    entities: f.source === 'index' ? [...(indexUrls.get(f.url) || [])] : undefined,
    status: f.status ?? null, headStatus: f.headStatus ?? null,
    contentType: f.contentType ?? null, error: f.error ?? null
  }))
}

fs.mkdirSync(ARTIFACTS, { recursive: true })
const file = path.join(ARTIFACTS, `official-art-links-${startedAt.replace(/[^\d]/g, '').slice(0, 14)}.json`)
fs.writeFileSync(file, JSON.stringify(report, null, 2))

console.log(`[link-check] 结果：${report.summary.ok}/${report.summary.total} 可用，${failures.length} 失败`)
for (const [h, c] of Object.entries(byHost)) console.log(`  ${h}: ${c.ok}/${c.total}`)
for (const f of failures.slice(0, 20)) {
  const who = f.source === 'index' ? `[${(indexUrls.get(f.url) || []).size} 实体]` : '[图解]'
  console.error(`  ✗ ${f.url} ${who} —— HTTP ${f.status ?? '-'} / 错误 ${f.error ?? '-'}${f.contentType ? ` / ${f.contentType}` : ''}`)
}
if (failures.length > 20) console.error(`  …… 其余 ${failures.length - 20} 条见 ${path.relative(REPO, file)}`)
console.log(`[link-check] 证据：${path.relative(REPO, file)}`)
process.exit(failures.length ? 1 : 0)
