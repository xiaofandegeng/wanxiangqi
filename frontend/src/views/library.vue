<template>
  <div class="library-view">
    <div class="page-header-card">
      <h2 class="page-title">资料库</h2>
      <p class="page-desc">
        英雄、棋手、装备、效果牌、天赋、阵营与机制的统一资料检索。
        查看卡面、技能和效果，按分类找到你需要的卡牌。
      </p>
    </div>

    <div v-if="loadError" class="state-panel is-error">
      <p>资料库加载失败：{{ loadError }}</p>
      <button class="state-btn" @click="reload">重新加载</button>
    </div>

    <template v-else>
      <!-- 分类页签：六类实体 + 规则条目 -->
      <div class="kind-tabs" role="tablist">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          class="kind-tab"
          :class="{ 'is-active': activeTab === tab.key }"
          role="tab"
          :aria-selected="activeTab === tab.key"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span v-if="tab.key !== 'mechanics'" class="tab-count font-mono">{{ entityCount(tab.key) }}</span>
          <span v-else class="tab-count font-mono">{{ mechanics.length }}</span>
        </button>
      </div>

      <!-- 搜索（仅实体页签；规则条目按标题检索） -->
      <div class="search-row">
        <input
          v-model="searchInput"
          class="search-input"
          type="search"
          :placeholder="activeTab === 'mechanics' ? '搜索规则条目标题…' : '搜索卡牌名称…'"
          @keyup.enter="applySearch"
        />
        <button class="search-btn" @click="applySearch">检索</button>
      </div>

      <!-- 实体档案列表 -->
      <template v-if="activeTab !== 'mechanics'">
        <div v-if="isLoadingEntities" class="state-panel">正在加载{{ activeKindLabel }}档案…</div>
        <div v-else-if="!entities.length" class="state-panel">
          <h3 class="state-title">暂无已发布的{{ activeKindLabel }}档案</h3>
          <p class="state-desc">
            技能数值、商店概率、经验表等必须经过当前版本第一方资料核对后才会写入，
            在此之前不会展示任何未核实数值。
          </p>
        </div>
        <div v-else class="entity-grid">
          <router-link
            v-for="e in entities"
            :key="e.id"
            :to="`/library/${activeTab}/${e.slug}`"
            class="entity-card"
          >
            <GameArt :entity-id="e.slug" :name="e.displayName" variant="portrait" />
            <div class="entity-name">{{ e.displayName }}</div>
            <div class="entity-meta">

              <span v-if="e.gameVersion" class="version-chip font-mono">{{ e.gameVersion.versionId }}</span>
            </div>

          </router-link>
        </div>
      </template>

      <!-- 规则条目列表（statementRaw 为来源原文） -->
      <template v-else>
        <div v-if="isLoadingEntities" class="state-panel">正在加载规则条目…</div>
        <div v-else-if="!mechanics.length" class="state-panel">
          <h3 class="state-title">暂无已发布的规则条目</h3>
          <p class="state-desc">规则条目以第一方资料原文为依据，未经核对不录入。</p>
        </div>
        <div v-else class="mechanic-list">
          <div v-for="m in mechanics" :key="m.id" class="mechanic-card">
            <div class="mechanic-head">
              <h3 class="mechanic-title">{{ m.title }}</h3>
              <span v-if="m.gameVersion" class="version-chip font-mono">{{ m.gameVersion.versionId }}</span>
            </div>
            <p v-if="m.statementRaw" class="mechanic-raw">{{ m.statementRaw }}</p>
            <pre v-if="m.params" class="json-block">{{ JSON.stringify(m.params, null, 2) }}</pre>
            <pre v-if="m.appliesTo" class="json-block">{{ JSON.stringify(m.appliesTo, null, 2) }}</pre>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import GameArt from "../components/GameArt.vue"
import { ref, computed, watch } from 'vue'
import {
  fetchCatalog,
  fetchMechanics,
  type CatalogEntry,
  type MechanicEntry
} from '../api'

// 分类键与 URL 段一致（heroes/commanders/equipment/effect-cards/talents/camps + mechanics）
const TABS = [
  { key: 'heroes', label: '英雄' },
  { key: 'commanders', label: '棋手' },
  { key: 'equipment', label: '装备' },
  { key: 'effect-cards', label: '效果牌' },
  { key: 'talents', label: '天赋' },
  { key: 'camps', label: '阵营' },
  { key: 'mechanics', label: '规则条目' }
] as const

type TabKey = (typeof TABS)[number]['key']

const activeTab = ref<TabKey>('heroes')
const searchInput = ref('')
const appliedQuery = ref('')

const entities = ref<CatalogEntry[]>([])
const mechanics = ref<MechanicEntry[]>([])
const isLoadingEntities = ref(false)
const loadError = ref<string | null>(null)

