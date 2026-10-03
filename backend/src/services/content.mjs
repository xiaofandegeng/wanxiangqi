// v6 · ContentService — 内容生命周期编排与发布校验（M2-1..M2-6，任务书 §7.2）
//
// 发布门槛（publishRevision 前置校验，全部通过才允许状态流转）：
//   通用：修订存在且为 DRAFT/PENDING_REVIEW；适用版本已登记且为当前版本
//         （跨版本强绑定拒绝：默认内容面不混排旧版本推荐）；
//         至少一条来源引用，且引用目标可解析（EVIDENCE 需 VERIFIED 且原件在库）。
//   LINEUP（A04）：§5.1–5.6 八个章节字段全部非空 + 难度 + 新手适合度理由 +
//         构成清单非空且实体真实存在（孤立实体 ID 拒绝）。
//   LESSON：学习目标与正文非空；先修图无环（DFS，先修循环拒绝）。
//   MECHANIC：原始说明非空（唯一规则事实，来源原文不改写）。
//   CATALOG_ENTITY：版本化事实非空。
//   SCENARIO：已知状态/分支/反馈非空且必须有出处。
// 生命周期：草稿→待审核→发布（同事务台账）；回滚=复制历史修订为新草稿；
// 退役=实体级 RETIRED。上传≠发布；AI 只能参与草稿，数值事实一律人工核对。

import { ContentRepository, ContentError, CONTENT_TYPES } from '../repositories/content-repository.mjs'
import { PgRepository } from '../repositories/pg-repository.mjs'

const LINEUP_STAGES = 7 * 24 * 3600 * 1000 // 与 pg-repository 快照过期阈值一致

const notEmpty = v => v != null && (
  Array.isArray(v) ? v.length > 0 : typeof v === 'object' ? Object.keys(v).length > 0 : String(v).trim() !== ''
)

export class ContentService {
  constructor(repo, contentRepo = null) {
    this.repo = repo
    this.content = contentRepo || new ContentRepository(repo.pool)
  }

  // ================================================================
  // 版本与官方更新（M2-1）
  // ================================================================

  async listVersions() {
    return this.content.listGameVersions()
  }

  async createVersion({ versionId, officialBasis, effectiveAt, note }, operator = 'ADMIN') {
    if (!versionId || !officialBasis) {
      throw new ContentError('版本登记需 versionId 与官方依据（officialBasis）', { status: 422, code: 'MISSING_FIELDS' })
    }
    const v = await this.content.upsertGameVersion({ versionId, officialBasis, effectiveAt, note })
    await this.content.appendReviewLog({
      contentType: 'GAME_VERSION', contentId: versionId, action: 'SAVE_DRAFT',
      operator, reason: '版本登记', details: { officialBasis, effectiveAt }
    })
    return v
  }

  /** 激活当前版本：旧版本已发布内容批量登记待复核（A09）；可附带发布公告 */
  async activateVersion(versionId, { patchNoteId = null, note = null } = {}, operator = 'ADMIN') {
    return this.content.activateGameVersion(versionId, { patchNoteId, operator, note })
  }

  async listUpdates() {
    return this.content.listPatchNotes({ publicOnly: true })
  }

  async getUpdate(slugOrId) {
    const note = await this.content.getPatchNote(slugOrId, { publicOnly: true })
    if (!note) return null
    return note
  }

  async createPatchNote(payload, operator = 'ADMIN') {
    const { versionId, slug, title, officialUrl, officialPublishedAt, fetchedAt, summary, id } = payload
    if (!versionId || !slug || !title) {
      throw new ContentError('更新公告需 versionId / slug / title', { status: 422, code: 'MISSING_FIELDS' })
    }
    const version = (await this.content.listGameVersions()).find(v => v.versionId === versionId)
    if (!version) {
      throw new ContentError(`版本 [${versionId}] 未登记，先登记版本再录入公告`,
        { status: 422, code: 'VERSION_NOT_FOUND' })
    }
    const note = await this.content.createPatchNote({
      id: id || `pn-${slug}`, versionId, slug, title, officialUrl,
      officialPublishedAt, fetchedAt, summary
    })
    await this.content.appendReviewLog({
      contentType: 'PATCH_NOTE', contentId: note.id, action: 'SAVE_DRAFT',
      operator, reason: '官方更新公告录入', details: { officialUrl }
    })
    return note
  }

  async publishPatchNote(id, operator = 'ADMIN') {
    const note = await this.content.publishPatchNote(id, { operator })
    return note
  }

