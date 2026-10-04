<template>
  <div class="lesson-view">
    <div class="nav-back-row">
      <router-link to="/learn" class="back-link">← 返回新手学堂</router-link>
    </div>

    <div v-if="isLoading" class="state-panel">正在加载课程...</div>

    <div v-else-if="loadError" class="state-panel is-error">
      <h3 class="state-title">课程加载失败</h3>
      <p class="state-desc">{{ loadError }}</p>
      <button class="state-btn" @click="loadLesson">重新加载</button>
    </div>

    <!-- 未发布/不存在：如实呈现，不渲染任何编造的课程正文 -->
    <div v-else-if="!lesson" class="state-panel">
      <h3 class="state-title">未找到该课程</h3>
      <p class="state-desc">
        课程「<span class="font-mono">{{ slug }}</span>」不存在或尚未发布
        （草稿 / 待审核 / 退役内容不在公开面陈列）。
      </p>
      <router-link to="/learn" class="state-btn">返回学习路径</router-link>
    </div>

    <template v-else>
      <div class="lesson-header-card">
        <div class="lesson-title-wrap">
          <span class="stage-chip font-mono">阶段 {{ lesson.stage }}</span>
          <h2 class="lesson-title">
            {{ lesson.title }}
            <span v-if="lesson.hasOpenRecheck" class="recheck-chip">待版本复核</span>
          </h2>
          <p class="lesson-meta-row">
            <template v-if="lesson.gameVersion">适用版本 <span class="font-mono">{{ lesson.gameVersion.versionId }}</span> · </template>
            <template v-if="lesson.revision">修订 r{{ lesson.revision.no }} · </template>
            <template v-if="lesson.publishedAt">发布于 {{ formatTime(lesson.publishedAt) }}</template>
          </p>
        </div>
      </div>

      <!-- 先修课程（依赖关系来自内容底座；无先修如实隐藏） -->
      <div v-if="lesson.prerequisites.length" class="section-card">
        <h3 class="section-title">先修课程</h3>
        <div class="prereq-list">
          <router-link
            v-for="p in lesson.prerequisites"
            :key="p.id"
            :to="`/learn/${p.slug}`"
            class="prereq-link"
          >{{ p.title || p.slug }}</router-link>
        </div>
      </div>

      <!-- 学习目标 -->
      <div v-if="lesson.objectives && lesson.objectives.length" class="section-card">
        <h3 class="section-title">学完你能</h3>
        <ul class="objectives-list">
          <li v-for="(o, i) in lesson.objectives" :key="i">{{ o }}</li>
        </ul>
      </div>

      <!-- 课程正文：结构化 sections 如实陈列；形态未知回退原始 JSON，不编造字段语义 -->
      <div class="section-card">
        <div class="content-head-row">
          <h3 class="section-title">课程内容</h3>
          <!-- 两种观看层次（任务书 §4）：「第一次玩」隐藏进阶，「我已理解规则」展开 -->
          <div class="layer-toggle" role="group" aria-label="观看层次切换">
            <button
              type="button" class="layer-btn" :class="{ 'is-active': layer === 'first' }"
              @click="setLayer('first')"
            >第一次玩</button>
            <button
              type="button" class="layer-btn" :class="{ 'is-active': layer === 'advanced' }"
              @click="setLayer('advanced')"
            >我已理解规则</button>
          </div>
        </div>
        <p class="layer-hint">{{ layer === 'first' ? '正在显示基础内容；切换到「我已理解规则」查看进阶细节。' : '进阶细节已展开（各节内标注「进阶」的段落）。' }}</p>
        <div v-if="!lesson.sections || !lesson.sections.length" class="section-empty">
          课程正文未登记（数据不完整，如实呈现）
        </div>
        <div v-else class="sections-wrap">
          <section v-for="(sec, i) in renderedSections" :key="i" class="lesson-section">
            <h4 class="ls-title">{{ sec.title }}</h4>
            <p v-if="sec.body" class="ls-body">{{ sec.body }}</p>
            <ul v-if="sec.items.length" class="ls-items">
              <li v-for="(item, j) in sec.items" :key="j">{{ item }}</li>
            </ul>
            <p v-if="layer === 'advanced' && sec.advanced" class="ls-advanced">
              <span class="adv-chip">进阶</span>{{ sec.advanced }}
            </p>
            <pre v-if="sec.restJson" class="json-block">{{ sec.restJson }}</pre>
          </section>
        </div>
      </div>

      <!-- 配套练习 -->
      <div class="section-card">
        <h3 class="section-title">配套练习</h3>
        <div v-if="!lesson.practice || !lesson.practice.length" class="section-empty">
          本课暂无配套练习
        </div>
        <div v-else class="practice-wrap">
          <div v-for="(p, i) in lesson.practice" :key="i" class="practice-item">
            <pre class="json-block">{{ JSON.stringify(p, null, 2) }}</pre>
          </div>
        </div>
      </div>

      <!-- 情景卡（成功/失败案例，链接到情景详情或内联呈现） -->
      <div class="section-card">
        <h3 class="section-title">情景案例</h3>
        <div v-if="!lesson.scenarios.length" class="section-empty">本课暂无情景案例</div>
        <div v-else class="scenario-list">
          <div v-for="s in lesson.scenarios" :key="s.id" class="scenario-item">
            <span class="scenario-kind" :class="kindClass(s.kind)">{{ kindLabel(s.kind) }}</span>
            <span class="scenario-title">{{ s.title }}</span>
            <span v-if="s.disclaimer" class="scenario-disclaimer">{{ s.disclaimer }}</span>
          </div>
        </div>
      </div>

      <!-- 来源引用 -->
      <div class="section-card">
        <h3 class="section-title">来源与依据（公开引用）</h3>
        <div v-if="!lesson.references.length" class="section-empty">无公开来源引用</div>
        <ul v-else class="ref-list">
          <li v-for="r in lesson.references" :key="r.id" class="ref-item">
            <span class="ref-kind">{{ refKindLabel(r.refKind) }}</span>
            <span class="ref-locator font-mono">{{ r.refLocator }}</span>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchLessonDetail, type LessonDetail } from '../api'

