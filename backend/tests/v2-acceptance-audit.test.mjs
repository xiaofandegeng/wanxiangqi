// 王者万象棋数据站 - 后端回归与数据库表结构测试 (backend/npm test)
// v3 P0-A 测试隔离改造：
//   - 所有 StorageEngine 实例一律绑定 mkdtemp 临时目录（helpers/tmp-store.mjs）
//   - 套件前后对业务 storage.json 哈希与业务库七表计数做护栏断言（V01 雏形）
//   - 测试不再 import 任何会写业务路径的单例
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '../..')

import { parseHokaceBody, syncHokaceLineups } from '../../tools/emulator-watcher/adapters/hokace.mjs'
import { createApiServer } from '../../tools/emulator-watcher/index.mjs'
import { makeTmpStore } from './helpers/tmp-store.mjs'
import { captureBusinessBaseline, assertBusinessUntouched } from './helpers/business-guard.mjs'

// ---- 业务资产护栏：套件级 before/after（V01 雏形）----
let businessBaseline = null

before(async () => {
  businessBaseline = await captureBusinessBaseline()
  console.log('[business-guard] 基线已采集: file sha256 =', businessBaseline.fileSha256?.slice(0, 16), '…')
})

after(async () => {
  await assertBusinessUntouched(businessBaseline)
  console.log('[business-guard] ✔ 业务 storage.json 与业务库计数在整轮测试中未被触碰')
})

test('F01: 后端启动脚本与数据库模式 schema.sql 健全性', async () => {
  const schemaPath = path.join(ROOT_DIR, 'backend/src/schema.sql')
  const serverPath = path.join(ROOT_DIR, 'backend/src/server.js')
  const dbPath = path.join(ROOT_DIR, 'backend/src/db.js')

  assert.ok(fs.existsSync(schemaPath), 'schema.sql 文件必须存在')
  assert.ok(fs.existsSync(serverPath), 'server.js 必须存在以支持 npm start')
  assert.ok(fs.existsSync(dbPath), 'db.js 数据库接入层必须存在')

  const schemaSql = fs.readFileSync(schemaPath, 'utf-8')
  assert.match(schemaSql, /CREATE TABLE IF NOT EXISTS matches/, 'schema.sql 必须包含 matches 表')
  assert.match(schemaSql, /available_at TIMESTAMP WITH TIME ZONE NOT NULL/, 'matches 必须包含 available_at 双截点字段')
  assert.match(schemaSql, /CHECK \(final_rank BETWEEN 1 AND 6\)/, 'matches 必须包含 final_rank 整数范围约束')
})

test('F02 & A01: 首次冷启动零 mock 规范 (Zero-Mock Cold Start)', async (t) => {
  const { engine, dataDir, cleanup } = makeTmpStore()
  t.after(cleanup)

  // 临时目录全新实例即为冷启动空库，无需（也不应）resetToEmpty 业务路径
  assert.equal(dataDir.includes(process.cwd()), false, '测试实例必须位于系统临时目录')
  assert.equal(engine.state.players.length, 0, '冷启动事实库选手数量必须为 0')
  assert.equal(engine.state.matches.length, 0, '冷启动事实库对局数量必须为 0')
  assert.equal(engine.state.events.length, 0, '冷启动事实库对决事件数量必须为 0')
  assert.equal(engine.state.lineupSnapshots.length, 0, '冷启动第三方阵容快照必须为空')

  const playersList = engine.getPlayersList()
  assert.equal(playersList.length, 0, '冷启动 getPlayersList() 必须返回空列表')

  // 冷启动零副作用：未发生业务动作前不得有任何落盘文件
  assert.equal(fs.existsSync(path.join(dataDir, 'storage.json')), false, '冷启动（纯读）不得自动创建 storage.json')
})

test('F03 & A04 & A05: 第三方阵容适配器真实解析与防伪闭环', async () => {
  const emptyHtml = '<html><body><h1>无阵容页面</h1></body></html>'
  assert.throws(() => {
    parseHokaceBody(emptyHtml)
  }, /未发现符合规范的阵容数据结构/)

  const validJson = JSON.stringify([
    {
      lineupName: '雷霆扶桑刺',
      tier: 'T1',
      commander: '司空震',
      coreHeroes: ['司空震', '不知火舞'],
      sampleCount: 12000,
      winRate: 0.22,
      top3Rate: 0.58,
      avgRank: 3.1
    }
  ])
  const parsed = parseHokaceBody(validJson)
  assert.equal(parsed.length, 1)
  assert.equal(parsed[0].lineupName, '雷霆扶桑刺')
  assert.equal(parsed[0].winRate, 0.22)

  const syncResult = await syncHokaceLineups(50)
  if (syncResult.status === 'FAILED') {
    assert.equal(syncResult.data, null)
    assert.ok(syncResult.error)
  }
})

