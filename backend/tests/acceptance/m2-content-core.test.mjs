// M2 · 内容底座集成验收（M2-1..M2-10）
// 覆盖：版本登记与待复核（A09）、实体/规则/阵容/课程/情境生命周期与发布校验
//（A03/A04：缺章节、无来源、孤立实体、跨版本绑定、先修环、原件缺失全拒绝）、
// 发布/回滚/退役与审核台账同事务、公开 API 新契约（/learn /lessons /catalog
// /mechanics /versions /updates + /lineups 稳定阵容根+快照子对象）、
// 内部材料不公开、快照显式映射、管理鉴权、重启保持。
// 仅触碰独立测试库 wanxiangqi_m2_test。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, reconnectStack, insertEvidenceWithBlob, pgAvailable } from './_helpers.mjs'

let stack = null

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_m2_test')
  // 证据素材：已核验带原件（可公开引用）/ 待核验 / 仅哈希无原件（pre-0005 存量）
  await insertEvidenceWithBlob(stack.pool, {
    id: 'ev-content-1', status: 'VERIFIED', kind: 'CONTENT_ASSET',
    usageScope: 'PUBLIC', note: '官方页面存档（已人工核验）'
  })
  await insertEvidenceWithBlob(stack.pool, {
    id: 'ev-pending-1', status: 'PENDING', kind: 'CONTENT_ASSET'
  })
  await stack.pool.query(
    `INSERT INTO evidences (id, sha256, source_id, captured_at, status, note, kind)
     VALUES ('ev-hashonly', 'deadbeef' || repeat('0', 56), 'src-manual-review',
             '2026-09-01T00:00:00Z', 'VERIFIED', '存量哈希-only 材料', 'CONTENT_ASSET')`)
  // hokace 来源快照（公开口径：READY 来源 + ACTIVE 快照）
  await stack.pool.query(
    `INSERT INTO lineup_snapshots
       (id, source_id, lineup_name, sample_count, win_rate, top3_rate, avg_rank,
        snapshot_version, window_text, scope, structure_key)
     VALUES ('ls-map-1', 'src-hokace-wiki', '测试阵容快照', 120, 0.42, 0.66, 3.2,
             'v2609', '近 7 日实战聚合', '全服王者段位', 'sk-test-1')`)
})

after(async () => {
  if (stack) await stack.cleanup()
})

const T = () => stack.adminToken

test('M2-8: 管理内容接口未授权一律 401（含 GET 台账）', { skip: !pgAvailable }, async () => {
  const anon1 = await stack.api('/api/v1/admin/game-versions')
  assert.equal(anon1.status, 401)
  const anon2 = await stack.api('/api/v1/admin/content/lineups', { method: 'POST', body: { id: 'x' } })
  assert.equal(anon2.status, 401)
  const anon3 = await stack.api('/api/v1/admin/review-log')
  assert.equal(anon3.status, 401)
})

test('M2-1: 版本登记（登记≠激活）→ 激活为当前版本', { skip: !pgAvailable }, async () => {
  const bad = await stack.api('/api/v1/admin/game-versions', {
    method: 'POST', token: T(), body: { versionId: 'v-empty' }
  })
  assert.equal(bad.status, 422, '缺官方依据拒绝')

  const created = await stack.api('/api/v1/admin/game-versions', {
    method: 'POST', token: T(),
    body: { versionId: 'v260901', officialBasis: '官方版本公告存档（ev-content-1）', effectiveAt: '2026-09-24T00:00:00Z' }
  })
  assert.equal(created.status, 201)

  const activated = await stack.api('/api/v1/admin/game-versions/v260901/activate', {
    method: 'POST', token: T(), body: {}
  })
  assert.equal(activated.status, 200)
  assert.equal(activated.json.data.markedCount, 0, '首个版本激活无旧内容可标记')

  const pub = await stack.api('/api/v1/versions')
  assert.equal(pub.status, 200)
  const current = pub.json.data.find(v => v.versionId === 'v260901')
  assert.equal(current.status, 'CURRENT')
})

