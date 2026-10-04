<template>
  <div class="mechanic-view">
    <div class="nav-back-row">
      <router-link to="/library" class="back-link">← 返回资料库</router-link>
    </div>

    <div v-if="isLoading" class="state-panel">正在加载规则条目…</div>

    <div v-else-if="loadError" class="state-panel is-error">
      <h3 class="state-title">规则条目加载失败</h3>
      <p class="state-desc">{{ loadError }}</p>
      <button class="state-btn" @click="loadMechanic">重新加载</button>
    </div>

    <!-- 未发布/不存在：如实呈现；规则未经第一方资料核对不录入 -->
    <div v-else-if="!mechanic" class="state-panel">
      <h3 class="state-title">未找到该规则条目</h3>
      <p class="state-desc">
        「<span class="font-mono">{{ slug }}</span>」不存在或尚未发布。
        规则条目以第一方资料原文为依据，未经核对不录入。
      </p>
      <router-link to="/library" class="state-btn">返回资料库</router-link>
    </div>

    <template v-else>
      <div class="mechanic-header-card">
        <div class="mechanic-title-wrap">
          <span class="kind-chip font-mono">规则条目</span>
          <h2 class="mechanic-name">{{ mechanic.title }}</h2>
          <p class="mechanic-meta-row">
            <span class="font-mono">{{ mechanic.slug }}</span>
            <template v-if="mechanic.gameVersion"> · 适用版本 <span class="font-mono">{{ mechanic.gameVersion.versionId }}</span></template>
            <template v-if="mechanic.revision"> · 修订 r{{ mechanic.revision.no }}</template>
            <template v-if="mechanic.revision?.publishedAt"> · 发布于 {{ formatTime(mechanic.revision.publishedAt) }}</template>
          </p>
        </div>
      </div>

      <!-- 来源原文（statementRaw 为第一方资料原文，不做转述替换） -->
      <div class="section-card">
        <h3 class="section-title">规则原文</h3>
        <p v-if="mechanic.statementRaw" class="statement-raw">{{ mechanic.statementRaw }}</p>
        <div v-else class="section-empty">原文未登记（数据不完整，如实呈现）</div>
      </div>

      <!-- 参数与适用对象：结构化字段原样陈列，不猜语义 -->
      <div v-if="mechanic.params" class="section-card">
        <h3 class="section-title">参数</h3>
        <pre class="json-block">{{ JSON.stringify(mechanic.params, null, 2) }}</pre>
      </div>
      <div v-if="mechanic.appliesTo" class="section-card">
        <h3 class="section-title">适用对象</h3>
        <pre class="json-block">{{ JSON.stringify(mechanic.appliesTo, null, 2) }}</pre>
      </div>

      <!-- 来源引用 -->
      <div class="section-card">
        <h3 class="section-title">来源与依据（公开引用）</h3>
        <div v-if="!mechanic.references?.length" class="section-empty">无公开来源引用</div>
        <ul v-else class="ref-list">
          <li v-for="r in mechanic.references" :key="r.id" class="ref-item">
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
import { fetchMechanicDetail, type MechanicEntry } from '../api'

const route = useRoute()
const slug = computed(() => (route.params.slug as string) || '')

const mechanic = ref<MechanicEntry | null>(null)
const isLoading = ref(true)
const loadError = ref<string | null>(null)

let loadAbort: AbortController | null = null

async function loadMechanic() {
  loadAbort?.abort()
  loadAbort = new AbortController()
  isLoading.value = true
  loadError.value = null
  try {
    mechanic.value = await fetchMechanicDetail(slug.value, loadAbort.signal)
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    console.error('加载规则条目失败:', err)
    loadError.value = err?.message || '未知错误'
    mechanic.value = null
  } finally {
    if (!loadAbort?.signal.aborted) isLoading.value = false
  }
}

onMounted(loadMechanic)
onUnmounted(() => loadAbort?.abort())
watch(() => route.params.slug, () => {
  if (route.name === 'mechanic') loadMechanic()
})

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

.mechanic-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.back-link {
  font-size: 13px;
  color: $color-primary;
  text-decoration: none;

  &:hover { text-decoration: underline; }
}

.state-panel {
  @include glass-panel;
  padding: 48px 32px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;

  &.is-error { color: $color-danger; }
}

.state-title { margin: 0; font-size: 18px; font-weight: 700; color: $text-primary; }

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

  &:hover { background: $color-primary-light; }
}

.mechanic-header-card { @include glass-panel; padding: 22px 24px; }

.mechanic-title-wrap { display: flex; flex-direction: column; gap: 6px; }

.kind-chip {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 700;
  color: $color-primary;
  background: $color-primary-light;
  border: 1px solid rgba(37, 99, 235, 0.3);
  padding: 1px 8px;
  border-radius: $radius-sm;
}

.mechanic-name { margin: 0; font-size: 21px; font-weight: 800; color: $text-primary; }

.mechanic-meta-row { margin: 0; font-size: 12px; color: $text-muted; }

.section-card {
  @include glass-panel;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title { margin: 0; font-size: 15px; font-weight: 700; color: $text-primary; }

.section-empty {
  font-size: 13px;
  color: $text-muted;
  background: $bg-tertiary;
  border: 1px dashed $border-color;
  border-radius: $radius-md;
  padding: 14px;
}

.statement-raw {
  margin: 0;
  font-size: 14px;
  line-height: 1.9;
  color: $text-secondary;
  white-space: pre-wrap;
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

.ref-locator { font-size: 12px; color: $text-secondary; word-break: break-all; }
</style>
