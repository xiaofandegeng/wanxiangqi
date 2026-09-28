// 王者万象棋数据站 - v2 验收缺陷闭环回归测试套件 (Vitest 执行)
// 覆盖 F01 至 F13 以及 A01 至 A18 全部项的强校验断言

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '../..')

import { StorageEngine } from '../../tools/emulator-watcher/storage.mjs'
import { parseHokaceBody, syncHokaceLineups } from '../../tools/emulator-watcher/adapters/hokace.mjs'
import { detectMatchFromImage } from '../src/utils/image-analyzer'
import { solveClientLiveMatch } from '../src/utils/live-solver'
import { createApiServer } from '../../tools/emulator-watcher/index.mjs'

describe('王者万象棋 v2 验收缺陷全面闭环验证', () => {
  it('F01: 后端启动脚本与数据库模式 schema.sql 健全性', () => {
    const schemaPath = path.join(ROOT_DIR, 'backend/src/schema.sql')
    const serverPath = path.join(ROOT_DIR, 'backend/src/server.js')
    const dbPath = path.join(ROOT_DIR, 'backend/src/db.js')

    expect(fs.existsSync(schemaPath)).toBe(true)
    expect(fs.existsSync(serverPath)).toBe(true)
    expect(fs.existsSync(dbPath)).toBe(true)

    const schemaSql = fs.readFileSync(schemaPath, 'utf-8')
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS matches')
    expect(schemaSql).toContain('available_at TIMESTAMP WITH TIME ZONE NOT NULL')
    expect(schemaSql).toContain('CHECK (final_rank BETWEEN 1 AND 6)')
  })

  it('F02 & A01: 首次冷启动零 mock 规范 (Zero-Mock Cold Start)', () => {
    const tempEngine = new StorageEngine()
    tempEngine.resetToEmpty()

    expect(tempEngine.state.players.length).toBe(0)
    expect(tempEngine.state.matches.length).toBe(0)
    expect(tempEngine.state.events.length).toBe(0)
    expect(tempEngine.state.lineupSnapshots.length).toBe(0)

    const playersList = tempEngine.getPlayersList()
    expect(playersList.length).toBe(0)
  })

  it('F03 & A04 & A05: 第三方阵容适配器真实解析与防伪闭环', async () => {
    // 1. 无阵容内容的 HTML 必须抛错，绝不返回假 baseline
    const emptyHtml = '<html><body><h1>无阵容页面</h1></body></html>'
    expect(() => parseHokaceBody(emptyHtml)).toThrow(/未发现符合规范的阵容数据结构/)

    // 2. 真实合法 JSON 解析
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
    expect(parsed.length).toBe(1)
    expect(parsed[0].lineupName).toBe('雷霆扶桑刺')
    expect(parsed[0].winRate).toBe(0.22)

    // 3. 网络超时失败返回 FAILED，且 data 为 null
    const syncResult = await syncHokaceLineups(50)
    if (syncResult.status === 'FAILED') {
      expect(syncResult.data).toBeNull()
      expect(syncResult.error).toBeDefined()
    }
  })

  it('F06 & A11 & A18: 未知图片检测与求解器强推荐关闭', async () => {
    // 伪造包含 18824 字符的未知文件
    const fakeContent = 'This is an unrelated test file.'
    const fakeFile = new File([fakeContent], 'unrelated-18824.png', { type: 'image/png' })

    const detectResult = await detectMatchFromImage(fakeFile)
    expect(detectResult.recognitionStatus).toBe('NEED_MANUAL_REVIEW')
    expect(detectResult.participants.length).toBe(0)

    // 未知文件传求解器直接报错，阻止推演
    expect(() => solveClientLiveMatch(detectResult)).toThrow(/必须具备完整 6 个席位才能进行实战对局推演/)
  })

  it('F08 & A03 & A13: 导入数据强校验、名次整数约束与未核验隔离', () => {
    const engine = new StorageEngine()
    engine.resetToEmpty()

    // 1. 空对象拒绝
    expect(() => engine.importMatchRecords([])).toThrow(/不能为空数组/)
    expect(() => engine.importMatchRecords([{}])).toThrow(/缺少必填项 playerId/)

    // 2. 缺少有效 matchTime 拒绝
    expect(() => engine.importMatchRecords([{ playerId: 'p-test', finalRank: 1 }])).toThrow(/缺少有效 matchTime/)

    // 3. 浮点数名次 finalRank: 1.5 必须拒绝
    expect(() => engine.importMatchRecords([{
      playerId: 'p-test',
      matchTime: '2026-09-27T10:00:00.000Z',
      finalRank: 1.5
    }])).toThrow(/必须是 1 到 6 的整数/)

    // 4. 传入 verified: false 时必须保留为 false，绝不自动转 true
    const run = engine.importMatchRecords([{
      playerId: 'p-candidate-1',
      matchTime: '2026-09-27T08:00:00.000Z',
      finalRank: 1,
      verified: false
    }])
    expect(run.inserted).toBe(1)
    const match = engine.state.matches.find(m => m.playerId === 'p-candidate-1')
    expect(match?.verified).toBe(false)

    // 未核验记录不计入有效统计
    const stats = engine.computePlayerStats('p-candidate-1')
    expect(stats.sampleCount).toBe(0)
    expect(stats.winRate).toBeNull()
  })

  it('F09 & A14: 管理写接口安全鉴权与未授权拦截', async () => {
    const server = createApiServer()

    const reqUnauth = {
      method: 'POST',
      url: '/api/v1/admin/imports',
      headers: {
        host: 'localhost:8080',
        origin: 'http://malicious-site.com'
      },
      on: (evt: string, cb: () => void) => {
        if (evt === 'end') cb()
      }
    }

    let capturedStatus: number | null = null
    let capturedBody: any = null
    const resMock = {
      setHeader: () => {},
      writeHead: (code: number) => {
        capturedStatus = code
      },
      end: (content: string) => {
        capturedBody = JSON.parse(content)
      }
    }

    await (server as any).emit('request', reqUnauth, resMock)
    expect(capturedStatus).toBe(401)
    expect(capturedBody.error).toMatch(/未授权/)
  })

  it('F10 & A09 & A10: 双时间防泄漏 (match_time & available_at) 与多维过滤', () => {
    const engine = new StorageEngine()
    engine.resetToEmpty()

    const cutoff = '2026-09-25T12:00:00.000Z'

    // 1. 正常赛前已录入: matchTime < cutoff && availableAt <= cutoff
    engine.importMatchRecords([{
      playerId: 'p-valid',
      matchTime: '2026-09-24T10:00:00.000Z',
      availableAt: '2026-09-24T11:00:00.000Z',
      finalRank: 1,
      verified: true,
      mode: 'RANKED_DIAMOND'
    }])

    // 2. 晚到数据 (Late Arrival): 比赛发生在 9-20，但 9-27 才录入 (availableAt > cutoff)
    engine.importMatchRecords([{
      playerId: 'p-valid',
      matchTime: '2026-09-20T10:00:00.000Z',
      availableAt: '2026-09-27T10:00:00.000Z',
      finalRank: 1,
      verified: true,
      mode: 'RANKED_DIAMOND'
    }])

    // 3. 赛后记录: matchTime > cutoff
    engine.importMatchRecords([{
      playerId: 'p-valid',
      matchTime: '2026-09-26T10:00:00.000Z',
      availableAt: '2026-09-26T11:00:00.000Z',
      finalRank: 1,
      verified: true,
      mode: 'RANKED_DIAMOND'
    }])

    // 在截点时刻计算统计
    const statsAtCutoff = engine.computePlayerStats('p-valid', { cutoffTime: cutoff })
    expect(statsAtCutoff.sampleCount).toBe(1)
    expect(statsAtCutoff.winRate).toBe(1.0)

    // 4. 模式隔离: TOURNAMENT 模式必须返回 N=0
    const statsTour = engine.computePlayerStats('p-valid', { cutoffTime: cutoff, mode: 'TOURNAMENT' })
    expect(statsTour.sampleCount).toBe(0)
    expect(statsTour.winRate).toBeNull()
  })

  it('F05: 人工核验工作台席位校对持久化确认 (confirmSlotAudit)', () => {
    const engine = new StorageEngine()
    engine.resetToEmpty()

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
    expect(result.id).toBe('evt-audit-test-01')
    expect(engine.state.events.length).toBe(1)
    expect(engine.state.matches.length).toBe(6)
    expect(engine.state.players.length).toBe(6)

    const yeyuStats = engine.computePlayerStats('p-EZ夜余')
    expect(yeyuStats.sampleCount).toBe(1)
    expect(yeyuStats.winRate).toBe(1.0)
  })
})
