<template>
  <div class="event-today-view">
    <!-- 工作台顶栏：仅事实陈列，无预测话术 -->
    <div class="workbench-header-card">
      <div class="title-wrap">
        <div class="brand-badge-row">
          <span class="workbench-tag">王牌对决 · 已收录场次台账</span>
          <span class="engine-status-tag">仅人工核验入库的真实数据</span>
        </div>
        <h2 class="view-title">已收录对局场次一览</h2>
        <p class="view-desc">
          本页只陈列经证据链人工核验后入库的对决场次及其赛后事实。未知字段如实标注，本站不发布任何赛前预测或对局建议。
        </p>
      </div>
      <div class="header-meta">
        <span class="meta-label">数据更新时间</span>
        <span class="meta-time font-mono">{{ formatDateTime(dataAsOf) }}</span>
      </div>
    </div>

    <!-- 日期 / 模式筛选（与 URL 同步，可追溯） -->
    <div class="filters-card">
      <div class="filter-group">
        <label class="filter-label">日期</label>
        <input
          v-model="selectedDate"
          type="date"
          class="date-input font-mono"
          @change="onFilterChange"
        />
        <button class="quick-btn" :class="{ active: !selectedDate }" @click="clearDate">全部日期</button>
      </div>
      <div class="filter-group">
        <label class="filter-label">模式</label>
        <select v-model="selectedMode" class="mode-select" @change="onFilterChange">
          <option value="">全部模式</option>
          <option v-for="m in knownModes" :key="m" :value="m">{{ m }}</option>
        </select>
      </div>
      <div class="filter-group result-count">
        <span class="font-mono">{{ loading ? '加载中…' : `共 ${events.length} 场` }}</span>
      </div>
    </div>

    <!-- 失败态如实呈现 -->
    <div v-if="loadError" class="state-panel is-error">
      <p>场次数据加载失败：{{ loadError }}</p>
      <button class="retry-btn" @click="loadEvents">重新加载</button>
    </div>

    <!-- 已收录场次表格 -->
    <div v-else class="events-table-card">
      <div class="table-title-row">
        <h3 class="table-title">场次记录</h3>
        <span class="table-sub">点击行进入单场六席位详情；赛后名次以人工核验录入为准</span>
      </div>

      <div v-if="loading" class="state-panel">正在加载场次数据...</div>

      <div v-else-if="events.length === 0" class="state-panel empty-state">
        <p>{{ selectedDate ? `${selectedDate} 暂无已收录场次` : '暂无已收录场次' }}</p>
        <span class="sub-hint">通过「证据核验工作台」录入并核验六席位材料后，场次将在此呈现。</span>
      </div>

      <div v-else class="table-responsive">
        <table class="events-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>场次编号</th>
              <th>模式</th>
              <th>状态</th>
              <th>六席位与名次</th>
              <th>核验</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="evt in events"
              :key="evt.id"
              class="event-tr"
              @click="goDetail(evt.id)"
            >
              <td class="font-mono">{{ formatDateTime(evt.scheduledAt) }}</td>
              <td class="font-mono text-gold">{{ evt.id }}</td>
              <td>{{ evt.mode || '未知' }}</td>
              <td><StatusTag :status="evt.status" /></td>
              <td>
                <div class="slots-lineup">
                  <span
                    v-for="p in evt.participants"
                    :key="p.slot"
                    class="slot-chip"
                    :class="p.finalRank === 1 ? 'is-first' : ''"
                    :title="p.finalRank != null ? `第 ${p.finalRank} 名` : '名次未录入'"
                  >
                    #{{ p.slot }} {{ p.nickname }}<template v-if="p.finalRank != null"> · {{ p.finalRank }}</template>
                  </span>
                </div>
              </td>
              <td>
                <span v-if="evt.verifiedAt" class="verified-tag">已核验</span>
                <span v-else class="pending-tag">待核验</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import StatusTag from '../components/StatusTag.vue'
import { fetchEventsList, type EventRecord } from '../api'

const route = useRoute()
const router = useRouter()

const selectedDate = ref<string>('')
const selectedMode = ref<string>('')
const events = ref<EventRecord[]>([])
const dataAsOf = ref<string>(new Date().toISOString())
const loading = ref(true)
const loadError = ref<string | null>(null)

let loadAbort: AbortController | null = null

// 已收录数据里实际出现的模式（不预设任何模式枚举）
const knownModes = computed(() => {
  const set = new Set<string>()
  for (const evt of events.value) {
    if (evt.mode) set.add(evt.mode)
  }
  return Array.from(set).sort()
})

function syncFromUrl() {
  const d = route.query.date
  const m = route.query.mode
  selectedDate.value = typeof d === 'string' ? d : ''
  selectedMode.value = typeof m === 'string' ? m : ''
}

function onFilterChange() {
  router.replace({
    query: {
      ...(selectedDate.value ? { date: selectedDate.value } : {}),
      ...(selectedMode.value ? { mode: selectedMode.value } : {})
    }
  })
  loadEvents()
}

