<template>
  <div class="matchup-analysis-container">
    <div class="analysis-header">
      <div class="title-wrap">
        <span class="header-icon">⚔️</span>
        <h4 class="analysis-title">自走棋沙盘推演与卡池内卷分析 (Matchup & Pool Matrix)</h4>
      </div>
      <span class="header-tag">基于万象棋公共卡池与流派克制深度推演</span>
    </div>

    <!-- 全局宏观局势洞察 -->
    <div v-if="insights && insights.length" class="macro-insights-box">
      <div v-for="(insight, idx) in insights" :key="idx" class="insight-item">
        <span class="insight-bullet">●</span>
        <span class="insight-text">{{ insight }}</span>
      </div>
    </div>

    <!-- 6 席卡池竞争与流派画像卡片网格 -->
    <div class="contest-grid">
      <div 
        v-for="item in analyses" 
        :key="item.slot" 
        class="contest-card"
        :class="{
          'is-exclusive': item.contestStatus === 'EXCLUSIVE',
          'is-contested': item.contestStatus === 'SEVERE_CONTEST',
          'is-slight': item.contestStatus === 'SLIGHT_OVERLAP'
        }"
      >
        <div class="card-head">
          <div class="slot-name-col">
            <span class="slot-badge">#{{ item.slot }}</span>
            <span class="player-name">{{ item.nickname }}</span>
          </div>
          <span 
            class="status-pill"
            :class="{
              'pill-green': item.contestStatus === 'EXCLUSIVE',
              'pill-red': item.contestStatus === 'SEVERE_CONTEST',
              'pill-yellow': item.contestStatus === 'SLIGHT_OVERLAP'
            }"
          >
            {{ statusText(item.contestStatus) }}
          </span>
        </div>

        <div class="lineup-info-row">
          <span class="info-label">拟选体系:</span>
          <span class="info-val text-gold">{{ item.chosenLineup }}</span>
        </div>

        <div class="stat-pills-row">
          <div class="mini-pill">
            <span class="pill-label">历史登顶率:</span>
            <span class="pill-val text-gold">{{ Math.round(item.historicalWinRate * 100) }}%</span>
          </div>
          <div class="mini-pill">
            <span class="pill-label">前三保率:</span>
            <span class="pill-val text-cyan">{{ Math.round(item.historicalTop3Rate * 100) }}%</span>
          </div>
          <div class="mini-pill">
            <span class="pill-label">克制系数:</span>
            <span class="pill-val" :class="item.counterAdvantageScore >= 1.0 ? 'text-success' : 'text-danger'">
              {{ item.counterAdvantageScore.toFixed(2) }}x
            </span>
          </div>
        </div>

        <div class="analysis-desc-box">
          <p class="desc-text">{{ item.analysisSummary }}</p>
          <p class="powerspike-text">{{ item.powerspikeDesc }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlayerContestAnalysis } from '../utils/matchup-engine'

defineProps<{
  analyses: PlayerContestAnalysis[]
  insights?: string[]
}>()

function statusText(status: string) {
  if (status === 'EXCLUSIVE') return '🌟 独家卡池红利'
  if (status === 'SEVERE_CONTEST') return '⚠️ 核心撞车内卷'
  return '⚖️ 轻微重叠'
}
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;

.matchup-analysis-container {
  margin-top: 16px;
  background: $bg-card;
  border: 1px solid rgba($color-gold, 0.25);
  border-radius: $radius-md;
  padding: 18px 20px;
}

.analysis-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);

  .title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;

    .header-icon {
      font-size: 1.15rem;
    }

    .analysis-title {
      font-size: 1rem;
      font-weight: 700;
      color: $text-primary;
      margin: 0;
    }
  }

  .header-tag {
    font-size: 0.8rem;
    color: $color-gold;
    background: rgba($color-gold, 0.12);
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid rgba($color-gold, 0.25);
  }
}

.macro-insights-box {
  background: rgba(0, 0, 0, 0.35);
  border: 1px dashed rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  .insight-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 0.82rem;
    line-height: 1.45;

    .insight-bullet {
      color: $color-cyan-light;
      font-size: 0.6rem;
      margin-top: 3px;
    }

    .insight-text {
      color: $text-secondary;
    }
  }
}

.contest-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}

.contest-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.2s ease;

  &.is-exclusive {
    border-color: rgba($color-success, 0.4);
    background: rgba($color-success, 0.03);
  }

  &.is-contested {
    border-color: rgba($color-danger, 0.4);
    background: rgba($color-danger, 0.03);
  }

  &.is-slight {
    border-color: rgba($color-gold, 0.3);
  }

  .card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .slot-name-col {
      display: flex;
      align-items: center;
      gap: 6px;

      .slot-badge {
        font-size: 0.75rem;
        background: rgba(255, 255, 255, 0.1);
        padding: 2px 6px;
        border-radius: 3px;
        color: $text-secondary;
      }

      .player-name {
        font-size: 0.95rem;
        font-weight: 700;
        color: $text-primary;
      }
    }

    .status-pill {
      font-size: 0.72rem;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 600;

      &.pill-green {
        background: rgba($color-success, 0.2);
        color: $color-success;
        border: 1px solid rgba($color-success, 0.4);
      }

      &.pill-red {
        background: rgba($color-danger, 0.2);
        color: #ff7875;
        border: 1px solid rgba($color-danger, 0.4);
      }

      &.pill-yellow {
        background: rgba($color-gold, 0.2);
        color: $color-gold;
        border: 1px solid rgba($color-gold, 0.4);
      }
    }
  }

  .lineup-info-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.82rem;

    .info-label {
      color: $text-muted;
    }

    .info-val {
      font-weight: 600;
    }
  }

  .stat-pills-row {
    display: flex;
    gap: 8px;
    background: rgba(0, 0, 0, 0.25);
    padding: 6px 8px;
    border-radius: 4px;

    .mini-pill {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .pill-label {
        font-size: 0.7rem;
        color: $text-muted;
      }

      .pill-val {
        font-size: 0.85rem;
        font-weight: 700;
      }
    }
  }

  .analysis-desc-box {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .desc-text {
      font-size: 0.78rem;
      line-height: 1.4;
      color: $text-secondary;
      margin: 0;
    }

    .powerspike-text {
      font-size: 0.72rem;
      color: $text-muted;
      margin: 0;
    }
  }
}

.text-gold {
  color: $color-gold;
}

.text-cyan {
  color: $color-cyan-light;
}

.text-success {
  color: $color-success;
}

.text-danger {
  color: #ff7875;
}
</style>
