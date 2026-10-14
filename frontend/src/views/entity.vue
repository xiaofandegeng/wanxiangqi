<template>
  <div class="entity-view">
    <div class="nav-back-row">
      <router-link to="/library" class="back-link">← 返回资料库</router-link>
    </div>

    <div v-if="isLoading" class="state-panel">正在加载实体档案…</div>

    <div v-else-if="loadError" class="state-panel is-error">
      <h3 class="state-title">实体档案加载失败</h3>
      <p class="state-desc">{{ loadError }}</p>
      <button class="state-btn" @click="loadEntity">重新加载</button>
    </div>

    <!-- 未发布/不存在：如实呈现；不渲染任何未核实的机制/数值 -->
    <div v-else-if="!entity" class="state-panel">
      <h3 class="state-title">未找到该实体档案</h3>
      <p class="state-desc">
        「<span class="font-mono">{{ kind }}/{{ slug }}</span>」不存在或尚未发布。
        档案内容（机制事实、版本差异、应用阵容、关联课程）须经来源核查与审核后发布。
      </p>
      <router-link to="/library" class="state-btn">返回资料库</router-link>
    </div>

    <template v-else>
      <div class="entity-header-card">
        <GameArt :entity-id="entity.slug" :name="entity.displayName" variant="card" />
        <div class="entity-title-wrap">
          <span class="kind-chip font-mono">{{ kindLabel(entity.kind) }}</span>
          <h2 class="entity-name">{{ entity.displayName }}</h2>
          <p class="entity-meta-row">

            <template v-if="entity.gameVersion">适用版本 <span class="font-mono">{{ entity.gameVersion.versionId }}</span></template>
            <template v-if="entity.revision"> · 修订 r{{ entity.revision.no }}</template>
            <template v-if="entity.revision?.publishedAt"> · 发布于 {{ formatTime(entity.revision.publishedAt) }}</template>
          </p>
        </div>
      </div>

      <TeachingMedia :entity-id="entity.slug" />
      <!-- 档案事实：结构化键值如实陈列；形态未知回退原始 JSON -->
      <div class="section-card">
        <h3 class="section-title">档案事实</h3>
        <div v-if="!factRows.length" class="section-empty">档案事实未登记（数据不完整，如实呈现）</div>
        <div v-else class="facts-table-wrap">
          <table class="facts-table">
            <tbody>
              <tr v-for="row in factRows" :key="row.key">
                <th>{{ row.key }}</th>
                <td>
                  <span v-if="row.scalar !== null" class="fact-scalar">{{ row.scalar }}</span>
                  <FactValue v-else :value="row.value" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 来源引用 -->
      <div class="section-card">
        <h3 class="section-title">来源与依据（公开引用）</h3>
        <div v-if="!entity.references.length" class="section-empty">无公开来源引用</div>
        <ul v-else class="ref-list">
          <li v-for="r in entity.references" :key="r.id" class="ref-item">
            <span class="ref-kind">{{ refKindLabel(r.refKind) }}</span>
            <span class="ref-locator font-mono">{{ r.refLocator }}</span>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import FactValue from "../components/FactValue.vue"
import GameArt from "../components/GameArt.vue"
import TeachingMedia from "../components/TeachingMedia.vue"
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchEntityDetail, type EntityDetail } from '../api'

const route = useRoute()
const kind = computed(() => (route.params.kind as string) || '')
const slug = computed(() => (route.params.slug as string) || '')

const entity = ref<EntityDetail | null>(null)
const isLoading = ref(true)
const loadError = ref<string | null>(null)

let loadAbort: AbortController | null = null

async function loadEntity() {
  loadAbort?.abort()
  loadAbort = new AbortController()
  isLoading.value = true
  loadError.value = null
  try {
    entity.value = await fetchEntityDetail(kind.value, slug.value, loadAbort.signal)
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    console.error('加载实体档案失败:', err)
    loadError.value = err?.message || '未知错误'
    entity.value = null
  } finally {
    if (!loadAbort?.signal.aborted) isLoading.value = false
  }
}

onMounted(loadEntity)
onUnmounted(() => loadAbort?.abort())
watch(() => [route.params.kind, route.params.slug], () => {
  if (route.name === 'entity') loadEntity()
})

/** facts 逐键陈列：标量直接展示，对象/数组原样 JSON（不猜字段语义） */
const factRows = computed(() => {
  const facts = entity.value?.facts
  if (!facts || typeof facts !== 'object') return []
  return Object.entries(facts).filter(([key]) => !["cardImage"].includes(key)).map(([key, value]) => {
    const isScalar = ['string', 'number', 'boolean'].includes(typeof value) || value === null
    return {
      key: ({ quality: "品阶", camp: "阵营", effectText: "卡牌效果", shopBuyCost: "购买费用", properties: "属性", baseProperties: "基础属性", awakening: "觉醒效果", awakeningText: "觉醒效果", howToGet: "获取途径", keywords: "关键词", recommendedEquipment: "推荐装备", stageNote: "阶段提示", lineupRoles: "阵容职责", officialBeginnerLineupCore: "入门阵容", engineNote: "触发机制", growthNote: "成长方式", substituteNote: "替补建议", transitionRole: "过渡职责", handoffNote: "交接方式", lateGameNote: "后期调整", equipmentNote: "装备建议" } as Record<string, string>)[key] || key,
      scalar: isScalar ? (value === null ? '—' : String(value)) : null,
      value
    }
  })
})

const KIND_LABELS: Record<string, string> = {
  HERO: '英雄', COMMANDER: '棋手', EQUIPMENT: '装备',
  EFFECT_CARD: '效果牌', TALENT: '天赋', CAMP: '阵营'
}

function kindLabel(k: string): string {
  return KIND_LABELS[k] || k
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

.entity-view {
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

.entity-header-card {
  @include glass-panel;
  padding: 22px 24px;
}

.entity-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

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

.entity-name {
  margin: 0;
  font-size: 21px;
  font-weight: 800;
  color: $text-primary;
}

.entity-meta-row {
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

.facts-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.facts-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;

  th {
    width: 180px;
    padding: 10px 12px;
    color: $text-muted;
    font-weight: 600;
    border-bottom: 1px solid $border-color;
    vertical-align: top;
    white-space: nowrap;
  }

  td {
    padding: 10px 12px;
    border-bottom: 1px solid $bg-tertiary;
    color: $text-secondary;
    vertical-align: top;
  }
}

.fact-scalar {
  line-height: 1.7;
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

.ref-locator {
  font-size: 12px;
  color: $text-secondary;
  word-break: break-all;
}
</style>
