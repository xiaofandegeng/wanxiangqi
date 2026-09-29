// V06 · 合成/测试批次隔离 → 正式查询 N 不包含它们；有 dry-run、备份和回滚证据
// 任务书 §5 V06。在独立测试库上复刻业务库的隔离现场（合成种子批 / 伪官方 camp 批 /
// 测试审核批 / 无证据待核验 / 造默认值），随后以子进程真实运行三个治理工具：
//   1. quarantine_records.mjs --dry-run   → 影响清单 + 模拟前后统计（证据落 docs/v3_artifacts/）
//   2. quarantine_records.mjs --execute --yes → 单事务：备份表 + 打标/清 NULL + 事务内复核
//   3. rollback_quarantine.mjs  --yes     → 按备份整行还原，逐行哈希校验
// 断言主线：隔离前后正式统计（verified ∧ ACTIVE ∧ 非 synthetic）只含真实核验记录；
// 回滚后计数与状态完全复原。
//
// 注意：工具按设计会把 dry-run/execute 报告写入 docs/v3_artifacts/（仓库内证据目录，
// 非业务数据文件）；本测试据此读取并校验证据文件本身。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { bootAcceptanceStack, insertPlayerRow, insertMatchRow, countRows, pgAvailable } from './_helpers.mjs'

const execFileAsync = promisify(execFile)
const DB = 'wanxiangqi_v06_test'
const BACKEND_DIR = new URL('../../', import.meta.url).pathname
const ARTIFACTS_DIR = path.join(BACKEND_DIR, '..', 'docs', 'v3_artifacts')

let stack = null

async function runTool(script, args) {
  const { stdout } = await execFileAsync('node', [path.join(BACKEND_DIR, 'scripts', script), ...args], {
    cwd: BACKEND_DIR, timeout: 60_000
  })
  return stdout
}

function latestArtifact(prefix) {
  const files = fs.readdirSync(ARTIFACTS_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
  return files.length ? path.join(ARTIFACTS_DIR, files[files.length - 1]) : null
}

/** 正式口径有效统计（SQL oracle，与统计服务同谓词） */
async function effectiveN(playerId) {
  return (await stack.pool.query(
    `SELECT count(*)::int AS n FROM matches
     WHERE player_id = $1 AND verified = TRUE AND record_status = 'ACTIVE' AND synthetic = FALSE`,
    [playerId]
  )).rows[0].n
}

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack(DB)

  // ---- 复刻业务库隔离前现场（v3 §2 F01/F03/F06/F09 同型数据）----
  await insertPlayerRow(stack.pool, { id: 'p-legit', nickname: '真实核验选手' })
  await insertPlayerRow(stack.pool, { id: 'p-seed', nickname: '合成种子选手', rankScore: 10000, rankText: '最强王者' })
  await insertPlayerRow(stack.pool, { id: 'p-camp', nickname: '伪官方同步选手' })
  await insertPlayerRow(stack.pool, { id: 'p-audit', nickname: '测试审核选手' })

  // 真实核验记录（带证据链）×2 —— 隔离后唯一幸存
  await stack.pool.query(
    `INSERT INTO evidences (id, sha256, source_id, captured_at, status)
     VALUES ('ev-v06-legit', $1, 'src-manual-review', '2026-09-01T09:00:00Z', 'VERIFIED')`,
    ['a'.repeat(64)]
  )
  await insertMatchRow(stack.pool, {
    id: 'm-legit-1', playerId: 'p-legit', matchTime: '2026-09-01T10:00:00Z',
    availableAt: '2026-09-01T10:05:00Z', finalRank: 1, recordKey: 'ev:ev-v06-legit:1', evidenceId: 'ev-v06-legit'
  })
  await insertMatchRow(stack.pool, {
    id: 'm-legit-2', playerId: 'p-legit', matchTime: '2026-09-01T11:00:00Z',
    availableAt: '2026-09-01T11:05:00Z', finalRank: 2, recordKey: 'ev:ev-v06-legit:2', evidenceId: 'ev-v06-legit'
  })
  // 无证据核验记录 ×1 —— 隔离动作转 PENDING（不认定虚假，待补证据）
  await insertMatchRow(stack.pool, {
    id: 'm-legit-3', playerId: 'p-legit', matchTime: '2026-09-01T12:00:00Z',
    availableAt: '2026-09-01T12:05:00Z', finalRank: 3
  })

  // F01 合成种子批（3 条，剧本生成名次）
  for (let i = 0; i < 3; i++) {
    await insertMatchRow(stack.pool, {
      id: `m-seed-${i}`, playerId: 'p-seed', matchTime: `2026-09-05T1${i}:00:00Z`,
      availableAt: `2026-09-05T1${i}:00:05Z`, finalRank: i + 1, batchId: 'batch-datatft-s1-seed'
    })
  }
  // F03 伪官方 camp 批（2 条）
  for (let i = 0; i < 2; i++) {
    await insertMatchRow(stack.pool, {
      id: `m-camp-${i}`, playerId: 'p-camp', matchTime: `2026-09-06T1${i}:00:00Z`,
      availableAt: `2026-09-06T1${i}:00:05Z`, finalRank: i + 1, batchId: 'batch-camp-official-full'
    })
  }
  // 测试审核批（1 条 + 连带 event/evidence）
  await stack.pool.query(
    `INSERT INTO evidences (id, sha256, source_id, captured_at, status)
     VALUES ('ev-v06-test', $1, 'src-manual-review', '2026-09-07T09:00:00Z', 'VERIFIED')`,
    ['b'.repeat(64)]
  )
  await stack.pool.query(
    `INSERT INTO events (id, mode, scheduled_at, title, status, evidence_id) VALUES
     ('evt-test', 'RANKED_DIAMOND', '2026-09-07T10:00:00Z', '测试审核场次', 'AUDITED', 'ev-v06-test')`
  )
  await insertMatchRow(stack.pool, {
    id: 'm-audit-1', playerId: 'p-audit', matchTime: '2026-09-07T10:00:00Z',
    availableAt: '2026-09-07T10:05:00Z', finalRank: 1, batchId: 'audit-evt-test', evidenceId: 'ev-v06-test'
  })

  // F06/F09 造默认值：选手天梯推导值 + 阵容 tier/窗口文案/3.5 兜底均名
  await stack.pool.query(
    `INSERT INTO lineup_snapshots (id, source_id, lineup_name, tier, sample_count, win_rate, top3_rate, avg_rank, window_text, scope, snapshot_version, updated_at) VALUES
     ('lu-dt-1', 'src-datatft-platform', '推导阵容甲', 'T0', 100, 0.441, 0.66, 3.5, '全服近 7 日实战大数据', '全服', 'v1', CURRENT_TIMESTAMP),
     ('lu-real-1', 'src-hokace-wiki', '真实快照乙', NULL, 88, 0.32, 0.51, 3.9, NULL, NULL, NULL, CURRENT_TIMESTAMP)`
  )
})