  async addImpacts(patchNoteId, impacts = [], operator = 'ADMIN') {
    for (const im of impacts) {
      if (!im.contentId || !im.contentType) {
        throw new ContentError('影响项需 contentType + contentId', { status: 422, code: 'MISSING_FIELDS' })
      }
    }
    return this.content.addContentImpacts(patchNoteId, impacts)
  }

  async resolveImpact(impactId, { resolution = 'UPDATED', note = null, resolvedBy = 'ADMIN' } = {}) {
    if (!['UPDATED', 'UNAFFECTED', 'NEEDS_RECHECK'].includes(resolution)) {
      throw new ContentError('复核结论须为 UPDATED / UNAFFECTED / NEEDS_RECHECK', { status: 422, code: 'BAD_RESOLUTION' })
    }
    const row = await this.content.resolveContentImpact(impactId, { resolution, resolvedBy, note })
    if (!row) throw new ContentError(`复核项 [${impactId}] 不存在`, { status: 404, code: 'NOT_FOUND' })
    return row
  }

  async listRechecks({ openOnly = true } = {}) {
    return this.content.listContentImpacts({ openOnly })
  }

  // ================================================================
  // 内容生命周期（M2-2..M2-6）
  // ================================================================

  async listContent(typeName, filters = {}) {
    this.content.type(typeName)
    const rows = await this.content.listContentRoots(typeName, filters)
    return rows.map(r => this.rootWire(typeName, r))
  }

  async getContent(typeName, idOrSlug) {
    const t = this.content.type(typeName)
    const root = await this.content.getContentRootRow(typeName, idOrSlug)
    if (!root) return null
    const result = { ...this.rootWire(typeName, root) }
    if (t.hasRevisions) {
      const revs = await this.content.listRevisionRows(typeName, root.id)
      result.revisions = revs.map(r => this.revisionWire(typeName, r))
      const current = revs.find(r => r.review_status === 'PUBLISHED' && r.superseded_at === null)
      if (current) {
        const comps = await this.content.listLineupComponents([current.id])
        if (comps.has(Number(current.id))) result.currentComponents = comps.get(Number(current.id))
      }
    }
    result.references = await this.content.listContentReferences({ contentType: t.label, contentId: root.id })
    result.reviewLog = await this.content.listReviewLog({ contentType: t.label, contentId: root.id })
    return result
  }

  async createContent(typeName, payload, operator = 'ADMIN') {
    const t = this.content.type(typeName)
    if (!payload.id || !payload.slug || (typeName !== 'scenarios' && !payload.title && !payload.displayName)) {
      throw new ContentError('内容创建需 id / slug / 名称', { status: 422, code: 'MISSING_FIELDS' })
    }
    if (typeName === 'scenarios' && !payload.title) {
      throw new ContentError('内容创建需 id / slug / title', { status: 422, code: 'MISSING_FIELDS' })
    }
    const root = await this.content.insertContentRoot(typeName, payload)
    await this.content.appendReviewLog({
      contentType: t.label, contentId: root.id, action: 'SAVE_DRAFT', operator,
      reason: '创建内容（草稿）', details: { slug: root.slug }
    })
    return this.rootWire(typeName, root)
  }

  async updateContent(typeName, idOrSlug, patch, operator = 'ADMIN') {
    const t = this.content.type(typeName)
    // 可变展示字段可改；稳定 id/slug 不经此路径变更
    delete patch.id
    delete patch.slug
    delete patch.status
    const root = await this.content.updateContentRoot(typeName, idOrSlug, patch)
    if (!root) return null
    await this.content.appendReviewLog({
      contentType: t.label, contentId: root.id, action: 'SAVE_DRAFT', operator,
      reason: '更新展示字段', details: patch
    })
    return this.rootWire(typeName, root)
  }

