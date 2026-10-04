// M5-4 前置 · 全站搜索验收（任务书 §验收标准：搜索一次命中阵容、英雄、规则和课程，
// 每类结果链接到唯一详情；同名不同类各归各类，不混合排序）。
// 隔离 wanxiangqi_m5s_test 库直插最小已发布内容（1 课程/1 手册/1 实体/1 规则），
// 验证 /api/v1/search 分组、href 唯一性、空/超长查询 400、大小写不敏感与部分匹配。

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { bootAcceptanceStack, pgAvailable } from './_helpers.mjs'

let stack = null

before(async () => {
  if (!pgAvailable) return
  stack = await bootAcceptanceStack('wanxiangqi_m5s_test')
  const c = await stack.pool.connect()
  try {
    await c.query('BEGIN')
    await c.query(
      `INSERT INTO game_versions (version_id, official_basis, effective_at, status)
       VALUES ('v260901', '官方版本公告存档（m5s 测试种子）', '2026-09-24T00:00:00Z', 'CURRENT')`)
    // 课程：标题含「雷霆」（与手册同名，验证同名各归各类）
    await c.query(
      `INSERT INTO lessons (id, slug, title, stage, sort_order, status)
       VALUES ('lesson-m5s', 'lesson-m5s', '雷霆入门第一课', 'A', 1, 'PUBLISHED')`)
    await c.query(
      `INSERT INTO lesson_revisions (lesson_id, revision, game_version_id, objectives, review_status, published_at)
       VALUES ('lesson-m5s', 1, 'v260901', '["认识雷霆体系"]'::jsonb, 'PUBLISHED', now())`)
    // 阵容手册：名称含「雷霆」
    await c.query(
      `INSERT INTO lineups (id, slug, display_name, one_line_summary, status)
       VALUES ('lu-m5s', 'lu-m5s', '雷霆守卫枪', '测试手册', 'PUBLISHED')`)
    await c.query(
      `INSERT INTO lineup_revisions (lineup_id, revision, game_version_id, difficulty, review_status, published_at)
       VALUES ('lu-m5s', 1, 'v260901', 'LOW', 'PUBLISHED', now())`)
    // 实体：display_name 含「雷霆」
    await c.query(
      `INSERT INTO catalog_entities (id, slug, kind, display_name, status)
       VALUES ('hero-m5s', 'hero-m5s', 'HERO', '雷霆之主', 'PUBLISHED')`)
    await c.query(
      `INSERT INTO catalog_entity_revisions (entity_id, revision, game_version_id, facts, review_status, published_at)
       VALUES ('hero-m5s', 1, 'v260901', '{}'::jsonb, 'PUBLISHED', now())`)
    // 规则：标题含「雷霆」
    await c.query(
      `INSERT INTO mechanics (id, slug, title, status)
       VALUES ('mech-m5s', 'mech-m5s', '雷霆触发规则', 'PUBLISHED')`)
    await c.query(
      `INSERT INTO mechanic_revisions (mechanic_id, revision, game_version_id, statement_raw, review_status, published_at)
       VALUES ('mech-m5s', 1, 'v260901', '测试原文', 'PUBLISHED', now())`)
    await c.query('COMMIT')
  } catch (err) {
    await c.query('ROLLBACK')
    throw err
  } finally {
    c.release()
  }
})

after(async () => { if (stack) await stack.cleanup() })

test('M5s: 环境前置', { skip: !pgAvailable }, () => assert.ok(pgAvailable))

test('M5s-1: 空/超长查询 400 INVALID_QUERY；匿名可搜（公开面）', { skip: !pgAvailable }, async () => {
  const empty = await stack.api('/api/v1/search?q=')
  assert.equal(empty.status, 400)
  assert.equal(empty.json.code_name, 'INVALID_QUERY')
  const blank = await stack.api('/api/v1/search?q=%20%20')
  assert.equal(blank.status, 400)
  const long = await stack.api(`/api/v1/search?q=${'x'.repeat(101)}`)
  assert.equal(long.status, 400)
  const ok = await stack.api('/api/v1/search?q=%E9%9B%B7%E9%9C%86')
  assert.equal(ok.status, 200)
})

test('M5s-2: 一次命中四类，同名「雷霆」各归各类且 href 唯一', { skip: !pgAvailable }, async () => {
  const res = await stack.api('/api/v1/search?q=%E9%9B%B7%E9%9C%86') // q=雷霆
  assert.equal(res.status, 200)
  const { groups, totals } = res.json
  assert.equal(totals.lessons, 1)
  assert.equal(totals.manuals, 1)
  assert.equal(totals.entities, 1)
  assert.equal(totals.mechanics, 1)
  assert.deepEqual(groups.lessons.map(h => h.href), ['/learn/lesson-m5s'])
  assert.deepEqual(groups.manuals.map(h => h.href), ['/lineups/lu-m5s'])
  assert.deepEqual(groups.entities.map(h => h.href), ['/library/heroes/hero-m5s'])
  assert.deepEqual(groups.mechanics.map(h => h.href), ['/library/mechanics/mech-m5s'])
  // 每类结果都带可读标题与类别副标题
  assert.equal(groups.lessons[0].title, '雷霆入门第一课')
  assert.ok(groups.entities[0].subtitle.includes('heroes'))
})

test('M5s-3: 大小写不敏感与部分匹配；无命中如实为空（不造结果）', { skip: !pgAvailable }, async () => {
  const none = await stack.api('/api/v1/search?q=%E4%B8%8D%E5%AD%98%E5%9C%A8%E7%9A%84%E5%86%85%E5%AE%B9') // 不存在的内容
  assert.equal(none.status, 200)
  assert.equal(Object.values(none.json.totals).reduce((a, b) => a + b, 0), 0)
  assert.equal(none.json.groups.lessons.length, 0)

  const partial = await stack.api('/api/v1/search?q=%E9%9B%B7%E9%9C%86%E5%85%A5') // 雷霆入
  assert.equal(partial.json.totals.lessons, 1)
  assert.equal(partial.json.totals.manuals, 0)
})

test('M5s-4: 手册可按构成英雄命中（components 参与匹配）', { skip: !pgAvailable }, async () => {
  // 为手册挂一个构成英雄，再用英雄名搜索（非手册名）
  await stack.pool.query(
    `INSERT INTO catalog_entities (id, slug, kind, display_name, status)
     VALUES ('hero-comp', 'hero-comp', 'HERO', '雷光使', 'PUBLISHED')`)
  await stack.pool.query(
    `INSERT INTO catalog_entity_revisions (entity_id, revision, facts, review_status, published_at)
     VALUES ('hero-comp', 1, '{}'::jsonb, 'PUBLISHED', now())`)
  await stack.pool.query(
    `INSERT INTO lineup_components (lineup_revision_id, entity_id, role, necessity)
     SELECT r.id, 'hero-comp', 'CORE_OUTPUT', 'REQUIRED' FROM lineup_revisions r WHERE r.lineup_id = 'lu-m5s'`)
  try {
    const res = await stack.api('/api/v1/search?q=%E9%9B%B7%E5%85%89%E4%BD%BF') // 雷光使
    assert.equal(res.json.totals.manuals, 1, '构成英雄名可命中其手册')
    assert.equal(res.json.totals.entities, 1)
  } finally {
    await stack.pool.query(`DELETE FROM lineup_components WHERE entity_id = 'hero-comp'`)
    await stack.pool.query(`DELETE FROM catalog_entities WHERE id = 'hero-comp'`)
  }
})