after(async () => {
  if (stack) await stack.cleanup()
})

test('V06: 环境前置（本地 PG 不可用则整体 skip）', { skip: !pgAvailable }, () => {
  assert.ok(pgAvailable)
})

test('V06: 隔离前正式统计口径现状（污染数据全部计入 —— 整改前基线）', { skip: !pgAvailable }, async () => {
  assert.equal(await effectiveN('p-legit'), 3)
  assert.equal(await effectiveN('p-seed'), 3, '隔离前合成种子批被计入（F01 现场）')
  assert.equal(await effectiveN('p-camp'), 2)
  assert.equal(await effectiveN('p-audit'), 1)
})

test('V06: dry-run 只读出影响清单且库零变更（证据文件落盘）', { skip: !pgAvailable }, async () => {
  const countsBefore = await countRows(stack.pool, 'matches')

  const stdout = await runTool('quarantine_records.mjs', ['--dry-run', '--db', DB])
  assert.match(stdout, /DRY-RUN 清单（只读，未做任何修改）/)

  const artifact = latestArtifact(`quarantine-dryrun-${DB}-`)
  assert.ok(artifact, 'dry-run 证据 JSON 必须落盘')
  const manifest = JSON.parse(fs.readFileSync(artifact, 'utf-8'))
  assert.equal(manifest.database, DB)
  assert.equal(manifest.categories.quarantineSeed.rowCount, 3)
  assert.equal(manifest.categories.quarantineCamp.rowCount, 2)
  assert.equal(manifest.categories.quarantineTestAudits.rowCount, 1)
  assert.equal(manifest.categories.quarantineTestEvents.rowCount, 1)
  assert.equal(manifest.categories.quarantineTestEvidences.rowCount, 1)
  assert.equal(manifest.categories.pendingNoEvidence.rowCount, 1, '无证据核验记录 → 待核验（不认定虚假）')
  assert.equal(manifest.categories.nullFabricatedPlayerRank.rowCount, 1)
  assert.equal(manifest.categories.nullFabricatedLineupMeta.rowCount, 1)
  assert.equal(manifest.categories.nullLineupAvgRankFallback.rowCount, 1)
  assert.equal(manifest.expectedEffectiveMatchesBefore, 9)
  assert.equal(manifest.expectedEffectiveMatchesAfter, 2, '模拟隔离后仅剩 2 条真实核验记录')
  // dry-run 只读：matches 行数与状态零变化
  assert.equal(await countRows(stack.pool, 'matches'), countsBefore)
  assert.equal(await effectiveN('p-seed'), 3, 'dry-run 不得提前打标')
})

