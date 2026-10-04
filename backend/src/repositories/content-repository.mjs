// v6 · ContentRepository — 内容底座数据访问（M2-1..M2-6）
//
// 覆盖 0006 内容模型：game_versions / patch_notes(+content_impacts) /
// catalog_entities(+revisions) / mechanics(+revisions) / lineups(+revisions +
// components + snapshot_links) / lessons(+revisions+dependencies) / scenarios /
// content_references / content_review_log。
//
// 铁律（任务书 §7.2）：
// 1. 发布/回退/退役与审核台账同一事务写入（publishRevisionTx 等）；
// 2. 回滚=复制目标修订生成新草稿版本（ROLLBACK 台账可追踪），不覆盖历史；
// 3. 上传≠发布、内容校验在服务层（本层只保证 SQL 原子性与约束）；
// 4. 公开读取只取 status='PUBLISHED' 实体的当前发布修订；PUBLIC 引用过滤
//    usage_scope='PUBLIC'（内部材料不公开）。
//
// 类型注册表：5 类内容共享「根实体 + 修订历史」形态；scenarios 按任务书 §7.1
// 为根级内容（无修订表），直接走状态流转。

const iso = v => (v instanceof Date ? v.toISOString() : v || null)

export class ContentError extends Error {
  constructor(message, { status = 400, code = 'CONTENT_ERROR' } = {}) {
    super(message)
    this.status = status
    this.code = code
  }
}

// path 段（HTTP）→ 表结构映射
export const CONTENT_TYPES = {
  'catalog-entities': {
    label: 'CATALOG_ENTITY', root: 'catalog_entities', rootPk: 'id',
    rev: 'catalog_entity_revisions', revFk: 'entity_id', hasRevisions: true,
    rootCols: ['id', 'slug', 'kind', 'display_name'],
    labelCol: 'display_name'
  },
  'mechanics': {
    label: 'MECHANIC', root: 'mechanics', rootPk: 'id',
    rev: 'mechanic_revisions', revFk: 'mechanic_id', hasRevisions: true,
    rootCols: ['id', 'slug', 'title'],
    labelCol: 'title'
  },
  'lineups': {
    label: 'LINEUP', root: 'lineups', rootPk: 'id',
    rev: 'lineup_revisions', revFk: 'lineup_id', hasRevisions: true,
    rootCols: ['id', 'slug', 'display_name', 'one_line_summary'],
    labelCol: 'display_name'
  },
  'lessons': {
    label: 'LESSON', root: 'lessons', rootPk: 'id',
    rev: 'lesson_revisions', revFk: 'lesson_id', hasRevisions: true,
    rootCols: ['id', 'slug', 'title', 'stage', 'sort_order'],
    labelCol: 'title'
  },
  'scenarios': {
    label: 'SCENARIO', root: 'scenarios', rootPk: 'id',
    rev: null, revFk: null, hasRevisions: false,
    rootCols: ['id', 'slug', 'title', 'kind', 'initial_state', 'branches', 'feedback', 'source_note', 'lineup_id', 'lesson_id'],
    labelCol: 'title'
  }
}

// 每类内容的修订内容列（创建修订 / 回滚复制共用）
const REVISION_CONTENT_COLS = {
  'catalog-entities': ['game_version_id', 'facts'],
  'mechanics': ['game_version_id', 'statement_raw', 'params', 'applies_to'],
  'lineups': [
    'game_version_id', 'commander_entity_id', 'difficulty', 'newbie_fit_rationale',
    'play_conditions', 'structure_levels', 'stages', 'stabilization',
    'skill_chains', 'positioning', 'substitutes', 'practice_cases'
  ],
  'lessons': ['game_version_id', 'objectives', 'sections', 'practice']
}

// camelCase（HTTP/前端）↔ snake_case（列）：写入路径两种键名都接受（值取先命中者）
const CAMEL_TO_SNAKE = s => s.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
const SNAKE_TO_CAMEL = s => s.replace(/_([a-z0-9])/g, (m, ch) => ch.toUpperCase())

// JSONB 写入显式序列化：node-postgres 会把顶层数组转成 PG 数组字面量（非法 JSON），
// 对象虽能隐式转换但统一 stringify 保证数组/对象口径一致。
const jsonb = v => (v === undefined || v === null || typeof v === 'string') ? v : JSON.stringify(v)

// 各内容类型根表中的 JSONB 列（insertContentRoot 需显式序列化）
const ROOT_JSONB_COLS = {
  'catalog-entities': [],
  mechanics: [],
  lineups: [],
  lessons: [],
  scenarios: ['initial_state', 'branches', 'feedback']
}

export class ContentRepository {
  /** @param {import('pg').Pool} pool */
  constructor(pool) {
    this.pool = pool
    this.kind = 'pg-content'
  }

  type(name) {
    const t = CONTENT_TYPES[name]
    if (!t) throw new ContentError(`未知内容类型 [${name}]`, { status: 404, code: 'UNKNOWN_CONTENT_TYPE' })
    return t
  }

  // ================================================================
  // 1. 游戏版本（M2-1）
  // ================================================================

  async upsertGameVersion({ versionId, officialBasis, effectiveAt = null, note = null, status = 'HISTORICAL' }) {
    const res = await this.pool.query(`
      INSERT INTO game_versions (version_id, official_basis, effective_at, status, note)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (version_id) DO UPDATE
        SET official_basis = EXCLUDED.official_basis,
            effective_at = EXCLUDED.effective_at,
            note = EXCLUDED.note,
            updated_at = CURRENT_TIMESTAMP
      RETURNING *`, [versionId, officialBasis, effectiveAt, status, note])
    return this.versionWire(res.rows[0])
  }

