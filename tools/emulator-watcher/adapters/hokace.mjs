// 王者万象棋数据站 - hokace.wiki 第三方阵容快照适配器
// v3 S6/P2-B 来源语义治理版（任务书 §3.1、§P2-B、F09）：
// 1. 真实字段解析与结构验证，禁止无条件返回内置 baseline 冒充 SUCCESS
// 2. 失败严格报告 FAILED 状态；失败不覆盖旧快照、不更新 lastSuccessAt (V15)
// 3. 缺失字段一律 null（tier/梯度文案/窗口文案/样本量/均名），禁止 'T1'/'通用'/'近 7 日' 等默认值冒充来源数据
// 4. 比率契约显式归一：JSON 通道按 [0,1] 小数严格校验；HTML data-* 属性按百分比契约
//    （"44.1%" 或 44.1）显式除以 100 后校验 —— 归一后统一 rateUnit='RATIO_0_1'
// 5. 采集时间 (updatedAt) 与数据截止时间 (dataCutoffAt) 分开：来源未给截止时间 → null

import http from 'node:http'
import https from 'node:https'
import crypto from 'node:crypto'
import { URL } from 'node:url'

export const HOKACE_ADAPTER_METADATA = {
  sourceId: 'src-hokace-wiki',
  name: 'hokace.wiki 第三方阵容快照',
  type: 'LINEUP_AGGREGATE',
  targetUrl: 'https://hokace.wiki/zh/lineups/',
  license: 'CC-BY-NC 4.0 / 公开抓取存证',
  pollIntervalSec: 3600
}

/**
 * JSON 通道比率：来源契约为 [0,1] 小数，越界（如 44.1）视为契约违背直接报错，
 * 不做静默换算 —— 换算必须发生在契约明确的通道（见 parsePercentAttr）。
 */
function parseJsonRatio(value, field, idx) {
  const n = Number(value)
  if (value === null || value === undefined || value === '' || isNaN(n) || n < 0 || n > 1) {
    throw new Error(`第 ${idx + 1} 条阵容 ${field} [${value}] 不在 [0, 1] 小数契约区间`)
  }
  return n
}

/**
 * HTML data-* 属性通道比率：页面展示契约为百分比（"44.1%" / "44.1"），
 * 显式剥离 % 并除以 100 后校验；归一结果恒为 [0,1] 小数。
 */
function parsePercentAttr(raw, field, idx) {
  const s = String(raw ?? '').trim().replace(/%$/, '')
  const n = Number(s)
  if (s === '' || isNaN(n) || n < 0) {
    throw new Error(`第 ${idx + 1} 条阵容 ${field} [${raw}] 不是有效百分比`)
  }
  const ratio = n > 1 ? n / 100 : n
  if (ratio > 1) {
    throw new Error(`第 ${idx + 1} 条阵容 ${field} [${raw}] 换算后超出 [0, 1]`)
  }
  return Number(ratio.toFixed(4))
}

/**
 * 校验解析出的单条阵容快照结构（P2-B：缺失 → null，禁止默认值）
 */
export function validateLineupSnapshotItem(item, idx = 0) {
  if (!item || typeof item !== 'object') {
    throw new Error(`第 ${idx + 1} 条阵容对象为空`)
  }
  if (!item.lineupName || typeof item.lineupName !== 'string') {
    throw new Error(`第 ${idx + 1} 条阵容缺少阵容名 lineupName`)
  }
  const lineupName = item.lineupName.trim()

  // 样本量：缺失 → null（禁止补 0 冒充已知）；有值必须 ≥ 0
  let sampleCount = null
  if (item.sampleCount !== null && item.sampleCount !== undefined && item.sampleCount !== '') {
    const n = Number(item.sampleCount)
    if (isNaN(n) || n < 0) {
      throw new Error(`第 ${idx + 1} 条阵容样本量 sampleCount [${item.sampleCount}] 无效`)
    }
    sampleCount = n
  }

  // 比率（JSON 契约 [0,1] 小数）
  const winRate = parseJsonRatio(item.winRate, '登顶率 winRate', idx)
  const top3Rate = parseJsonRatio(item.top3Rate, '前三率 top3Rate', idx)

  // 均名：缺失 → null（禁止 3.5 兜底）；有值必须 1~6
  let avgRank = null
  if (item.avgRank !== null && item.avgRank !== undefined && item.avgRank !== '') {
    const n = Number(item.avgRank)
    if (isNaN(n) || n < 1 || n > 6) {
      throw new Error(`第 ${idx + 1} 条阵容平均名次 avgRank [${item.avgRank}] 不在 [1, 6] 区间`)
    }
    avgRank = n
  }

  // 窗口起止：缺失 → null（禁止编造“近 7 日”）
  const windowStart = item.windowStart && !isNaN(new Date(item.windowStart).getTime())
    ? new Date(item.windowStart).toISOString() : null
  const windowEnd = item.windowEnd && !isNaN(new Date(item.windowEnd).getTime())
    ? new Date(item.windowEnd).toISOString() : null
  const dataCutoffAt = item.dataCutoffAt && !isNaN(new Date(item.dataCutoffAt).getTime())
    ? new Date(item.dataCutoffAt).toISOString() : null

  return {
    // 稳定 id：同名阵容跨次同步保持同一主键（详情页/引用不漂移）
    id: item.id || `hokace-${crypto.createHash('sha256').update(lineupName).digest('hex').slice(0, 16)}`,
    sourceId: HOKACE_ADAPTER_METADATA.sourceId,
    lineupName,
    tier: item.tier || null,
    commander: item.commander || null,
    coreHeroes: Array.isArray(item.coreHeroes) ? item.coreHeroes : [],
    sampleCount,
    winRate,
    top3Rate,
    avgRank,
    snapshotVersion: item.snapshotVersion || null,
    windowText: item.windowText || null,
    scope: item.scope || null,
    structureKey: item.structureKey || null,
    windowStart,
    windowEnd,
    sampleUnit: item.sampleUnit || null,
    rateUnit: 'RATIO_0_1', // 归一化后统一契约（百分比通道已显式换算）
    dataCutoffAt, // 数据截止时间（来源给出才有；≠ 采集时间）
    updatedAt: new Date().toISOString() // 采集时间
  }
}

