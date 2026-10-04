// v6 M3-1 · 官网第一方内容抓取适配器（只读 GET，原文存证）
//
// 铁律：
// 1. 只做只读 GET，不做任何登录/授权/个人数据请求（与 research/ 官网核查结论一致：
//    官网公开页面与资讯接口可用；个人战绩/营地接口未授权不触碰）
// 2. 原文整包存证（body + SHA-256 + 实测字节数 + 响应 Content-Type），
//    不做语义解析——内容条目的撰写与引用由人工/服务层基于存证进行
// 3. 任一目标失败 → 整次抓取 FAILED（不写部分存证；重试由运营者触发）
// 4. 采集时间 (fetchedAt) 由调用方统一生成，与来源数据自身时间无关

import http from 'node:http'
import https from 'node:https'
import crypto from 'node:crypto'
import { URL } from 'node:url'

export const OFFICIAL_ADAPTER_METADATA = {
  sourceId: 'src-wxq-official',
  name: '王者万象棋官网公开页（第一方内容依据）',
  type: 'OFFICIAL_CONTENT',
  license: '官网公开页面只读抓取存证',
  pollIntervalSec: 86400
}

/**
 * 抓取目标清单（record_key 即 raw_materials.record_key，稳定可追溯）。
 * news 目标为 2026-10-02 research/official-channel-probe 实测确认的官方资讯接口
 * （JSONP 响应，status=0）；id=18873181 为实测可见的版本更新公告编号。
 * cards 五目标为 2026-10-03 M4 实测确认的官网卡牌图鉴数据接口
 * （portal 页 cards.js 以 $.getJSON 拉取的四个官方 JSON + cards.js 本体，
 *  内容为全部英雄/装备/效果/天赋牌的官方完整数据）。
 */
export const OFFICIAL_CONTENT_TARGETS = [
  { recordKey: 'official:home', url: 'https://wxq.qq.com/', contentType: 'text/html' },
  { recordKey: 'official:portal', url: 'https://wxq.qq.com/cp/a20260707sfgw/index.html', contentType: 'text/html' },
  { recordKey: 'official:newbie-guide', url: 'https://wxq.qq.com/cp/a202609xszy/', contentType: 'text/html' },
  {
    recordKey: 'official:news:18873181',
    url: 'https://apps.game.qq.com/wmp/v3.1/public/searchNews.php?p0=389&source=web_pc&id=18873181',
    contentType: 'application/javascript'
  },
  {
    recordKey: 'official:cards:heroes',
    url: 'https://game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_1.js',
    contentType: 'application/json'
  },
  {
    recordKey: 'official:cards:effects',
    url: 'https://game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_2.js',
    contentType: 'application/json'
  },
  {
    recordKey: 'official:cards:equips',
    url: 'https://game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_4.js',
    contentType: 'application/json'
  },
  {
    recordKey: 'official:cards:talents',
    url: 'https://game.gtimg.cn/images/amside/ide_timer/589094_oscard_new_8.js',
    contentType: 'application/json'
  },
  {
    recordKey: 'official:cards:js',
    url: 'https://wxq.qq.com/cp/a20260707sfgw/js/cards.js',
    contentType: 'application/javascript'
  }
]

/** 单目标抓取：返回原文与指纹（不解析、不裁剪、不改写） */
async function fetchTarget(target, timeoutMs) {
  const body = await fetchRemoteBody(target.url, timeoutMs)
  if (!body || body.length === 0) {
    throw new Error(`目标 [${target.recordKey}] 响应正文为空`)
  }
  return {
    recordKey: target.recordKey,
    url: target.url,
    contentType: target.contentType,
    content: body,
    contentSha256: crypto.createHash('sha256').update(body).digest('hex'),
    sizeBytes: Buffer.byteLength(body, 'utf8')
  }
}

/**
 * 抓取全部官网目标（一次同步动作）。
 * 返回 { status, materials, error, startedAt, endedAt }：
 *   SUCCESS 时 materials 为全部目标的原文存证载荷。
 */
export async function fetchOfficialContent(timeoutMs = 10_000) {
  const startedAt = new Date().toISOString()
  const materials = []
  try {
    for (const target of OFFICIAL_CONTENT_TARGETS) {
      materials.push(await fetchTarget(target, timeoutMs))
    }
    return {
      status: 'SUCCESS',
      sourceId: OFFICIAL_ADAPTER_METADATA.sourceId,
      materials,
      fetchedCount: materials.length,
      startedAt,
      endedAt: new Date().toISOString(),
      error: null
    }
  } catch (err) {
    console.warn(`[OfficialSiteAdapter] 抓取失败: ${err.message}`)
    return {
      status: 'FAILED',
      sourceId: OFFICIAL_ADAPTER_METADATA.sourceId,
      materials: [],
      fetchedCount: materials.length,
      startedAt,
      endedAt: new Date().toISOString(),
      error: err.message
    }
  }
}

/** 带超时的原生 HTTP/HTTPS 抓取（与 hokace 适配器同一纪律） */
function fetchRemoteBody(urlStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(urlStr)
      const client = url.protocol === 'https:' ? https : http

      const req = client.get(url, {
        timeout: timeoutMs,
        headers: {
          // HTTP 头只允许 ASCII（中文 UA 会直接抛 Invalid character in header content）
          'User-Agent': 'WanxiangqiContentBot/1.0 (+https://github.com/wanxiangqi; read-only public page archival)'
        }
      }, (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode}（${urlStr}）`))
        }
        let raw = ''
        res.setEncoding('utf-8')
        res.on('data', chunk => { raw += chunk })
        res.on('end', () => resolve(raw))
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error(`网络连接超时 (${timeoutMs}ms)：${urlStr}`))
      })

      req.on('error', (err) => {
        reject(new Error(`网络连接失败：${err.message}`))
      })
    } catch (err) {
      reject(new Error(`URL 无效: ${err.message}`))
    }
  })
}