test('M2-2: 实体资料 —— 无来源拒发布；公开引用必须已核验；修订历史与公开过滤', { skip: !pgAvailable }, async () => {
  const created = await stack.api('/api/v1/admin/content/catalog-entities', {
    method: 'POST', token: T(),
    body: { id: 'hero-test', slug: 'hero-test', kind: 'HERO', displayName: '测试英雄' }
  })
  assert.equal(created.status, 201)
  assert.equal(created.json.data.status, 'DRAFT', '创建即草稿（上传/创建≠发布）')

  const r1 = await stack.api('/api/v1/admin/content/catalog-entities/hero-test/revisions', {
    method: 'POST', token: T(),
    body: { gameVersionId: 'v260901', facts: { skills: [{ name: '技能一', effect: '描述' }] } }
  })
  assert.equal(r1.status, 201)
  const rev1Id = r1.json.data.id

  // 无来源引用 → 拒绝发布
  const noRef = await stack.api(`/api/v1/admin/revisions/catalog-entities/${rev1Id}/publish`, {
    method: 'POST', token: T(), body: {}
  })
  assert.equal(noRef.status, 422)
  assert.equal(noRef.json.code_name, 'NO_REFERENCES')

  // 未核验证据 → 公开引用直接拒绝
  const badRef = await stack.api('/api/v1/admin/content-references', {
    method: 'POST', token: T(),
    body: { contentType: 'CATALOG_ENTITY', contentId: 'hero-test', refKind: 'EVIDENCE',
      refLocator: 'ev-pending-1', usageScope: 'PUBLIC' }
  })
  assert.equal(badRef.status, 422)
  assert.equal(badRef.json.code_name, 'EVIDENCE_NOT_VERIFIED')

  // 已核验证据（PUBLIC）+ 内部 URL（INTERNAL_ONLY）
  const okRef = await stack.api('/api/v1/admin/content-references', {
    method: 'POST', token: T(),
    body: { contentType: 'CATALOG_ENTITY', contentId: 'hero-test', refKind: 'EVIDENCE',
      refLocator: 'ev-content-1', usageScope: 'PUBLIC' }
  })
  assert.equal(okRef.status, 201)
  const internalRef = await stack.api('/api/v1/admin/content-references', {
    method: 'POST', token: T(),
    body: { contentType: 'CATALOG_ENTITY', contentId: 'hero-test', refKind: 'URL',
      refLocator: 'https://internal.example/only-internal', usageScope: 'INTERNAL_ONLY' }
  })
  assert.equal(internalRef.status, 201)

  const submitted = await stack.api(`/api/v1/admin/revisions/catalog-entities/${rev1Id}/submit`, {
    method: 'POST', token: T(), body: {}
  })
  assert.equal(submitted.status, 200)
  assert.equal(submitted.json.data.reviewStatus, 'PENDING_REVIEW')

  const published = await stack.api(`/api/v1/admin/revisions/catalog-entities/${rev1Id}/publish`, {
    method: 'POST', token: T(), body: { reason: '首轮事实入库' }
  })
  assert.equal(published.status, 200)
  assert.equal(published.json.data.reviewStatus, 'PUBLISHED')

  // 发布与台账同事务：PUBLISH 已记录
  const log = await stack.api('/api/v1/admin/review-log?contentType=CATALOG_ENTITY&contentId=hero-test', { token: T() })
  assert.ok(log.json.data.some(l => l.action === 'PUBLISH'))

  // 修订 2 发布 → 修订 1 被取代但历史保留
  const r2 = await stack.api('/api/v1/admin/content/catalog-entities/hero-test/revisions', {
    method: 'POST', token: T(),
    body: { gameVersionId: 'v260901', facts: { skills: [{ name: '技能一', effect: '描述（勘误后）' }] } }
  })
  await stack.api(`/api/v1/admin/revisions/catalog-entities/${r2.json.data.id}/publish`, {
    method: 'POST', token: T(), body: {}
  })
  const detail = await stack.api('/api/v1/admin/content/catalog-entities/hero-test', { token: T() })
  assert.equal(detail.json.data.revisions.length, 2)
  assert.ok(detail.json.data.revisions.find(r => r.revision === 1).supersededAt, '历史发布被标记取代（不删除）')

  // 公开详情：仅 PUBLIC 引用可见（内部材料不公开）
  const pubDetail = await stack.api('/api/v1/catalog/heroes/hero-test')
  assert.equal(pubDetail.status, 200)
  assert.equal(pubDetail.json.data.facts.skills[0].effect, '描述（勘误后）')
  const locators = pubDetail.json.data.references.map(r => r.refLocator)
  assert.ok(locators.includes('ev-content-1'))
  assert.ok(!locators.includes('https://internal.example/only-internal'), 'INTERNAL_ONLY 引用不得出现在公开面')

  const list = await stack.api('/api/v1/catalog?kind=HERO')
  assert.equal(list.json.total, 1)
})

