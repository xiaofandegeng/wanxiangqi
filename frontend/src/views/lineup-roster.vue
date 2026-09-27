<template>
  <div class="lineup-roster-view">
    <!-- 顶栏标题与来源说明 -->
    <div class="page-header-card">
      <div class="header-main-row">
        <div class="title-wrap">
          <span class="category-badge">第三方阵容环境大盘</span>
          <h2 class="page-title">自走棋主流流派胜率与前三率归纳</h2>
          <p class="page-desc">
            数据来源：{{ sourceNotice }}（统计窗口：近 7 日实战聚合，全服王者段位样本）。
            本页面展示阵容群体大盘特征，不代表单名选手的个人历史战绩。
          </p>
        </div>

        <div class="snapshot-meta-box">
          <span class="meta-label">快照版本:</span>
          <span class="meta-val">v260917</span>
          <span class="meta-divider">|</span>
          <span class="meta-label">数据截至:</span>
          <span class="meta-val">{{ formatDate(dataAsOf) }}</span>
        </div>
      </div>

      <!-- 核心指标摘要 -->
      <div class="stats-summary-grid">
        <div class="summary-item">
          <span class="item-num">{{ lineups.length }} 套</span>
          <span class="item-label">收录主流成型体系</span>
        </div>
        <div class="summary-item">
          <span class="item-num">{{ formatTotalSamples }}</span>
          <span class="item-label">聚合实战总样本量</span>
        </div>
        <div class="summary-item">
          <span class="item-num highlight-blue">{{ topWinRateLineup?.lineupName || '九五至尊' }}</span>
          <span class="item-label">最高吃鸡率流派 ({{ Math.round((topWinRateLineup?.winRate || 0) * 100) }}%)</span>
        </div>
        <div class="summary-item">
          <span class="item-num highlight-green">{{ topStableLineup?.lineupName || '玄雍重坦' }}</span>
          <span class="item-label">最高前三保分流 ({{ Math.round((topStableLineup?.top3Rate || 0) * 100) }}%)</span>
        </div>
      </div>
    </div>

    <!-- 筛选与搜索工具条 -->
    <div class="filter-toolbar">
      <div class="sort-tabs">
        <span class="sort-lbl">排序方式:</span>
        <button 
          class="sort-tab-btn" 
          :class="{ active: sortField === 'winRate' }" 
          @click="sortField = 'winRate'"
        >
          登顶吃鸡率
        </button>
        <button 
          class="sort-tab-btn" 
          :class="{ active: sortField === 'top3Rate' }" 
          @click="sortField = 'top3Rate'"
        >
          前三保分率
        </button>
        <button 
          class="sort-tab-btn" 
          :class="{ active: sortField === 'avgRank' }" 
          @click="sortField = 'avgRank'"
        >
          平均名次
        </button>
        <button 
          class="sort-tab-btn" 
          :class="{ active: sortField === 'sampleCount' }" 
          @click="sortField = 'sampleCount'"
        >
          样本规模
        </button>
      </div>

      <div class="search-box">
        <input 
          v-model="searchKey" 
          type="text" 
          class="search-input" 
          placeholder="搜索阵容名称 / 核心英雄..." 
        />
      </div>
    </div>

    <!-- 阵容数据表格 -->
    <div class="table-card">
      <table class="lineup-table">
        <thead>
          <tr>
            <th class="th-rank">序号</th>
            <th class="th-name">阵容体系</th>
            <th class="th-tier">梯队评级</th>
            <th class="th-commander">推荐棋手</th>
            <th class="th-heroes">核心关键英雄</th>
            <th class="th-samples">样本规模</th>
            <th class="th-winrate">登顶吃鸡率</th>
            <th class="th-top3">前三率 (保分)</th>
            <th class="th-avg">平均名次</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, idx) in sortedLineups" :key="item.id" class="lineup-row">
            <td class="td-rank">
              <span class="order-badge" :class="'order-' + (idx + 1)">{{ idx + 1 }}</span>
            </td>
            <td class="td-name">
              <span class="lineup-name">{{ item.lineupName }}</span>
              <span class="scope-tag">{{ item.scope }}</span>
            </td>
            <td class="td-tier">
              <span class="tier-badge" :class="'tier-' + item.tier.replace('.', '_')">{{ item.tier }}</span>
            </td>
            <td class="td-commander">
              <span class="commander-tag">{{ item.commander }}</span>
            </td>
            <td class="td-heroes">
              <div class="heroes-list">
                <span v-for="h in item.coreHeroes" :key="h" class="hero-chip">{{ h }}</span>
              </div>
            </td>
            <td class="td-samples font-mono">
              {{ item.sampleCount.toLocaleString() }} 局
            </td>
            <td class="td-winrate font-mono highlight-gold">
              {{ (item.winRate * 100).toFixed(1) }}%
            </td>
            <td class="td-top3 font-mono highlight-cyan">
              {{ (item.top3Rate * 100).toFixed(1) }}%
            </td>
            <td class="td-avg font-mono">
              {{ item.avgRank.toFixed(2) }} 名
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchLineupSnapshots, type LineupSnapshot } from '../api'

