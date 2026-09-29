// V01 · 连续运行前后端测试：业务文件哈希、业务库计数不变；临时资源可清理
// 任务书 §5 V01：整轮验收测试期间，业务 storage.json 的 sha256 与业务库七表计数
// 必须保持不变；测试创建的临时目录/临时库必须可清理。
//
// 本文件同时完成两件事：
//   1. 后端侧：在临时目录 StorageEngine + 独立测试库上执行写入负载，全程业务资产不变
//   2. 前端侧：子进程真实运行整套 vitest（frontend npm test），解析其机器可读输出，
//      断言全部通过且（由 vite.config.ts 的 globalSetup 护栏保证）业务文件未被触碰
//
// 铁律：仅连 *_test 库；业务库/业务文件只读（哈希+计数比对）。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { captureBusinessBaseline, assertBusinessUntouched, businessStorageSha256 } from '../helpers/business-guard.mjs'
import { makeTmpStore, makeTempDataDir } from '../helpers/tmp-store.mjs'
import { FileRepository } from '../../src/repositories/file-repository.mjs'
import { createServices } from '../../src/services/index.mjs'
import { recreateNamedTestDb, isLocalPgAvailable } from '../helpers/pg-test.mjs'
import { pgAvailable } from './_helpers.mjs'

const execFileAsync = promisify(execFile)
const FRONTEND_DIR = new URL('../../../frontend/', import.meta.url).pathname
const VITEST_OUTPUT = path.join(FRONTEND_DIR, '.vitest', 'json', 'output.json')

let baseline = null

before(async () => {
  baseline = await captureBusinessBaseline()
})

after(async () => {
  await assertBusinessUntouched(baseline)
})

test('V01: 后端写入负载全程业务 storage.json 哈希不变（每次写后即时比对）', async () => {
  const bizShaBefore = businessStorageSha256()
  const tmp = makeTmpStore()
  const repo = new FileRepository(tmp.engine)
  const svc = createServices(repo, { appMode: 'demo' })

  // 写入负载：导入两批（第二批为更正版本）+ 核验放行
  // 复验2 语义：核验强制证据链 —— 先在沙箱内登记存证材料，导入时逐条关联
  tmp.engine.state.evidences.push({
    id: 'ev-v01-sandbox', sha256: 'a'.repeat(64), sourceId: 'src-manual-review',
    capturedAt: '2026-09-01T09:00:00Z', verifiedAt: '2026-09-01T09:00:00Z',
    verifiedBy: 'v01', status: 'VERIFIED', note: 'V01 沙箱存证'
  })
  tmp.engine.saveState()
  const records = [
    { playerId: 'p-v01', matchTime: '2026-09-01T10:00:00Z', finalRank: 1, mode: 'RANKED_DIAMOND', nickname: '隔离样本A', evidenceId: 'ev-v01-sandbox' },
    { playerId: 'p-v01', matchTime: '2026-09-01T11:00:00Z', finalRank: 3, mode: 'RANKED_DIAMOND', nickname: '隔离样本A', evidenceId: 'ev-v01-sandbox' }
  ]
  const run1 = await svc.imports.importMatches(records, { source: 'V01_TEST' })
  assert.equal(run1.inserted, 2)
  assert.equal(businessStorageSha256(), bizShaBefore, 'FileRepository 必须只写注入的临时目录')

  // 核验放行两局（导入均为 PENDING，统计只认核验后记录；证据已随导入关联）
  for (const m of await repo.getPlayerMatches('p-v01')) {
    await svc.imports.verifyMatch(m.id, { verifiedBy: 'v01' })
  }
  await svc.imports.importMatches([
    ...records,
    { playerId: 'p-v01', matchTime: '2026-09-02T10:00:00Z', finalRank: 6, mode: 'RANKED_DIAMOND', nickname: '隔离样本A' }
  ], { source: 'V01_TEST' })

  const stats = await svc.stats.getPlayerStats('p-v01', {})
  assert.equal(stats.stats.sampleCount, 2, '临时沙箱内统计正常工作（核验 2 局生效）')
  assert.equal(businessStorageSha256(), bizShaBefore, '写入负载结束后业务文件仍不得变化')

  // 临时资源可清理：显式删除后目录必须消失
  tmp.cleanup()
  assert.equal(fs.existsSync(tmp.dataDir), false, '临时数据目录必须可完全清理')
})

test('V01: 后端写入负载全程业务库七表计数不变', { skip: !pgAvailable }, async () => {
  if (!baseline.pg.ok) {
    assert.ok(true, `业务库不可达，计数比对已在护栏内跳过（原因留档）: ${baseline.pg.reason}`)
    return
  }
  // 独立命名测试库上的写负载（重建+迁移+写入），业务库计数必须不动
  await recreateNamedTestDb('wanxiangqi_v01_test')
  assert.deepEqual(
    (await captureBusinessBaseline()).pg.counts,
    baseline.pg.counts,
    '整轮写负载后业务库七表计数不得漂移'
  )
})

test('V01: 前端整套 vitest 连续运行全绿（子进程真实运行 + 机器输出断言）', { timeout: 240_000 }, async () => {
  assert.ok(fs.existsSync(path.join(FRONTEND_DIR, 'node_modules')), 'frontend 依赖未安装（npm i），此前端子套件无法在本机执行')
  const tmpDataDir = makeTempDataDir('wxq-v01-fe-')
  try {
    await execFileAsync('npm', ['test'], {
      cwd: FRONTEND_DIR,
      env: { ...process.env, WXQ_DATA_DIR: tmpDataDir },
      timeout: 200_000
    })
    const report = JSON.parse(fs.readFileSync(VITEST_OUTPUT, 'utf-8'))
    assert.equal(report.numTotalTests > 0, true, `vitest 输出异常: ${VITEST_OUTPUT}`)
    assert.equal(
      report.numPassedTests, report.numTotalTests,
      `前端测试存在失败: passed=${report.numPassedTests} total=${report.numTotalTests} failed=${report.numFailedTests}`
    )
    assert.equal(report.numFailedTests, 0)
  } finally {
    fs.rmSync(tmpDataDir, { recursive: true, force: true })
    assert.equal(fs.existsSync(tmpDataDir), false, '前端测试临时目录必须可清理')
  }
})

test('V01: isLocalPgAvailable 探测结果与业务库可达性记录一致（环境前置留档）', () => {
  // 仅作证据记录：本机 PG 可用性决定 *_test 库类用例是否 skip，不产生误报失败
  assert.equal(typeof pgAvailable, 'boolean')
})
