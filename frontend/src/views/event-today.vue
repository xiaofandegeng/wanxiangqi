<template>
  <div class="event-today-view">
    <!-- 顶部概览与筛选栏 -->
    <div class="dashboard-header">
      <div class="header-left">
        <h2 class="view-title">今日钻石狂潮赛程看板</h2>
        <p class="view-desc">每天 12:00 / 13:00 / 14:00 / 15:00 四场对决 · 严格防未来信息泄漏</p>
      </div>

      <div class="header-filters">
        <div class="date-picker-wrap">
          <span class="filter-label">比赛日期</span>
          <span class="date-badge">2026-09-27</span>
        </div>

        <div class="status-tabs">
          <button 
            v-for="tab in filterTabs" 
            :key="tab.value"
            class="tab-btn"
            :class="{ 'is-active': activeFilter === tab.value }"
            @click="activeFilter = tab.value"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- 运行健康度状态指标条 -->
    <div class="health-metrics-bar">
      <div class="metric-item">
        <span class="metric-label">当日场次完整率</span>
        <span class="metric-val text-success">4 / 4 (100%)</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">时序防泄漏审计</span>
        <span class="metric-val text-success">已通过 (Cutoff严格)</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">预测基线模型</span>
        <span class="metric-val text-gold">Plackett-Luce v1.2</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">钻石投入推荐状态</span>
        <span class="metric-val text-warning">公式待核实 (已熔断保护)</span>
      </div>
    </div>

    <!-- 场次卡片列表 -->
    <div class="events-list">
      <EventCard 
        v-for="event in displayEvents" 
        :key="event.id" 
        :event="event" 
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEventStore } from '../stores/event-store'
import EventCard from '../components/EventCard.vue'

const eventStore = useEventStore()
const activeFilter = ref<string>('ALL')

const filterTabs = [
  { label: '全部场次', value: 'ALL' },
  { label: '可预测/比赛中', value: 'ACTIVE' },
  { label: '已完赛复盘', value: 'SETTLED' }
]

const displayEvents = computed(() => {
  if (activeFilter.value === 'ALL') {
    return eventStore.events
  }
  if (activeFilter.value === 'ACTIVE') {
    return eventStore.events.filter(e => e.status === 'PREDICTABLE' || e.status === 'BET_CLOSED')
  }
  if (activeFilter.value === 'SETTLED') {
    return eventStore.events.filter(e => e.status === 'SETTLED' || e.status === 'AUDITED')
  }
  return eventStore.events
})
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.event-today-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dashboard-header {
  @include flex-between;
  flex-wrap: wrap;
  gap: 16px;
}

.view-title {
  font-size: 24px;
  font-weight: 800;
  color: $text-primary;
  letter-spacing: 0.5px;
}

.view-desc {
  font-size: 13px;
  color: $text-secondary;
  margin-top: 4px;
}

.header-filters {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.date-picker-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.04);
  padding: 6px 12px;
  border-radius: $radius-md;
  border: 1px solid $border-color;

  .filter-label {
    font-size: 12px;
    color: $text-muted;
  }

  .date-badge {
    font-size: 13px;
    font-weight: 700;
    color: $color-gold-light;
  }
}

.status-tabs {
  display: flex;
  background: rgba(0, 0, 0, 0.3);
  padding: 4px;
  border-radius: $radius-md;
  border: 1px solid $border-color;
}

.tab-btn {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: $text-secondary;
  border-radius: $radius-sm;
  transition: $transition-base;

  &:hover {
    color: $text-primary;
  }

  &.is-active {
    color: #111827;
    background: $color-gold;
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.4);
  }
}

.health-metrics-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  @include glass-panel;
  padding: 14px 20px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

.metric-item {
  @include flex-column;
  gap: 4px;

  .metric-label {
    font-size: 11px;
    color: $text-muted;
  }

  .metric-val {
    font-size: 14px;
    font-weight: 700;

    &.text-success { color: $color-success; }
    &.text-gold { color: $color-gold-light; }
    &.text-warning { color: $color-warning; }
  }
}

.events-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
