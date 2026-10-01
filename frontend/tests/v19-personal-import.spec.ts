// V19 · 单人真实战绩导入页（v4 W2）七段流程与铁律断言
// 任务书 W2：上传 ≠ 核验；单人导入不要求其余五席；可选字段留空=null；
//           recordKey 恒 ev:证据编号:材料内序号；表单不发送 availableAt；
//           驳回仅提交前（移除候选 + 原因留界面日志，不落库）。
// 以真实组件挂载（happy-dom + mock API 层）断言交互流。

// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { createApp } from 'vue'
import PersonalImport from '../src/views/personal-evidence-import.vue'

const mocks = vi.hoisted(() => {
  class AdminTokenMissingError extends Error {}
  return {
    AdminTokenMissingError,
    tokenConfigured: true,
    evidence: null as any,
    evidenceAfterVerify: null as any,
    players: [] as any[],
    pendingRows: [] as any[],
    importCalls: [] as any[],
    verifyMatchCalls: [] as any[],
    verifyEvidenceCalls: [] as any[]
  }
})

vi.mock('../src/api', () => ({
  setAdminToken: vi.fn(),
  hasAdminToken: () => mocks.tokenConfigured,
  AdminTokenMissingError: mocks.AdminTokenMissingError,
  uploadEvidence: vi.fn(async () => ({
    evidenceId: mocks.evidence.id,
    deduplicated: false,
    evidence: mocks.evidence
  })),
  verifyEvidence: vi.fn(async (id: string, verifiedBy: string) => {
    mocks.verifyEvidenceCalls.push({ id, verifiedBy })
    return mocks.evidenceAfterVerify
  }),
  fetchEvidenceObjectUrl: vi.fn(async () => 'blob:preview-not-real'),
  fetchPlayersList: vi.fn(async () => ({
    players: mocks.players,
    total: mocks.players.length,
    dataAsOf: '2026-09-30T00:00:00Z'
  })),
  importMatchRecords: vi.fn(async (records: any[], source: string) => {
    mocks.importCalls.push({ records, source })
    // 模拟服务端事实：提交的候选以 PENDING wire 行进入待核验台账
    for (const rec of records) {
      mocks.pendingRows.push({
        id: `mh-new-${rec.slot}`, playerId: rec.playerId, matchTime: rec.matchTime,
        availableAt: '2026-09-30T10:00:00Z', mode: rec.mode ?? null, finalRank: rec.finalRank,
        commander: rec.commander ?? null, lineup: rec.lineup ?? null,
        roundsSurvived: rec.roundsSurvived ?? null,
        verified: false, evidenceId: rec.evidenceId, recordStatus: 'PENDING',
        recordKey: `ev:${rec.evidenceId}:${rec.slot}`, revision: rec.revision,
        evidenceLocator: rec.evidenceLocator ?? null
      })
    }
    return { batchId: 'batch-v19', inserted: records.length, duplicates: 0, superseded: 0 }
  }),
  // 与真实 API 一致：每次返回全新数组（引用变化才能触发视图响应式更新）
  fetchAdminMatches: vi.fn(async () => ({ total: mocks.pendingRows.length, data: [...mocks.pendingRows] })),
  verifyMatch: vi.fn(async (matchId: string, body: any) => {
    mocks.verifyMatchCalls.push({ matchId, body })
    return { ...mocks.pendingRows.find(r => r.id === matchId), recordStatus: 'ACTIVE', revision: 2 }
  })
}))

function pendingEvidence() {
  return {
    id: 'ev-v19-personal', sha256: 'f'.repeat(64), sourceId: 'src-manual-review',
    kind: 'PERSONAL_SCREENSHOT', status: 'PENDING',
    capturedAt: '2026-09-30T08:00:00Z', verifiedAt: null, verifiedBy: null,
    providedBy: 'v19-self', usageScope: 'INTERNAL_ONLY', note: null,
    hasOriginal: true, mimeType: 'image/png', sizeBytes: 64, storageUri: 'pg:evidence_blobs:sha-ffffffffffffffff'
  }
}