const activeKindLabel = computed(() =>
  TABS.find(t => t.key === activeTab.value)?.label || '')


const kindCounts = ref<Record<string, number>>({})

function entityCount(tabKey: string): number {
  // 已加载的当前页签给真实数；其他页签在切换前不显示未核实计数
  return activeTab.value === tabKey ? entities.value.length : (kindCounts.value[tabKey] ?? 0)
}

async function loadTab() {
  isLoadingEntities.value = true
  loadError.value = null
  try {
    if (activeTab.value === 'mechanics') {
      mechanics.value = await fetchMechanics(appliedQuery.value || undefined)
    } else {
      entities.value = await fetchCatalog({
        kind: activeTab.value,
        q: appliedQuery.value || undefined
      })
      kindCounts.value[activeTab.value] = entities.value.length
    }
  } catch (err: any) {
    loadError.value = err?.message || '未知错误'
  } finally {
    isLoadingEntities.value = false
  }
}

function applySearch() {
  appliedQuery.value = searchInput.value.trim()
  loadTab()
}

function reload() {
  loadTab()
}

watch(activeTab, () => {
  searchInput.value = appliedQuery.value = ''
  loadTab()
})

loadTab()
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.library-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header-card {
  @include glass-panel;
  padding: 20px 24px;
}

.page-title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
  color: $text-primary;
}

.page-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: $text-muted;
  max-width: 760px;
}

.kind-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.kind-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  padding: 7px 14px;
  border-radius: $radius-md;
  border: 1px solid $border-color;
  background: $bg-secondary;
  color: $text-secondary;
  cursor: pointer;
  transition: $transition-base;

  &:hover {
    border-color: rgba(37, 99, 235, 0.4);
  }

  &.is-active {
    background: $color-primary;
    border-color: $color-primary;
    color: #ffffff;

    .tab-count {
      background: rgba(255, 255, 255, 0.2);
      color: #ffffff;
    }
  }
}

.tab-count {
  font-size: 11px;
  padding: 0 6px;
  border-radius: $radius-sm;
  background: $bg-tertiary;
  color: $text-muted;
}

.search-row {
  display: flex;
  gap: 8px;
}

.search-input {
  flex: 1;
  font-size: 13px;
  padding: 8px 12px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: $bg-secondary;
  color: $text-primary;

  &:focus {
    outline: none;
    border-color: $color-primary;
  }
}

.search-btn {
  font-size: 13px;
  font-weight: 600;
  padding: 8px 18px;
  border-radius: $radius-md;
  border: none;
  background: $color-primary;
  color: #ffffff;
  cursor: pointer;

  &:hover {
    background: $color-primary-dark;
  }
}

.state-panel {
  @include glass-panel;
  padding: 40px 28px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: $text-secondary;
  font-size: 14px;

  &.is-error {
    color: $color-danger;
  }
}

.state-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: $text-primary;
}

.state-desc {
  margin: 0;
  max-width: 560px;
  font-size: 13px;
  line-height: 1.8;
  color: $text-muted;
}

.state-btn {
  font-size: 13px;
  font-weight: 600;
  color: $color-primary;
  padding: 8px 18px;
  border: 1px solid rgba(37, 99, 235, 0.35);
  border-radius: $radius-md;
  background: transparent;
  cursor: pointer;

  &:hover {
    background: $color-primary-light;
  }
}

.entity-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 560px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.entity-card {
  @include glass-panel;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-decoration: none;
  transition: $transition-base;

  &:hover {
    border-color: rgba(37, 99, 235, 0.45);
  }
}

.entity-name {
  font-size: 15px;
  font-weight: 700;
  color: $text-primary;
}

.entity-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  .font-mono {
    font-family: $font-mono;
    font-size: 11px;
    background: $bg-tertiary;
    color: $text-muted;
    padding: 1px 6px;
    border-radius: $radius-sm;
  }
}

.version-chip {
  font-family: $font-mono;
  font-size: 10px;
  color: $color-primary;
  background: $color-primary-light;
  border: 1px solid rgba(37, 99, 235, 0.3);
  padding: 0 6px;
  border-radius: $radius-sm;
}

.entity-facts {
  font-size: 11px;
  color: $text-muted;
  line-height: 1.6;
}

.mechanic-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mechanic-card {
  @include glass-panel;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mechanic-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.mechanic-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: $text-primary;
}

.mechanic-raw {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: $text-secondary;
  white-space: pre-wrap;
  background: $bg-tertiary;
  border-left: 3px solid rgba(37, 99, 235, 0.35);
  border-radius: $radius-sm;
  padding: 10px 14px;
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
</style>
