<template>
  <div class="event-card" :class="{ 'is-active-match': event.status === 'PREDICTABLE' || event.status === 'BET_CLOSED' }">
    <div class="card-top-bar">
      <div class="time-meta">
        <span class="match-time">{{ formatTime(event.scheduledAt) }}</span>
        <span class="mode-badge">钻石狂潮</span>
        <span class="version-tag">{{ event.gameVersion }}</span>
      </div>
      <div class="status-wrap">
        <StatusTag :status="event.status" />
      </div>
    </div>

    <!-- 6人选手缩略卡片网格 -->
    <div class="participants-grid">
      <div 
        v-for="p in event.participants" 
        :key="p.slot" 
        class="mini-player-pill"
        :class="{ 'is-winner': p.finalRank === 1 }"
      >
        <div class="slot-num">#{{ p.slot }}</div>
        <div class="player-info">
          <div class="player-name">{{ p.nickname }}</div>
          <div class="player-rank">{{ p.rankText }}</div>
        </div>
        <div v-if="p.finalRank" class="rank-result">
          第{{ p.finalRank }}
        </div>
        <div v-else-if="event.forecast?.probabilities[p.slot]" class="prob-tag">
          {{ Math.round((event.forecast?.probabilities[p.slot] || 0) * 100) }}%
        </div>
      </div>
    </div>

    <!-- 底部状态说明与快速进入详情 -->
    <div class="card-footer">
      <div class="footer-meta">
        <span v-if="event.forecast" class="model-info">
          模型: {{ event.forecast.modelVersion }} (覆盖率: {{ Math.round(event.forecast.coverageRate * 100) }}%)
        </span>
        <span v-else class="model-info">
          赛前名单采集中，暂未生成预测
        </span>
      </div>

      <router-link :to="`/events/${event.id}`" class="action-btn">
        <span>对决详情</span>
        <span class="arrow-icon">→</span>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EventItem } from '../types/event'
import StatusTag from './StatusTag.vue'

defineProps<{
  event: EventItem
}>()

function formatTime(scheduledAt: string): string {
  if (!scheduledAt) return ''
  const parts = scheduledAt.split(' ')
  return parts.length > 1 ? parts[1].substring(0, 5) : scheduledAt
}
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.event-card {
  @include glass-panel;
  padding: 20px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;

  &.is-active-match {
    border-color: rgba(245, 158, 11, 0.4);
    box-shadow: 0 4px 20px rgba(245, 158, 11, 0.12);
  }
}

.card-top-bar {
  @include flex-between;
}

.time-meta {
  display: flex;
  align-items: center;
  gap: 10px;

  .match-time {
    font-size: 20px;
    font-weight: 800;
    color: $text-primary;
    letter-spacing: 0.5px;
  }

  .mode-badge {
    padding: 2px 8px;
    background: rgba(6, 182, 212, 0.15);
    border: 1px solid rgba(6, 182, 212, 0.3);
    border-radius: $radius-sm;
    font-size: 11px;
    font-weight: 600;
    color: $color-cyan-light;
  }

  .version-tag {
    font-size: 11px;
    color: $text-muted;
  }
}

.participants-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

.mini-player-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: $radius-md;
  transition: $transition-base;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  &.is-winner {
    background: rgba(245, 158, 11, 0.15);
    border-color: rgba(245, 158, 11, 0.4);
  }

  .slot-num {
    font-size: 11px;
    font-weight: 700;
    color: $text-muted;
  }

  .player-info {
    flex: 1;
    min-width: 0;

    .player-name {
      font-size: 13px;
      font-weight: 600;
      color: $text-primary;
      @include text-ellipsis;
    }

    .player-rank {
      font-size: 10px;
      color: $text-muted;
      @include text-ellipsis;
    }
  }

  .prob-tag {
    font-size: 12px;
    font-weight: 700;
    color: $color-gold;
  }

  .rank-result {
    font-size: 11px;
    font-weight: 700;
    color: $color-gold-light;
  }
}

.card-footer {
  @include flex-between;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);

  .footer-meta {
    font-size: 12px;
    color: $text-muted;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: $radius-md;
    font-size: 12px;
    font-weight: 600;
    color: $color-gold-light;
    transition: $transition-base;

    &:hover {
      background: rgba(245, 158, 11, 0.25);
      border-color: $color-gold;
      transform: translateX(2px);
    }

    .arrow-icon {
      font-size: 14px;
      transition: transform 0.2s ease;
    }
  }
}
</style>
