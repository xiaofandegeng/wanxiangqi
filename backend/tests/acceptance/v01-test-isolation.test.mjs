// V01 · 连续运行前后端测试：业务库计数不变；临时资源可清理（v6 适配）
// 整轮验收测试期间，业务库各表计数必须保持不变；测试创建的临时库必须可清理。
//
// 本文件同时完成两件事：
//   1. 后端侧：在独立测试库上执行真实写负载（素材原件上传→核验→同步触发），
//      全程业务库计数不变
//   2. 前端侧：子进程真实运行整套 vitest（frontend npm test），解析其机器可读输出，
//      断言全部通过
//
// 铁律：仅连 *_test 库；业务库只读（计数比对）。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { captureBusinessBaseline, assertBusinessUntouched } from '../helpers/business-guard.mjs'
import { bootAcceptanceStack, pgAvailable } from './_helpers.mjs'

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

test('V01: 后端写负载全程业务库计数不变（隔离测试库上传/核验/同步）', { skip: !pgAvailable }, async () => {
  const stack = await bootAcceptanceStack('wanxiangqi_v01_test')
  try {
    // 写负载 1：素材原件上传（PENDING）→ 人工确认有效（VERIFIED）
    const buf = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('V01-FIXTURE-content-asset-bytes')
    ])
    const q = new URLSearchParams({ capturedAt: '2026-10-03T09:00:00Z', kind: 'CONTENT_ASSET', usageScope: 'INTERNAL_ONLY' })
    const up = await fetch(`${stack.baseUrl}/api/v1/admin/evidences/upload?${q}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${stack.adminToken}`, 'Content-Type': 'image/png', 'Content-Length': String(buf.length) },
      body: buf
    })
    assert.equal(up.status, 201)
    const upJson = await up.json()
    const ack = await stack.api(`/api/v1/admin/evidences/${upJson.evidenceId}/verify`, {
      method: 'POST', token: stack.adminToken, body: { verifiedBy: 'v01' }
    })
    assert.equal(ack.status, 200)

    // 写负载 2：同步任务台账（未配置来源 → 400，但留下受控错误路径零写入验证）
    const sync = await stack.api('/api/v1/admin/sources/src-unknown-x/sync', {
      method: 'POST', token: stack.adminToken
    })
    assert.equal(sync.status, 400)

    const health = await stack.api('/api/v1/health')
    assert.equal(health.json.counts.evidences, 1, '写负载落在隔离测试库')
  } finally {
    await stack.cleanup()
  }
  assert.ok(true, '业务库计数由 after() 钩子统一断言')
})

test('V01: 前端整套 vitest 连续运行全绿（子进程真实运行 + 机器输出断言）', { timeout: 240_000 }, async () => {
  assert.ok(fs.existsSync(path.join(FRONTEND_DIR, 'node_modules')), 'frontend 依赖未安装（npm i），此前端子套件无法在本机执行')
  await execFileAsync('npm', ['test'], { cwd: FRONTEND_DIR, timeout: 200_000 })
  const report = JSON.parse(fs.readFileSync(VITEST_OUTPUT, 'utf-8'))
  assert.equal(report.numTotalTests > 0, true, `vitest 输出异常: ${VITEST_OUTPUT}`)
  assert.equal(
    report.numPassedTests, report.numTotalTests,
    `前端测试存在失败: passed=${report.numPassedTests} total=${report.numTotalTests} failed=${report.numFailedTests}`
  )
  assert.equal(report.numFailedTests, 0)
})

test('V01: pgAvailable 探测结果记录（环境前置留档）', () => {
  // 仅作证据记录：本机 PG 可用性决定 *_test 库类用例是否 skip，不产生误报失败
  assert.equal(typeof pgAvailable, 'boolean')
})
