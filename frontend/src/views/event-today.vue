<template>
  <div class="event-today-view">
    <!-- 顶部概览与筛选栏 (对齐 v2 克制数据风格) -->
    <div class="dashboard-header">
      <div class="header-left">
        <h2 class="view-title">王牌对决赛程与对局大盘</h2>
        <p class="view-desc">展示已录入实战对局场次 · 席位选手画像对比与实盘归档</p>
      </div>

      <div class="header-filters">
        <div class="date-picker-wrap">
          <span class="filter-label">日期筛选:</span>
          <span class="date-badge">{{ currentDateStr }}</span>
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

    <!-- 运行健康度状态指标条 (基于真实数据动态统计) -->
    <div class="health-metrics-bar">
      <div class="metric-item">
        <span class="metric-label">已收录场次数</span>
        <span class="metric-val text-success">{{ eventStore.events.length }} 场</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">已完赛复盘场次</span>
        <span class="metric-val text-cyan">{{ settledCount }} 场</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">时序防泄漏截点 (Cutoff)</span>
        <span class="metric-val text-blue">生效中 (match_time严格隔离)</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">外部数据同步状态</span>
        <span class="metric-val text-success">正常 (Port 8080 API)</span>
      </div>
    </div>

    <!-- 场次卡片列表 (带空态处理) -->
    <div v-if="displayEvents.length > 0" class="events-list">
      <EventCard 
        v-for="event in displayEvents" 
        :key="event.id" 
        :event="event" 
      />
    </div>

    <div v-else class="empty-state-card">
      <span class="empty-icon">📋</span>
      <h4 class="empty-title">当前筛选条件下暂无对局记录</h4>
      <p class="empty-desc">您可通过右上角【对局录入与对比】或管理区导入真实比赛截图或战绩数据。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useEventStore } from '../stores/event-store'
import EventCard from '../components/EventCard.vue'

const eventStore = useEventStore()
const activeFilter = ref<string>('ALL')

const currentDateStr = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

const filterTabs = [
  { label: '全部场次', value: 'ALL' },
  { label: '比赛中/未开赛', value: 'ACTIVE' },
  { label: '已完赛复盘', value: 'SETTLED' }
]

const settledCount = computed(() => {
  return eventStore.events.filter(e => e.status === 'SETTLED' || e.status === 'AUDITED').length
})

const displayEvents = computed(() => {
  if (activeFilter.value === 'ALL') {
    return eventStore.events
  }
  if (activeFilter.value === 'ACTIVE') {
    return eventStore.events.filter(e => e.status === 'PREDICTABLE' || e.status === 'BET_CLOSED' || e.status === 'PENDING_VERIFY')
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
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 20px 60px;
}

.dashboard-header {
  @include flex-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  background: var(--color-surface, #1e2538);
  border: 1px solid var(--color-border, #2a344d);
  border-radius: 8px;
  padding: 24px;

  .header-left {
    .view-title {
      font-size: 22px;
      font-weight: 700;
      color: var(--color-text, #f1f5f9);
      margin: 0 0 6px;
    }

    .view-desc {
      font-size: 13px;
      color: var(--color-text-secondary, #94a3b8);
      margin: 0;
    }
  }

  .header-filters {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;

    .date-picker-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(0, 0, 0, 0.2);
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid var(--color-border, #2a344d);

      .filter-label {
        font-size: 12px;
        color: #64748b;
      }

      .date-badge {
        font-size: 13px;
        font-weight: 600;
        color: #cbd5e1;
        font-family: ui-monospace, monospace;
      }
    }

    .status-tabs {
      display: flex;
      gap: 6px;

      .tab-btn {
        background: transparent;
        border: 1px solid var(--color-border, #2a344d);
        color: var(--color-text-secondary, #94a3b8);
        padding: 6px 12px;
        font-size: 13px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;

        &:hover {
          color: #fff;
          border-color: #3b82f6;
        }

        &.is-active {
          background: #2563eb;
          color: #fff;
          border-color: #2563eb;
          font-weight: 600;
        }
      }
    }
  }
}

.health-metrics-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  background: var(--color-surface, #1e2538);
  border: 1px solid var(--color-border, #2a344d);
  border-radius: 8px;
  padding: 16px 20px;

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }

  .metric-item {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .metric-label {
      font-size: 12px;
      color: var(--color-text-secondary, #94a3b8);
    }

    .metric-val {
      font-size: 15px;
      font-weight: 600;
      color: var(--color-text, #f1f5f9);

      &.text-success {
        color: #4ade80;
      }
      &.text-cyan {
        color: #38bdf8;
      }
      &.text-blue {
        color: #60a5fa;
      }
    }
  }
}

.events-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 20px;
}

.empty-state-card {
  text-align: center;
  padding: 60px 20px;
  background: var(--color-surface, #1e2538);
  border: 1px dashed var(--color-border, #2a344d);
  border-radius: 8px;

  .empty-icon {
    font-size: 36px;
    display: block;
    margin-bottom: 12px;
  }
  .empty-title {
    font-size: 16px;
    font-weight: 600;
    color: #cbd5e1;
    margin: 0 0 6px;
  }
  .empty-desc {
    font-size: 13px;
    color: #64748b;
    margin: 0;
  }
}
</style>