  async listGameVersions() {
    const res = await this.pool.query(`
      SELECT gv.*, (
        SELECT count(*)::int FROM patch_notes pn
        WHERE pn.version_id = gv.version_id AND pn.status = 'PUBLISHED'
      ) AS published_notes
      FROM game_versions gv
      ORDER BY (gv.status = 'CURRENT') DESC, gv.effective_at DESC NULLS LAST, gv.version_id`)
    return res.rows.map(r => ({ ...this.versionWire(r), publishedNotes: r.published_notes }))
  }

  async getCurrentGameVersion() {
    const res = await this.pool.query(`SELECT * FROM game_versions WHERE status = 'CURRENT' LIMIT 1`)
    return res.rows.length ? this.versionWire(res.rows[0]) : null
  }

  /**
   * 激活新当前版本（§7.4）：单事务
   *   旧 CURRENT → HISTORICAL；目标 → CURRENT；
   *   若提供 patchNoteId：为绑定旧版本的全部已发布内容批量登记 NEEDS_RECHECK
   *   （content_impacts + 每条一条 MARK_RECHECK 台账）。
   */
  async activateGameVersion(versionId, { patchNoteId = null, operator = 'ADMIN', note = null } = {}) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      const target = (await client.query(
        `SELECT version_id, status FROM game_versions WHERE version_id = $1 FOR UPDATE`, [versionId]
      )).rows[0]
      if (!target) throw new ContentError(`版本 [${versionId}] 不存在`, { status: 404, code: 'VERSION_NOT_FOUND' })

      const previous = (await client.query(
        `SELECT version_id FROM game_versions WHERE status = 'CURRENT' AND version_id <> $1`,
        [versionId]
      )).rows[0]

      if (previous) {
        await client.query(
          `UPDATE game_versions SET status='HISTORICAL', updated_at=CURRENT_TIMESTAMP WHERE version_id=$1`,
          [previous.version_id])
      }
      await client.query(
        `UPDATE game_versions SET status='CURRENT', updated_at=CURRENT_TIMESTAMP WHERE version_id=$1`,
        [versionId])

      let marked = []
      if (patchNoteId) {
        const pn = (await client.query(`SELECT id FROM patch_notes WHERE id=$1 AND version_id=$2`,
          [patchNoteId, versionId])).rows[0]
        if (!pn) {
          throw new ContentError(`更新公告 [${patchNoteId}] 不存在或不属于版本 ${versionId}`,
            { status: 422, code: 'PATCH_NOTE_MISMATCH' })
        }

        // 四类带版本绑定的已发布内容：旧版本 → 待复核
        for (const [label, rev, fk, root] of [
          ['CATALOG_ENTITY', 'catalog_entity_revisions', 'entity_id', 'catalog_entities'],
          ['MECHANIC', 'mechanic_revisions', 'mechanic_id', 'mechanics'],
          ['LINEUP', 'lineup_revisions', 'lineup_id', 'lineups'],
          ['LESSON', 'lesson_revisions', 'lesson_id', 'lessons']
        ]) {
          const rows = (await client.query(`
            SELECT DISTINCT rt.${fk} AS root_id
            FROM ${rev} rt
            JOIN ${root} ro ON ro.id = rt.${fk}
            WHERE rt.review_status = 'PUBLISHED' AND rt.superseded_at IS NULL
              AND rt.game_version_id = $1 AND ro.status = 'PUBLISHED'`,
            [previous ? previous.version_id : '__none__'])).rows
          for (const row of rows) {
            await client.query(`
              INSERT INTO content_impacts (patch_note_id, content_type, content_id, impact, note)
              VALUES ($1, $2, $3, 'NEEDS_RECHECK', $4)`,
              [patchNoteId, label, row.root_id, note || `版本切换：绑定旧版本 ${previous ? previous.version_id : ''}`])
            await client.query(`
              INSERT INTO content_review_log (content_type, content_id, action, operator, reason, details)
              VALUES ($1, $2, 'MARK_RECHECK', $3, $4, $5)`,
              [label, row.root_id, operator, note || '新版本激活，待复核',
                JSON.stringify({ patchNoteId, newVersion: versionId })])
            marked.push({ contentType: label, contentId: row.root_id })
          }
        }
      }

      await client.query(`
        INSERT INTO content_review_log (content_type, content_id, action, operator, reason, details)
        VALUES ('GAME_VERSION', $1, 'PUBLISH', $2, $3, $4)`,
        [versionId, operator, note || '激活为当前版本',
          JSON.stringify({ previousVersion: previous ? previous.version_id : null, patchNoteId, markedCount: marked.length })])

      await client.query('COMMIT')
      return { versionId, previousVersionId: previous ? previous.version_id : null, marked, markedCount: marked.length }
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  versionWire(v) {
    return {
      versionId: v.version_id,
      officialBasis: v.official_basis,
      effectiveAt: iso(v.effective_at),
      status: v.status,
      note: v.note ?? null,
      createdAt: iso(v.created_at),
      updatedAt: iso(v.updated_at)
    }
  }

  // ================================================================
  // 2. 官方更新公告 + 待复核清单（M2-1 / A09）
  // ================================================================

