<template>
  <div class="global-search" ref="rootEl">
    <div class="gs-input-row">
      <input
        ref="inputEl"
        v-model="query"
        type="text"
        class="gs-input"
        placeholder="搜索阵容 / 英雄 / 规则 / 课程…"
        role="searchbox"
        aria-label="全站搜索"
        @keydown="onKeydown"
        @focus="open = true"
      />
      <span v-if="searching" class="gs-state font-mono">搜索中…</span>
    </div>

    <div v-if="open && query.trim() && !searching" class="gs-panel" role="listbox">
      <p v-if="loadError" class="gs-empty">搜索失败：{{ loadError }}（稍后重试）</p>
      <p v-else-if="totalHits === 0" class="gs-empty">没有找到与「{{ query.trim() }}」相关的内容；可换关键词，或到资料库按分类浏览。</p>
      <template v-else>
        <section v-for="g in visibleGroups" :key="g.key" class="gs-group">
          <h4 class="gs-group-title">{{ g.label }}<span class="font-mono gs-count">{{ g.items.length }}/{{ g.total }}</span></h4>
          <router-link
            v-for="hit in g.items"
            :key="hit.href"
            :to="hit.href"
            class="gs-hit"
            role="option"
            :class="{ 'is-active-key': flatIndex(hit.href) === activeIndex }"
            @click="closePanel"
          >
            <span class="gs-hit-title">{{ hit.title }}</span>
            <span class="gs-hit-sub">{{ hit.subtitle }}</span>
          </router-link>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { fetchGlobalSearch, type GlobalSearchResult, type SearchHit } from '../api'

const router = useRouter()
const query = ref('')
const open = ref(false)
const searching = ref(false)
const loadError = ref<string | null>(null)
const result = ref<GlobalSearchResult | null>(null)
const activeIndex = ref(-1)
const rootEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let abortCtl: AbortController | null = null

const GROUP_DEFS = [
  { key: 'lessons', label: '课程' },
  { key: 'manuals', label: '阵容手册' },
  { key: 'entities', label: '资料实体（英雄/棋手/装备…）' },
  { key: 'mechanics', label: '规则条目' }
] as const

const visibleGroups = computed(() => {
  if (!result.value) return []
  return GROUP_DEFS
    .map(g => ({ ...g, items: result.value!.groups[g.key], total: result.value!.totals[g.key] }))
    .filter(g => g.items.length > 0)
})
const totalHits = computed(() =>
  result.value ? Object.values(result.value.totals).reduce((a, b) => a + b, 0) : 0)

// 键盘导航的扁平列表（§验收：键盘可操作搜索）
const flatHits = computed<SearchHit[]>(() => visibleGroups.value.flatMap(g => g.items))
const flatIndex = (href: string) => flatHits.value.findIndex(h => h.href === href)

watch(query, q => {
  if (debounceTimer) clearTimeout(debounceTimer)
  const trimmed = q.trim()
  if (!trimmed) { result.value = null; loadError.value = null; return }
  open.value = true
  searching.value = true
  debounceTimer = setTimeout(() => runSearch(trimmed), 250)
})

async function runSearch(q: string) {
  abortCtl?.abort()
  abortCtl = new AbortController()
  try {
    result.value = await fetchGlobalSearch(q, abortCtl.signal)
    loadError.value = null
    activeIndex.value = -1
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    loadError.value = err?.message || '网络错误'
    result.value = null
  } finally {
    searching.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') { closePanel(); return }
  const hits = flatHits.value
  if (!hits.length) return
  if (e.key === 'Enter') {
    const target = activeIndex.value >= 0 ? hits[activeIndex.value] : hits[0]
    router.push(target.href)
    closePanel()
    e.preventDefault()
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const delta = e.key === 'ArrowDown' ? 1 : -1
    activeIndex.value = (activeIndex.value + delta + hits.length) % hits.length
    nextTick(() => rootEl.value?.querySelector('.gs-hit.is-active-key')?.scrollIntoView({ block: 'nearest' }))
  }
}

function closePanel() {
  open.value = false
  activeIndex.value = -1
  inputEl.value?.blur()
}

function onDocClick(e: MouseEvent) {
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) closePanel()
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  if (debounceTimer) clearTimeout(debounceTimer)
  abortCtl?.abort()
})
</script>

<style lang="scss" scoped>
.global-search { position: relative; flex: 1 1 auto; min-width: 0; max-width: 420px; }

.gs-input-row { display: flex; align-items: center; gap: 8px; }

.gs-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 12px;
  font-size: 13px;
  color: #0f172a;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  outline: none;

  &:focus { border-color: #2563eb; background: #ffffff; }
}

.gs-state { font-size: 11px; color: #64748b; white-space: nowrap; }

.gs-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0; right: 0;
  z-index: 200;
  max-height: 70vh;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12);
  padding: 8px;
}

.gs-empty { margin: 8px; font-size: 12px; color: #64748b; }

.gs-group { padding: 4px 0; & + .gs-group { border-top: 1px solid #f1f5f9; } }

.gs-group-title {
  margin: 6px 8px 4px;
  font-size: 11px;
  font-weight: 700;
  color: #64748b;
  .gs-count { margin-left: 6px; font-weight: 400; }
}

.gs-hit {
  display: flex; flex-direction: column; gap: 1px;
  padding: 6px 10px;
  border-radius: 6px;
  text-decoration: none;

  &:hover, &.is-active-key { background: #eff6ff; }
  .gs-hit-title { font-size: 13px; color: #0f172a; font-weight: 600; }
  .gs-hit-sub { font-size: 11px; color: #64748b; }
}
</style>