function verifiedEvidence() {
  return {
    ...pendingEvidence(),
    status: 'VERIFIED',
    verifiedAt: '2026-09-30T08:05:00Z',
    verifiedBy: 'v19-staff'
  }
}

async function mountView(): Promise<{ dom: HTMLElement; unmount: () => void }> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(PersonalImport)
  app.mount(host)
  await new Promise(r => setTimeout(r, 0))
  await new Promise(r => setTimeout(r, 0))
  return { dom: host, unmount: () => app.unmount() }
}

/** happy-dom 下向 <input type=file> 注入 File 并触发 change（真实走组件 handleFileChange） */
function setFile(input: HTMLInputElement, file: File) {
  const dt = new DataTransfer()
  dt.items.add(file)
  input.files = dt.files
  input.dispatchEvent(new Event('change'))
}

async function tick() {
  await new Promise(r => setTimeout(r, 0))
  await new Promise(r => setTimeout(r, 0))
}

/**
 * 向原生控件写值并驱动 v-model 同步。
 * 关键：赋值/派发后必须让出事件循环（宏任务），等 Vue 的微任务渲染队列刷新——
 * 否则依赖该值的按钮 disabled 在 DOM 上仍是旧值，happy-dom 对禁用按钮的 click()
 * 按规范是 no-op，后续交互会被静默吞掉。
 */
async function setVal(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise(r => setTimeout(r, 0))
}

async function setChecked(input: HTMLInputElement, checked: boolean) {
  input.checked = checked
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await new Promise(r => setTimeout(r, 0))
}