  /** 新建修订（lineup 附带构成清单 components） */
  async createRevision(typeName, idOrSlug, payload, operator = 'ADMIN') {
    const t = this.content.type(typeName)
    if (!t.hasRevisions) {
      throw new ContentError('scenarios 为根级内容，直接编辑后发布', { status: 409, code: 'NO_REVISIONS' })
    }
    const root = await this.content.getContentRootRow(typeName, idOrSlug)
    if (!root) throw new ContentError(`内容 [${idOrSlug}] 不存在`, { status: 404, code: 'NOT_FOUND' })
    const { components, ...revFields } = payload
    // 阵容构成：孤立实体引用在录入时即拒绝（存在性 + 角色必填）
    if (typeName === 'lineups' && Array.isArray(components)) {
      for (const c of components) {
        if (!c.entityId || !c.role) {
          throw new ContentError('阵容构成项需 entityId 与 role（核心输出/前排/…）',
            { status: 422, code: 'MISSING_FIELDS' })
        }
        const ent = await this.content.getContentRootRow('catalog-entities', c.entityId)
        if (!ent) {
          throw new ContentError(`构成实体 [${c.entityId}] 不存在（孤立实体引用拒绝）`,
            { status: 422, code: 'ENTITY_NOT_FOUND' })
        }
      }
    }
    const revisionNo = await this.content.nextRevisionNo(typeName, root.id)
    const rev = await this.content.insertRevision(typeName, root.id, { revisionNo, createdBy: operator, ...revFields })
    if (typeName === 'lineups' && Array.isArray(components)) {
      await this.content.replaceLineupComponents(rev.id, components)
    }
    await this.content.appendReviewLog({
      contentType: t.label, contentId: root.id, revisionId: rev.id, action: 'SAVE_DRAFT',
      operator, reason: `新建修订 r${revisionNo}`
    })
    return this.revisionWire(typeName, rev)
  }

  async submitRevision(typeName, revisionId, operator = 'ADMIN') {
    const rev = await this.content.submitRevision(typeName, revisionId, { operator })
    return this.revisionWire(typeName, rev)
  }

  async publishRevision(typeName, revisionId, { operator = 'ADMIN', reason = null } = {}) {
    await this.validatePublish(typeName, revisionId)
    const rev = await this.content.publishRevision(typeName, revisionId, { operator, reason })
    return this.revisionWire(typeName, rev)
  }

  async publishScenario(idOrSlug, { operator = 'ADMIN', reason = null } = {}) {
    const root = await this.content.getContentRootRow('scenarios', idOrSlug)
    if (!root) throw new ContentError(`情境 [${idOrSlug}] 不存在`, { status: 404, code: 'NOT_FOUND' })
    await this.validateScenarioPublish(root)
    const row = await this.content.publishScenarioRoot(root.id, { operator, reason })
    return this.rootWire('scenarios', row)
  }

  async retractContent(typeName, idOrSlug, { reason, operator = 'ADMIN' } = {}) {
    const t = this.content.type(typeName)
    const root = await this.content.getContentRootRow(typeName, idOrSlug)
    if (!root) return null
    const row = await this.content.retractContent(typeName, root.id, { operator, reason })
    return this.rootWire(typeName, row)
  }

  async rollbackContent(typeName, idOrSlug, { targetRevisionId, reason = null } = {}, operator = 'ADMIN') {
    const t = this.content.type(typeName)
    if (!t.hasRevisions) throw new ContentError('该内容类型无修订历史', { status: 409, code: 'NO_REVISIONS' })
    const root = await this.content.getContentRootRow(typeName, idOrSlug)
    if (!root) throw new ContentError(`内容 [${idOrSlug}] 不存在`, { status: 404, code: 'NOT_FOUND' })
    const target = await this.content.getRevisionRow(typeName, targetRevisionId)
    if (!target || target[t.revFk] !== root.id) {
      throw new ContentError('回滚目标修订不存在', { status: 404, code: 'REVISION_NOT_FOUND' })
    }
    const rev = await this.content.rollbackToRevision(typeName, root.id, targetRevisionId, { operator, reason })
    // 构成清单随修订复制（阵容手册的 §5.5 结构化替补关系不可丢）
    if (typeName === 'lineups') {
      const comps = await this.content.listLineupComponents([targetRevisionId])
      if (comps.has(Number(targetRevisionId))) {
        await this.content.replaceLineupComponents(rev.id,
          comps.get(Number(targetRevisionId)).map(c => ({
            entityId: c.entityId, role: c.role, necessity: c.necessity,
            substituteFor: c.substituteFor, notes: c.notes
          })))
      }
    }
    return this.revisionWire(typeName, rev)
  }

  async setDependencies(idOrSlug, dependsOn = [], operator = 'ADMIN') {
    const root = await this.content.getContentRootRow('lessons', idOrSlug)
    if (!root) throw new ContentError(`课程 [${idOrSlug}] 不存在`, { status: 404, code: 'NOT_FOUND' })
    for (const dep of dependsOn) {
      const depRow = await this.content.getContentRootRow('lessons', dep)
      if (!depRow) {
        throw new ContentError(`先修课程 [${dep}] 不存在（孤立引用拒绝）`, { status: 422, code: 'DEPENDENCY_NOT_FOUND' })
      }
    }
    // 先修环检测在写入之前：拒绝的请求不得留下任何边（否则 l-a→l-b 被写入后 l-a 多出先修）
    this.assertNoDependencyCycle([
      ...((await this.content.getLessonDependencyEdges())
        .filter(e => e.lessonId !== root.id)),
      ...dependsOn.map(d => ({ lessonId: root.id, dependsOn: d }))
    ])
    await this.content.setLessonDependencies(root.id, dependsOn)
    return { lessonId: root.id, dependsOn }
  }

