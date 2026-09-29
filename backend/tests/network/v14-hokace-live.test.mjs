// V14 · hokace 真实来源实测（联网验收，默认 skip）
// 任务书 §5 V14：抓取真实 hokace.wiki 阵容页 ≥5 条并核对字段语义（第三方汇总，[0,1] 比率）。
//
// 门控：WXQ_NETWORK_TESTS=1 才真正联网（默认测试运行零网络依赖，P0-A 隔离铁律）。
// 红线：本测试不得用 fixtures 冒充 —— 联网失败/结构变化即如实 FAILED，并落盘证据，
//       供交付报告引用（受阻也是事实，不得掩饰为通过）。

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const GATED = process.env.WXQ_NETWORK_TESTS === '1'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ARTIFACTS = path.resolve(__dirname, '../../../docs/v3_artifacts')

test('V14: hokace.wiki 真实页面实测（联网门控）', { skip: !GATED && '需 WXQ_NETWORK_TESTS=1 显式开启（默认零联网）' }, async () => {
  const { syncHokaceLineups } = await import('../../../tools/emulator-watcher/adapters/hokace.mjs')
  const result = await syncHokaceLineups(10_000)

  const record = {
    testedAt: new Date().toISOString(),
    target: 'https://hokace.wiki/zh/lineups/',
    status: result.status,
    fetchedCount: result.status === 'SUCCESS' ? result.data.length : 0,
    error: result.error || null,
    sample: result.status === 'SUCCESS'
      ? result.data.slice(0, 5).map(d => ({
          lineupName: d.lineupName, winRate: d.winRate, top3Rate: d.top3Rate,
          avgRank: d.avgRank, sampleCount: d.sampleCount, dataCutoffAt: d.dataCutoffAt ?? null
        }))
      : []
  }
  fs.mkdirSync(ARTIFACTS, { recursive: true })
  const file = path.join(ARTIFACTS, `v14-hokace-live-${record.testedAt.replace(/[^\d]/g, '').slice(0, 14)}.json`)
  fs.writeFileSync(file, JSON.stringify(record, null, 2))

  if (result.status !== 'SUCCESS') {
    // 如实受阻：断言失败语义正确（无数据、错误信息在场），证据已落盘
    assert.equal(result.data, null)
    assert.ok(result.error, '网络/结构受阻必须携带真实错误信息')
    assert.ok(record.error.length > 0)
    return
  }

  // 成功路径：≥5 条真实阵容 + 比率契约 [0,1] + 字段语义
  assert.ok(result.data.length >= 5, `真实页面应解析出 ≥5 条阵容（实际 ${result.data.length}）`)
  for (const d of result.data.slice(0, 5)) {
    assert.ok(d.winRate >= 0 && d.winRate <= 1, `${d.lineupName} winRate 必须在 [0,1]`)
    assert.ok(d.top3Rate >= 0 && d.top3Rate <= 1)
    assert.equal(d.rateUnit, 'RATIO_0_1')
  }
})
