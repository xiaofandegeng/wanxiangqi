<template>
  <div class="player-roster-view">
    <!-- 顶部大盘指标横幅 -->
    <div class="roster-header-card">
      <div class="header-top-row">
        <div class="title-block">
          <span class="header-badge">全服天梯大数据引擎</span>
          <h2 class="view-title">全服顶尖王者战绩大盘与天梯榜</h2>
          <span class="view-sub">沉淀高分段 (9000★ ~ 19000★) 核心参赛选手全景档案与真实历史表现</span>
        </div>

        <div class="data-status-box">
          <span class="live-dot"></span>
          <span class="status-title">数据源已接入: 模拟器后台巡检 + 天梯大盘</span>
        </div>
      </div>

      <!-- 核心指标摘要 -->
      <div class="metrics-grid">
        <div class="metric-card">
          <span class="metric-num">{{ players.length }} 位</span>
          <span class="metric-label">收录高分顶尖王者</span>
          <span class="metric-hint">全网主播 / 榜一 / 职业选手</span>
        </div>
        <div class="metric-card highlight-gold">
          <span class="metric-num">18824★</span>
          <span class="metric-label">全服天梯最高分</span>
          <span class="metric-hint">榜一 EZ夜余</span>
        </div>
        <div class="metric-card highlight-cyan">
          <span class="metric-num">{{ totalMatchesRecorded }} 场</span>
          <span class="metric-label">归档对局流水</span>
          <span class="metric-hint">每场包含 6 席位名次与阵容</span>
        </div>
        <div class="metric-card highlight-green">
          <span class="metric-num">98.5%</span>
          <span class="metric-label">卡池与流派特征覆盖率</span>
          <span class="metric-hint">用于即时沙盘推演与 EV 精算</span>
        </div>
      </div>
    </div>

    <!-- 过滤器与排序列 -->
    <div class="filter-bar">
      <div class="sort-tabs">
        <span class="sort-label">排序方式:</span>
        <button 
          class="sort-btn" 
          :class="{ active: sortBy === 'score' }" 
          @click="sortBy = 'score'"
        >
          段位分天梯榜
        </button>
        <button 
          class="sort-btn" 
          :class="{ active: sortBy === 'winRate' }" 
          @click="sortBy = 'winRate'"
        >
          登顶吃鸡率
        </button>
        <button 
          class="sort-btn" 
          :class="{ active: sortBy === 'top3' }" 
          @click="sortBy = 'top3'"
        >
          前三保分率
        </button>
        <button 
          class="sort-btn" 
          :class="{ active: sortBy === 'matches' }" 
          @click="sortBy = 'matches'"
        >
          样本场次
        </button>
      </div>

      <div class="search-wrap">
        <input 
          v-model="searchKeyword" 
          type="text" 
          class="search-input" 
          placeholder="搜索选手昵称 / 流派 / 称号..." 
        />
      </div>
    </div>

    <!-- 选手大盘天梯表格 -->
    <div class="table-container">
      <table class="roster-table">
        <thead>
          <tr>
            <th class="th-rank">排名</th>
            <th class="th-player">选手档案</th>
            <th class="th-score">段位天梯分</th>
            <th class="th-winrate">真实吃鸡率</th>
            <th class="th-top3">前三率 (烂分保率)</th>
            <th class="th-avg">平均名次</th>
            <th class="th-lineup">主玩体系与本命</th>
            <th class="th-style">战术打法归纳</th>
            <th class="th-action">历史战绩</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="(p, idx) in sortedPlayers" 
            :key="p.id" 
            class="player-tr"
            @click="openPlayerDetail(p.nickname)"
          >
            <td class="td-rank">
              <span class="rank-badge" :class="'top-' + (idx + 1)">{{ idx + 1 }}</span>
            </td>

            <td class="td-player">
              <div class="player-info-cell">
                <span class="avatar-tag">{{ p.nickname.substring(0, 1) }}</span>
                <div class="name-meta">
                  <div class="name-line">
                    <span class="p-name">{{ p.nickname }}</span>
                    <span v-if="p.titleBadge" class="title-tag">{{ p.titleBadge }}</span>
                  </div>
                  <span class="p-platform">{{ p.platform }}</span>
                </div>
              </div>
            </td>

            <td class="td-score">
              <span class="score-text">{{ p.rankScore }}★</span>
            </td>

            <td class="td-winrate">
              <div class="rate-cell">
                <span class="rate-val text-gold">{{ Math.round(p.firstPlaceRate * 100) }}%</span>
                <div class="rate-bar-track">
                  <div class="rate-bar-fill gold-fill" :style="{ width: `${p.firstPlaceRate * 100}%` }"></div>
                </div>
              </div>
            </td>

            <td class="td-top3">
              <div class="rate-cell">
                <span class="rate-val text-cyan">{{ Math.round(p.top3Rate * 100) }}%</span>
                <div class="rate-bar-track">
                  <div class="rate-bar-fill cyan-fill" :style="{ width: `${p.top3Rate * 100}%` }"></div>
                </div>
              </div>
            </td>

            <td class="td-avg">
              <span class="avg-text">{{ p.avgPlacement.toFixed(2) }} 名</span>
            </td>

            <td class="td-lineup">
              <div class="lineup-cell">
                <span class="lineup-name">{{ p.primaryLineup }}</span>
                <span class="hero-tag">本命: {{ p.signatureHero }}</span>
              </div>
            </td>

            <td class="td-style">
              <span class="style-badge" :class="p.playstyleCategory">
                {{ p.playstyleName }}
              </span>
            </td>

            <td class="td-action">
              <button class="action-view-btn" @click.stop="openPlayerDetail(p.nickname)">
                复盘流水
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 真实对局战绩流水弹窗 (复用封装的大驼峰组件) -->
    <PlayerHistoryModal 
      :is-open="isHistoryModalOpen" 
      :player-stats="currentHistoryStats" 
      @close="isHistoryModalOpen = false" 
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import PlayerHistoryModal from '../components/PlayerHistoryModal.vue'
import { masterPlayersList, type MasterPlayerItem } from '../mock/master-database'
import { realMatchHistoryData, type PlayerHistoricalStats } from '../mock/match-history'