  async addReference(payload, operator = 'ADMIN') {
    const { contentType, contentId, revisionId = null, refKind, refLocator, usageScope = 'INTERNAL_ONLY', licenseNote = null } = payload
    if (!Object.values(CONTENT_TYPES).some(t => t.label === contentType)) {
      throw new ContentError(`未知引用内容类型 [${contentType}]`, { status: 422, code: 'BAD_CONTENT_TYPE' })
    }
    if (!['URL', 'RAW_MATERIAL', 'EVIDENCE', 'OFFICIAL_PAGE'].includes(refKind)) {
      throw new ContentError('refKind 须为 URL/RAW_MATERIAL/EVIDENCE/OFFICIAL_PAGE', { status: 422, code: 'BAD_REF_KIND' })
    }
    if (!refLocator || !String(refLocator).trim()) {
      throw new ContentError('引用定位（refLocator）不可为空', { status: 422, code: 'MISSING_FIELDS' })
    }
    if (refKind === 'RAW_MATERIAL') {
      const ok = await this.content.rawMaterialExists(String(refLocator))
      if (!ok) throw new ContentError(`原始材料存证 [${refLocator}] 不存在`, { status: 422, code: 'REF_NOT_FOUND' })
    }
    if (refKind === 'EVIDENCE') {
      const facts = await this.content.getEvidenceRefFacts(String(refLocator))
      if (!facts) throw new ContentError(`证据 [${refLocator}] 不存在`, { status: 422, code: 'REF_NOT_FOUND' })
      if (usageScope === 'PUBLIC' && facts.status !== 'VERIFIED') {
        throw new ContentError('公开引用必须指向已人工核验（VERIFIED）的证据', { status: 422, code: 'EVIDENCE_NOT_VERIFIED' })
      }
    }
    return this.content.addContentReference({
      contentType, contentId, revisionId, refKind, refLocator, usageScope, licenseNote, createdBy: operator
    })
  }

  listReferences(filters = {}) {
    return this.content.listContentReferences(filters)
  }

  getReviewLog(filters = {}) {
    return this.content.listReviewLog(filters)
  }

  // ---------------- 快照映射（M2-9） ----------------

  async linkSnapshot({ lineupId, sourceId, structureKey, note = null }, operator = 'ADMIN') {
    const root = await this.content.getContentRootRow('lineups', lineupId)
    if (!root) throw new ContentError(`阵容 [${lineupId}] 不存在`, { status: 404, code: 'NOT_FOUND' })
    const link = await this.content.addSnapshotLink({ lineupId: root.id, sourceId, structureKey, note })
    await this.content.appendReviewLog({
      contentType: 'LINEUP', contentId: root.id, action: 'SAVE_DRAFT', operator,
      reason: '建立来源快照映射', details: { sourceId, structureKey }
    })
    return { id: link.id, lineupId: link.lineup_id, sourceId: link.source_id, structureKey: link.structure_key, note: link.note }
  }

  async unlinkSnapshot(id) {
    const ok = await this.content.deleteSnapshotLink(id)
    if (!ok) throw new ContentError(`映射 [${id}] 不存在`, { status: 404, code: 'NOT_FOUND' })
    return { deleted: true }
  }

  listSnapshotLinks(filters = {}) {
    return this.content.listSnapshotLinks(filters)
  }

  async listUnmappedSnapshots() {
    return (await this.content.listUnmappedSnapshotRows()).map(r => ({
      snapshotId: r.id, sourceId: r.source_id, sourceName: r.source_name,
      structureKey: r.structure_key, lineupName: r.lineup_name, updatedAt: r.updated_at
    }))
  }

  // ================================================================
  // 发布校验（A03/A04 + §7.2）
  // ================================================================