const lineups = ref<LineupSnapshot[]>([])
const sourceNotice = ref('')
const dataAsOf = ref('')
const sortField = ref<'winRate' | 'top3Rate' | 'avgRank' | 'sampleCount'>('winRate')
const searchKey = ref('')

onMounted(async () => {
  const result = await fetchLineupSnapshots()
  lineups.value = result.lineups
  sourceNotice.value = result.sourceNotice
  dataAsOf.value = result.dataAsOf
})

const sortedLineups = computed(() => {
  let list = lineups.value.slice()
  if (searchKey.value.trim()) {
    const q = searchKey.value.trim().toLowerCase()
    list = list.filter(l => 
      l.lineupName.toLowerCase().includes(q) || 
      l.commander.toLowerCase().includes(q) ||
      l.coreHeroes.some(h => h.toLowerCase().includes(q))
    )
  }

  if (sortField.value === 'winRate') {
    list.sort((a, b) => b.winRate - a.winRate)
  } else if (sortField.value === 'top3Rate') {
    list.sort((a, b) => b.top3Rate - a.top3Rate)
  } else if (sortField.value === 'avgRank') {
    list.sort((a, b) => a.avgRank - b.avgRank)
  } else if (sortField.value === 'sampleCount') {
    list.sort((a, b) => b.sampleCount - a.sampleCount)
  }
  return list
})

const formatTotalSamples = computed(() => {
  const total = lineups.value.reduce((acc, cur) => acc + cur.sampleCount, 0)
  return total.toLocaleString() + ' 局'
})

const topWinRateLineup = computed(() => {
  if (lineups.value.length === 0) return null
  return [...lineups.value].sort((a, b) => b.winRate - a.winRate)[0]
})

const topStableLineup = computed(() => {
  if (lineups.value.length === 0) return null
  return [...lineups.value].sort((a, b) => b.top3Rate - a.top3Rate)[0]
})

function formatDate(isoStr: string) {
  if (!isoStr) return '--'
  try {
    const d = new Date(isoStr)
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  } catch {
    return isoStr
  }
}
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;

.lineup-roster-view {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 20px 60px;
}