  async createPatchNote({ id, versionId, slug, title, officialUrl = null, officialPublishedAt = null, fetchedAt = null, summary = null }) {
    const res = await this.pool.query(`
      INSERT INTO patch_notes (id, version_id, slug, title, official_url, official_published_at, fetched_at, summary)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, versionId, slug, title, officialUrl, officialPublishedAt, fetchedAt || new Date().toISOString(), summary])
    return this.patchNoteWire(res.rows[0])
  }

  async publishPatchNote(id, { operator = 'ADMIN' } = {}) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const res = await client.query(
        `UPDATE patch_notes SET status='PUBLISHED', updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`, [id])
      if (!res.rows.length) throw new ContentError(`更新公告 [${id}] 不存在`, { status: 404, code: 'PATCH_NOTE_NOT_FOUND' })
      await client.query(`
        INSERT INTO content_review_log (content_type, content_id, action, operator, reason)
        VALUES ('PATCH_NOTE', $1, 'PUBLISH', $2, '官方更新公告发布')`, [id, operator])
      await client.query('COMMIT')
      return this.patchNoteWire(res.rows[0])
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  async listPatchNotes({ publicOnly = false } = {}) {
    const res = await this.pool.query(`
      SELECT pn.*, gv.status AS version_status
      FROM patch_notes pn JOIN game_versions gv ON gv.version_id = pn.version_id
      ${publicOnly ? `WHERE pn.status = 'PUBLISHED'` : ''}
      ORDER BY pn.official_published_at DESC NULLS LAST, pn.created_at DESC`)
    return res.rows.map(r => ({ ...this.patchNoteWire(r), versionStatus: r.version_status }))
  }

  async getPatchNote(idOrSlug, { publicOnly = false } = {}) {
    const res = await this.pool.query(`
      SELECT pn.*, gv.status AS version_status
      FROM patch_notes pn JOIN game_versions gv ON gv.version_id = pn.version_id
      WHERE (pn.id = $1 OR pn.slug = $1) ${publicOnly ? `AND pn.status = 'PUBLISHED'` : ''} LIMIT 1`,
      [idOrSlug])
    if (!res.rows.length) return null
    const impacts = await this.pool.query(
      `SELECT * FROM content_impacts WHERE patch_note_id = $1 ORDER BY created_at`, [res.rows[0].id])
    return {
      ...this.patchNoteWire(res.rows[0]),
      versionStatus: res.rows[0].version_status,
      impacts: impacts.rows.map(this.impactWire)
    }
  }

  async addContentImpacts(patchNoteId, impacts = []) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const pn = (await client.query(`SELECT id FROM patch_notes WHERE id=$1`, [patchNoteId])).rows[0]
      if (!pn) throw new ContentError(`更新公告 [${patchNoteId}] 不存在`, { status: 404, code: 'PATCH_NOTE_NOT_FOUND' })
      const inserted = []
      for (const im of impacts) {
        const res = await client.query(`
          INSERT INTO content_impacts (patch_note_id, content_type, content_id, impact, note)
          VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [patchNoteId, im.contentType, im.contentId, im.impact || 'NEEDS_RECHECK', im.note || null])
        inserted.push(this.impactWire(res.rows[0]))
      }
      await client.query('COMMIT')
      return inserted
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  async resolveContentImpact(impactId, { resolution = 'UPDATED', resolvedBy = 'ADMIN', note = null } = {}) {
    const res = await this.pool.query(`
      UPDATE content_impacts
      SET impact = $2, resolved_at = CURRENT_TIMESTAMP, resolved_by = $3, note = COALESCE($4, note)
      WHERE id = $1 RETURNING *`, [impactId, resolution, resolvedBy, note])
    if (!res.rows.length) return null
    const row = res.rows[0]
    await this.pool.query(`
      INSERT INTO content_review_log (content_type, content_id, action, operator, reason, details)
      VALUES ($1, $2, 'RESOLVE_RECHECK', $3, $4, $5)`,
      [row.content_type, row.content_id, resolvedBy, note || '复核完成',
        JSON.stringify({ impactId, resolution })])
    return this.impactWire(row)
  }

  async listContentImpacts({ openOnly = false } = {}) {
    const res = await this.pool.query(`
      SELECT ci.*, pn.slug AS patch_note_slug, pn.title AS patch_note_title
      FROM content_impacts ci JOIN patch_notes pn ON pn.id = ci.patch_note_id
      ${openOnly ? `WHERE ci.resolved_at IS NULL` : ''}
      ORDER BY ci.resolved_at NULLS FIRST, ci.created_at DESC`)
    return res.rows.map(r => ({
      ...this.impactWire(r),
      patchNoteSlug: r.patch_note_slug,
      patchNoteTitle: r.patch_note_title
    }))
  }

  patchNoteWire(p) {
    return {
      id: p.id,
      versionId: p.version_id,
      slug: p.slug,
      title: p.title,
      officialUrl: p.official_url ?? null,
      officialPublishedAt: iso(p.official_published_at),
      fetchedAt: iso(p.fetched_at),
      summary: p.summary ?? null,
      status: p.status,
      createdAt: iso(p.created_at),
      updatedAt: iso(p.updated_at)
    }
  }

  impactWire(i) {
    return {
      id: i.id,
      patchNoteId: i.patch_note_id,
      contentType: i.content_type,
      contentId: i.content_id,
      impact: i.impact,
      note: i.note ?? null,
      resolvedAt: iso(i.resolved_at),
      resolvedBy: i.resolved_by ?? null,
      createdAt: iso(i.created_at)
    }
  }

  // ================================================================
  // 3. 内容根实体（通用 CRUD；M2-2..M2-5）
  // ================================================================

  async insertContentRoot(typeName, fields) {
    const t = this.type(typeName)
    const cols = t.rootCols.filter(c => fields[c] !== undefined || fields[SNAKE_TO_CAMEL(c)] !== undefined)
    if (!cols.length) throw new ContentError('创建内容缺少字段', { code: 'EMPTY_FIELDS' })
    const snake = cols.map(CAMEL_TO_SNAKE)
    const jsonbCols = ROOT_JSONB_COLS[typeName] || []
    const vals = cols.map((c, i) => {
      const raw = fields[c] !== undefined ? fields[c] : fields[SNAKE_TO_CAMEL(c)]
      return jsonbCols.includes(snake[i]) ? jsonb(raw) : raw
    })
    const ph = cols.map((_, i) => `$${i + 1}`).join(',')
    const res = await this.pool.query(
      `INSERT INTO ${t.root} (${snake.join(',')}) VALUES (${ph}) RETURNING *`, vals)
    return res.rows[0]
  }

