<template>
  <div class="matchup-analysis-container">
    <div class="analysis-header">
      <div class="title-wrap">
        <span class="header-icon">📊</span>
        <h4 class="analysis-title">六席选手历史战力与打法风格生态画像 (Performance & Archetype Matrix)</h4>
      </div>
      <span class="header-tag">严守赛前事实 · 基于真实战绩与打法偏好</span>
    </div>

    <!-- 赛前公理原则提示横幅 -->
    <div class="premise-notice-banner">
      <span class="notice-icon">📌</span>
      <div class="notice-content">
        <strong class="notice-highlight">赛前事实原则：</strong>
        自走棋开局前无法预知最终随机发牌与成型阵容，强行假定阵容属于无效空模拟！本推演严格依据认证选手的真实历史登顶率、前三率、平均名次与长期沉淀的擅长打法风格偏好进行科学加权。
      </div>
    </div>

    <!-- 全局宏观局势洞察 -->
    <div v-if="insights && insights.length" class="macro-insights-box">
      <div v-for="(insight, idx) in insights" :key="idx" class="insight-item">
        <span class="insight-bullet">●</span>
        <span class="insight-text">{{ insight }}</span>
      </div>
    </div>

    <!-- 6 席位历史战绩与擅长打法画像卡片网格 -->
    <div class="contest-grid">
      <div 
        v-for="item in analyses" 
        :key="item.slot" 
        class="contest-card"
        :class="{
          'is-favored': item.archetypeAdvantageScore >= 1.05,
          'is-disfavored': item.archetypeAdvantageScore < 0.95,
          'is-balanced': item.archetypeAdvantageScore >= 0.95 && item.archetypeAdvantageScore < 1.05
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
              'pill-green': item.archetypeAdvantageScore >= 1.05,
              'pill-red': item.archetypeAdvantageScore < 0.95,
              'pill-yellow': item.archetypeAdvantageScore >= 0.95 && item.archetypeAdvantageScore < 1.05
            }"
          >
            {{ getStyleEnvironmentTag(item.archetypeAdvantageScore) }}
          </span>
        </div>

        <!-- 选手长期擅长打法偏好 (非局内假定阵容) -->
        <div class="lineup-info-row">
          <span class="info-label">擅长打法偏好:</span>
          <span class="info-val text-gold">{{ item.preferredStyle }}</span>
        </div>

        <!-- 真实历史战绩三项硬核指标 -->
        <div class="stat-pills-row">
          <div class="mini-pill">
            <span class="pill-label">历史登顶率:</span>
            <span class="pill-val text-gold">{{ Math.round(item.historicalWinRate * 100) }}%</span>
          </div>
          <div class="mini-pill">
            <span class="pill-label">前三保分率:</span>
            <span class="pill-val text-cyan">{{ Math.round(item.historicalTop3Rate * 100) }}%</span>
          </div>
          <div class="mini-pill">
            <span class="pill-label">历史均名:</span>
            <span class="pill-val font-mono">{{ item.historicalAvgPlacement.toFixed(2) }} 名</span>
          </div>
          <div class="mini-pill">
            <span class="pill-label">生态契合度:</span>
            <span class="pill-val" :class="item.archetypeAdvantageScore >= 1.0 ? 'text-success' : 'text-danger'">
              {{ item.archetypeAdvantageScore.toFixed(2) }}x
            </span>
          </div>
        </div>

        <!-- 战绩硬核评估与风格生态诊断 -->
        <div class="analysis-desc-box">
          <p class="desc-text font-mono text-cyan">{{ item.historicalDataAssessment }}</p>
          <p class="powerspike-text">{{ item.playstyleEvaluation }}</p>
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

function getStyleEnvironmentTag(score: number): string {
  if (score >= 1.08) return '🌟 风格生态优势'
  if (score >= 1.02) return '✨ 风格契合良好'
  if (score < 0.95) return '⚠️ 风格受制环境'
  return '⚖️ 生态势均力敌'
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
  margin-bottom: 12px;
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

.premise-notice-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba($color-gold, 0.08);
  border: 1px solid rgba($color-gold, 0.25);
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 14px;

  .notice-icon {
    font-size: 1.1rem;
    line-height: 1.2;
  }

  .notice-content {
    font-size: 0.82rem;
    color: $text-secondary;
    line-height: 1.5;

    .notice-highlight {
      color: $color-gold;
    }
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

  &.is-favored {
    border-color: rgba($color-success, 0.4);
    background: rgba($color-success, 0.03);
  }

  &.is-disfavored {
    border-color: rgba($color-danger, 0.4);
    background: rgba($color-danger, 0.03);
  }

  &.is-balanced {
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
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
    background: rgba(0, 0, 0, 0.25);
    padding: 8px;
    border-radius: 4px;

    .mini-pill {
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
      margin: 0;
    }

    .powerspike-text {
      font-size: 0.74rem;
      color: $text-secondary;
      margin: 0;
      line-height: 1.4;
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

.font-mono {
  font-family: $font-mono;
}
</style>