  async validatePublish(typeName, revisionId) {
    const t = this.content.type(typeName)
    const rev = await this.content.getRevisionRow(typeName, revisionId)
    if (!rev) throw new ContentError(`修订 [${revisionId}] 不存在`, { status: 404, code: 'REVISION_NOT_FOUND' })
    if (!['DRAFT', 'PENDING_REVIEW'].includes(rev.review_status)) {
      throw new ContentError(`仅草稿/待审核修订可发布（当前 ${rev.review_status}）`, { status: 409, code: 'INVALID_STATE' })
    }

    // 1) 来源引用：至少一条且全部可解析（原件存在检查 / 内部材料不公开）
    const refs = (await this.content.listContentReferences({ contentType: t.label, contentId: rev[t.revFk] }))
      .filter(r => r.revisionId === null || r.revisionId === Number(revisionId))
    if (!refs.length) {
      throw new ContentError('发布前至少登记一条来源引用（无来源内容不得发布）',
        { status: 422, code: 'NO_REFERENCES' })
    }
    for (const ref of refs) {
      if (ref.refKind === 'EVIDENCE') {
        const facts = await this.content.getEvidenceRefFacts(ref.refLocator)
        if (!facts) {
          throw new ContentError(`引用的证据 [${ref.refLocator}] 不存在`, { status: 422, code: 'REF_NOT_FOUND' })
        }
        if (ref.usageScope === 'PUBLIC' && facts.status !== 'VERIFIED') {
          throw new ContentError(`公开引用的证据 [${ref.refLocator}] 未人工核验`, { status: 422, code: 'EVIDENCE_NOT_VERIFIED' })
        }
        if (facts.blob_count === 0) {
          throw new ContentError(`引用的证据 [${ref.refLocator}] 无可恢复原件（原件存在检查失败）`,
            { status: 422, code: 'ORIGINAL_MISSING' })
        }
      }
    }

    // 2) 适用版本：必须已登记且为当前版本（跨版本强绑定拒绝）
    const current = await this.content.getCurrentGameVersion()
    if (!rev.game_version_id) {
      throw new ContentError('发布需绑定适用版本（gameVersionId）；未注明适用版本的内容不得发布',
        { status: 422, code: 'MISSING_GAME_VERSION' })
    }
    if (!current || current.versionId !== rev.game_version_id) {
      throw new ContentError(
        `适用版本 [${rev.game_version_id}] 不是当前版本${current ? `（当前 ${current.versionId}）` : '（尚未激活任何当前版本）'}：跨版本强绑定拒绝，历史内容请走复核/退役流程`,
        { status: 422, code: 'VERSION_NOT_CURRENT' })
    }

    // 3) 类型专属校验
    if (typeName === 'lineups') await this.validateLineupPublish(rev)
    if (typeName === 'lessons') await this.validateLessonPublish(rev)
    if (typeName === 'mechanics') this.validateMechanicPublish(rev)
    if (typeName === 'catalog-entities') this.validateEntityPublish(rev)
    return true
  }

  async validateLineupPublish(rev) {
    // rev 为修订原始行（snake_case 列名）
    const required = [
      ['play_conditions', '定阵条件（§5.1）'],
      ['structure_levels', '结构分层（§5.1）'],
      ['stages', '条件化阶段操作（§5.2）'],
      ['stabilization', '稳血与快速成型（§5.3）'],
      ['skill_chains', '技能操作链（§5.4）'],
      ['positioning', '站位与变阵（§5.5）'],
      ['substitutes', '替补说明（§5.5）'],
      ['practice_cases', '实战案例引用（§5.6）']
    ]
    for (const [col, label] of required) {
      if (!notEmpty(rev[col])) {
        throw new ContentError(`阵容手册缺少必填章节：${label}（缺少必填章节阻止发布）`,
          { status: 422, code: 'MISSING_SECTION' })
      }
    }
    if (!rev.difficulty) {
      throw new ContentError('阵容手册需标注难度（低/中/高，附操作要求）', { status: 422, code: 'MISSING_SECTION' })
    }
    if (!notEmpty(rev.newbie_fit_rationale)) {
      throw new ContentError('阵容手册需写新手适合度理由（不是胜率评分）', { status: 422, code: 'MISSING_SECTION' })
    }
    const comps = await this.content.listLineupComponents([rev.id])
    const list = comps.get(Number(rev.id)) || []
    if (!list.length) {
      throw new ContentError('阵容手册需登记构成清单（每张卡的角色与必需性）', { status: 422, code: 'MISSING_COMPONENTS' })
    }
    if (rev.commander_entity_id) {
      const commander = await this.content.getContentRootRow('catalog-entities', rev.commander_entity_id)
      if (!commander) {
        throw new ContentError(`棋手实体 [${rev.commander_entity_id}] 不存在（孤立实体引用拒绝）`,
          { status: 422, code: 'ENTITY_NOT_FOUND' })
      }
    }
  }