.page-header-card {
  background: var(--color-surface, #1e2538);
  border: 1px solid var(--color-border, #2a344d);
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 20px;
}

.header-main-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  gap: 16px;
}

.category-badge {
  display: inline-block;
  font-size: 12px;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 600;
  margin-bottom: 8px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text, #f1f5f9);
  margin: 0 0 8px;
}

.page-desc {
  font-size: 13px;
  color: var(--color-text-secondary, #94a3b8);
  margin: 0;
  line-height: 1.5;
  max-width: 800px;
}

.snapshot-meta-box {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.2);
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  white-space: nowrap;

  .meta-label {
    color: #64748b;
  }
  .meta-val {
    color: #cbd5e1;
    font-weight: 600;
  }
  .meta-divider {
    color: #475569;
  }
}

.stats-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  border-top: 1px solid var(--color-border, #2a344d);
  padding-top: 20px;

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .item-num {
    font-size: 20px;
    font-weight: 700;
    color: var(--color-text, #f1f5f9);
  }
  .item-label {
    font-size: 12px;
    color: var(--color-text-secondary, #94a3b8);
  }
  .highlight-blue {
    color: #38bdf8;
  }
  .highlight-green {
    color: #4ade80;
  }
}

.filter-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 16px;
  flex-wrap: wrap;
}

.sort-tabs {
  display: flex;
  align-items: center;
  gap: 8px;

  .sort-lbl {
    font-size: 13px;
    color: var(--color-text-secondary, #94a3b8);
  }

  .sort-tab-btn {
    background: var(--color-surface, #1e2538);
    border: 1px solid var(--color-border, #2a344d);
    color: var(--color-text-secondary, #94a3b8);
    font-size: 13px;
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      color: #fff;
      border-color: #3b82f6;
    }

    &.active {
      background: #2563eb;
      color: #fff;
      border-color: #2563eb;
      font-weight: 600;
    }
  }
}

.search-box {
  .search-input {
    background: var(--color-surface, #1e2538);
    border: 1px solid var(--color-border, #2a344d);
    color: #f1f5f9;
    padding: 6px 14px;
    font-size: 13px;
    border-radius: 6px;
    width: 240px;
    outline: none;

    &:focus {
      border-color: #3b82f6;
    }
  }
}

.table-card {
  background: var(--color-surface, #1e2538);
  border: 1px solid var(--color-border, #2a344d);
  border-radius: 8px;
  overflow-x: auto;
}

.lineup-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 14px;

  thead th {
    background: rgba(0, 0, 0, 0.2);
    color: var(--color-text-secondary, #94a3b8);
    font-size: 12px;
    font-weight: 600;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border, #2a344d);
    white-space: nowrap;
  }

  tbody tr {
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    transition: background 0.15s;

    &:hover {
      background: rgba(255, 255, 255, 0.02);
    }
  }

  tbody td {
    padding: 14px 16px;
    color: var(--color-text, #f1f5f9);
    vertical-align: middle;
  }
}

.order-badge {
  display: inline-block;
  width: 22px;
  height: 22px;
  line-height: 22px;
  text-align: center;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  background: #334155;
  color: #94a3b8;

  &.order-1 {
    background: #eab308;
    color: #000;
  }
  &.order-2 {
    background: #94a3b8;
    color: #000;
  }
  &.order-3 {
    background: #d97706;
    color: #fff;
  }
}

.lineup-name {
  font-weight: 600;
  font-size: 15px;
  display: block;
}

.scope-tag {
  font-size: 11px;
  color: #64748b;
}

.tier-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  background: #334155;
  color: #cbd5e1;

  &.tier-T0_5 {
    background: rgba(234, 179, 8, 0.2);
    color: #facc15;
    border: 1px solid rgba(234, 179, 8, 0.4);
  }
  &.tier-T1 {
    background: rgba(56, 189, 248, 0.2);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.4);
  }
  &.tier-T1_5 {
    background: rgba(168, 85, 247, 0.2);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.4);
  }
}

.commander-tag {
  font-size: 12px;
  background: rgba(255, 255, 255, 0.08);
  padding: 3px 8px;
  border-radius: 4px;
  color: #cbd5e1;
}

.heroes-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.hero-chip {
  font-size: 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
  padding: 2px 6px;
  border-radius: 4px;
  color: #94a3b8;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.highlight-gold {
  color: #facc15;
  font-weight: 600;
}

.highlight-cyan {
  color: #38bdf8;
  font-weight: 600;
}
</style>