/**
 * 解析 HTML 页面或 JSON 响应中的阵容数据
 * 真实从文本提取，如果网页不包含合法阵容，抛出解析失败，绝不偷梁换柱！
 */
export function parseHokaceBody(rawBody) {
  if (!rawBody || typeof rawBody !== 'string' || rawBody.trim().length === 0) {
    throw new Error('响应正文为空')
  }

  // 1. 若为 JSON 接口响应
  if (rawBody.trim().startsWith('{') || rawBody.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(rawBody)
      const list = Array.isArray(parsed) ? parsed : (parsed.data || parsed.lineups || [])
      if (!Array.isArray(list) || list.length === 0) {
        throw new Error('JSON 响应中未包含有效的阵容列表数组')
      }
      return list.map((item, i) => validateLineupSnapshotItem(item, i))
    } catch (e) {
      throw new Error(`JSON 解析错误: ${e.message}`)
    }
  }

  // 2. 若为 HTML 页面，使用结构化正则/语义选择器真实提取
  // 匹配形如 <div class="lineup-card" data-name="雷霆扶桑刺" data-tier="T1" ...> 或表格 <tr>
  const lineups = []
  
  // 模式 A: 提取带有阵容属性的元素（百分比契约：data-winrate="44.1%" 或 "44.1"）
  const cardRegex = /<[^>]+class="[^"]*(?:lineup-card|tier-row)[^"]*"[^>]*data-name="([^"]+)"[^>]*(?:data-tier="([^"]*)")?[^>]*data-winrate="([^"]+)"[^>]*data-top3="([^"]+)"[^>]*(?:data-avgrank="([^"]*)")?[^>]*(?:data-samples="([^"]*)")?/gi
  let match
  while ((match = cardRegex.exec(rawBody)) !== null) {
    lineups.push({
      lineupName: match[1],
      tier: match[2] || null,
      __winRatePercent: match[3], // HTML 通道百分比，稍后显式换算
      __top3Percent: match[4],
      avgRank: match[5] === '' || match[5] === undefined ? null : Number(match[5]),
      sampleCount: match[6] === '' || match[6] === undefined ? null : parseInt(match[6], 10)
    })
  }
  // HTML 通道比率换算：validate 之前就地归一（百分比 → [0,1] 小数）
  lineups.forEach((item, i) => {
    if ('__winRatePercent' in item) {
      item.winRate = parsePercentAttr(item.__winRatePercent, '登顶率 data-winrate', i)
      item.top3Rate = parsePercentAttr(item.__top3Percent, '前三率 data-top3', i)
      delete item.__winRatePercent
      delete item.__top3Percent
    }
  })

  // 模式 A2: Astro 改版后的阵容卡（2026-09 实测结构）—— <article class="lineup-list-card"
  // data-first/data-top3/data-placement/data-count>。比率属性本身即 [0,1] 小数（实测
  // data-first="0.3801"），走 JSON 比率契约，不做百分比换算；名称取卡内 <strong>，
  // 棋手取 data-players；tier/窗口/数据截止时间页面未公布 → null（不造默认值）
  if (lineups.length === 0) {
    const astroCardRegex = /<article[^>]*class="[^"]*lineup-list-card[^"]*"[^>]*>/gi
    let astro
    while ((astro = astroCardRegex.exec(rawBody)) !== null) {
      const tag = astro[0]
      const attr = (name) => {
        const a = tag.match(new RegExp(`${name}="([^"]*)"`))
        return a ? a[1] : null
      }
      const strong = rawBody.slice(astro.index, astro.index + 2000).match(/<strong[^>]*>([^<]+)<\/strong>/)
      const lineupName = ((strong ? strong[1] : attr('data-players')) || '').trim()
      const players = attr('data-players')
      // 稳定 id：优先来源自身 data-id（同卡跨日快照更新不换 id）；
      // 名称是前三棋手的有损摘要（实测两卡同名不同阵容），禁用名称做唯一键
      const srcCardId = attr('data-id')
      lineups.push({
        id: srcCardId !== null
          ? `hokace-card-${srcCardId}`
          : `hokace-${crypto.createHash('sha256').update(`${lineupName}|${players || ''}`).digest('hex').slice(0, 16)}`,
        lineupName,
        tier: null,
        commander: null,
        coreHeroes: (players || '').split(',').map(s => s.trim()).filter(Boolean),
        winRate: attr('data-first') !== null ? parseJsonRatio(attr('data-first'), '登顶率 data-first', lineups.length) : null,
        top3Rate: attr('data-top3') !== null ? parseJsonRatio(attr('data-top3'), '前三率 data-top3', lineups.length) : null,
        avgRank: attr('data-placement') !== null ? Number(attr('data-placement')) : null,
        sampleCount: attr('data-count') !== null ? parseInt(attr('data-count'), 10) : null
      })
    }
  }

  // 模式 B: 提取内联 JSON-LD 或 window.__DATA__ 结构
  if (lineups.length === 0) {
    const jsonMatch = rawBody.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i) ||
                      rawBody.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/i)
    if (jsonMatch && jsonMatch[1]) {
      try {
        const state = JSON.parse(jsonMatch[1])
        const list = state?.props?.pageProps?.lineups || state?.lineups || []
        if (Array.isArray(list) && list.length > 0) {
          return list.map((item, i) => validateLineupSnapshotItem(item, i))
        }
      } catch (e) {
        // 忽略并继续
      }
    }
  }

  // 如果 HTML 页面完全不包含有效阵容卡片，严格报错！(F03, A04)
  if (lineups.length === 0) {
    throw new Error('HTML 页面解析完毕，但未发现符合规范的阵容数据结构 (非阵容页面或结构已变更)')
  }

  return lineups.map((item, i) => validateLineupSnapshotItem(item, i))
}