  async updateContentRoot(typeName, idOrSlug, patch) {
    const t = this.type(typeName)
    const root = await this.getContentRootRow(typeName, idOrSlug)
    if (!root) return null
    const sets = []
    const vals = []
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${CAMEL_TO_SNAKE(k)} = $${sets.length + 1}`)
      vals.push(v)
    }
    if (!sets.length) return root
    vals.push(root[t.rootPk])
    const res = await this.pool.query(
      `UPDATE ${t.root} SET ${sets.join(',')}, updated_at = CURRENT_TIMESTAMP
       WHERE ${t.rootPk} = $${vals.length} RETURNING *`, vals)
    return res.rows[0]
  }

  async getContentRootRow(typeName, idOrSlug) {
    const t = this.type(typeName)
    const res = await this.pool.query(
      `SELECT * FROM ${t.root} WHERE id = $1 OR slug = $1 LIMIT 1`, [idOrSlug])
    return res.rows[0] || null
  }

  async listContentRoots(typeName, { status = null, kind = null, stage = null } = {}) {
    const t = this.type(typeName)
    const where = []
    const vals = []
    if (status) { vals.push(status); where.push(`status = $${vals.length}`) }
    if (kind && typeName === 'catalog-entities') { vals.push(kind); where.push(`kind = $${vals.length}`) }
    if (stage && typeName === 'lessons') { vals.push(stage); where.push(`stage = $${vals.length}`) }
    const res = await this.pool.query(
      `SELECT * FROM ${t.root} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY ${typeName === 'lessons' ? 'stage, sort_order, id' : `${t.labelCol}, id`}`, vals)
    return res.rows
  }

  async setContentRootStatus(typeName, id, status) {
    const t = this.type(typeName)
    const res = await this.pool.query(
      `UPDATE ${t.root} SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE ${t.rootPk} = $1 RETURNING *`,
      [id, status])
    return res.rows[0] || null
  }

  // ================================================================
  // 4. 修订历史（生命周期：DRAFT → PENDING_REVIEW → PUBLISHED）
  // ================================================================

  async nextRevisionNo(typeName, rootId) {
    const t = this.type(typeName)
    const res = await this.pool.query(
      `SELECT COALESCE(MAX(revision), 0) + 1 AS n FROM ${t.rev} WHERE ${t.revFk} = $1`, [rootId])
    return res.rows[0].n
  }

  async insertRevision(typeName, rootId, { revisionNo, createdBy = null, ...content }) {
    const t = this.type(typeName)
    if (!t.hasRevisions) throw new ContentError(`${typeName} 无修订历史`, { code: 'NO_REVISIONS' })
    const cols = REVISION_CONTENT_COLS[typeName]
    const use = cols.filter(c => content[c] !== undefined || content[SNAKE_TO_CAMEL(c)] !== undefined)
    const allCols = [t.revFk, 'revision', 'created_by', ...use]
    const vals = [rootId, revisionNo, createdBy,
      ...use.map(c => {
        const raw = content[c] !== undefined ? content[c] : content[SNAKE_TO_CAMEL(c)]
        return c === 'game_version_id' ? raw : jsonb(raw) // 修订内容列全为 JSONB（版本列除外）
      })]
    const ph = allCols.map((_, i) => `$${i + 1}`).join(',')
    const res = await this.pool.query(
      `INSERT INTO ${t.rev} (${allCols.join(',')}) VALUES (${ph}) RETURNING *`, vals)
    return res.rows[0]
  }

  async getRevisionRow(typeName, revisionId) {
    const t = this.type(typeName)
    const res = await this.pool.query(
      `SELECT * FROM ${t.rev} WHERE id = $1 LIMIT 1`, [revisionId])
    return res.rows[0] || null
  }

  async listRevisionRows(typeName, rootId) {
    const t = this.type(typeName)
    const res = await this.pool.query(
      `SELECT * FROM ${t.rev} WHERE ${t.revFk} = $1 ORDER BY revision DESC`, [rootId])
    return res.rows
  }

  async getCurrentPublishedRevisionRow(typeName, rootId) {
    const t = this.type(typeName)
    const res = await this.pool.query(
      `SELECT * FROM ${t.rev} WHERE ${t.revFk} = $1 AND review_status = 'PUBLISHED' AND superseded_at IS NULL LIMIT 1`,
      [rootId])
    return res.rows[0] || null
  }

  /** 提交审核：DRAFT → PENDING_REVIEW（+台账） */
  async submitRevision(typeName, revisionId, { operator = 'ADMIN' } = {}) {
    const t = this.type(typeName)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const res = await client.query(`
        UPDATE ${t.rev} SET review_status = 'PENDING_REVIEW'
        WHERE id = $1 AND review_status = 'DRAFT' RETURNING *`, [revisionId])
      if (!res.rows.length) {
        throw new ContentError('仅 DRAFT 修订可提交审核', { status: 409, code: 'INVALID_STATE' })
      }
      await client.query(`
        INSERT INTO content_review_log (content_type, content_id, revision_id, action, operator, reason)
        VALUES ($1, $2, $3, 'SUBMIT_REVIEW', $4, '提交审核')`,
        [t.label, res.rows[0][t.revFk], revisionId, operator])
      await client.query('COMMIT')
      return res.rows[0]
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * 发布（§7.2 核心，单事务）：
   *   旧当前发布 → superseded_at（历史保留可查看）；
   *   目标修订 → PUBLISHED；根实体 → PUBLISHED；台账 PUBLISH 同事务写入。
   * 前置校验（必填章节/引用/版本绑定/循环）由服务层完成——本方法只做状态原子流转。
   */
  async publishRevision(typeName, revisionId, { operator = 'ADMIN', reason = null } = {}) {
    const t = this.type(typeName)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const cur = (await client.query(
        `SELECT * FROM ${t.rev} WHERE id = $1 FOR UPDATE`, [revisionId])).rows[0]
      if (!cur) throw new ContentError(`修订 [${revisionId}] 不存在`, { status: 404, code: 'REVISION_NOT_FOUND' })
      if (!['DRAFT', 'PENDING_REVIEW'].includes(cur.review_status)) {
        throw new ContentError(`仅草稿/待审核修订可发布（当前 ${cur.review_status}）`,
          { status: 409, code: 'INVALID_STATE' })
      }
      await client.query(`
        UPDATE ${t.rev} SET superseded_at = CURRENT_TIMESTAMP
        WHERE ${t.revFk} = $1 AND review_status = 'PUBLISHED' AND superseded_at IS NULL`,
        [cur[t.revFk]])
      const res = await client.query(`
        UPDATE ${t.rev}
        SET review_status = 'PUBLISHED', published_at = CURRENT_TIMESTAMP, superseded_at = NULL
        WHERE id = $1 RETURNING *`, [revisionId])
      await client.query(`
        UPDATE ${t.root} SET status = 'PUBLISHED', updated_at = CURRENT_TIMESTAMP WHERE ${t.rootPk} = $1`,
        [cur[t.revFk]])
      await client.query(`
        INSERT INTO content_review_log (content_type, content_id, revision_id, action, operator, reason)
        VALUES ($1, $2, $3, 'PUBLISH', $4, $5)`,
        [t.label, cur[t.revFk], revisionId, operator, reason || '发布'])
      await client.query('COMMIT')
      return res.rows[0]
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  /** 发布根级内容（scenarios）：状态流转 + 台账同事务 */
  async publishScenarioRoot(id, { operator = 'ADMIN', reason = null } = {}) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const res = await client.query(
        `UPDATE scenarios SET status = 'PUBLISHED', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`, [id])
      if (!res.rows.length) throw new ContentError(`情境 [${id}] 不存在`, { status: 404, code: 'NOT_FOUND' })
      await client.query(`
        INSERT INTO content_review_log (content_type, content_id, action, operator, reason)
        VALUES ('SCENARIO', $1, 'PUBLISH', $2, $3)`, [id, operator, reason || '发布'])
      await client.query('COMMIT')
      return res.rows[0]
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  /** 退役（实体级）：PUBLISHED/DRAFT → RETIRED + 台账 */
  async retractContent(typeName, rootId, { operator = 'ADMIN', reason = null } = {}) {
    const t = this.type(typeName)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const res = await client.query(
        `UPDATE ${t.root} SET status = 'RETIRED', updated_at = CURRENT_TIMESTAMP WHERE ${t.rootPk} = $1 RETURNING *`,
        [rootId])
      if (!res.rows.length) throw new ContentError(`内容 [${rootId}] 不存在`, { status: 404, code: 'NOT_FOUND' })
      await client.query(`
        INSERT INTO content_review_log (content_type, content_id, action, operator, reason)
        VALUES ($1, $2, 'RETRACT', $3, $4)`, [t.label, rootId, operator, reason || '退役下线'])
      await client.query('COMMIT')
      return res.rows[0]
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  /** 回滚：复制目标修订内容为新草稿（不覆盖历史），台账 ROLLBACK */
  async rollbackToRevision(typeName, rootId, targetRevisionId, { operator = 'ADMIN', reason = null } = {}) {
    const t = this.type(typeName)
    if (!t.hasRevisions) throw new ContentError('该内容类型不支持修订回滚', { status: 409, code: 'NO_REVISIONS' })
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const target = (await client.query(
        `SELECT * FROM ${t.rev} WHERE id = $1 AND ${t.revFk} = $2`, [targetRevisionId, rootId])).rows[0]
      if (!target) throw new ContentError('回滚目标修订不存在或不属于该内容', { status: 404, code: 'REVISION_NOT_FOUND' })
      const cols = REVISION_CONTENT_COLS[typeName]
      const nextNo = (await client.query(
        `SELECT COALESCE(MAX(revision), 0) + 1 AS n FROM ${t.rev} WHERE ${t.revFk} = $1`, [rootId])).rows[0].n
      const res = await client.query(`
        INSERT INTO ${t.rev} (${t.revFk}, revision, created_by, ${cols.join(',')})
        VALUES ($1, $2, $3, ${cols.map((_, i) => `$${i + 4}`).join(',')}) RETURNING *`,
        [rootId, nextNo, operator, ...cols.map(c =>
          c === 'game_version_id' ? target[c] : jsonb(target[c]))])
      await client.query(`
        INSERT INTO content_review_log (content_type, content_id, revision_id, action, operator, reason, details)
        VALUES ($1, $2, $3, 'ROLLBACK', $4, $5, $6)`,
        [t.label, rootId, res.rows[0].id, operator, reason || '回滚到历史版本',
          JSON.stringify({ targetRevisionId, targetRevisionNo: target.revision })])
      await client.query('COMMIT')
      return res.rows[0]
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  // ================================================================
  // 5. 阵容构成 / 快照映射 / 课程先修 / 引用 / 台账
  // ================================================================

  async replaceLineupComponents(revisionId, components = []) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`DELETE FROM lineup_components WHERE lineup_revision_id = $1`, [revisionId])
      for (const c of components) {
        await client.query(`
          INSERT INTO lineup_components
            (lineup_revision_id, entity_id, role, necessity, substitute_for, notes)
          VALUES ($1,$2,$3,$4,$5,$6)`,
          [revisionId, c.entityId, c.role, c.necessity || 'REQUIRED',
            c.substituteFor || null, JSON.stringify(c.notes || {})])
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  async listLineupComponents(revisionIds) {
    if (!revisionIds.length) return new Map()
    const res = await this.pool.query(`
      SELECT lc.*, ce.slug AS entity_slug, ce.display_name AS entity_name, ce.kind AS entity_kind
      FROM lineup_components lc JOIN catalog_entities ce ON ce.id = lc.entity_id
      WHERE lc.lineup_revision_id = ANY($1::bigint[]) ORDER BY lc.id`, [revisionIds])
    const map = new Map()
    for (const r of res.rows) {
      // pg 对 int8（BIGINT）返回字符串：统一转 Number 作 Map 键
      const revKey = Number(r.lineup_revision_id)
      const list = map.get(revKey) || []
      list.push({
        id: r.id,
        entityId: r.entity_id,
        entitySlug: r.entity_slug,
        entityName: r.entity_name,
        entityKind: r.entity_kind,
        role: r.role,
        necessity: r.necessity,
        substituteFor: r.substitute_for,
        notes: r.notes
      })
      map.set(revKey, list)
    }
    return map
  }

  async setLessonDependencies(lessonId, dependsOnIds = []) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`DELETE FROM lesson_dependencies WHERE lesson_id = $1`, [lessonId])
      for (const dep of dependsOnIds) {
        if (dep === lessonId) {
          throw new ContentError('课程不能以自身为先修', { status: 422, code: 'SELF_DEPENDENCY' })
        }
        await client.query(
          `INSERT INTO lesson_dependencies (lesson_id, depends_on_lesson_id) VALUES ($1, $2)`, [lessonId, dep])
      }
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally {
      client.release()
    }
  }

  /** 全量先修图（服务层做环检测） */
  async getLessonDependencyEdges() {
    const res = await this.pool.query(`SELECT lesson_id, depends_on_lesson_id FROM lesson_dependencies`)
    return res.rows.map(r => ({ lessonId: r.lesson_id, dependsOn: r.depends_on_lesson_id }))
  }

  async listLessonDependencies() {
    const res = await this.pool.query(`
      SELECT ld.lesson_id, ld.depends_on_lesson_id, l2.title AS depends_on_title, l2.slug AS depends_on_slug
      FROM lesson_dependencies ld JOIN lessons l2 ON l2.id = ld.depends_on_lesson_id
      ORDER BY ld.lesson_id`)
    return res.rows.map(r => ({
      lessonId: r.lesson_id, dependsOnId: r.depends_on_lesson_id,
      dependsOnTitle: r.depends_on_title, dependsOnSlug: r.depends_on_slug
    }))
  }

  async addContentReference({ contentType, contentId, revisionId = null, refKind, refLocator, usageScope = 'INTERNAL_ONLY', licenseNote = null, createdBy = null }) {
    const res = await this.pool.query(`
      INSERT INTO content_references
        (content_type, content_id, revision_id, ref_kind, ref_locator, usage_scope, license_note, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [contentType, contentId, revisionId, refKind, refLocator, usageScope, licenseNote, createdBy])
    return this.referenceWire(res.rows[0])
  }