test('M2-2b: 仅哈希无原件的证据 → 发布被原件存在检查拒绝', { skip: !pgAvailable }, async () => {
  await stack.api('/api/v1/admin/content/catalog-entities', {
    method: 'POST', token: T(),
    body: { id: 'hero-hash', slug: 'hero-hash', kind: 'HERO', displayName: '哈希引用英雄' }
  })
  const rev = await stack.api('/api/v1/admin/content/catalog-entities/hero-hash/revisions', {
    method: 'POST', token: T(), body: { gameVersionId: 'v260901', facts: { note: 'x' } }
  })
  await stack.api('/api/v1/admin/content-references', {
    method: 'POST', token: T(),
    body: { contentType: 'CATALOG_ENTITY', contentId: 'hero-hash', refKind: 'EVIDENCE',
      refLocator: 'ev-hashonly', usageScope: 'INTERNAL_ONLY' }
  })
  const rejected = await stack.api(`/api/v1/admin/revisions/catalog-entities/${rev.json.data.id}/publish`, {
    method: 'POST', token: T(), body: {}
  })
  assert.equal(rejected.status, 422)
  assert.equal(rejected.json.code_name, 'ORIGINAL_MISSING', '无原件证据不得支撑发布')
})

test('M2-3: 规则条目 —— 原始说明必填 + 来源引用', { skip: !pgAvailable }, async () => {
  await stack.api('/api/v1/admin/content/mechanics', {
    method: 'POST', token: T(),
    body: { id: 'mech-income', slug: 'income-rules', title: '金币收入规则' }
  })
  const rev = await stack.api('/api/v1/admin/content/mechanics/income-rules/revisions', {
    method: 'POST', token: T(),
    body: { gameVersionId: 'v260901', statementRaw: '来源原文：每回合基础收入 5 金币。',
      params: { base: 5 }, appliesTo: { modes: ['RANKED'] } }
  })
  const noRef = await stack.api(`/api/v1/admin/revisions/mechanics/${rev.json.data.id}/publish`, {
    method: 'POST', token: T(), body: {}
  })
  assert.equal(noRef.status, 422)
  assert.equal(noRef.json.code_name, 'NO_REFERENCES')

  await stack.api('/api/v1/admin/content-references', {
    method: 'POST', token: T(),
    body: { contentType: 'MECHANIC', contentId: 'mech-income', refKind: 'OFFICIAL_PAGE',
      refLocator: 'https://pvp.qq.com/example-rules', usageScope: 'PUBLIC' }
  })
  const pub = await stack.api(`/api/v1/admin/revisions/mechanics/${rev.json.data.id}/publish`, {
    method: 'POST', token: T(), body: {}
  })
  assert.equal(pub.status, 200)

  const detail = await stack.api('/api/v1/mechanics/income-rules')
  assert.equal(detail.status, 200)
  assert.equal(detail.json.data.statementRaw, '来源原文：每回合基础收入 5 金币。')
  assert.equal(detail.json.data.params.base, 5)
})

