// V14 · hokace 真实来源实测（联网验收，默认 skip）
// 任务书 §5 V14 + v4 W4：抓取真实 hokace.wiki 阵容页 ≥5 条并核对字段语义（第三方汇总，[0,1] 比率），
// 并核对页面级快照版本与窗口说明（snapshotVersion / windowText）真实提取。
//
// 门控：WXQ_NETWORK_TESTS=1 才真正联网（默认测试运行零网络依赖，P0-A 隔离铁律）。
// 红线：本测试不得用 fixtures 冒充 —— 联网失败/结构变化即如实 FAILED：先落盘证据，
//       再 assert.fail（FAILED/BLOCKED 不算验收通过，受阻也是事实，不得掩饰为通过）。

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const GATED = process.env.WXQ_NETWORK_TESTS === '1'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACTS = path.resolve(__dirname, '../../../docs/v4_artifacts')

test('V14: hokace.wiki 真实页面实测（联网门控）', { skip: !GATED && '需 WXQ_NETWORK_TESTS=1 显式开启（默认零联网）' }, async () => {
  const { syncHokaceLineups } = await import('../../../tools/emulator-watcher/adapters/hokace.mjs')
  const result = await syncHokaceLineups(10_000)

  // v4 W4：证据含页面级版本/窗口说明与正文指纹（sha256 + 长度），可离线复核
  const record = {
    testedAt: new Date().toISOString(),
    target: 'https://hokace.wiki/zh/lineups/',
    status: result.status,
    fetchedCount: result.status === 'SUCCESS' ? result.data.length : 0,
    snapshotVersion: result.status === 'SUCCESS' ? (result.data[0]?.snapshotVersion ?? null) : null,
    windowText: result.status === 'SUCCESS' ? (result.data[0]?.windowText ?? null) : null,
    contentSha256: crypto.createHash('sha256').update(result.rawBody || '').digest('hex'),
    contentLength: typeof result.rawBody === 'string' ? result.rawBody.length : 0,
    error: result.error || null,
    sample: result.status === 'SUCCESS'
      ? result.data.slice(0, 5).map(d => ({
          lineupName: d.lineupName, winRate: d.winRate, top3Rate: d.top3Rate,
          avgRank: d.avgRank, sampleCount: d.sampleCount, dataCutoffAt: d.dataCutoffAt ?? null,
          snapshotVersion: d.snapshotVersion ?? null, windowText: d.windowText ?? null
        }))
      : []
  }
  fs.mkdirSync(ARTIFACTS, { recursive: true })
  const file = path.join(ARTIFACTS, `v14-hokace-live-${record.testedAt.replace(/[^\d]/g, '').slice(0, 14)}.json`)
  fs.writeFileSync(file, JSON.stringify(record, null, 2))

  if (result.status !== 'SUCCESS') {
    // 如实受阻：证据已先落盘，再以失败告终 —— FAILED 不是验收通过
    assert.fail(`hokace 真实联网验收受阻（证据已落盘 ${file}）: ${result.error || '未知错误'}`)
  }

  // 成功路径：≥5 条真实阵容 + 比率契约 [0,1] + 页面级版本/窗口字段语义
  assert.ok(result.data.length >= 5, `真实页面应解析出 ≥5 条阵容（实际 ${result.data.length}）`)
  assert.ok(record.snapshotVersion, '页面公布的快照版本必须被提取（如 v260924），缺失即页面结构变化')
  assert.ok(record.windowText, '页面公布的窗口说明必须被提取（如「7 日对局快照」），缺失即页面结构变化')
  assert.ok(record.contentLength > 0 && /^[0-9a-f]{64}$/.test(record.contentSha256), '正文指纹与长度必须随证据落盘')
  for (const d of result.data.slice(0, 5)) {
    assert.ok(d.winRate >= 0 && d.winRate <= 1, `${d.lineupName} winRate 必须在 [0,1]`)
    assert.ok(d.top3Rate >= 0 && d.top3Rate <= 1)
    assert.equal(d.rateUnit, 'RATIO_0_1')
    // 页面级元信息注入全部条目（W4）
    assert.equal(d.snapshotVersion, record.snapshotVersion, '页面级快照版本应注入全部条目')
    assert.equal(d.windowText, record.windowText, '页面级窗口说明应注入全部条目')
    assert.equal(d.dataCutoffAt, null, '来源未公布数据截止时间 → null（不编造）')
  }
})