  async listContentReferences({ contentType = null, contentId = null, publicOnly = false } = {}) {
    const where = []
    const vals = []
    if (contentType) { vals.push(contentType); where.push(`content_type = $${vals.length}`) }
    if (contentId) { vals.push(contentId); where.push(`content_id = $${vals.length}`) }
    if (publicOnly) where.push(`usage_scope = 'PUBLIC'`)
    const res = await this.pool.query(`
      SELECT * FROM content_references ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY id DESC`, vals)
    return res.rows.map(this.referenceWire)
  }

  referenceWire(r) {
    return {
      id: r.id,
      contentType: r.content_type,
      contentId: r.content_id,
      revisionId: r.revision_id,
      refKind: r.ref_kind,
      refLocator: r.ref_locator,
      usageScope: r.usage_scope,
      licenseNote: r.license_note ?? null,
      createdBy: r.created_by ?? null,
      createdAt: iso(r.created_at)
    }
  }

  /** 引用完整性事实（服务层发布校验用） */
  async getEvidenceRefFacts(evidenceId) {
    const res = await this.pool.query(`
      SELECT e.status, e.usage_scope,
             (SELECT count(*)::int FROM evidence_blobs b WHERE b.sha256 = e.sha256) AS blob_count
      FROM evidences e WHERE e.id = $1`, [evidenceId])
    return res.rows[0] || null
  }