describe('V19: 单人真实战绩导入页七段流程', () => {
  it('A: 上传→PENDING 门禁——材料未人工确认前，提交被禁用（上传 ≠ 核验）', async () => {
    mocks.evidence = pendingEvidence()
    mocks.evidenceAfterVerify = null
    mocks.players = []
    mocks.pendingRows = []
    mocks.importCalls = []

    const { dom, unmount } = await mountView()
    try {
      setFile(
        dom.querySelector('input[type=file]') as HTMLInputElement,
        new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'personal.png', { type: 'image/png' })
      )
      await tick()

      const text = dom.textContent || ''
      expect(text).toContain('ev-v19-personal')
      expect(text).toContain('待人工确认（PENDING）')

      // PENDING 材料下：提交按钮禁用（证据链未闭合）
      const submitBtn = Array.from(dom.querySelectorAll('button')).find(
        b => (b.textContent || '').includes('提交') && (b.textContent || '').includes('候选')
      )
      expect(submitBtn).toBeTruthy()
      expect((submitBtn as HTMLButtonElement).disabled).toBe(true)
      expect(mocks.importCalls.length).toBe(0)
    } finally {
      unmount()
    }
  })

  it('B: 全流程——确认材料→身份核对(同名告警)→候选行→提交载荷铁律→待核验放行', async () => {
    mocks.evidence = pendingEvidence()
    mocks.evidenceAfterVerify = verifiedEvidence()
    mocks.players = [
      { id: 'p-v19-me', nickname: 'V19当前档案名' }, // 同 ID 档案名与材料不一致 → 需显式确认
      { id: 'p-v19-other', nickname: 'V19同名选手' } // 同名他人 → 告警
    ]
    mocks.pendingRows = [
      {
        id: 'mh-v19-1', playerId: 'p-v19-me', matchTime: '2026-09-29T13:40:00.000Z',
        availableAt: '2026-09-30T09:00:00Z', mode: null, finalRank: 2,
        verified: false, evidenceId: 'ev-v19-personal', recordStatus: 'PENDING',
        recordKey: 'ev:ev-v19-personal:2', revision: 1, evidenceLocator: null
      }
    ]
    mocks.importCalls = []
    mocks.verifyMatchCalls = []
    mocks.verifyEvidenceCalls = []

    const { dom, unmount } = await mountView()
    const byText = (needle: string) =>
      Array.from(dom.querySelectorAll('button')).find(b => (b.textContent || '').includes(needle))

    try {
      // ① 上传
      setFile(
        dom.querySelector('input[type=file]') as HTMLInputElement,
        new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'personal.png', { type: 'image/png' })
      )
      await tick()

      // ③ 操作人 + 确认材料有效（PENDING → VERIFIED）
      const operatorInput = dom.querySelector('.operator-col input') as HTMLInputElement
      await setVal(operatorInput, 'v19-staff')
      ;(byText('确认材料有效') as HTMLButtonElement).click()
      await tick()
      expect(mocks.verifyEvidenceCalls).toEqual([{ id: 'ev-v19-personal', verifiedBy: 'v19-staff' }])
      expect(dom.textContent).toContain('已确认有效')

      // ④ 身份：材料昵称与档案名不一致 + 存在同名他人 → 两条警示
      const [pidInput, nickInput] = Array.from(dom.querySelectorAll('.identity-row input')) as HTMLInputElement[]
      await setVal(pidInput, 'p-v19-me')
      await setVal(nickInput, 'V19同名选手')
      ;(byText('在选手库核对身份') as HTMLButtonElement).click()
      await tick()

      const text1 = dom.textContent || ''
      expect(text1).toContain('V19当前档案名')
      expect(text1).toContain('p-v19-other')
      expect(text1).toContain('1 位同名昵称选手')

      // 不一致未确认前仍不可提交
      const submitBtn = () =>
        Array.from(dom.querySelectorAll('button')).find(b => (b.textContent || '').includes('候选（PENDING）')) as HTMLButtonElement
      expect(submitBtn().disabled).toBe(true)

      const confirmBox = dom.querySelector('.confirm-check input') as HTMLInputElement
      await setChecked(confirmBox, true)

      // ⑤ 添加一局候选：时间/名次必填，可选字段留空（=null）
      ;(byText('按材料添加一局') as HTMLButtonElement).click()
      await tick()
      const timeInput = dom.querySelector('.candidate-table input[type=datetime-local]') as HTMLInputElement
      await setVal(timeInput, '2026-09-29T21:40')
      const rankInput = dom.querySelector('.candidate-table input[type=number]') as HTMLInputElement
      await setVal(rankInput, '3')
      await tick()

      // ⑥ 提交：载荷铁律断言
      expect(submitBtn().disabled).toBe(false)
      submitBtn().click()
      await tick()

      expect(mocks.importCalls.length).toBe(1)
      const { records, source } = mocks.importCalls[0]
      expect(source).toBe('PERSONAL_IMPORT')
      expect(records.length).toBe(1)
      expect(records[0]).toEqual({
        playerId: 'p-v19-me',
        nickname: 'V19同名选手',
        matchTime: new Date('2026-09-29T21:40').toISOString(),
        finalRank: 3,
        mode: null,
        commander: null,
        lineup: null,
        roundsSurvived: null,
        evidenceId: 'ev-v19-personal',
        slot: 1,
        evidenceLocator: null,
        revision: 1
      })
      expect('availableAt' in records[0]).toBe(false)
      expect('verified' in records[0]).toBe(false)

      // ⑦ 待核验台账渲染 + 逐条放行（verifiedBy + evidenceId 绑定）
      const text2 = dom.textContent || ''
      expect(text2).toContain('ev:ev-v19-personal:1')
      ;(byText('确认核验放行') as HTMLButtonElement).click()
      await tick()
      expect(mocks.verifyMatchCalls).toEqual([
        { matchId: 'mh-v19-1', body: { verifiedBy: 'v19-staff', evidenceId: 'ev-v19-personal' } }
      ])
    } finally {
      unmount()
    }
  })

  it('C: 更正警示与驳回——已存在同键候选时提交 revision+1；驳回移除候选并留界面日志', async () => {
    mocks.evidence = verifiedEvidence()
    mocks.evidenceAfterVerify = verifiedEvidence()
    mocks.players = [{ id: 'p-v19-me', nickname: 'V19本人' }]
    mocks.pendingRows = [
      {
        id: 'mh-v19-old', playerId: 'p-v19-me', matchTime: '2026-09-29T09:00:00.000Z',
        availableAt: '2026-09-30T09:00:00Z', mode: null, finalRank: 4,
        verified: false, evidenceId: 'ev-v19-personal', recordStatus: 'PENDING',
        recordKey: 'ev:ev-v19-personal:1', revision: 1, evidenceLocator: null
      }
    ]
    mocks.importCalls = []

    const { dom, unmount } = await mountView()
    const byText = (needle: string) =>
      Array.from(dom.querySelectorAll('button')).find(b => (b.textContent || '').includes(needle))

    try {
      setFile(
        dom.querySelector('input[type=file]') as HTMLInputElement,
        new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'personal.png', { type: 'image/png' })
      )
      await tick()
      // 已 VERIFIED 的去重材料：直接可录候选（材料状态如实回显）
      expect(dom.textContent).toContain('已确认有效')

      const [pidInput, nickInput] = Array.from(dom.querySelectorAll('.identity-row input')) as HTMLInputElement[]
      await setVal(pidInput, 'p-v19-me')
      await setVal(nickInput, 'V19本人')
      ;(byText('在选手库核对身份') as HTMLButtonElement).click()
      await tick()

      // 两行：第一行与已存在键相同（更正 → revision 2），第二行驳回
      ;(byText('按材料添加一局') as HTMLButtonElement).click()
      ;(byText('按材料添加一局') as HTMLButtonElement).click()
      await tick()

      const timeInputs = Array.from(dom.querySelectorAll('.candidate-table input[type=datetime-local]')) as HTMLInputElement[]
      const rankInputs = Array.from(dom.querySelectorAll('.candidate-table input[type=number]')) as HTMLInputElement[]
      await setVal(timeInputs[0], '2026-09-29T21:30')
      await setVal(rankInputs[0], '4')
      await setVal(timeInputs[1], '2026-09-28T20:00')
      await setVal(rankInputs[1], '6')
      await tick()

      // 更正警示：同键候选存在 → 行内提示
      expect(dom.textContent).toContain('该序号已有候选')

      // 驳回第二行（材料内序号 #2）
      const rejectBtns = Array.from(dom.querySelectorAll('button')).filter(b => (b.textContent || '') === '驳回')
      ;(rejectBtns[1] as HTMLButtonElement).click()
      await tick()
      const reasonInput = dom.querySelector('.reject-reason') as HTMLInputElement
      await setVal(reasonInput, '原件放大后无法辨认时间，作废重录')
      ;(byText('确认驳回') as HTMLButtonElement).click()
      await tick()

      expect(dom.textContent).toContain('本会话驳回日志')
      expect(dom.textContent).toContain('原件放大后无法辨认时间，作废重录')
      // 驳回仅作用于⑤编辑表（含 datetime 输入的表；⑦台账表同名 class，需区分）
      const editRows = Array.from(dom.querySelectorAll('.candidate-table tbody tr')).filter(tr =>
        tr.querySelector('input[type=datetime-local]')
      )
      expect(editRows.length).toBe(1)
      expect(editRows[0].textContent).toContain('#1')
      expect(editRows[0].textContent).not.toContain('#2')

      // 提交：唯一一行对已存在键以 revision 2 更正
      const submitBtn = Array.from(dom.querySelectorAll('button')).find(b => (b.textContent || '').includes('候选（PENDING）')) as HTMLButtonElement
      submitBtn.click()
      await tick()
      expect(mocks.importCalls.length).toBe(1)
      expect(mocks.importCalls[0].records).toEqual([
        expect.objectContaining({ slot: 1, revision: 2, finalRank: 4 })
      ])
    } finally {
      unmount()
    }
  })
})
