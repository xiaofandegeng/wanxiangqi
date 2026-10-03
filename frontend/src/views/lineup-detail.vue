<template>
  <div class="lineup-detail-view">
    <div class="nav-back-row">
      <router-link to="/lineups" class="back-link">← 返回阵容研习库</router-link>
    </div>

    <div v-if="isLoading" class="loading-state">正在加载阵容手册...</div>

    <div v-else-if="loadError" class="not-found-state">
      <h3>阵容手册加载失败</h3>
      <p>{{ loadError }}</p>
      <button class="primary-btn" @click="loadDetail">重新加载</button>
    </div>

    <div v-else-if="!manual" class="not-found-state">
      <h3>未找到该阵容手册</h3>
      <p>该阵容不存在或尚未发布（草稿/退役内容不在公开面陈列）</p>
      <router-link to="/lineups" class="primary-btn">返回列表</router-link>
    </div>

    <div v-else class="detail-content-wrap">
      <!-- 手册头部：稳定阵容标识 + 难度 + 版本 + 复核状态 -->
      <div class="lineup-header-card">
        <div class="header-left">
          <div class="title-meta">
            <h2 class="lineup-name">
              {{ manual.displayName }}
              <span class="difficulty-badge" :class="difficultyClass(manual.difficulty)">
                {{ difficultyLabel(manual.difficulty) }}
              </span>
              <span v-if="manual.hasOpenRecheck" class="recheck-chip">待版本复核</span>
            </h2>
            <span class="sub-scope">
              <template v-if="manual.commander">棋手 {{ manual.commander.displayName || manual.commander.id }} · </template>
              <template v-if="manual.gameVersion">适用版本 <span class="font-mono">{{ manual.gameVersion.versionId }}</span> · </template>
              <template v-if="manual.revision">手册修订 r{{ manual.revision.no }}</template>
            </span>
            <p v-if="manual.oneLineSummary" class="one-line">{{ manual.oneLineSummary }}</p>
          </div>
        </div>

        <div class="header-right">
          <span v-if="manual.publishedAt" class="update-time">发布于: {{ formatTime(manual.publishedAt) }}</span>
          <span class="source-tag font-mono">{{ manual.slug }}</span>
        </div>
      </div>

      <!-- 新手适合度（任务书：写理由，不是胜率评分） -->
      <div v-if="manual.newbieFitRationale" class="newbie-fit-card">
        <h4 class="fit-title">新手适合度说明</h4>
        <p class="fit-text">{{ manual.newbieFitRationale }}</p>
      </div>

      <!-- 构成清单：每张卡的角色与必需性（§5.5 结构化替补关系） -->
      <div class="section-card">
        <h3 class="section-title">构成清单（角色与必需性）</h3>
        <div v-if="manual.components.length" class="comp-table-wrap">
          <table class="comp-table">
            <thead>
              <tr>
                <th>实体</th>
                <th>种类</th>
                <th>阵容角色</th>
                <th>必需性</th>
                <th>替补关系</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in manual.components" :key="c.entityId + c.role">
                <td>
                  <router-link
                    v-if="c.slug"
                    :to="`/library/${kindSegment(c.kind)}/${c.slug}`"
                    class="comp-entity"
                  >{{ c.displayName || c.entityId }}</router-link>
                  <span v-else>{{ c.displayName || c.entityId }}</span>
                </td>
                <td>{{ kindLabel(c.kind) }}</td>
                <td>{{ roleLabel(c.role) }}</td>
                <td>{{ necessityLabel(c.necessity) }}</td>
                <td class="font-mono sub-text">{{ c.substituteFor || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="section-empty">构成清单未登记</div>
      </div>

      <!-- §5.1–5.6 手册章节（结构化 JSON 如实陈列；未知形态回退原始 JSON） -->
      <div class="section-card">
        <h3 class="section-title">阵容手册正文（§5.1–5.6）</h3>
        <div class="manual-sections">
          <section v-for="sec in renderedSections" :key="sec.key" class="manual-section">
            <h4 class="ms-title">{{ sec.title }}</h4>
            <template v-if="sec.key === 'playConditions'">
              <condition-list :value="sec.value" />
            </template>
            <template v-else-if="sec.key === 'structureLevels'">
              <structure-levels :value="sec.value" />
            </template>
            <template v-else-if="sec.key === 'stages'">
              <stages-list :value="sec.value" />
            </template>
            <template v-else>
              <json-block :value="sec.value" />
            </template>
          </section>
          <p v-if="renderedSections.length === 0" class="section-empty">手册章节字段缺失（数据不完整，如实呈现）</p>
        </div>
      </div>

      <!-- 来源统计子对象（口径原样；未映射如实「暂无统计」） -->
      <div class="section-card">
        <h3 class="section-title">来源统计（参考，非战绩）</h3>
        <div v-if="manual.snapshots.length === 0" class="section-empty">
          暂无统计（无已映射的来源快照；统计不得由本站生成或推算）
        </div>
        <div v-for="s in manual.snapshots" :key="s.id" class="snap-card">
          <div class="snap-head-row">
            <strong>{{ s.sourceName || s.sourceId }}</strong>
            <span v-if="s.sourceUrl" class="snap-url font-mono">{{ s.sourceUrl }}</span>
          </div>
          <div class="snap-metrics-grid">
            <div class="snap-metric">
              <span class="metric-num text-primary">{{ formatRate(s.winRate) }}</span>
              <span class="metric-label">登顶率</span>
            </div>
            <div class="snap-metric">
              <span class="metric-num text-cyan">{{ formatRate(s.top3Rate) }}</span>
              <span class="metric-label">前三率</span>
            </div>
            <div class="snap-metric">
              <span class="metric-num">{{ s.avgRank != null ? s.avgRank.toFixed(2) : '未公布' }}</span>
              <span class="metric-label">平均名次</span>
            </div>
            <div class="snap-metric">
              <span class="metric-num">
                {{ s.sampleCount != null ? s.sampleCount.toLocaleString() : '未公布' }}
                <em class="unit" v-if="s.sampleUnit">{{ s.sampleUnit }}</em>
              </span>
              <span class="metric-label">样本规模</span>
            </div>
          </div>
          <ul class="snap-meta-list">
            <li v-if="s.snapshotVersion"><strong>快照版本:</strong> <span class="font-mono">{{ s.snapshotVersion }}</span></li>
            <li v-if="s.windowText"><strong>统计窗口:</strong> {{ s.windowText }}</li>
            <li v-if="s.scope"><strong>统计范围:</strong> {{ s.scope }}</li>
            <li v-if="s.mode"><strong>模式:</strong> {{ s.mode }}</li>
            <li v-if="s.dataCutoffAt"><strong>数据截止:</strong> {{ formatTime(s.dataCutoffAt) }}</li>
            <li><strong>快照采集:</strong> {{ formatTime(s.updatedAt) }}（采集时间 ≠ 数据截止时间）</li>
            <li v-if="s.sourceLicenseNote"><strong>许可说明:</strong> {{ s.sourceLicenseNote }}</li>
          </ul>
          <p class="snap-note">
            以上为该来源公布的聚合统计，口径原样陈列；本站不跨来源平均、不推算个人战绩、不生成对局建议。
          </p>
        </div>
      </div>

      <!-- 公开来源引用（内部材料不公开；引用缺失如实呈现） -->
      <div class="section-card">
        <h3 class="section-title">来源与依据（公开引用）</h3>
        <div v-if="manual.references.length === 0" class="section-empty">无公开来源引用</div>
        <ul v-else class="ref-list">
          <li v-for="r in manual.references" :key="r.id" class="ref-item">
            <span class="ref-kind">{{ refKindLabel(r.refKind) }}</span>
            <span class="ref-locator font-mono">{{ r.refLocator }}</span>
            <span v-if="r.licenseNote" class="ref-license">{{ r.licenseNote }}</span>
          </li>
        </ul>
      </div>

      <!-- 修订历史索引（历史保留可查看；不删不藏） -->
      <div class="section-card">
        <h3 class="section-title">修订历史</h3>
        <div class="history-table-wrap">
          <table class="history-table">
            <thead>
              <tr>
                <th>修订</th>
                <th>状态</th>
                <th>发布时间</th>
                <th>被取代于</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in manual.revisionHistory" :key="h.revisionId">
                <td class="font-mono">r{{ h.no }}</td>
                <td>
                  <span class="status-chip" :class="historyClass(h)">{{ historyLabel(h) }}</span>
                </td>
                <td>{{ formatTime(h.publishedAt) }}</td>
                <td>{{ formatTime(h.supersededAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 内联小组件：结构化章节的如实陈列（未知结构回退原始 JSON，不编造字段语义）
import { defineComponent, h, type PropType } from 'vue'
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchLineupManual, type LineupManualDetail } from '../api'

const JsonBlock = defineComponent({
  props: { value: { type: null as unknown as PropType<unknown>, required: true } },
  setup(props) {
    return () => h('pre', { class: 'json-block' },
      typeof props.value === 'string' ? props.value : JSON.stringify(props.value, null, 2))
  }
})

/** 定阵条件（§5.1）：{ consider: [...], abandon: [...] } 等对象形态 */
const ConditionList = defineComponent({
  components: { JsonBlock },
  props: { value: { type: Object as PropType<Record<string, unknown>>, required: true } },
  setup(props) {
    return () => {
      const entries = Object.entries(props.value || {}).filter(([, v]) => v != null)
      if (!entries.length) return h(JsonBlock, { value: props.value })
      return h('ul', { class: 'cond-list' }, entries.map(([k, v]) =>
        h('li', { class: 'cond-item' }, [
          h('strong', { class: 'cond-key' }, conditionKeyLabel(k)),
          Array.isArray(v)
            ? h('span', { class: 'cond-val' }, (v as unknown[]).map(String).join('；') || '（空）')
            : h(JsonBlock, { value: v })
        ])))
    }
  }
})

/** 结构分层（§5.1）：{ minimal: [...], full: [...] } 键值形态 */
const StructureLevels = defineComponent({
  components: { JsonBlock },
  props: { value: { type: Object as PropType<Record<string, unknown>>, required: true } },
  setup(props) {
    return () => {
      const entries = Object.entries(props.value || {}).filter(([, v]) => v != null)
      if (!entries.length) return h(JsonBlock, { value: props.value })
      return h('div', { class: 'levels-grid' }, entries.map(([k, v]) =>
        h('div', { class: 'level-block' }, [
          h('div', { class: 'level-name' }, levelNameLabel(k)),
          Array.isArray(v)
            ? h('div', { class: 'level-chips' }, (v as unknown[]).map((item, i) =>
                h('span', { class: 'level-chip', key: i }, String(item))))
            : h(JsonBlock, { value: v })
        ])))
    }
  }
})

/** 阶段操作（§5.2）：数组形态 [{ stage, actions: [...] }] */
const StagesList = defineComponent({
  components: { JsonBlock },
  props: { value: { type: Array as PropType<unknown[]>, required: true } },
  setup(props) {
    return () => {
      const rows = (props.value || []).filter(r => r && typeof r === 'object')
      if (!rows.length) return h(JsonBlock, { value: props.value })
      return h('div', { class: 'stages-wrap' }, rows.map((r, i) => {
        const row = r as Record<string, unknown>
        const actions = Array.isArray(row.actions) ? row.actions.map(String) : []
        const rest = Object.entries(row).filter(([k]) => k !== 'stage' && k !== 'actions')
        return h('div', { class: 'stage-block', key: i }, [
          h('div', { class: 'stage-head' }, String(row.stage ?? `阶段 ${i + 1}`)),
          actions.length
            ? h('ol', { class: 'stage-actions' }, actions.map((a, j) => h('li', { key: j }, a)))
            : null,
          rest.length ? h(JsonBlock, { value: Object.fromEntries(rest) }) : null
        ])
      }))
    }
  }
})

function conditionKeyLabel(k: string): string {
  const map: Record<string, string> = {
    consider: '可考虑上场条件', abandon: '应放弃条件', prefer: '偏好条件',
    avoid: '回避条件', when: '适用时机'
  }
  return map[k] || k
}

function levelNameLabel(k: string): string {
  const map: Record<string, string> = { minimal: '最低成型', mid: '中期形态', full: '完全体' }
  return map[k] || k
}

const route = useRoute()
const manual = ref<LineupManualDetail | null>(null)
const isLoading = ref(true)
const loadError = ref<string | null>(null)

let loadAbort: AbortController | null = null

async function loadDetail() {
  loadAbort?.abort()
  loadAbort = new AbortController()
  isLoading.value = true
  loadError.value = null
  const id = route.params.id as string
  try {
    manual.value = await fetchLineupManual(id, loadAbort.signal)
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    console.error('加载阵容手册失败:', err)
    loadError.value = err?.message || '未知错误'
    manual.value = null
  } finally {
    if (!loadAbort?.signal.aborted) isLoading.value = false
  }
}

onMounted(loadDetail)
onUnmounted(() => loadAbort?.abort())
watch(() => route.params.id, () => {
  if (route.name === 'lineup-detail') loadDetail()
})

const SECTION_TITLES: Array<{ key: keyof LineupManualDetail['sections']; title: string }> = [
  { key: 'playConditions', title: '§5.1 定阵条件' },
  { key: 'structureLevels', title: '§5.1 结构分层' },
  { key: 'stages', title: '§5.2 条件化阶段操作' },
  { key: 'stabilization', title: '§5.3 稳血与快速成型' },
  { key: 'skillChains', title: '§5.4 技能操作链' },
  { key: 'positioning', title: '§5.5 站位与变阵' },
  { key: 'substitutes', title: '§5.5 替补说明' },
  { key: 'practiceCases', title: '§5.6 实战案例引用' }
]

const renderedSections = computed<Array<{ key: string; title: string; value: any }>>(() => {
  const m = manual.value
  if (!m) return []
  return SECTION_TITLES
    .map(({ key, title }) => ({ key: key as string, title, value: m.sections[key] as any }))
    .filter(s => s.value != null)
})

function difficultyLabel(d: string | null | undefined): string {
  if (d === 'LOW') return '难度：低'
  if (d === 'MEDIUM') return '难度：中'
  if (d === 'HIGH') return '难度：高'
  return '难度未标注'
}

function difficultyClass(d: string | null | undefined): string {
  if (d === 'LOW') return 'is-low'
  if (d === 'MEDIUM') return 'is-medium'
  if (d === 'HIGH') return 'is-high'
  return 'is-unknown'
}

const ROLE_LABELS: Record<string, string> = {
  CORE_OUTPUT: '核心输出', FRONTLINE: '前排', GROWTH_ENGINE: '成长引擎',
  RESOURCE_ENGINE: '资源引擎', PROTECTION: '保护', CONTROL: '控制',
  TRANSITION: '过渡', SUBSTITUTE: '替补', LATE_CEILING: '后期上限'
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role] || role
}

function necessityLabel(n: string | null | undefined): string {
  if (n === 'REQUIRED') return '必需'
  if (n === 'PREFERRED') return '优选'
  if (n === 'OPTIONAL') return '可选'
  return n || '—'
}

const KIND_LABELS: Record<string, string> = {
  HERO: '英雄', COMMANDER: '棋手', EQUIPMENT: '装备',
  EFFECT_CARD: '效果牌', TALENT: '天赋', CAMP: '阵营'
}

function kindLabel(kind: string | null | undefined): string {
  return (kind && KIND_LABELS[kind]) || kind || '—'
}

const KIND_SEGMENTS: Record<string, string> = {
  HERO: 'heroes', COMMANDER: 'commanders', EQUIPMENT: 'equipment',
  EFFECT_CARD: 'effect-cards', TALENT: 'talents', CAMP: 'camps'
}

function kindSegment(kind: string | null | undefined): string {
  return (kind && KIND_SEGMENTS[kind]) || 'heroes'
}

function refKindLabel(k: string): string {
  const map: Record<string, string> = {
    URL: '链接', RAW_MATERIAL: '原始材料存证', EVIDENCE: '证据原件', OFFICIAL_PAGE: '官方页面'
  }
  return map[k] || k
}

function historyLabel(h: { status: string; supersededAt: string | null }): string {
  if (h.status === 'PUBLISHED' && !h.supersededAt) return '当前发布'
  if (h.status === 'PUBLISHED') return '历史发布（已被取代）'
  if (h.status === 'PENDING_REVIEW') return '待审核'
  return '草稿'
}

function historyClass(h: { status: string; supersededAt: string | null }): string {
  if (h.status === 'PUBLISHED' && !h.supersededAt) return 'is-current'
  if (h.status === 'PUBLISHED') return 'is-history'
  return 'is-draft'
}

function formatRate(v: number | null | undefined): string {
  if (v === null || v === undefined) return '未公布'
  return `${(v * 100).toFixed(1)}%`
}

function formatTime(isoStr: string | null | undefined) {
  if (!isoStr) return '—'
  try {
    return new Date(isoStr).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return isoStr
  }
}
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.lineup-detail-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 16px 40px;
  box-sizing: border-box;
}

.nav-back-row {
  margin-top: 4px;
}

.back-link {
  font-size: 13px;
  font-weight: 500;
  color: #2563eb;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

.loading-state,
.not-found-state {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 48px 24px;
  text-align: center;
  color: #64748b;

  h3 {
    margin: 0 0 8px;
    color: #1e293b;
  }

  p {
    margin: 0;
    font-size: 13px;
  }
}

.primary-btn {
  display: inline-block;
  margin-top: 12px;
  background: #2563eb;
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.detail-content-wrap {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.lineup-header-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.title-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lineup-name {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.difficulty-badge {
  font-size: 12px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 4px;

  &.is-low {
    background: rgba(5, 150, 105, 0.1);
    color: #059669;
    border: 1px solid rgba(5, 150, 105, 0.35);
  }

  &.is-medium {
    background: rgba(245, 158, 11, 0.1);
    color: #b45309;
    border: 1px solid rgba(245, 158, 11, 0.35);
  }

  &.is-high {
    background: rgba(220, 38, 38, 0.08);
    color: #b91c1c;
    border: 1px solid rgba(220, 38, 38, 0.3);
  }

  &.is-unknown {
    background: #f1f5f9;
    color: #94a3b8;
    border: 1px solid #e2e8f0;
  }
}

.recheck-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 4px;
  background: #eff6ff;
  border: 1px solid rgba(37, 99, 235, 0.35);
  color: #2563eb;
}

.sub-scope {
  font-size: 12px;
  color: #64748b;
}

.one-line {
  margin: 4px 0 0;
  font-size: 13px;
  color: #334155;
  line-height: 1.7;
}

.header-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;

  @media (max-width: 600px) {
    align-items: flex-start;
  }
}

.update-time {
  font-size: 12px;
  color: #64748b;
}

.source-tag {
  font-size: 11px;
  background: #f1f5f9;
  color: #475569;
  padding: 1px 6px;
  border-radius: 3px;
}

.newbie-fit-card {
  background: rgba(5, 150, 105, 0.04);
  border: 1px solid rgba(5, 150, 105, 0.25);
  border-radius: 12px;
  padding: 16px 20px;

  .fit-title {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 700;
    color: #047857;
  }

  .fit-text {
    margin: 0;
    font-size: 13px;
    line-height: 1.8;
    color: #334155;
  }
}

.section-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.section-empty {
  font-size: 13px;
  color: #94a3b8;
  background: #f8fafc;
  border: 1px dashed #e2e8f0;
  border-radius: 8px;
  padding: 16px;
}

.comp-table-wrap,
.history-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.comp-table,
.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;

  th {
    padding: 8px 12px;
    color: #64748b;
    font-weight: 600;
    border-bottom: 1px solid #e2e8f0;
    white-space: nowrap;
  }

  td {
    padding: 10px 12px;
    border-bottom: 1px solid #f1f5f9;
    color: #334155;
    vertical-align: middle;
  }
}

.comp-entity {
  color: #2563eb;
  text-decoration: none;
  font-weight: 600;

  &:hover {
    text-decoration: underline;
  }
}

.sub-text {
  font-size: 11px;
  color: #94a3b8;
}

.manual-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.manual-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ms-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
  padding-left: 10px;
  border-left: 3px solid rgba(37, 99, 235, 0.4);
}

:deep(.json-block) {
  margin: 0;
  font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.7;
  color: #475569;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 14px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

:deep(.cond-list) {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

:deep(.cond-item) {
  font-size: 13px;
  color: #334155;
  line-height: 1.7;

  .cond-key {
    color: #64748b;
    margin-right: 6px;
  }
}

:deep(.levels-grid) {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

:deep(.level-block) {
  flex: 1 1 220px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

:deep(.level-name) {
  font-size: 12px;
  font-weight: 700;
  color: #475569;
}

:deep(.level-chips) {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

:deep(.level-chip) {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #eff6ff;
  color: #2563eb;
  border: 1px solid rgba(37, 99, 235, 0.25);
}

:deep(.stages-wrap) {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

:deep(.stage-block) {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

:deep(.stage-head) {
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
}

:deep(.stage-actions) {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  li {
    font-size: 13px;
    color: #334155;
    line-height: 1.7;
  }
}

.snap-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #f8fafc;
}

.snap-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #0f172a;

  .snap-url {
    font-size: 11px;
    color: #2563eb;
  }
}

.snap-metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;

  @media (max-width: 720px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.snap-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
}

.metric-num {
  font-size: 20px;
  font-weight: 800;
  color: #0f172a;

  .unit {
    font-style: normal;
    font-size: 11px;
    font-weight: 400;
    color: #94a3b8;
  }

  &.text-primary {
    color: #2563eb;
  }

  &.text-cyan {
    color: #0284c7;
  }
}

.metric-label {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
}

.snap-meta-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;

  li {
    font-size: 12px;
    color: #475569;
    line-height: 1.6;

    strong {
      color: #64748b;
    }
  }
}

.snap-note {
  margin: 0;
  font-size: 11px;
  color: #64748b;
  border-top: 1px dashed #e2e8f0;
  padding-top: 8px;
}

.ref-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ref-item {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 13px;
}

.ref-kind {
  font-size: 11px;
  color: #7c3aed;
  background: rgba(139, 92, 246, 0.08);
  border: 1px solid rgba(139, 92, 246, 0.25);
  padding: 1px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.ref-locator {
  font-size: 12px;
  color: #334155;
  word-break: break-all;
}

.ref-license {
  font-size: 11px;
  color: #94a3b8;
}

.status-chip {
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 4px;

  &.is-current {
    color: #059669;
    background: rgba(5, 150, 105, 0.08);
    border: 1px solid rgba(5, 150, 105, 0.3);
  }

  &.is-history {
    color: #64748b;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
  }

  &.is-draft {
    color: #b45309;
    background: rgba(245, 158, 11, 0.08);
    border: 1px solid rgba(245, 158, 11, 0.3);
  }
}
</style>