const players = ref<MasterPlayerItem[]>(masterPlayersList)
const searchKeyword = ref('')
const sortBy = ref<'score' | 'winRate' | 'top3' | 'matches'>('score')

const isHistoryModalOpen = ref(false)
const currentHistoryStats = ref<PlayerHistoricalStats | null>(null)

const totalMatchesRecorded = computed(() => {
  return players.value.reduce((acc, p) => acc + p.totalRecordedMatches, 0)
})

const sortedPlayers = computed(() => {
  let list = players.value.filter(p => {
    if (!searchKeyword.value) return true
    const kw = searchKeyword.value.toLowerCase()
    return (
      p.nickname.toLowerCase().includes(kw) ||
      p.primaryLineup.toLowerCase().includes(kw) ||
      (p.titleBadge && p.titleBadge.toLowerCase().includes(kw))
    )
  })

  return list.sort((a, b) => {
    if (sortBy.value === 'score') return b.rankScore - a.rankScore
    if (sortBy.value === 'winRate') return b.firstPlaceRate - a.firstPlaceRate
    if (sortBy.value === 'top3') return b.top3Rate - a.top3Rate
    return b.totalRecordedMatches - a.totalRecordedMatches
  })
})

function openPlayerDetail(nickname: string) {
  const stats = realMatchHistoryData[nickname]
  if (stats) {
    currentHistoryStats.value = stats
    isHistoryModalOpen.value = true
  }
}
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.player-roster-view {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.roster-header-card {
  background: $bg-card;
  border: 1px solid $border-gold;
  border-radius: $radius-lg;
  padding: 24px;
  box-shadow: $shadow-md;
  display: flex;
  flex-direction: column;
  gap: 20px;

  .header-top-row {
    @include flex-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 16px;

    .title-block {
      display: flex;
      flex-direction: column;
      gap: 6px;

      .header-badge {
        font-size: 11px;
        font-weight: 700;
        color: $color-gold;
        background: rgba(245, 158, 11, 0.15);
        padding: 2px 8px;
        border-radius: 4px;
        align-self: flex-start;
        border: 1px solid rgba(245, 158, 11, 0.3);
      }

      .view-title {
        font-size: 22px;
        font-weight: 800;
        color: $text-primary;
        margin: 0;
      }

      .view-sub {
        font-size: 13px;
        color: $text-secondary;
      }
    }

    .data-status-box {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: $radius-full;
      font-size: 12px;
      color: $color-success;

      .live-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: $color-success;
        box-shadow: 0 0 8px $color-success;
      }
    }
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;

    @media (max-width: 900px) {
      grid-template-columns: repeat(2, 1fr);
    }

    .metric-card {
      background: rgba(0, 0, 0, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: $radius-md;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;

      &.highlight-gold {
        border-color: rgba(245, 158, 11, 0.35);
        .metric-num { color: $color-gold-light; }
      }

      &.highlight-cyan {
        border-color: rgba(6, 182, 212, 0.35);
        .metric-num { color: $color-cyan-light; }
      }

      &.highlight-green {
        border-color: rgba(16, 185, 129, 0.35);
        .metric-num { color: $color-success; }
      }

      .metric-num {
        font-size: 24px;
        font-weight: 800;
        color: $text-primary;
      }

      .metric-label {
        font-size: 12px;
        color: $text-secondary;
        font-weight: 600;
      }

      .metric-hint {
        font-size: 11px;
        color: $text-muted;
      }
    }
  }
}

.filter-bar {
  @include flex-between;
  flex-wrap: wrap;
  gap: 14px;

  .sort-tabs {
    display: flex;
    align-items: center;
    gap: 8px;

    .sort-label {
      font-size: 13px;
      color: $text-muted;
    }

    .sort-btn {
      font-size: 12px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: $radius-sm;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: $text-secondary;
      cursor: pointer;
      transition: $transition-base;

      &:hover {
        color: $color-gold-light;
        background: rgba(245, 158, 11, 0.1);
      }

      &.active {
        background: rgba(245, 158, 11, 0.2);
        border-color: $color-gold;
        color: $color-gold-light;
      }
    }
  }

  .search-wrap {
    .search-input {
      width: 260px;
      padding: 8px 14px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: $radius-md;
      color: $text-primary;
      font-size: 13px;
      outline: none;
      transition: $transition-base;

      &:focus {
        border-color: $color-gold;
        box-shadow: 0 0 10px rgba(245, 158, 11, 0.2);
      }

      &::placeholder {
        color: $text-muted;
      }
    }
  }
}

.table-container {
  background: $bg-card;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  overflow-x: auto;
}

.roster-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th {
    padding: 14px 16px;
    background: rgba(0, 0, 0, 0.4);
    color: $text-secondary;
    font-weight: 600;
    text-align: left;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    white-space: nowrap;
  }

  td {
    padding: 14px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .player-tr {
    cursor: pointer;
    transition: $transition-base;

    &:hover {
      background: rgba(245, 158, 11, 0.04);
    }
  }

  .td-rank {
    width: 60px;

    .rank-badge {
      font-size: 12px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      color: $text-secondary;

      &.top-1 {
        background: linear-gradient(135deg, $color-gold, #c89b3c);
        color: #000;
      }
      &.top-2 {
        background: #94a3b8;
        color: #0f172a;
      }
      &.top-3 {
        background: #b45309;
        color: #fef3c7;
      }
    }
  }

  .td-player {
    .player-info-cell {
      display: flex;
      align-items: center;
      gap: 10px;

      .avatar-tag {
        width: 34px;
        height: 34px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: $color-gold-light;
        @include flex-center;
        font-weight: 800;
        font-size: 14px;
      }

      .name-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;

        .name-line {
          display: flex;
          align-items: center;
          gap: 6px;

          .p-name {
            font-size: 14px;
            font-weight: 700;
            color: $text-primary;
          }

          .title-tag {
            font-size: 10px;
            padding: 1px 5px;
            border-radius: 3px;
            background: rgba(245, 158, 11, 0.12);
            color: $color-gold-light;
            border: 1px solid rgba(245, 158, 11, 0.25);
          }
        }

        .p-platform {
          font-size: 11px;
          color: $text-muted;
        }
      }
    }
  }

  .td-score {
    .score-text {
      font-size: 14px;
      font-weight: 700;
      color: $color-gold-light;
    }
  }

  .td-winrate, .td-top3 {
    width: 140px;

    .rate-cell {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .rate-val {
        font-size: 13px;
        font-weight: 700;
      }

      .rate-bar-track {
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.06);
        border-radius: $radius-full;
        overflow: hidden;

        .rate-bar-fill {
          height: 100%;

          &.gold-fill {
            background: linear-gradient(90deg, $color-gold-dark, $color-gold-light);
          }
          &.cyan-fill {
            background: linear-gradient(90deg, #0284c7, $color-cyan-light);
          }
        }
      }
    }
  }

  .td-avg {
    .avg-text {
      font-size: 13px;
      font-weight: 700;
      color: $text-primary;
    }
  }

  .td-lineup {
    .lineup-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;

      .lineup-name {
        font-size: 12px;
        font-weight: 600;
        color: $text-primary;
      }

      .hero-tag {
        font-size: 11px;
        color: $text-muted;
      }
    }
  }

  .td-style {
    .style-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 4px;

      &.OPERATIONAL {
        background: rgba(245, 158, 11, 0.15);
        color: $color-gold-light;
      }
      &.AGGRO_REROLL {
        background: rgba(239, 68, 68, 0.15);
        color: #ff7875;
      }
      &.LATE_HYPERCARRY {
        background: rgba(139, 92, 246, 0.15);
        color: #c4b5fd;
      }
      &.BALANCED {
        background: rgba(6, 182, 212, 0.15);
        color: $color-cyan-light;
      }
    }
  }

  .td-action {
    .action-view-btn {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: $text-secondary;
      cursor: pointer;
      transition: $transition-base;

      &:hover {
        background: rgba(245, 158, 11, 0.2);
        border-color: $color-gold;
        color: $color-gold-light;
      }
    }
  }
}

.text-gold { color: $color-gold-light; }
.text-cyan { color: $color-cyan-light; }
</style>
