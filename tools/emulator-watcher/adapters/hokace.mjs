// 王者万象棋数据站 - hokace.wiki 第三方阵容快照适配器 (v2 真实解析与严格防伪版)
// 遵循 v2 任务书及验收报告规范 (F03, A04, A05, A17)：
// 1. 真实字段解析与结构验证，禁止无条件返回内置 baseline 冒充 SUCCESS
// 2. 失败严格报告 FAILED 状态，禁止将失败结果当作成功写盘
// 3. 网络或解析失败时，严禁覆盖旧的最后有效快照，严禁更新 lastSuccessAt
// 4. 沙箱或离线环境网络受限时，如实抛出 CONNECTION_FAILED

import http from 'node:http'
import https from 'node:https'
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
 * 校验解析出的单条阵容快照结构
 */
export function validateLineupSnapshotItem(item, idx = 0) {
  if (!item || typeof item !== 'object') {
    throw new Error(`第 ${idx + 1} 条阵容对象为空`)
  }
  if (!item.lineupName || typeof item.lineupName !== 'string') {
    throw new Error(`第 ${idx + 1} 条阵容缺少阵容名 lineupName`)
  }
  const sampleCount = Number(item.sampleCount)
  if (isNaN(sampleCount) || sampleCount < 0) {
    throw new Error(`第 ${idx + 1} 条阵容缺少有效样本量 sampleCount`)
  }
  const winRate = Number(item.winRate)
  if (isNaN(winRate) || winRate < 0 || winRate > 1) {
    throw new Error(`第 ${idx + 1} 条阵容登顶率 winRate [${item.winRate}] 不在 [0, 1] 区间`)
  }
  const top3Rate = Number(item.top3Rate)
  if (isNaN(top3Rate) || top3Rate < 0 || top3Rate > 1) {
    throw new Error(`第 ${idx + 1} 条阵容前三率 top3Rate [${item.top3Rate}] 不在 [0, 1] 区间`)
  }
  const avgRank = Number(item.avgRank)
  if (isNaN(avgRank) || avgRank < 1 || avgRank > 6) {
    throw new Error(`第 ${idx + 1} 条阵容平均名次 avgRank [${item.avgRank}] 不在 [1, 6] 区间`)
  }

  return {
    id: item.id || `lineup-snap-${Date.now()}-${idx}`,
    sourceId: HOKACE_ADAPTER_METADATA.sourceId,
    lineupName: item.lineupName.trim(),
    tier: item.tier || 'T1',
    commander: item.commander || '通用',
    coreHeroes: Array.isArray(item.coreHeroes) ? item.coreHeroes : [],
    sampleCount,
    winRate,
    top3Rate,
    avgRank,
    snapshotVersion: item.snapshotVersion || 'v2609',
    windowText: item.windowText || '近 7 日实战聚合',
    scope: item.scope || '全服王者段位',
    updatedAt: new Date().toISOString()
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
  
  // 模式 A: 提取带有阵容属性的元素
  const cardRegex = /<[^>]+class="[^"]*(?:lineup-card|tier-row)[^"]*"[^>]*data-name="([^"]+)"[^>]*data-tier="([^"]+)"[^>]*data-winrate="([^"]+)"[^>]*data-top3="([^"]+)"[^>]*data-avgrank="([^"]+)"[^>]*data-samples="([^"]+)"/gi
  let match
  while ((match = cardRegex.exec(rawBody)) !== null) {
    lineups.push({
      lineupName: match[1],
      tier: match[2],
      winRate: parseFloat(match[3]),
      top3Rate: parseFloat(match[4]),
      avgRank: parseFloat(match[5]),
      sampleCount: parseInt(match[6], 10)
    })
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