function clearDate() {
  selectedDate.value = ''
  onFilterChange()
}

function goDetail(eventId: string) {
  router.push(`/events/${eventId}`)
}

function formatDateTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

async function loadEvents() {
  loadAbort?.abort()
  loadAbort = new AbortController()
  loading.value = true
  loadError.value = null
  try {
    // 无日期时不按日期过滤（全部已收录场次倒序）
    const list = await fetchEventsList(
      {
        ...(selectedDate.value ? { date: selectedDate.value } : {}),
        ...(selectedMode.value ? { mode: selectedMode.value } : {})
      },
      loadAbort.signal
    )
    events.value = list
    dataAsOf.value = new Date().toISOString()
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    loadError.value = err?.message || '未知错误'
    events.value = []
  } finally {
    if (!loadAbort?.signal.aborted) loading.value = false
  }
}

onMounted(() => {
  syncFromUrl()
  loadEvents()
})
onUnmounted(() => loadAbort?.abort())
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.event-today-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workbench-header-card {
  @include glass-panel;
  padding: 20px 24px;
}

.title-wrap {
  .brand-badge-row {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }

  .workbench-tag {
    background: linear-gradient(135deg, $color-gold 0%, $color-gold-dark 100%);
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
    padding: 2px 10px;
    border-radius: $radius-sm;
  }

  .engine-status-tag {
    background: rgba(16, 185, 129, 0.12);
    color: $color-success;
    font-size: 12px;
    font-weight: 600;
    padding: 2px 10px;
    border-radius: $radius-sm;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .view-title {
    font-size: 20px;
    font-weight: 700;
    color: $text-primary;
    margin: 0 0 6px 0;
  }

  .view-desc {
    font-size: 13px;
    color: $text-muted;
    margin: 0;
    line-height: 1.6;
    max-width: 720px;
  }
}

.header-meta {
  margin-top: 14px;
  display: flex;
  align-items: baseline;
  gap: 8px;

  .meta-label {
    font-size: 11px;
    color: $text-muted;
  }

  .meta-time {
    font-size: 12px;
    color: $text-secondary;
  }
}

.filters-card {
  @include glass-panel;
  padding: 14px 20px;
  display: flex;
  gap: 20px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;

  .filter-label {
    font-size: 12px;
    color: $text-muted;
  }

  &.result-count {
    margin-left: auto;
    font-size: 12px;
    color: $text-secondary;
  }
}

.date-input,
.mode-select {
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid $border-color-hover;
  border-radius: $radius-sm;
  background: $bg-tertiary;
  color: $text-primary;
}

.quick-btn {
  padding: 6px 12px;
  border: 1px solid $border-color-hover;
  background: transparent;
  color: $text-secondary;
  font-size: 12px;
  border-radius: $radius-sm;
  cursor: pointer;

  &.active {
    border-color: rgba(245, 158, 11, 0.5);
    color: $color-gold;
    background: rgba(245, 158, 11, 0.1);
  }
}

.state-panel {
  padding: 40px 24px;
  text-align: center;
  color: $text-secondary;
  font-size: 14px;

  &.is-error {
    color: $color-danger;
  }

  .sub-hint {
    display: block;
    margin-top: 8px;
    font-size: 11px;
    color: $text-muted;
  }
}

.retry-btn {
  margin-top: 12px;
  padding: 6px 16px;
  border: 1px solid rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.1);
  color: $color-gold;
  border-radius: $radius-sm;
  cursor: pointer;
}

.events-table-card {
  @include glass-panel;
  padding: 20px;

  .table-title-row {
    @include flex-between;
    margin-bottom: 14px;

    .table-title {
      font-size: 16px;
      font-weight: 700;
      color: $text-primary;
    }

    .table-sub {
      font-size: 11px;
      color: $text-muted;
    }
  }
}

.table-responsive {
  width: 100%;
  overflow-x: auto;
}

.events-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;

  th {
    padding: 10px 12px;
    color: $text-muted;
    font-weight: 600;
    border-bottom: 1px solid $border-color;
    white-space: nowrap;
  }

  td {
    padding: 12px;
    border-bottom: 1px solid #eef2f7;
    vertical-align: top;
  }

  .event-tr {
    cursor: pointer;
    transition: background 0.15s;

    &:hover {
      background: $bg-card-hover;
    }
  }

  .text-gold {
    color: $color-gold;
  }
}

.slots-lineup {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 560px;
}

.slot-chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: $radius-sm;
  background: $bg-tertiary;
  border: 1px solid $border-color;
  color: $text-secondary;
  white-space: nowrap;

  &.is-first {
    border-color: rgba(245, 158, 11, 0.5);
    color: $color-gold;
    background: rgba(245, 158, 11, 0.1);
  }
}

.verified-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: $radius-sm;
  background: rgba(16, 185, 129, 0.12);
  color: $color-success;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.pending-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: $radius-sm;
  background: rgba(245, 158, 11, 0.1);
  color: $color-gold;
  border: 1px solid rgba(245, 158, 11, 0.3);
}
</style>
