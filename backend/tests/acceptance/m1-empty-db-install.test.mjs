// M1 · 空库安装路径：全新 *_test 库 → 全部迁移 → 正式栈启动 → 空态如实
// （v6：PG 为唯一权威；demo 文件引擎退役后不再有“旁边旧 JSON”路径，
//  本用例取代 v02，验证空库安装的可执行性与空态诚实性。）

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, pgAvailable } from './_helpers.mjs'

let stack = null

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_m1e_test')
})

after(async () => {
  if (stack) await stack.cleanup()
})

test('M1-E: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('M1-E1: 空库下 ready/health 正常，内容计数全 0（来源注册表由迁移种子）', { skip: !pgAvailable }, async () => {
  const ready = await stack.api('/api/v1/ready')
  assert.equal(ready.status, 200)
  assert.equal(ready.json.status, 'READY')

  const health = await stack.api('/api/v1/health')
  assert.equal(health.json.db.connected, true)
  assert.deepEqual(health.json.counts, {
    sources: 6, lineups: 0, lineupsActive: 0, evidences: 0,
    evidenceBlobs: 0, rawMaterials: 0, syncJobs: 0,
    publishedLineups: 0, publishedLessons: 0, publishedEntities: 0, publishedMechanics: 0
  }, '空库内容计数全 0；6 个来源为迁移种子注册行（v6 M2 计数含内容模型发布量）')
})

test('M1-E2: 空库读取端点返回空列表（无编造内容）', { skip: !pgAvailable }, async () => {
  const lineups = await stack.api('/api/v1/lineups')
  assert.equal(lineups.status, 200)
  assert.equal(lineups.json.total, 0)
  assert.deepEqual(lineups.json.data, [])

  const ghost = await stack.api('/api/v1/lineups/lm-not-exists')
  assert.equal(ghost.status, 404, '未知快照 404（如实不存在）')
})

test('M1-E3: data-status 来源注册表如实呈现（种子 6 行，无 ACTIVE 宣称）', { skip: !pgAvailable }, async () => {
  const status = await stack.api('/api/v1/data-status')
  assert.equal(status.status, 200)
  const sources = status.json.sources
  assert.equal(sources.length, 6, '迁移种子注册 6 个来源')
  assert.deepEqual(sources.map(s => s.id).sort(), [
    'src-datatft-platform', 'src-hokace-wiki', 'src-kohcamp-official',
    'src-manual-review', 'src-official-helper', 'src-wxq-official'
  ])
  for (const s of sources) {
    // src-manual-review 是人工核验录入路径（唯一提真通道），ACTIVE 合法；
    // 其余自动来源在无真实接入时不得宣称 ACTIVE
    if (s.id !== 'src-manual-review') {
      assert.notEqual(s.status, 'ACTIVE', `来源 ${s.id} 不得在无真实接入的情况下宣称 ACTIVE`)
    }
    assert.equal(s.lastSuccessAt, null)
  }
  assert.deepEqual(status.json.recentSyncJobs, [])
})

test('M1-E4: 管理面空台账 + 401 语义在空库下一致', { skip: !pgAvailable }, async () => {
  const anon = await stack.api('/api/v1/admin/sync-jobs')
  assert.equal(anon.status, 401)
  const authed = await stack.api('/api/v1/admin/sync-jobs', { token: stack.adminToken })
  assert.equal(authed.status, 200)
  assert.equal(authed.json.total, 0)
})