const route = useRoute()
const slug = computed(() => (route.params.slug as string) || '')

const lesson = ref<LessonDetail | null>(null)
const isLoading = ref(true)
const loadError = ref<string | null>(null)

// 两种观看层次（任务书 §4）：偏好走本地存储；浏览器禁止存储时默认基础层仍可用
const LAYER_KEY = 'wxq-lesson-layer'
const layer = ref<'first' | 'advanced'>('first')
try {
  if (localStorage.getItem(LAYER_KEY) === 'advanced') layer.value = 'advanced'
} catch { /* 存储不可用：保持默认，不阻断课程 */ }
function setLayer(next: 'first' | 'advanced') {
  layer.value = next
  try { localStorage.setItem(LAYER_KEY, next) } catch { /* 偏好不持久化，本次会话仍生效 */ }
}

let loadAbort: AbortController | null = null

async function loadLesson() {
  loadAbort?.abort()
  loadAbort = new AbortController()
  isLoading.value = true
  loadError.value = null
  try {
    lesson.value = await fetchLessonDetail(slug.value, loadAbort.signal)
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    console.error('加载课程失败:', err)
    loadError.value = err?.message || '未知错误'
    lesson.value = null
  } finally {
    if (!loadAbort?.signal.aborted) isLoading.value = false
  }
}

onMounted(loadLesson)
onUnmounted(() => loadAbort?.abort())
watch(() => route.params.slug, () => {
  if (route.name === 'lesson') loadLesson()
})

/** 课程 sections：识别 title/body/items/advanced 常见形态；其余键原样 JSON 陈列 */
const renderedSections = computed(() => {
  const secs = lesson.value?.sections
  if (!secs || !Array.isArray(secs)) return []
  return secs.map(sec => {
    const row = (sec && typeof sec === 'object' ? sec : {}) as Record<string, unknown>
    const rest = Object.entries(row).filter(([k]) => !['title', 'body', 'items', 'advanced'].includes(k))
    return {
      title: typeof row.title === 'string' ? row.title : '（未命名小节）',
      body: typeof row.body === 'string' ? row.body : null,
      items: Array.isArray(row.items) ? row.items.map(String) : [],
      advanced: typeof row.advanced === 'string' ? row.advanced : null,
      restJson: rest.length ? JSON.stringify(Object.fromEntries(rest), null, 2) : null
    }
  })
})

function kindLabel(kind: string): string {
  const map: Record<string, string> = { LINEUP_SCENARIO: '阵容情境', REVIEW_CASE: '复盘案例' }
  return map[kind] || kind
}

function kindClass(kind: string): string {
  // REVIEW_CASE 含成功/失败两类复盘（sourceNote 标注推演依据），用中性样式不做红绿预判
  if (kind === 'REVIEW_CASE') return 'is-review'
  return 'is-neutral'
}