test('M2-4: 阵容手册 A04 —— 缺章节逐项拒绝；孤立实体拒绝；全字段发布', { skip: !pgAvailable }, async () => {
  // 手册依赖的实体：棋手 + 英雄
  await stack.api('/api/v1/admin/content/catalog-entities', {
    method: 'POST', token: T(), body: { id: 'cmd-test', slug: 'cmd-test', kind: 'COMMANDER', displayName: '测试棋手' }
  })
  const cmdRev = await stack.api('/api/v1/admin/content/catalog-entities/cmd-test/revisions', {
    method: 'POST', token: T(), body: { gameVersionId: 'v260901', facts: { passive: '测试被动' } }
  })
  await stack.api('/api/v1/admin/content-references', {
    method: 'POST', token: T(),
    body: { contentType: 'CATALOG_ENTITY', contentId: 'cmd-test', refKind: 'EVIDENCE',
      refLocator: 'ev-content-1', usageScope: 'PUBLIC' }
  })
  await stack.api(`/api/v1/admin/revisions/catalog-entities/${cmdRev.json.data.id}/publish`, {
    method: 'POST', token: T(), body: {}
  })
  await stack.api('/api/v1/admin/content/catalog-entities', {
    method: 'POST', token: T(), body: { id: 'hero-a', slug: 'hero-a', kind: 'HERO', displayName: '英雄甲' }
  })
  const heroARev = await stack.api('/api/v1/admin/content/catalog-entities/hero-a/revisions', {
    method: 'POST', token: T(), body: { gameVersionId: 'v260901', facts: { role: '输出' } }
  })
  await stack.api('/api/v1/admin/content-references', {
    method: 'POST', token: T(),
    body: { contentType: 'CATALOG_ENTITY', contentId: 'hero-a', refKind: 'EVIDENCE',
      refLocator: 'ev-content-1', usageScope: 'PUBLIC' }
  })
  await stack.api(`/api/v1/admin/revisions/catalog-entities/${heroARev.json.data.id}/publish`, {
    method: 'POST', token: T(), body: {}
  })

  await stack.api('/api/v1/admin/content/lineups', {
    method: 'POST', token: T(),
    body: { id: 'lu-test', slug: 'test-lineup', displayName: '测试阵容', oneLineSummary: '新手友好测试路线' }
  })

  // 孤立实体：构成清单引用不存在的英雄 → 录入即拒绝
  const ghost = await stack.api('/api/v1/admin/content/lineups/lu-test/revisions', {
    method: 'POST', token: T(),
    body: {
      gameVersionId: 'v260901', commanderEntityId: 'cmd-test', difficulty: 'LOW',
      newbieFitRationale: '操作简单，替补弹性大',
      playConditions: { prefer: ['前期来牌顺'] },
      components: [{ entityId: 'hero-ghost', role: 'CORE_OUTPUT' }]
    }
  })
  assert.equal(ghost.status, 422)
  assert.equal(ghost.json.code_name, 'ENTITY_NOT_FOUND')

  // 缺章节：只给部分 §5 字段 → 拒绝并指明缺哪个
  const partial = await stack.api('/api/v1/admin/content/lineups/lu-test/revisions', {
    method: 'POST', token: T(),
    body: {
      gameVersionId: 'v260901', commanderEntityId: 'cmd-test', difficulty: 'LOW',
      newbieFitRationale: '操作简单，替补弹性大',
      playConditions: { prefer: ['前期来牌顺'] },
      components: [{ entityId: 'hero-a', role: 'CORE_OUTPUT', necessity: 'REQUIRED' }]
    }
  })
  assert.equal(partial.status, 201, '草稿允许不完整（只有发布才拦截）')
  await stack.api('/api/v1/admin/content-references', {
    method: 'POST', token: T(),
    body: { contentType: 'LINEUP', contentId: 'lu-test', refKind: 'EVIDENCE',
      refLocator: 'ev-content-1', usageScope: 'PUBLIC' }
  })
  const rejected = await stack.api(`/api/v1/admin/revisions/lineups/${partial.json.data.id}/publish`, {
    method: 'POST', token: T(), body: {}
  })
  assert.equal(rejected.status, 422)
  assert.equal(rejected.json.code_name, 'MISSING_SECTION')
  assert.ok(rejected.json.error.includes('结构分层'), '拒绝信息指明缺失章节')

  // 全字段（§5.1–5.6）→ 发布通过
  const full = await stack.api('/api/v1/admin/content/lineups/lu-test/revisions', {
    method: 'POST', token: T(),
    body: {
      gameVersionId: 'v260901', commanderEntityId: 'cmd-test', difficulty: 'LOW',
      newbieFitRationale: '操作简单，替补弹性大',
      playConditions: { consider: ['来牌顺'], abandon: ['核心牌被拿'] },
      structureLevels: { minimal: ['英雄甲'], full: ['英雄甲×2'] },
      stages: [{ stage: '前期', actions: ['留输出牌'] }],
      stabilization: { missingCore: '转过渡牌保血' },
      skillChains: [{ hero: 'hero-a', chain: ['开大→集火'] }],
      positioning: { default: ['hero-a 后排'] },
      substitutes: { heroA: '可用英雄乙过渡，损失部分输出' },
      practiceCases: [{ scenarioId: 'sc-test', note: '见情境练习' }],
      components: [
        { entityId: 'hero-a', role: 'CORE_OUTPUT', necessity: 'REQUIRED' },
        { entityId: 'cmd-test', role: 'RESOURCE_ENGINE', necessity: 'REQUIRED' }
      ]
    }
  })
  assert.equal(full.status, 201)
  const pub = await stack.api(`/api/v1/admin/revisions/lineups/${full.json.data.id}/publish`, {
    method: 'POST', token: T(), body: {}
  })
  assert.equal(pub.status, 200, `全字段阵容手册应可发布：${pub.json?.error}`)

  const detail = await stack.api('/api/v1/lineups/test-lineup')
  assert.equal(detail.status, 200)
  assert.equal(detail.json.data.difficulty, 'LOW')
  assert.equal(detail.json.data.components.length, 2)
  assert.equal(detail.json.data.sections.stages[0].stage, '前期')
  assert.deepEqual(detail.json.data.snapshots, [], '未映射快照不自动编成攻略')
})