test('F08 & A03 & A13: 导入数据强校验、名次整数约束与未核验隔离', (t) => {
  const { engine, cleanup } = makeTmpStore()
  t.after(cleanup)

  assert.throws(() => {
    engine.importMatchRecords([])
  }, /不能为空数组/)

  assert.throws(() => {
    engine.importMatchRecords([{}])
  }, /缺少必填项 playerId/)

  assert.throws(() => {
    engine.importMatchRecords([{ playerId: 'p-test', finalRank: 1 }])
  }, /缺少有效 matchTime/)

  assert.throws(() => {
    engine.importMatchRecords([{
      playerId: 'p-test',
      matchTime: '2026-09-27T10:00:00.000Z',
      finalRank: 1.5
    }])
  }, /必须是 1 到 6 的整数/)

  const run = engine.importMatchRecords([{
    playerId: 'p-candidate-1',
    matchTime: '2026-09-27T08:00:00.000Z',
    finalRank: 1,
    verified: false
  }])
  assert.equal(run.inserted, 1)
  const candidateMatch = engine.state.matches.find(m => m.playerId === 'p-candidate-1')
  assert.equal(candidateMatch.verified, false)

  const candidateStats = engine.computePlayerStats('p-candidate-1')
  assert.equal(candidateStats.sampleCount, 0)
  assert.equal(candidateStats.winRate, null)
})

test('F09 & A14: 管理写接口安全鉴权与未授权拦截', async () => {
  const server = createApiServer()

  const reqUnauth = {
    method: 'POST',
    url: '/api/v1/admin/imports',
    headers: {
      host: 'localhost:8080',
      origin: 'http://malicious-site.com'
    },
    on: (evt, cb) => {
      if (evt === 'end') cb()
    }
  }

  let capturedStatus = null
  let capturedBody = null
  const resMock = {
    setHeader: () => {},
    writeHead: (code, headers) => {
      capturedStatus = code
    },
    end: (content) => {
      capturedBody = JSON.parse(content)
    }
  }

  await server.emit('request', reqUnauth, resMock)
  assert.equal(capturedStatus, 401)
  assert.match(capturedBody.error, /未授权/)
})

test('F10 & A09 & A10: 双时间防泄漏 (match_time & available_at) 与多维过滤', (t) => {
  const { engine, cleanup } = makeTmpStore()
  t.after(cleanup)

  const cutoff = '2026-09-25T12:00:00.000Z'

  engine.importMatchRecords([{
    playerId: 'p-valid',
    matchTime: '2026-09-24T10:00:00.000Z',
    availableAt: '2026-09-24T11:00:00.000Z',
    finalRank: 1,
    verified: true,
    mode: 'RANKED_DIAMOND'
  }])

  // 晚到数据：matchTime 早于截点，但 availableAt 晚于截点 → 必须剔除
  engine.importMatchRecords([{
    playerId: 'p-valid',
    matchTime: '2026-09-20T10:00:00.000Z',
    availableAt: '2026-09-27T10:00:00.000Z',
    finalRank: 1,
    verified: true,
    mode: 'RANKED_DIAMOND'
  }])

  // 未来数据：matchTime 晚于截点 → 必须剔除
  engine.importMatchRecords([{
    playerId: 'p-valid',
    matchTime: '2026-09-26T10:00:00.000Z',
    availableAt: '2026-09-26T11:00:00.000Z',
    finalRank: 1,
    verified: true,
    mode: 'RANKED_DIAMOND'
  }])

  const statsAtCutoff = engine.computePlayerStats('p-valid', { cutoffTime: cutoff })
  assert.equal(statsAtCutoff.sampleCount, 1)
  assert.equal(statsAtCutoff.winRate, 1.0)

  const statsTournament = engine.computePlayerStats('p-valid', { cutoffTime: cutoff, mode: 'TOURNAMENT' })
  assert.equal(statsTournament.sampleCount, 0)
  assert.equal(statsTournament.winRate, null)
})