function refKindLabel(k: string): string {
  const map: Record<string, string> = {
    URL: '链接', RAW_MATERIAL: '原始材料存证', EVIDENCE: '证据原件', OFFICIAL_PAGE: '官方页面'
  }
  return map[k] || k
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

.lesson-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.back-link {
  font-size: 13px;
  color: $color-primary;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

.state-panel {
  @include glass-panel;
  padding: 48px 32px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;

  &.is-error {
    color: $color-danger;
  }
}

.state-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: $text-primary;
}

.state-desc {
  margin: 0;
  max-width: 520px;
  font-size: 13px;
  line-height: 1.8;
  color: $text-secondary;
}

.font-mono {
  font-family: $font-mono;
  font-size: 12px;
  background: $bg-tertiary;
  padding: 1px 6px;
  border-radius: $radius-sm;
}

.state-btn {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  color: $color-primary;
  text-decoration: none;
  padding: 8px 18px;
  border: 1px solid rgba(37, 99, 235, 0.35);
  border-radius: $radius-md;
  background: transparent;
  cursor: pointer;

  &:hover {
    background: $color-primary-light;
  }
}

.lesson-header-card {
  @include glass-panel;
  padding: 22px 24px;
}

.lesson-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stage-chip {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 700;
  color: $color-primary;
  background: $color-primary-light;
  border: 1px solid rgba(37, 99, 235, 0.3);
  padding: 1px 8px;
  border-radius: $radius-sm;
}

.lesson-title {
  margin: 0;
  font-size: 21px;
  font-weight: 800;
  color: $text-primary;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.recheck-chip {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: $radius-sm;
  background: $color-primary-light;
  border: 1px solid rgba(37, 99, 235, 0.35);
  color: $color-primary;
}

.lesson-meta-row {
  margin: 0;
  font-size: 12px;
  color: $text-muted;
}

.section-card {
  @include glass-panel;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: $text-primary;
}

.section-empty {
  font-size: 13px;
  color: $text-muted;
  background: $bg-tertiary;
  border: 1px dashed $border-color;
  border-radius: $radius-md;
  padding: 14px;
}

.prereq-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.prereq-link {
  font-size: 13px;
  font-weight: 600;
  color: $color-primary;
  text-decoration: none;
  padding: 6px 12px;
  border: 1px solid rgba(37, 99, 235, 0.35);
  border-radius: $radius-md;

  &:hover {
    background: $color-primary-light;
  }
}

.objectives-list {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  li {
    font-size: 13px;
    line-height: 1.7;
    color: $text-secondary;
  }
}

.sections-wrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.lesson-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ls-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: $text-primary;
  padding-left: 10px;
  border-left: 3px solid rgba(37, 99, 235, 0.4);
}

.content-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.layer-toggle {
  display: inline-flex;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  overflow: hidden;
}

.layer-btn {
  font-size: 12px;
  font-weight: 600;
  padding: 5px 12px;
  border: none;
  background: transparent;
  color: $text-secondary;
  cursor: pointer;

  &.is-active {
    background: $color-primary;
    color: #fff;
  }

  &:focus-visible {
    outline: 2px solid $color-primary;
    outline-offset: 1px;
  }
}

.layer-hint {
  margin: -4px 0 0;
  font-size: 12px;
  color: $text-muted;
}

.ls-advanced {
  margin: 2px 0 0;
  font-size: 13px;
  line-height: 1.8;
  color: $text-secondary;
  background: rgba(139, 92, 246, 0.06);
  border: 1px solid rgba(139, 92, 246, 0.25);
  border-radius: $radius-md;
  padding: 10px 12px;
}

.adv-chip {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  color: #7c3aed;
  border: 1px solid rgba(139, 92, 246, 0.35);
  border-radius: $radius-sm;
  padding: 0 6px;
  margin-right: 8px;
  vertical-align: 1px;
}

.ls-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: $text-secondary;
  white-space: pre-wrap;
}

.ls-items {
  margin: 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  li {
    font-size: 13px;
    line-height: 1.7;
    color: $text-secondary;
  }
}

.json-block {
  margin: 0;
  font-family: $font-mono;
  font-size: 12px;
  line-height: 1.7;
  color: $text-secondary;
  background: $bg-tertiary;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  padding: 12px 14px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.practice-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scenario-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scenario-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  padding: 10px 12px;
  background: $bg-tertiary;
  border: 1px solid $border-color;
  border-radius: $radius-md;
}

// 「教学情境/教学复盘（非真实对局…）」声明随卡如实呈现（单一事实源）
.scenario-disclaimer {
  flex-basis: 100%;
  font-size: 12px;
  color: $text-secondary;
}

.scenario-kind {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: $radius-sm;
  white-space: nowrap;

  &.is-success {
    color: #059669;
    background: rgba(5, 150, 105, 0.08);
    border: 1px solid rgba(5, 150, 105, 0.3);
  }

  &.is-failure {
    color: #b91c1c;
    background: rgba(220, 38, 38, 0.06);
    border: 1px solid rgba(220, 38, 38, 0.25);
  }

  &.is-neutral {
    color: $color-primary;
    background: $color-primary-light;
    border: 1px solid rgba(37, 99, 235, 0.3);
  }

  &.is-review {
    color: #7c2d12;
    background: rgba(124, 45, 18, 0.06);
    border: 1px solid rgba(124, 45, 18, 0.25);
  }
}

.scenario-title {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
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
  border-radius: $radius-sm;
  white-space: nowrap;
}

.ref-locator {
  font-size: 12px;
  color: $text-secondary;
  word-break: break-all;
}
</style>
