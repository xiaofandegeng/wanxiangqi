// V02 · 空数据库启动，旁边存在旧 JSON → API 仍为空，无旧数据自动填充
// 任务书 §5 V02：正式模式以 PostgreSQL 为唯一权威；旁边的旧 storage.json（历史遗留、
// 或被前端测试污染过的文件）绝不允许被自动吸入填充 API。
//
// 构造：空净迁移后的测试库 + 同机临时目录里一份“装满旧数据”的 storage.json，
// 显式设置 WXQ_DATA_DIR 指向该目录后启动正式栈 —— 断言 API 一切为空且旧文件分毫未动。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { makeTmpStore } from '../helpers/tmp-store.mjs'
import { bootAcceptanceStack, pgAvailable } from './_helpers.mjs'

let stack = null
let legacyTmp = null
let legacySha = null

before(async () => {
  if (!pgAvailable) return

  // 1. 旁边旧 JSON：临时目录里写入装满历史数据的 storage.json（模拟 v2 时代的业务文件）
  legacyTmp = makeTmpStore('wxq-v02-legacy-')
  legacyTmp.engine.state.players.push(
    { id: 'p-legacy-1', nickname: '旧选手甲', platform: 'DEFAULT', rankScore: 25 },
    { id: 'p-legacy-2', nickname: '旧选手乙', platform: 'DEFAULT', rankScore: 21 }
  )
  legacyTmp.engine.state.matches.push(
    { id: 'mh-legacy-1', playerId: 'p-legacy-1', matchTime: '2026-08-01T10:00:00Z', availableAt: '2026-08-01T10:05:00Z',
      finalRank: 1, mode: 'RANKED_DIAMOND', verified: true, recordStatus: 'ACTIVE', synthetic: false,
      recordKey: null, revision: 1, supersededAt: null, commander: null, lineup: null, roundsSurvived: null,
      threeStars: [], batchId: 'batch-legacy', evidenceId: null },
    { id: 'mh-legacy-2', playerId: 'p-legacy-2', matchTime: '2026-08-01T11:00:00Z', availableAt: '2026-08-01T11:05:00Z',
      finalRank: 2, mode: 'RANKED_DIAMOND', verified: true, recordStatus: 'ACTIVE', synthetic: false,
      recordKey: null, revision: 1, supersededAt: null, commander: null, lineup: null, roundsSurvived: null,
      threeStars: [], batchId: 'batch-legacy', evidenceId: null }
  )
  legacyTmp.engine.saveState()
  const legacyFile = `${legacyTmp.dataDir}/storage.json`
  legacySha = crypto.createHash('sha256').update(fs.readFileSync(legacyFile)).digest('hex')

  // 2. 正式栈：空净测试库；WXQ_DATA_DIR 显式指向旧 JSON 所在目录（诱惑路径）
  process.env.WXQ_DATA_DIR = legacyTmp.dataDir
  stack = await bootAcceptanceStack('wanxiangqi_v02_test')
})

after(async () => {
  delete process.env.WXQ_DATA_DIR
  if (stack) await stack.cleanup()
  if (legacyTmp) legacyTmp.cleanup()
})

test('V02: 环境前置（本地 PG 不可用则整体 skip，禁止误报失败）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('V02: 空库下所有读取端点返回空，无旧 JSON 自动填充', { skip: !pgAvailable }, async () => {
  const players = await stack.api('/api/v1/players')
  assert.equal(players.status, 200)
  assert.equal(players.json.total, 0, '空库 + 旁边旧 JSON → players 必须为空')
  assert.deepEqual(players.json.data, [])

  const matches = await stack.api('/api/v1/matches')
  assert.equal(matches.status, 200)
  assert.equal(matches.json.total, 0, '不得吸入旧 JSON 的 2 条对局')

  const events = await stack.api('/api/v1/events')
  assert.equal(events.json.total, 0)

  const lineups = await stack.api('/api/v1/lineups')
  assert.equal(lineups.json.total, 0)

  // 旧 JSON 中的选手在正式栈下不存在：统计 N=0 且比率全 null（不得拿旧数据补战绩）
  const ghost = await stack.api('/api/v1/players/p-legacy-1/stats')
  assert.equal(ghost.status, 200)
  assert.equal(ghost.json.stats.sampleCount, 0)
  assert.equal(ghost.json.stats.winRate, null)
  assert.equal(ghost.json.stats.avgRank, null)
})

test('V02: health/ready 如实报告空库状态（不虚报组件与计数）', { skip: !pgAvailable }, async () => {
  const ready = await stack.api('/api/v1/ready')
  assert.equal(ready.status, 200)
  assert.equal(ready.json.status, 'READY')

  const health = await stack.api('/api/v1/health')
  assert.equal(health.json.db.connected, true)
  assert.deepEqual(health.json.counts, {
    players: 0, matches: 0, effectiveMatches: 0, events: 0, lineups: 0, lineupsActive: 0, evidences: 0
  }, '空库计数必须全 0（正式栈绝不读取旁边的旧 JSON）')
})

test('V02: 旧 JSON 文件本身分毫未动（哈希不变，测试不破坏现场）', { skip: !pgAvailable }, () => {
  const legacyFile = `${legacyTmp.dataDir}/storage.json`
  const after = crypto.createHash('sha256').update(fs.readFileSync(legacyFile)).digest('hex')
  assert.equal(after, legacySha, '旧 JSON 是历史现场证据（含 v2 时代污染残留），验收测试只读不动')
})