  async validateLessonPublish(rev) {
    if (!notEmpty(rev.objectives)) {
      throw new ContentError('课程需写学习目标（学完能做什么）', { status: 422, code: 'MISSING_SECTION' })
    }
    if (!notEmpty(rev.sections)) {
      throw new ContentError('课程正文不可为空', { status: 422, code: 'MISSING_SECTION' })
    }
    // 先修环检测（含本课既有边）
    const edges = await this.content.getLessonDependencyEdges()
    this.assertNoDependencyCycle(edges)
  }

  validateMechanicPublish(rev) {
    if (!notEmpty(rev.statement_raw)) {
      throw new ContentError('规则条目需保留来源原始说明（statementRaw）', { status: 422, code: 'MISSING_SECTION' })
    }
  }

  validateEntityPublish(rev) {
    if (!notEmpty(rev.facts)) {
      throw new ContentError('资料实体需登记版本化事实（facts）', { status: 422, code: 'MISSING_SECTION' })
    }
  }

  async validateScenarioPublish(root) {
    for (const [col, label] of [
      ['initial_state', '已知状态'], ['branches', '条件分支'], ['feedback', '反馈']
    ]) {
      if (!notEmpty(root[col])) {
        throw new ContentError(`教学情境缺少：${label}`, { status: 422, code: 'MISSING_SECTION' })
      }
    }
    const refs = await this.content.listContentReferences({ contentType: 'SCENARIO', contentId: root.id })
    if (!refs.length && !notEmpty(root.source_note)) {
      throw new ContentError('教学情境必须有出处（来源引用或 sourceNote），虚构案例拒绝发布',
        { status: 422, code: 'NO_REFERENCES' })
    }
  }

  /** 有向图环检测（先修循环拒绝；DFS 三色标记） */
  assertNoDependencyCycle(edges) {
    const adj = new Map()
    for (const e of edges) {
      if (!adj.has(e.lessonId)) adj.set(e.lessonId, [])
      adj.get(e.lessonId).push(e.dependsOn)
    }
    const color = new Map() // 0=未访问 1=在栈 2=完成
    const visit = (node, path) => {
      const c = color.get(node) || 0
      if (c === 1) {
        throw new ContentError(`先修依赖成环：${[...path, node].join(' → ')}（先修循环拒绝）`,
          { status: 422, code: 'DEPENDENCY_CYCLE' })
      }
      if (c === 2) return
      color.set(node, 1)
      for (const next of adj.get(node) || []) visit(next, [...path, node])
      color.set(node, 2)
    }
    for (const node of adj.keys()) visit(node, [])
    return true
  }

  // ================================================================
  // 公开读取（M2-7 新契约）
  // ================================================================

  /** GET /api/v1/lineups —— 稳定阵容为根，来源统计为子对象 */
  async getLineupsList() {
    const roots = await this.content.listPublishedLineupRoots()
    if (!roots.length) return []
    const compMap = await this.content.listLineupComponents(roots.map(r => r.revision_id))
    const snapRows = await this.content.listLinkedSnapshotRows(roots.map(r => r.id))
    const snapsByLineup = new Map()
    for (const s of snapRows) {
      const list = snapsByLineup.get(s.lineup_id) || []
      list.push(this.snapshotSubObject(s))
      snapsByLineup.set(s.lineup_id, list)
    }
    return roots.map(r => ({
      id: r.id,
      slug: r.slug,
      displayName: r.display_name,
      oneLineSummary: r.one_line_summary ?? null,
      difficulty: r.difficulty,
      newbieFitRationale: r.newbie_fit_rationale ?? null,
      gameVersion: r.game_version_id
        ? { versionId: r.game_version_id, status: r.game_version_status }
        : null,
      commander: r.commander_entity_id
        ? { id: r.commander_entity_id, slug: r.commander_slug, displayName: r.commander_name }
        : null,
      components: (compMap.get(Number(r.revision_id)) || []).map(c => ({
        entityId: c.entityId, slug: c.entitySlug, displayName: c.entityName,
        kind: c.entityKind, role: c.role, necessity: c.necessity, substituteFor: c.substituteFor
      })),
      hasOpenRecheck: r.has_open_recheck,
      publishedAt: r.published_at,
      snapshots: snapsByLineup.get(r.id) || []
    }))
  }