  async rawMaterialExists(id) {
    const res = await this.pool.query(`SELECT 1 FROM raw_materials WHERE id = $1`, [id])
    return res.rows.length > 0
  }

  async appendReviewLog({ contentType, contentId, revisionId = null, action, operator, reason = null, details = null }) {
    const res = await this.pool.query(`
      INSERT INTO content_review_log (content_type, content_id, revision_id, action, operator, reason, details)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [contentType, contentId, revisionId, action, operator, reason, details])
    return res.rows[0]
  }

  async listReviewLog({ contentType = null, contentId = null, limit = 100 } = {}) {
    const where = []
    const vals = []
    if (contentType) { vals.push(contentType); where.push(`content_type = $${vals.length}`) }
    if (contentId) { vals.push(contentId); where.push(`content_id = $${vals.length}`) }
    vals.push(limit)
    const res = await this.pool.query(`
      SELECT * FROM content_review_log ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY id DESC LIMIT $${vals.length}`, vals)
    return res.rows.map(l => ({
      id: l.id,
      contentType: l.content_type,
      contentId: l.content_id,
      revisionId: l.revision_id,
      action: l.action,
      operator: l.operator,
      reason: l.reason ?? null,
      details: l.details ?? null,
      createdAt: iso(l.created_at)
    }))
  }

  // ================================================================
  // 6. 阵容快照显式映射（M2-9；未匹配快照不自动编成攻略）
  // ================================================================

  async addSnapshotLink({ lineupId, sourceId, structureKey, note = null }) {
    const res = await this.pool.query(`
      INSERT INTO lineup_snapshot_links (lineup_id, source_id, structure_key, note)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (lineup_id, source_id, structure_key) DO UPDATE
        SET note = EXCLUDED.note
      RETURNING *`, [lineupId, sourceId, structureKey, note])
    return res.rows[0]
  }

  async deleteSnapshotLink(id) {
    const res = await this.pool.query(`DELETE FROM lineup_snapshot_links WHERE id = $1 RETURNING id`, [id])
    return res.rows.length > 0
  }

  async listSnapshotLinks({ lineupId = null } = {}) {
    const res = await this.pool.query(`
      SELECT * FROM lineup_snapshot_links ${lineupId ? 'WHERE lineup_id = $1' : ''} ORDER BY id`,
      lineupId ? [lineupId] : [])
    return res.rows.map(l => ({
      id: l.id, lineupId: l.lineup_id, sourceId: l.source_id,
      structureKey: l.structure_key, note: l.note ?? null, createdAt: iso(l.created_at)
    }))
  }

  // ================================================================
  // 7. 公开读取（M2-7 新契约：稳定阵容为根 + 快照子对象）
  // ================================================================

  /** 已发布阵容根列表（含当前发布修订摘要 + 待复核标识） */
  async listPublishedLineupRoots() {
    const res = await this.pool.query(`
      SELECT l.id, l.slug, l.display_name, l.one_line_summary,
             r.id AS revision_id, r.revision, r.difficulty, r.newbie_fit_rationale,
             r.published_at,
             gv.version_id AS game_version_id, gv.status AS game_version_status,
             ce.id AS commander_entity_id, ce.slug AS commander_slug, ce.display_name AS commander_name,
             EXISTS (
               SELECT 1 FROM content_impacts ci
               WHERE ci.content_type = 'LINEUP' AND ci.content_id = l.id AND ci.resolved_at IS NULL
             ) AS has_open_recheck
      FROM lineups l
      JOIN lineup_revisions r
        ON r.lineup_id = l.id AND r.review_status = 'PUBLISHED' AND r.superseded_at IS NULL
      LEFT JOIN game_versions gv ON gv.version_id = r.game_version_id
      LEFT JOIN catalog_entities ce ON ce.id = r.commander_entity_id
      WHERE l.status = 'PUBLISHED'
      ORDER BY r.published_at DESC`)
    return res.rows
  }

  /** 阵容详情当前发布修订（全部 §5 字段） */
  async getPublishedLineupDetailRow(idOrSlug) {
    const res = await this.pool.query(`
      SELECT l.*, r.id AS revision_id, r.revision, r.game_version_id, r.commander_entity_id,
             r.difficulty, r.newbie_fit_rationale, r.play_conditions, r.structure_levels,
             r.stages, r.stabilization, r.skill_chains, r.positioning, r.substitutes,
             r.practice_cases, r.published_at, r.created_by,
             gv.status AS game_version_status, gv.effective_at AS game_version_effective_at,
             ce.slug AS commander_slug, ce.display_name AS commander_name,
             EXISTS (
               SELECT 1 FROM content_impacts ci
               WHERE ci.content_type = 'LINEUP' AND ci.content_id = l.id AND ci.resolved_at IS NULL
             ) AS has_open_recheck
      FROM lineups l
      JOIN lineup_revisions r
        ON r.lineup_id = l.id AND r.review_status = 'PUBLISHED' AND r.superseded_at IS NULL
      LEFT JOIN game_versions gv ON gv.version_id = r.game_version_id
      LEFT JOIN catalog_entities ce ON ce.id = r.commander_entity_id
      WHERE l.status = 'PUBLISHED' AND (l.id = $1 OR l.slug = $1)
      LIMIT 1`, [idOrSlug])
    return res.rows[0] || null
  }

  async listLineupRevisionHistory(idOrSlug) {
    const res = await this.pool.query(`
      SELECT r.id, r.revision, r.review_status, r.published_at, r.superseded_at, r.created_at, r.created_by
      FROM lineup_revisions r JOIN lineups l ON l.id = r.lineup_id
      WHERE l.id = $1 OR l.slug = $1
      ORDER BY r.revision DESC`, [idOrSlug])
    return res.rows
  }

  /** 阵容映射的来源快照子对象（来源公开口径：READY/ACTIVE + 快照 ACTIVE） */
  async listLinkedSnapshotRows(lineupIds) {
    if (!lineupIds.length) return []
    const res = await this.pool.query(`
      SELECT lsl.lineup_id, ls.*, ds.name AS source_name, ds.status AS source_status,
             ds.type AS source_type, ds.url AS source_url, ds.license_note AS source_license_note,
             -- M4-5 §6「同步失败保留上次快照并明确状态」：来源健康字段随快照一起公开，
             -- 失败与否由 data_sources 真实台账状态决定（last_error 非空 = 最近一次尝试失败）
             ds.last_error AS source_last_error,
             ds.last_attempt_at AS source_last_attempt_at,
             ds.last_success_at AS source_last_success_at
      FROM lineup_snapshot_links lsl
      JOIN lineup_snapshots ls ON ls.source_id = lsl.source_id AND ls.structure_key = lsl.structure_key
      JOIN data_sources ds ON ds.source_id = ls.source_id
      WHERE lsl.lineup_id = ANY($1::varchar[])
        AND ds.status IN ('ACTIVE', 'READY') AND ls.record_status = 'ACTIVE'
      ORDER BY lsl.lineup_id, ls.source_id, ls.updated_at DESC`, [lineupIds])
    return res.rows
  }

  /** 未映射的可用快照（管理端映射工作台用；不进公开阵容列表） */
  async listUnmappedSnapshotRows() {
    const res = await this.pool.query(`
      SELECT ls.source_id, ls.structure_key, ls.lineup_name, ls.id, ls.updated_at, ds.name AS source_name
      FROM lineup_snapshots ls
      JOIN data_sources ds ON ds.source_id = ls.source_id
      WHERE ls.record_status = 'ACTIVE' AND ds.status IN ('ACTIVE', 'READY')
        AND NOT EXISTS (
          SELECT 1 FROM lineup_snapshot_links lsl
          WHERE lsl.source_id = ls.source_id AND lsl.structure_key = ls.structure_key
        )
      ORDER BY ls.source_id, ls.updated_at DESC`)
    return res.rows
  }

  // ---------------- 课程（/learn + /lessons/:slug） ----------------

  async listPublishedLessonRows() {
    const res = await this.pool.query(`
      SELECT l.id, l.slug, l.title, l.stage, l.sort_order,
             r.id AS revision_id, r.objectives, r.published_at,
             gv.version_id AS game_version_id,
             EXISTS (
               SELECT 1 FROM content_impacts ci
               WHERE ci.content_type = 'LESSON' AND ci.content_id = l.id AND ci.resolved_at IS NULL
             ) AS has_open_recheck
      FROM lessons l
      JOIN lesson_revisions r
        ON r.lesson_id = l.id AND r.review_status = 'PUBLISHED' AND r.superseded_at IS NULL
      LEFT JOIN game_versions gv ON gv.version_id = r.game_version_id
      WHERE l.status = 'PUBLISHED'
      ORDER BY l.stage, l.sort_order, l.id`)
    return res.rows
  }

  async getPublishedLessonRow(idOrSlug) {
    const res = await this.pool.query(`
      SELECT l.*, r.id AS revision_id, r.revision, r.game_version_id,
             r.objectives, r.sections, r.practice, r.published_at,
             gv.status AS game_version_status,
             EXISTS (
               SELECT 1 FROM content_impacts ci
               WHERE ci.content_type = 'LESSON' AND ci.content_id = l.id AND ci.resolved_at IS NULL
             ) AS has_open_recheck
      FROM lessons l
      JOIN lesson_revisions r
        ON r.lesson_id = l.id AND r.review_status = 'PUBLISHED' AND r.superseded_at IS NULL
      LEFT JOIN game_versions gv ON gv.version_id = r.game_version_id
      WHERE l.status = 'PUBLISHED' AND (l.id = $1 OR l.slug = $1) LIMIT 1`, [idOrSlug])
    return res.rows[0] || null
  }

  // ---------------- 资料实体 / 规则条目 / 情境 ----------------

  async listPublishedEntityRows({ kind = null, q = null } = {}) {
    const where = [`e.status = 'PUBLISHED'`, `EXISTS (
      SELECT 1 FROM catalog_entity_revisions r
      WHERE r.entity_id = e.id AND r.review_status = 'PUBLISHED' AND r.superseded_at IS NULL)`]
    const vals = []
    if (kind) { vals.push(kind); where.push(`e.kind = $${vals.length}`) }
    if (q) { vals.push(`%${q}%`); where.push(`(e.display_name ILIKE $${vals.length} OR e.slug ILIKE $${vals.length})`) }
    const res = await this.pool.query(`
      SELECT e.id, e.slug, e.kind, e.display_name, r.facts, r.published_at, r.game_version_id
      FROM catalog_entities e
      JOIN catalog_entity_revisions r
        ON r.entity_id = e.id AND r.review_status = 'PUBLISHED' AND r.superseded_at IS NULL
      WHERE ${where.join(' AND ')}
      ORDER BY e.kind, e.display_name`, vals)
    return res.rows
  }

  async getPublishedEntityRow(kind, slugOrId) {
    const res = await this.pool.query(`
      SELECT e.*, r.id AS revision_id, r.revision, r.facts, r.game_version_id, r.published_at,
             gv.status AS game_version_status
      FROM catalog_entities e
      JOIN catalog_entity_revisions r
        ON r.entity_id = e.id AND r.review_status = 'PUBLISHED' AND r.superseded_at IS NULL
      LEFT JOIN game_versions gv ON gv.version_id = r.game_version_id
      WHERE e.status = 'PUBLISHED' AND e.kind = $1 AND (e.id = $2 OR e.slug = $2) LIMIT 1`,
      [kind, slugOrId])
    return res.rows[0] || null
  }

  async listPublishedMechanicRows({ q = null } = {}) {
    const where = [`m.status = 'PUBLISHED'`, `EXISTS (
      SELECT 1 FROM mechanic_revisions r
      WHERE r.mechanic_id = m.id AND r.review_status = 'PUBLISHED' AND r.superseded_at IS NULL)`]
    const vals = []
    if (q) { vals.push(`%${q}%`); where.push(`(m.title ILIKE $${vals.length} OR m.slug ILIKE $${vals.length})`) }
    const res = await this.pool.query(`
      SELECT m.id, m.slug, m.title, r.statement_raw, r.params, r.applies_to,
             r.game_version_id, r.published_at
      FROM mechanics m
      JOIN mechanic_revisions r
        ON r.mechanic_id = m.id AND r.review_status = 'PUBLISHED' AND r.superseded_at IS NULL
      WHERE ${where.join(' AND ')}
      ORDER BY m.title`, vals)
    return res.rows
  }

  async getPublishedMechanicRow(slugOrId) {
    const res = await this.pool.query(`
      SELECT m.*, r.id AS revision_id, r.revision, r.statement_raw, r.params, r.applies_to,
             r.game_version_id, r.published_at, gv.status AS game_version_status
      FROM mechanics m
      JOIN mechanic_revisions r
        ON r.mechanic_id = m.id AND r.review_status = 'PUBLISHED' AND r.superseded_at IS NULL
      LEFT JOIN game_versions gv ON gv.version_id = r.game_version_id
      WHERE m.status = 'PUBLISHED' AND (m.id = $1 OR m.slug = $1) LIMIT 1`, [slugOrId])
    return res.rows[0] || null
  }

  async listPublishedScenarioRows({ lineupId = null, lessonId = null } = {}) {
    const where = [`s.status = 'PUBLISHED'`]
    const vals = []
    if (lineupId) { vals.push(lineupId); where.push(`s.lineup_id = $${vals.length}`) }
    if (lessonId) { vals.push(lessonId); where.push(`s.lesson_id = $${vals.length}`) }
    const res = await this.pool.query(`
      SELECT s.* FROM scenarios s WHERE ${where.join(' AND ')} ORDER BY s.id`, vals)
    return res.rows
  }
}
