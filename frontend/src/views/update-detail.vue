<template>
  <div class="update-detail-view">
    <div class="nav-back-row">
      <router-link to="/updates" class="back-link">← 返回版本动态</router-link>
    </div>

    <div v-if="isLoading" class="state-panel">正在加载更新公告…</div>

    <div v-else-if="loadError" class="state-panel is-error">
      <h3 class="state-title">公告加载失败</h3>
      <p class="state-desc">{{ loadError }}</p>
      <button class="state-btn" @click="loadDetail">重新加载</button>
    </div>

    <div v-else-if="!update" class="state-panel">
      <h3 class="state-title">未找到该更新公告</h3>
      <p class="state-desc">
        公告「<span class="font-mono">{{ slug }}</span>」不存在或尚未发布。
      </p>
      <router-link to="/updates" class="state-btn">返回版本动态</router-link>
    </div>

    <template v-else>
      <div class="update-header-card">
        <div class="update-title-wrap">
          <span class="version-chip font-mono">{{ update.versionId }}</span>
          <h2 class="update-title">{{ update.title }}</h2>
          <p class="update-meta-row">
            <template v-if="update.officialPublishedAt">官方发布于 {{ formatTime(update.officialPublishedAt) }} · </template>
            <template v-if="update.fetchedAt">本站收录于 {{ formatTime(update.fetchedAt) }}</template>
          </p>
          <a
            v-if="update.officialUrl"
            :href="update.officialUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="official-link"
          >查看官方原文 ↗</a>
        </div>
      </div>

      <!-- 公告摘要（来源原文要点；不做的推测性扩充） -->
      <div v-if="update.summary" class="section-card">
        <h3 class="section-title">公告摘要</h3>
        <p class="summary-text">{{ update.summary }}</p>
      </div>

      <!-- 受影响内容清单（A09 待复核 / 已复核分列） -->
      <div class="section-card">
        <h3 class="section-title">本站受影响内容</h3>
        <div v-if="!openImpacts.length && !resolvedImpacts.length" class="section-empty">
          该公告暂无关联的内容影响清单
        </div>
        <template v-else>
          <div v-if="openImpacts.length" class="impact-group">
            <h4 class="group-title is-open">待复核（{{ openImpacts.length }}）</h4>
            <div class="impact-list">
              <div v-for="im in openImpacts" :key="im.id" class="impact-item is-open">
                <span class="impact-type font-mono">{{ contentTypeLabel(im.contentType) }}</span>
                <span class="impact-id font-mono">{{ im.contentId }}</span>
                <span class="impact-text">{{ im.impact }}</span>
                <span v-if="im.note" class="impact-note">{{ im.note }}</span>
              </div>
            </div>
          </div>
          <div v-if="resolvedImpacts.length" class="impact-group">
            <h4 class="group-title is-resolved">已复核（{{ resolvedImpacts.length }}）</h4>
            <div class="impact-list">
              <div v-for="im in resolvedImpacts" :key="im.id" class="impact-item">
                <span class="impact-type font-mono">{{ contentTypeLabel(im.contentType) }}</span>
                <span class="impact-id font-mono">{{ im.contentId }}</span>
                <span class="impact-text">{{ im.impact }}</span>
                <span v-if="im.resolvedAt" class="impact-note">复核于 {{ formatTime(im.resolvedAt) }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchUpdateDetail, type UpdateNote, type ContentImpact } from '../api'

const route = useRoute()
const slug = computed(() => (route.params.slug as string) || '')

const update = ref<UpdateNote | null>(null)
const isLoading = ref(true)
const loadError = ref<string | null>(null)

let loadAbort: AbortController | null = null

async function loadDetail() {
  loadAbort?.abort()
  loadAbort = new AbortController()
  isLoading.value = true
  loadError.value = null
  try {
    update.value = await fetchUpdateDetail(slug.value, loadAbort.signal)
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    console.error('加载更新公告失败:', err)
    loadError.value = err?.message || '未知错误'
    update.value = null
  } finally {
    if (!loadAbort?.signal.aborted) isLoading.value = false
  }
}

onMounted(loadDetail)
onUnmounted(() => loadAbort?.abort())
watch(() => route.params.slug, () => {
  if (route.name === 'update-detail') loadDetail()
})

const openImpacts = computed<ContentImpact[]>(() =>
  (update.value?.impacts || []).filter(im => !im.resolvedAt))

const resolvedImpacts = computed<ContentImpact[]>(() =>
  (update.value?.impacts || []).filter(im => im.resolvedAt != null))

function contentTypeLabel(t: string): string {
  const map: Record<string, string> = {
    LESSON: '课程', LINEUP: '阵容手册', CATALOG_ENTITY: '资料档案',
    MECHANIC: '规则条目', SCENARIO: '情景案例'
  }
  return map[t] || t
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

.update-detail-view {
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

.update-header-card {
  @include glass-panel;
  padding: 22px 24px;
}

.update-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.version-chip {
  font-size: 11px;
  color: $color-primary;
  background: $color-primary-light;
  border: 1px solid rgba(37, 99, 235, 0.3);
}

.update-title {
  margin: 0;
  font-size: 21px;
  font-weight: 800;
  color: $text-primary;
}

.update-meta-row {
  margin: 0;
  font-size: 12px;
  color: $text-muted;
}

.official-link {
  font-size: 13px;
  font-weight: 600;
  color: $color-primary;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
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

.summary-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: $text-secondary;
  white-space: pre-wrap;
}

.impact-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;

  &.is-open {
    color: #b45309;
  }

  &.is-resolved {
    color: $text-muted;
  }
}

.impact-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.impact-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: $bg-tertiary;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  font-size: 13px;

  &.is-open {
    background: rgba(245, 158, 11, 0.05);
    border-color: rgba(245, 158, 11, 0.3);
  }
}

.impact-type {
  font-size: 11px;
  color: $color-primary;
}

.impact-id {
  font-size: 11px;
  color: $text-muted;
}

.impact-text {
  color: $text-primary;
  font-weight: 600;
}

.impact-note {
  font-size: 11px;
  color: $text-muted;
}
</style>