  /** GET /api/v1/lineups/:slugOrId —— 详情（§5 全字段 + 统计子对象 + 修订历史索引） */
  async getLineupDetail(idOrSlug) {
    const row = await this.content.getPublishedLineupDetailRow(idOrSlug)
    if (!row) return null
    const comps = await this.content.listLineupComponents([row.revision_id])
    const snapRows = await this.content.listLinkedSnapshotRows([row.id])
    const history = await this.content.listLineupRevisionHistory(idOrSlug)
    const refs = await this.content.listContentReferences({
      contentType: 'LINEUP', contentId: row.id, publicOnly: true
    })
    return {
      id: row.id,
      slug: row.slug,
      displayName: row.display_name,
      oneLineSummary: row.one_line_summary ?? null,
      difficulty: row.difficulty,
      newbieFitRationale: row.newbie_fit_rationale ?? null,
      gameVersion: row.game_version_id
        ? { versionId: row.game_version_id, status: row.game_version_status, effectiveAt: row.game_version_effective_at }
        : null,
      commander: row.commander_entity_id
        ? { id: row.commander_entity_id, slug: row.commander_slug, displayName: row.commander_name }
        : null,
      sections: {
        playConditions: row.play_conditions,
        structureLevels: row.structure_levels,
        stages: row.stages,
        stabilization: row.stabilization,
        skillChains: row.skill_chains,
        positioning: row.positioning,
        substitutes: row.substitutes,
        practiceCases: row.practice_cases
      },
      components: (comps.get(Number(row.revision_id)) || []).map(c => ({
        entityId: c.entityId, slug: c.entitySlug, displayName: c.entityName,
        kind: c.entityKind, role: c.role, necessity: c.necessity,
        substituteFor: c.substituteFor, notes: c.notes
      })),
      revision: { id: row.revision_id, no: row.revision, publishedAt: row.published_at },
      hasOpenRecheck: row.has_open_recheck,
      references: refs,
      snapshots: snapRows.map(s => this.snapshotSubObject(s)),
      revisionHistory: history.map(h => ({
        revisionId: h.id, no: h.revision, status: h.review_status,
        publishedAt: h.published_at, supersededAt: h.superseded_at, createdBy: h.created_by
      }))
    }
  }

  /** 快照子对象（§6 口径：来源公布值原样 + 单位/窗口/截止/抓取时间，不换算不平均） */
  snapshotSubObject(s) {
    const wire = PgRepository.LINEUP_WIRE(s)
    return {
      ...wire,
      sourceUrl: s.source_url ?? null,
      sourceLicenseNote: s.source_license_note ?? null,
      mode: s.mode ?? null,
      rawMetrics: s.raw_metrics ?? null
    }
  }

  /** GET /api/v1/learn —— 阶段化课程路径 */
  async getLearnPath() {
    const lessons = await this.content.listPublishedLessonRows()
    const deps = await this.content.listLessonDependencies()
    const depsBy = new Map()
    for (const d of deps) {
      const list = depsBy.get(d.lessonId) || []
      list.push({ id: d.dependsOnId, slug: d.dependsOnSlug, title: d.dependsOnTitle })
      depsBy.set(d.lessonId, list)
    }
    const wire = lessons.map(l => ({
      id: l.id, slug: l.slug, title: l.title, stage: l.stage, sortOrder: l.sort_order,
      objectives: l.objectives ?? null,
      gameVersion: l.game_version_id ? { versionId: l.game_version_id } : null,
      hasOpenRecheck: l.has_open_recheck,
      publishedAt: l.published_at,
      prerequisites: depsBy.get(l.id) || []
    }))
    const stages = ['A', 'B', 'C', 'D', 'E', 'F'].map(stage => ({
      stage,
      lessons: wire.filter(l => l.stage === stage)
    }))
    return { stages, total: wire.length }
  }