test('M2-5: 课程先修环拒绝 + 情境无出处拒绝', { skip: !pgAvailable }, async () => {
  const mkLesson = async (id, slug, stage, title) => {
    await stack.api('/api/v1/admin/content/lessons', {
      method: 'POST', token: T(), body: { id, slug, title, stage, sortOrder: 1 }
    })
    const rev = await stack.api(`/api/v1/admin/content/lessons/${id}/revisions`, {
      method: 'POST', token: T(),
      body: {
        gameVersionId: 'v260901',
        objectives: [`学完 ${title} 能做的事`],
        sections: [{ heading: '正文', body: '内容' }],
        practice: [{ question: '问', answer: '答', explanation: '解释' }]
      }
    })
    await stack.api('/api/v1/admin/content-references', {
      method: 'POST', token: T(),
      body: { contentType: 'LESSON', contentId: id, refKind: 'EVIDENCE',
        refLocator: 'ev-content-1', usageScope: 'PUBLIC' }
    })
    const pub = await stack.api(`/api/v1/admin/revisions/lessons/${rev.json.data.id}/publish`, {
      method: 'POST', token: T(), body: {}
    })
    assert.equal(pub.status, 200, `课程 ${id} 应可发布：${pub.json?.error}`)
    return rev.json.data.id
  }

  await mkLesson('l-a', 'lesson-a', 'A', '第一课：认识棋盘')
  await mkLesson('l-b', 'lesson-b', 'B', '第二课：经济基础')

  // b 依赖 a → 合法
  const depOk = await stack.api('/api/v1/admin/lessons/l-b/dependencies', {
    method: 'PUT', token: T(), body: { dependsOn: ['l-a'] }
  })
  assert.equal(depOk.status, 200)

  // a 依赖 b → 成环拒绝
  const cycle = await stack.api('/api/v1/admin/lessons/l-a/dependencies', {
    method: 'PUT', token: T(), body: { dependsOn: ['l-b'] }
  })
  assert.equal(cycle.status, 422)
  assert.equal(cycle.json.code_name, 'DEPENDENCY_CYCLE')

  // 先修指向不存在的课程 → 孤立引用拒绝
  const ghostDep = await stack.api('/api/v1/admin/lessons/l-a/dependencies', {
    method: 'PUT', token: T(), body: { dependsOn: ['l-ghost'] }
  })
  assert.equal(ghostDep.status, 422)
  assert.equal(ghostDep.json.code_name, 'DEPENDENCY_NOT_FOUND')

  // 情境：无出处拒绝；有出处发布
  await stack.api('/api/v1/admin/content/scenarios', {
    method: 'POST', token: T(),
    body: {
      id: 'sc-test', slug: 'scenario-test', title: '前期保血情境', kind: 'LINEUP_SCENARIO',
      initialState: { hp: 60, gold: 10 },
      branches: [{ condition: '来牌顺', action: '升人口' }],
      feedback: { correct: '保住血量', wrong: '强 D 搜牌致血崩' },
      lineupId: 'lu-test'
    }
  })
  const noSource = await stack.api('/api/v1/admin/content/scenarios/sc-test/publish', {
    method: 'POST', token: T(), body: {}
  })
  assert.equal(noSource.status, 422)
  assert.equal(noSource.json.code_name, 'NO_REFERENCES')

  await stack.api('/api/v1/admin/content/scenarios/sc-test', {
    method: 'PATCH', token: T(),
    body: { sourceNote: '出处：官方新手指引页存档 ev-content-1' }
  })
  const pubSc = await stack.api('/api/v1/admin/content/scenarios/sc-test/publish', {
    method: 'POST', token: T(), body: {}
  })
  assert.equal(pubSc.status, 200)
})