/**
 * 执行一次同步抓取任务 (真实接入与防伪闭环)
 */
export async function syncHokaceLineups(timeoutMs = 3000) {
  const runId = `run-hokace-${Date.now()}`
  const startTime = new Date().toISOString()

  try {
    const rawBody = await fetchRemoteBody(HOKACE_ADAPTER_METADATA.targetUrl, timeoutMs)
    const validData = parseHokaceBody(rawBody)

    return {
      runId,
      sourceId: HOKACE_ADAPTER_METADATA.sourceId,
      status: 'SUCCESS',
      startTime,
      endTime: new Date().toISOString(),
      recordsCount: validData.length,
      data: validData,
      rawBody,
      rawLength: rawBody.length,
      error: null
    }
  } catch (err) {
    // 严格诚实报错，绝不伪装成功，绝不用假 baseline 覆盖 (F03)
    console.warn(`[HokaceAdapter] 同步失败: ${err.message}`)
    return {
      runId,
      sourceId: HOKACE_ADAPTER_METADATA.sourceId,
      status: 'FAILED',
      startTime,
      endTime: new Date().toISOString(),
      recordsCount: 0,
      data: null,
      error: err.message
    }
  }
}

/**
 * 带有超时控制的原生 HTTP/HTTPS 抓取
 */
function fetchRemoteBody(urlStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr)
      const client = url.protocol === 'https:' ? https : http

      const req = client.get(url, {
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'WanxiangqiDataBot/2.0 (+https://github.com/wanxiangqi)'
        }
      }, (res) => {
        if (res.statusCode !== 200) {
          res.resume() // 消费剩余响应流
          return reject(new Error(`远端服务器返回非 200 状态码: HTTP ${res.statusCode}`))
        }
        let raw = ''
        res.setEncoding('utf-8')
        res.on('data', chunk => raw += chunk)
        res.on('end', () => resolve(raw))
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error(`网络连接超时 (${timeoutMs}ms)`))
      })

      req.on('error', (err) => {
        reject(new Error(`网络连接失败: ${err.message}`))
      })
    } catch (err) {
      reject(new Error(`URL 无效: ${err.message}`))
    }
  })
}