  /** GET /api/v1/lessons/:slug */
  async getLessonDetail(idOrSlug) {
    const row = await this.content.getPublishedLessonRow(idOrSlug)
    if (!row) return null
    const deps = await this.content.listLessonDependencies()
    const prerequisites = deps.filter(d => d.lessonId === row.id)
      .map(d => ({ id: d.dependsOnId, slug: d.dependsOnSlug, title: d.dependsOnTitle }))
    const refs = await this.content.listContentReferences({
      contentType: 'LESSON', contentId: row.id, publicOnly: true
    })
    const scenarios = (await this.content.listPublishedScenarioRows({ lessonId: row.id }))
      .map(s => ({ id: s.id, slug: s.slug, title: s.title, kind: s.kind }))
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      stage: row.stage,
      sortOrder: row.sort_order,
      objectives: row.objectives ?? null,
      sections: row.sections ?? null,
      practice: row.practice ?? null,
      gameVersion: row.game_version_id
        ? { versionId: row.game_version_id, status: row.game_version_status }
        : null,
      hasOpenRecheck: row.has_open_recheck,
      revision: { id: row.revision_id, no: row.revision, publishedAt: row.published_at },
      prerequisites,
      scenarios,
      references: refs
    }
  }

  /** GET /api/v1/catalog?kind=&q= */
  async getCatalog({ kind = null, q = null } = {}) {
    const rows = await this.content.listPublishedEntityRows({ kind, q })
    return rows.map(r => ({
      id: r.id, slug: r.slug, kind: r.kind, displayName: r.display_name,
      gameVersion: r.game_version_id ? { versionId: r.game_version_id } : null,
      publishedAt: r.published_at,
      factsSummary: this.factsSummary(r.facts)
    }))
  }

  /** GET /api/v1/catalog/:kind/:slug */
  async getEntityDetail(kind, slugOrId) {
    const row = await this.content.getPublishedEntityRow(kind, slugOrId)
    if (!row) return null
    const refs = await this.content.listContentReferences({
      contentType: 'CATALOG_ENTITY', contentId: row.id, publicOnly: true
    })
    return {
      id: row.id,
      slug: row.slug,
      kind: row.kind,
      displayName: row.display_name,
      facts: row.facts ?? null,
      gameVersion: row.game_version_id
        ? { versionId: row.game_version_id, status: row.game_version_status }
        : null,
      revision: { id: row.revision_id, no: row.revision, publishedAt: row.published_at },
      references: refs
    }
  }

  /** GET /api/v1/mechanics 与 /mechanics/:slug */
  async getMechanics({ q = null } = {}) {
    const rows = await this.content.listPublishedMechanicRows({ q })
    return rows.map(r => ({
      id: r.id, slug: r.slug, title: r.title,
      statementRaw: r.statement_raw,
      params: r.params ?? null,
      appliesTo: r.applies_to ?? null,
      gameVersion: r.game_version_id ? { versionId: r.game_version_id } : null,
      publishedAt: r.published_at
    }))
  }

  async getMechanicDetail(slugOrId) {
    const row = await this.content.getPublishedMechanicRow(slugOrId)
    if (!row) return null
    const refs = await this.content.listContentReferences({
      contentType: 'MECHANIC', contentId: row.id, publicOnly: true
    })
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      statementRaw: row.statement_raw,
      params: row.params ?? null,
      appliesTo: row.applies_to ?? null,
      gameVersion: row.game_version_id
        ? { versionId: row.game_version_id, status: row.game_version_status }
        : null,
      revision: { id: row.revision_id, no: row.revision, publishedAt: row.published_at },
      references: refs
    }
  }

  factsSummary(facts) {
    if (!facts || typeof facts !== 'object') return null
    const keys = Object.keys(facts)
    return keys.length ? { fields: keys } : null
  }

  // ---------------- wire ----------------

  rootWire(typeName, r) {
    const base = {
      id: r.id,
      slug: r.slug,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }
    if (typeName === 'catalog-entities') return { ...base, kind: r.kind, displayName: r.display_name }
    if (typeName === 'mechanics') return { ...base, title: r.title }
    if (typeName === 'lineups') return { ...base, displayName: r.display_name, oneLineSummary: r.one_line_summary }
    if (typeName === 'lessons') return { ...base, title: r.title, stage: r.stage, sortOrder: r.sort_order }
    return {
      ...base, title: r.title, kind: r.kind, initialState: r.initial_state,
      branches: r.branches, feedback: r.feedback, sourceNote: r.source_note,
      lineupId: r.lineup_id, lessonId: r.lesson_id
    }
  }

  revisionWire(typeName, r) {
    const wire = {
      id: r.id,
      revision: r.revision,
      reviewStatus: r.review_status,
      gameVersionId: r.game_version_id,
      createdBy: r.created_by,
      createdAt: r.created_at,
      publishedAt: r.published_at,
      supersededAt: r.superseded_at
    }
    if (typeName === 'catalog-entities') return { ...wire, facts: r.facts }
    if (typeName === 'mechanics') {
      return { ...wire, statementRaw: r.statement_raw, params: r.params, appliesTo: r.applies_to }
    }
    if (typeName === 'lineups') {
      return {
        ...wire, commanderEntityId: r.commander_entity_id, difficulty: r.difficulty,
        newbieFitRationale: r.newbie_fit_rationale,
        playConditions: r.play_conditions, structureLevels: r.structure_levels,
        stages: r.stages, stabilization: r.stabilization, skillChains: r.skill_chains,
        positioning: r.positioning, substitutes: r.substitutes, practiceCases: r.practice_cases
      }
    }
    if (typeName === 'lessons') {
      return { ...wire, objectives: r.objectives, sections: r.sections, practice: r.practice }
    }
    return wire
  }
}