test('M2-6: 回滚生成可追踪新版本；退役下线但不删历史', { skip: !pgAvailable }, async () => {
  // 阵容出第 2 版（改 rationale），发布，然后回滚到第 1 版
  const r2 = await stack.api('/api/v1/admin/content/lineups/lu-test/revisions', {
    method: 'POST', token: T(),
    body: { gameVersionId: 'v260901', commanderEntityId: 'cmd-test', difficulty: 'MEDIUM',
      newbieFitRationale: '第二版理由（将被回滚）',
      playConditions: { consider: ['x'] }, structureLevels: { minimal: ['y'] },
      stages: [{ stage: 's' }], stabilization: { a: 'b' }, skillChains: [{ c: 'd' }],
      positioning: { e: 'f' }, substitutes: { g: 'h' }, practiceCases: [{ i: 'j' }],
      components: [{ entityId: 'hero-a', role: 'CORE_OUTPUT' }] }
  })
  await stack.api(`/api/v1/admin/revisions/lineups/${r2.json.data.id}/publish`, {
    method: 'POST', token: T(), body: {}
  })

  const detailBefore = await stack.api('/api/v1/lineups/test-lineup')
  const firstPublishedRevision = detailBefore.json.data.revisionHistory
    .filter(h => h.status === 'PUBLISHED' && h.supersededAt)
    .sort((a, b) => a.no - b.no)[0]

  const rollback = await stack.api('/api/v1/admin/content/lineups/lu-test/rollback', {
    method: 'POST', token: T(),
    body: { targetRevisionId: String(firstPublishedRevision.revisionId), reason: '第二版理由有误，回滚' }
  })
  assert.equal(rollback.status, 201)
  assert.equal(rollback.json.data.reviewStatus, 'DRAFT', '回滚生成新草稿（不自动发布、不覆盖历史）')

  // 回滚草稿（含构成复制）再发布 → 内容回到第一版
  const pub = await stack.api(`/api/v1/admin/revisions/lineups/${rollback.json.data.id}/publish`, {
    method: 'POST', token: T(), body: {}
  })
  assert.equal(pub.status, 200)
  const detailAfter = await stack.api('/api/v1/lineups/test-lineup')
  assert.equal(detailAfter.json.data.newbieFitRationale, '操作简单，替补弹性大')
  assert.equal(detailAfter.json.data.revisionHistory.length, 4,
    '历史修订全保留（r1 未发布草稿 + r2/r3 被取代发布 + r4 回滚发布）')
  const log = await stack.api('/api/v1/admin/review-log?contentType=LINEUP&contentId=lu-test', { token: T() })
  assert.ok(log.json.data.some(l => l.action === 'ROLLBACK'), '回滚入台账')

  // 退役：课程 l-b 下线，/learn 不再展示
  const retract = await stack.api('/api/v1/admin/content/lessons/l-b/retract', {
    method: 'POST', token: T(), body: { reason: '内容重构中' }
  })
  assert.equal(retract.status, 200)
  assert.equal(retract.json.data.status, 'RETIRED')
  const learn = await stack.api('/api/v1/learn')
  const allLessons = learn.json.stages.flatMap(s => s.lessons)
  assert.ok(!allLessons.some(l => l.id === 'l-b'), '退役课程不进默认列表')
})

