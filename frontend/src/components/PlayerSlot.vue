<template>
  <div class="player-slot-card" :class="{ 'is-champion': participant.finalRank === 1 }">
    <div class="slot-header">
      <div class="slot-identity">
        <span class="slot-index">#{{ participant.slot }}</span>
        <router-link 
          v-if="participant.playerId" 
          :to="`/players/${participant.playerId}`" 
          class="player-nickname is-link"
          :title="'查看选手画像: ' + participant.nickname"
        >
          {{ participant.nickname }}
        </router-link>
        <span v-else class="player-nickname">
          {{ participant.nickname }}
        </span>
      </div>

      <div class="slot-badges">
        <RankBadge :rank-text="participant.rankText" :rank-score="participant.rankScore" />
        <div v-if="participant.finalRank" class="final-rank-tag" :class="rankClass(participant.finalRank)">
          第 {{ participant.finalRank }} 名
        </div>
      </div>
    </div>

    <!-- 赛前指标与画像简报 -->
    <div class="slot-body">
      <div class="meta-row">
        <div class="meta-item">
          <span class="meta-label">擅用棋手</span>
          <span class="meta-value highlight">{{ participant.commanderName || '未指定' }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">常用体系</span>
          <span class="meta-value">{{ participant.favoriteLineup || '多元阵容' }}</span>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-box">
          <span class="stat-num">{{ formatPercent(participant.winRateRecent) }}</span>
          <span class="stat-desc">近期登顶率</span>
        </div>
        <div class="stat-box">
          <span class="stat-num">{{ formatPercent(participant.top3RateRecent) }}</span>
          <span class="stat-desc">近期前三率</span>
        </div>
        <div class="stat-box">
          <span class="stat-num">{{ participant.sampleMatches || '-' }}</span>
          <span class="stat-desc">有效样本</span>
        </div>
      </div>

      <!-- 预测模型第一名概率 -->
      <div v-if="forecastProb !== undefined" class="forecast-section">
        <div class="forecast-header">
          <span class="forecast-label">赛前登顶概率</span>
          <span class="forecast-value">{{ formatPercent(forecastProb) }}</span>
        </div>
        <div class="prob-track">
          <div class="prob-fill" :style="{ width: `${forecastProb * 100}%` }"></div>
        </div>
      </div>

      <!-- 实时支持进度 -->
      <div v-if="supportRatio !== undefined" class="support-section">
        <SupportBar :ratio-percent="supportRatio" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Participant } from '../types/event'
import RankBadge from './RankBadge.vue'
import SupportBar from './SupportBar.vue'

defineProps<{
  participant: Participant
  forecastProb?: number
  supportRatio?: number
}>()

function formatPercent(val?: number): string {
  if (val === undefined || val === null) return '-'
  return `${Math.round(val * 100)}%`
}

function rankClass(rank: number): string {
  if (rank === 1) return 'rank-first'
  if (rank === 2) return 'rank-second'
  if (rank === 3) return 'rank-third'
  return 'rank-other'
}
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.player-slot-card {
  @include glass-panel;
  padding: 16px;
  position: relative;
  overflow: hidden;

  &.is-champion {
    border-color: rgba(245, 158, 11, 0.45);
    background: linear-gradient(180deg, rgba(245, 158, 11, 0.08) 0%, rgba(17, 24, 39, 0.8) 100%);
  }
}

.slot-header {
  @include flex-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.slot-identity {
  display: flex;
  align-items: center;
  gap: 8px;

  .slot-index {
    font-size: 11px;
    font-weight: 700;
    color: $text-muted;
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 6px;
    border-radius: $radius-sm;
  }

  .player-nickname {
    font-size: 15px;
    font-weight: 700;
    color: $text-primary;

    &.is-link {
      transition: $transition-base;
      &:hover {
        color: $color-gold;
        text-decoration: underline;
      }
    }
  }
}

.slot-badges {
  display: flex;
  align-items: center;
  gap: 6px;
}

.final-rank-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: $radius-sm;

  &.rank-first {
    background: linear-gradient(135deg, $color-gold 0%, $color-gold-dark 100%);
    color: #111827;
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
  }
  &.rank-second {
    background: #94a3b8;
    color: #0f172a;
  }
  &.rank-third {
    background: #b45309;
    color: #fef3c7;
  }
  &.rank-other {
    background: rgba(255, 255, 255, 0.1);
    color: $text-secondary;
  }
}

.slot-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.meta-row {
  @include flex-between;
  font-size: 12px;

  .meta-item {
    display: flex;
    gap: 6px;
  }

  .meta-label {
    color: $text-muted;
  }

  .meta-value {
    color: $text-secondary;

    &.highlight {
      color: $color-cyan-light;
      font-weight: 600;
    }
  }
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  background: rgba(0, 0, 0, 0.25);
  padding: 8px;
  border-radius: $radius-md;
}

.stat-box {
  @include flex-column;
  align-items: center;
  text-align: center;

  .stat-num {
    font-size: 14px;
    font-weight: 700;
    color: $text-primary;
  }

  .stat-desc {
    font-size: 10px;
    color: $text-muted;
  }
}

.forecast-section {
  .forecast-header {
    @include flex-between;
    font-size: 11px;
    margin-bottom: 4px;

    .forecast-label {
      color: $text-secondary;
    }

    .forecast-value {
      font-weight: 700;
      color: $color-gold-light;
    }
  }

  .prob-track {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: $radius-full;
    overflow: hidden;

    .prob-fill {
      height: 100%;
      background: linear-gradient(90deg, #8b5cf6 0%, #f59e0b 100%);
      border-radius: $radius-full;
      transition: width 0.5s ease-out;
    }
  }
}

.support-section {
  padding-top: 4px;
}
</style>