test('V12 边界专项: availableAt 缺失不回退、availableAt=cutoff 纳入、matchTime=cutoff 排除、[from,to) 窗口', (t) => {
  const { engine, cleanup } = makeTmpStore()
  t.after(cleanup)

  const cutoff = '2026-09-25T12:00:00.000Z'

  // availableAt 缺失 + 指定 cutoff → 排除（禁止回退 matchTime）
  engine.importMatchRecords([{
    playerId: 'p-edge',
    matchTime: '2026-09-24T10:00:00.000Z',
    finalRank: 1,
    verified: true,
    mode: 'RANKED_DIAMOND'
  }])
  assert.equal(engine.computePlayerStats('p-edge', { cutoffTime: cutoff }).sampleCount, 0,
    'availableAt 缺失且指定截点时必须排除，不得回退 matchTime')

  // 无 cutoff 时 availableAt 缺失不参与截点过滤，可正常统计
  assert.equal(engine.computePlayerStats('p-edge').sampleCount, 1,
    '未指定截点时 availableAt 缺失不应影响统计')

  // availableAt === cutoff → 纳入；matchTime === cutoff → 排除
  engine.importMatchRecords([{
    playerId: 'p-edge2',
    matchTime: '2026-09-24T10:00:00.000Z',
    availableAt: cutoff, // 恰好等于截点
    finalRank: 2,
    verified: true,
    mode: 'RANKED_DIAMOND'
  }])
  engine.importMatchRecords([{
    playerId: 'p-edge3',
    matchTime: cutoff, // 恰好等于截点
    availableAt: '2026-09-25T11:00:00.000Z',
    finalRank: 3,
    verified: true,
    mode: 'RANKED_DIAMOND'
  }])
  assert.equal(engine.computePlayerStats('p-edge2', { cutoffTime: cutoff }).sampleCount, 1,
    'availableAt === cutoff 的记录在截点时刻已可知，必须纳入')
  assert.equal(engine.computePlayerStats('p-edge3', { cutoffTime: cutoff }).sampleCount, 0,
    'matchTime === cutoff 的记录尚未完赛，必须排除')

  // 窗口 [from, to)：to 端点排除
  engine.importMatchRecords([{
    playerId: 'p-window',
    matchTime: '2026-09-24T10:00:00.000Z',
    availableAt: '2026-09-24T10:05:00.000Z',
    finalRank: 1,
    verified: true,
    mode: 'RANKED_DIAMOND'
  }])
  engine.importMatchRecords([{
    playerId: 'p-window',
    matchTime: '2026-09-25T10:00:00.000Z',
    availableAt: '2026-09-25T10:05:00.000Z',
    finalRank: 1,
    verified: true,
    mode: 'RANKED_DIAMOND'
  }])
  const windowStats = engine.computePlayerStats('p-window', { from: '2026-09-24T00:00:00.000Z', to: '2026-09-25T10:00:00.000Z' })
  assert.equal(windowStats.sampleCount, 1, '时间窗口为 [from, to)，to 端点必须排除')
})

test('F05: 人工核验工作台席位校对持久化确认 (confirmSlotAudit)', (t) => {
  const { engine, cleanup } = makeTmpStore()
  t.after(cleanup)

  const auditPayload = {
    eventId: 'evt-audit-test-01',
    title: '实战核验场次',
    scheduledAt: '2026-09-27T10:00:00.000Z',
    mode: 'RANKED_DIAMOND',
    evidenceSha256: 'e4ea43a1b70ad626d5e5508684d5de3d9bf1eb12265ca703a3fb45c2ec4bfa82',
    slots: [
      { slot: 1, nickname: 'EZ夜余', rankScore: 18824, odds: 1.8, finalRank: 1, commander: '弈星', lineup: '九五之尊' },
      { slot: 2, nickname: 'DY校长神Gin', rankScore: 12091, odds: 7.1, finalRank: 2, commander: '司空震', lineup: '雷霆扶桑刺' },
      { slot: 3, nickname: '抖音李由多', rankScore: 10075, odds: 10.2, finalRank: 3, commander: '司空震', lineup: '扶桑法刺' },
      { slot: 4, nickname: '抖音EGM皮皮鲨', rankScore: 10054, odds: 10.1, finalRank: 4, commander: '庄周', lineup: '玄雍重坦防刺' },
      { slot: 5, nickname: '想k益笙菌', rankScore: 9996, odds: 10.5, finalRank: 5, commander: '诸葛亮', lineup: '稷下群雄大招流' },
      { slot: 6, nickname: 'B站小优律', rankScore: 9961, odds: 10.3, finalRank: 6, commander: '公孙离', lineup: '尧天公孙离射手' }
    ]
  }

  const result = engine.confirmSlotAudit(auditPayload)
  assert.equal(result.id, 'evt-audit-test-01')
  assert.equal(engine.state.events.length, 1)
  assert.equal(engine.state.matches.length, 6)
  assert.equal(engine.state.players.length, 6)

  const yeyuStats = engine.computePlayerStats('p-EZ夜余')
  assert.equal(yeyuStats.sampleCount, 1)
  assert.equal(yeyuStats.winRate, 1.0)
})