test('M2-7: 公开契约 —— learn 阶段路径 / 课程详情含先修 / versions / updates 空态如实', { skip: !pgAvailable }, async () => {
  const learn = await stack.api('/api/v1/learn')
  assert.equal(learn.status, 200)
  assert.equal(learn.json.total, 1, 'l-a 发布、l-b 退役')
  const stageA = learn.json.stages.find(s => s.stage === 'A')
  assert.equal(stageA.lessons.length, 1)

  const lesson = await stack.api('/api/v1/lessons/lesson-a')
  assert.equal(lesson.status, 200)
  assert.equal(lesson.json.data.objectives.length, 1)
  assert.equal(lesson.json.data.prerequisites.length, 0)
  assert.ok(Array.isArray(lesson.json.data.references))

  const ghostLesson = await stack.api('/api/v1/lessons/not-exist')
  assert.equal(ghostLesson.status, 404)

  const versions = await stack.api('/api/v1/versions')
  assert.equal(versions.json.total, 1)

  const updates = await stack.api('/api/v1/updates')
  assert.equal(updates.status, 200)
  assert.equal(updates.json.total, 0, '无官方更新时如实为空')
})

test('M2-9: 快照显式映射 —— 未匹配不公开；映射后作为统计子对象（口径原样）', { skip: !pgAvailable }, async () => {
  // 映射前：阵容详情无快照；待映射工作台可见
  const before = await stack.api('/api/v1/lineups/test-lineup')
  assert.equal(before.json.data.snapshots.length, 0)
  const unmapped = await stack.api('/api/v1/admin/unmapped-snapshots', { token: T() })
  assert.equal(unmapped.json.data.length, 1)
  assert.equal(unmapped.json.data[0].structureKey, 'sk-test-1')

  // 建立映射（人工确认，非自动）
  const link = await stack.api('/api/v1/admin/lineup-snapshot-links', {
    method: 'POST', token: T(),
    body: { lineupId: 'lu-test', sourceId: 'src-hokace-wiki', structureKey: 'sk-test-1', note: '结构一致，人工确认' }
  })
  assert.equal(link.status, 201)

  const after = await stack.api('/api/v1/lineups/test-lineup')
  assert.equal(after.json.data.snapshots.length, 1)
  const snap = after.json.data.snapshots[0]
  assert.equal(snap.sampleCount, 120)
  assert.equal(snap.winRate, 0.42)
  assert.equal(snap.sourceName, 'hokace.wiki 第三方阵容汇总')
  assert.equal(snap.windowText, '近 7 日实战聚合')
  assert.equal(snap.snapshotVersion, 'v2609')

  const unmappedAfter = await stack.api('/api/v1/admin/unmapped-snapshots', { token: T() })
  assert.equal(unmappedAfter.json.data.length, 0)

  // 列表契约：稳定阵容为根 + 快照子对象
  const list = await stack.api('/api/v1/lineups')
  assert.equal(list.json.total, 1)
  assert.equal(list.json.data[0].slug, 'test-lineup')
  assert.equal(list.json.data[0].snapshots.length, 1)
  assert.equal(typeof list.json.statsNotice, 'string')
})