test('V06: --execute 单事务隔离 → 正式查询 N 不再包含合成/测试批次', { skip: !pgAvailable }, async () => {
  const stdout = await runTool('quarantine_records.mjs', ['--execute', '--db', DB, '--yes'])
  assert.match(stdout, /事务提交完成/)

  const report = JSON.parse(fs.readFileSync(latestArtifact(`quarantine-execute-${DB}-`), 'utf-8'))
  assert.ok(report.backupTable.startsWith('quarantine_backup_'), '执行报告必须记录备份表名')
  assert.ok(report.backupRowCount >= 10, `备份必须覆盖全部受影响行（实际 ${report.backupRowCount}）`)
  assert.equal(report.effectiveMatchesAfter, 2)

  // 正式统计口径：只剩真实核验记录
  assert.equal(await effectiveN('p-legit'), 2, '无证据第 3 局转 PENDING → 不计入')
  assert.equal(await effectiveN('p-seed'), 0, 'F01 合成种子批隔离后必须为 0')
  assert.equal(await effectiveN('p-camp'), 0)
  assert.equal(await effectiveN('p-audit'), 0)

  // API 大盘（默认 ACTIVE 非合成）同样只剩 2 条
  const matches = await stack.api('/api/v1/matches?recordStatus=ACTIVE')
  assert.equal(matches.json.total, 2)
  assert.ok(matches.json.data.every(m => m.playerId === 'p-legit'))

  // F06：造默认值清 NULL
  const seedPlayer = (await stack.pool.query(`SELECT rank_score, rank_text FROM players WHERE id='p-seed'`)).rows[0]
  assert.equal(seedPlayer.rank_score, null)
  assert.equal(seedPlayer.rank_text, null)

  // F09：datatft 快照编造口径清 NULL；hokace 真实快照保持原样
  const dt = (await stack.pool.query(`SELECT tier, window_text, scope, snapshot_version, avg_rank FROM lineup_snapshots WHERE id='lu-dt-1'`)).rows[0]
  assert.equal(dt.tier, null); assert.equal(dt.window_text, null)
  assert.equal(dt.scope, null); assert.equal(dt.snapshot_version, null); assert.equal(dt.avg_rank, null)
  const real = (await stack.pool.query(`SELECT tier, avg_rank FROM lineup_snapshots WHERE id='lu-real-1'`)).rows[0]
  assert.equal(real.tier, null, '真实快照 tier 本来就未公布（null 保持 null）')
  assert.equal(Number(real.avg_rank), 3.9)

  // 连带隔离：测试场次与存证
  const evt = (await stack.pool.query(`SELECT status FROM events WHERE id='evt-test'`)).rows[0]
  const evd = (await stack.pool.query(`SELECT status FROM evidences WHERE id='ev-v06-test'`)).rows[0]
  assert.equal(evt.status, 'QUARANTINED')
  assert.equal(evd.status, 'QUARANTINED')
  const legitEvd = (await stack.pool.query(`SELECT status FROM evidences WHERE id='ev-v06-legit'`)).rows[0]
  assert.equal(legitEvd.status, 'VERIFIED', '真实证据不受连带影响')
})

test('V06: 回滚按备份整行还原 → 污染现场完全复原（含造默认值恢复）', { skip: !pgAvailable }, async () => {
  const stdout = await runTool('rollback_quarantine.mjs', ['--db', DB, '--yes'])
  assert.match(stdout, /回滚/)

  // 状态与计数复原
  assert.equal(await effectiveN('p-legit'), 3)
  assert.equal(await effectiveN('p-seed'), 3, '回滚后合成批恢复整改前状态（回滚 = 时光机，不是清理）')
  assert.equal(await effectiveN('p-camp'), 2)
  assert.equal(await effectiveN('p-audit'), 1)
  assert.equal(await countRows(stack.pool, 'matches'), 9)

  const seedPlayer = (await stack.pool.query(`SELECT rank_score, rank_text FROM players WHERE id='p-seed'`)).rows[0]
  assert.equal(seedPlayer.rank_score, 10000, '整行还原包含被清 NULL 的字段')
  assert.equal(seedPlayer.rank_text, '最强王者')
})