test('M2-1/A09: 新版本激活 → 旧版本内容批量待复核；跨版本强绑定拒绝新发布', { skip: !pgAvailable }, async () => {
  // 登记新版本 + 官方更新公告
  await stack.api('/api/v1/admin/game-versions', {
    method: 'POST', token: T(),
    body: { versionId: 'v261001', officialBasis: '官方 10 月版本公告', effectiveAt: '2026-10-08T00:00:00Z' }
  })
  const note = await stack.api('/api/v1/admin/patch-notes', {
    method: 'POST', token: T(),
    body: { versionId: 'v261001', slug: 'note-v2610', title: '10 月平衡调整',
      officialUrl: 'https://pvp.qq.com/news/v2610', officialPublishedAt: '2026-10-07T10:00:00Z',
      summary: '多名英雄调整（摘要以官方公告为准）' }
  })
  assert.equal(note.status, 201)
  const notePub = await stack.api('/api/v1/admin/patch-notes/pn-note-v2610/publish', {
    method: 'POST', token: T(), body: {}
  })
  assert.equal(notePub.status, 200)

  // 激活新版本并携带公告 → 绑定 v260901 的已发布内容批量登记待复核
  const activate = await stack.api('/api/v1/admin/game-versions/v261001/activate', {
    method: 'POST', token: T(), body: { patchNoteId: 'pn-note-v2610' }
  })
  assert.equal(activate.status, 200)
  assert.ok(activate.json.data.markedCount >= 3, `至少标记 阵容/课程/实体/规则：${activate.json.data.markedCount}`)

  const open = await stack.api('/api/v1/admin/content-impacts?open=1', { token: T() })
  const lineupImpact = open.json.data.find(i => i.contentType === 'LINEUP' && i.contentId === 'lu-test')
  assert.ok(lineupImpact, '阵容进入待复核清单')

  const detail = await stack.api('/api/v1/lineups/test-lineup')
  assert.equal(detail.json.data.hasOpenRecheck, true, '公开面可见待复核标识')

  // 官方更新公开可见
  const updates = await stack.api('/api/v1/updates')
  assert.equal(updates.json.total, 1)
  const updateDetail = await stack.api('/api/v1/updates/note-v2610')
  assert.equal(updateDetail.status, 200)
  assert.ok(updateDetail.json.data.impacts.length >= 1)

  // 复核完成一项 → 清单收窄
  const resolved = await stack.api(`/api/v1/admin/content-impacts/${lineupImpact.id}/resolve`, {
    method: 'POST', token: T(), body: { resolution: 'UPDATED', note: '已按新版手册更新' }
  })
  assert.equal(resolved.status, 200)
  const detailAfter = await stack.api('/api/v1/lineups/test-lineup')
  assert.equal(detailAfter.json.data.hasOpenRecheck, false, '复核完成后标识消除')

  // 跨版本强绑定：仍绑旧版本的新修订 → 拒绝发布
  const staleRev = await stack.api('/api/v1/admin/content/catalog-entities/hero-a/revisions', {
    method: 'POST', token: T(), body: { gameVersionId: 'v260901', facts: { role: '输出' } }
  })
  const rejected = await stack.api(`/api/v1/admin/revisions/catalog-entities/${staleRev.json.data.id}/publish`, {
    method: 'POST', token: T(), body: {}
  })
  assert.equal(rejected.status, 422)
  assert.equal(rejected.json.code_name, 'VERSION_NOT_CURRENT')
})

test('M2-10: 重启保持 —— 全新进程栈下内容/映射/台账完整', { skip: !pgAvailable }, async () => {
  const reconnected = await reconnectStack('wanxiangqi_m2_test')
  try {
    const lineups = await reconnected.api('/api/v1/lineups')
    assert.equal(lineups.json.total, 1, '阵容实体重启后保持')
    assert.equal(lineups.json.data[0].snapshots.length, 1, '快照映射重启后保持')

    const lesson = await reconnected.api('/api/v1/lessons/lesson-a')
    assert.equal(lesson.status, 200)

    const log = await reconnected.api('/api/v1/admin/review-log?contentType=LINEUP&contentId=lu-test', { token: reconnected.adminToken })
    assert.ok(log.json.data.filter(l => l.action === 'PUBLISH').length >= 3, '发布历史台账重启后保持')

    const open = await reconnected.api('/api/v1/admin/content-impacts?open=1', { token: reconnected.adminToken })
    assert.ok(open.json.data.length >= 1, '未复核项重启后保持')
  } finally {
    await reconnected.cleanup()
  }
})
