<template>
  <div v-if="profile" class="player-profile-view">
    <!-- 选手基础信息头卡 -->
    <div class="profile-header-card">
      <div class="header-nav-row">
        <button class="back-btn" @click="$router.back()">
          <span>←</span>
          <span>返回</span>
        </button>
        <span class="source-tag">官方战绩与对局样本</span>
      </div>

      <div class="profile-main-meta">
        <div class="avatar-box">
          <span class="avatar-char">{{ profile.lastNickname.substring(0, 1) }}</span>
        </div>
        <div class="profile-names">
          <div class="title-row">
            <h2 class="player-nickname">{{ profile.lastNickname }}</h2>
            <RankBadge :rank-text="profile.rankText" :rank-score="profile.rankScore" />
          </div>
          <div class="sub-row">
            <span class="platform-text">所在大区: {{ profile.platform }}</span>
            <span class="id-text">ID: {{ profile.id }}</span>
          </div>
        </div>
      </div>

      <!-- 核心统计大卡 -->
      <div class="core-metrics-grid">
        <div class="metric-card">
          <span class="metric-num">{{ profile.totalMatches }}</span>
          <span class="metric-label">收录场次</span>
        </div>
        <div class="metric-card highlight-gold">
          <span class="metric-num">{{ Math.round(profile.winRate * 100) }}%</span>
          <span class="metric-label">综合登顶率 (第1名)</span>
        </div>
        <div class="metric-card highlight-cyan">
          <span class="metric-num">{{ Math.round(profile.top3Rate * 100) }}%</span>
          <span class="metric-label">前三率 (≤第3名)</span>
        </div>
      </div>
    </div>

    <!-- 近期名次走势与棋手/阵容偏好两列 -->
    <div class="profile-content-grid">
      <!-- 常用局内棋手偏好 -->
      <div class="content-panel">
        <div class="panel-header">
          <h3 class="panel-title">局内棋手熟练度与胜率</h3>
          <span class="panel-sub">统计样本内该玩家选用棋手频率</span>
        </div>

        <div class="items-list">
          <div v-for="c in profile.favoriteCommanders" :key="c.name" class="list-item-bar">
            <div class="item-title-row">
              <span class="item-name">{{ c.name }}</span>
              <div class="item-stats">
                <span>选用率 {{ Math.round(c.usageRate * 100) }}%</span>
                <span class="win-rate text-gold">登顶率 {{ Math.round(c.winRate * 100) }}%</span>
              </div>
            </div>
            <div class="bar-track">
              <div class="bar-fill" :style="{ width: `${c.usageRate * 100}%` }"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 擅长阵容体系 -->
      <div class="content-panel">
        <div class="panel-header">
          <h3 class="panel-title">常用阵容结构体系</h3>
          <span class="panel-sub">历史成型阵容分布与前三保证率</span>
        </div>

        <div class="items-list">
          <div v-for="lineup in profile.favoriteLineups" :key="lineup.name" class="list-item-bar">
            <div class="item-title-row">
              <span class="item-name">{{ lineup.name }}</span>
              <div class="item-stats">
                <span>出场 {{ Math.round(lineup.usageRate * 100) }}%</span>
                <span class="top3-rate text-cyan">前三率 {{ Math.round(lineup.top3Rate * 100) }}%</span>
              </div>
            </div>
            <div class="bar-track">
              <div class="bar-fill cyan-fill" :style="{ width: `${lineup.usageRate * 100}%` }"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 最近名次记录 -->
    <div class="recent-ranks-panel">
      <div class="panel-header">
        <h3 class="panel-title">近期已核验对局名次分布</h3>
      </div>
      <div class="ranks-track">
        <div 
          v-for="(rank, idx) in profile.recentRanks" 
          :key="idx" 
          class="rank-bubble"
          :class="'rank-' + rank"
        >
          <span class="rank-digit">#{{ rank }}</span>
          <span class="rank-seq">局 {{ profile.recentRanks.length - idx }}</span>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="empty-view">
    <p>暂无该选手的详细画像档案</p>
    <router-link to="/" class="back-link">返回首页</router-link>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useEventStore } from '../stores/event-store'
import RankBadge from '../components/RankBadge.vue'

const route = useRoute()
const eventStore = useEventStore()

const profile = computed(() => {
  const playerId = route.params.id as string
  return eventStore.getPlayerProfile(playerId)
})
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.player-profile-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.profile-header-card {
  @include glass-panel;
  padding: 24px;
}

.header-nav-row {
  @include flex-between;
  margin-bottom: 20px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: $text-secondary;
  font-size: 13px;
  transition: $transition-base;

  &:hover {
    color: $color-gold;
    transform: translateX(-2px);
  }
}

.source-tag {
  font-size: 11px;
  color: $text-muted;
  background: rgba(255, 255, 255, 0.05);
  padding: 4px 8px;
  border-radius: $radius-sm;
}

.profile-main-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.avatar-box {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: linear-gradient(135deg, $color-gold 0%, $color-purple 100%);
  @include flex-center;
  box-shadow: $glow-gold;

  .avatar-char {
    font-size: 28px;
    font-weight: 800;
    color: #111827;
  }
}

.profile-names {
  .title-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 4px;
  }

  .player-nickname {
    font-size: 22px;
    font-weight: 800;
    color: $text-primary;
  }

  .sub-row {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: $text-muted;
  }
}

.core-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.metric-card {
  @include flex-column;
  align-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: $radius-md;

  .metric-num {
    font-size: 24px;
    font-weight: 800;
    color: $text-primary;
    margin-bottom: 4px;
  }

  .metric-label {
    font-size: 12px;
    color: $text-muted;
  }

  &.highlight-gold .metric-num { color: $color-gold-light; }
  &.highlight-cyan .metric-num { color: $color-cyan-light; }
}

.profile-content-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.content-panel, .recent-ranks-panel {
  @include glass-panel;
  padding: 20px;

  .panel-header {
    margin-bottom: 16px;

    .panel-title {
      font-size: 16px;
      font-weight: 700;
      color: $text-primary;
    }

    .panel-sub {
      font-size: 11px;
      color: $text-muted;
    }
  }
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.list-item-bar {
  .item-title-row {
    @include flex-between;
    font-size: 13px;
    margin-bottom: 6px;

    .item-name {
      font-weight: 600;
      color: $text-primary;
    }

    .item-stats {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: $text-secondary;
    }
  }

  .bar-track {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: $radius-full;
    overflow: hidden;

    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);
      border-radius: $radius-full;

      &.cyan-fill {
        background: linear-gradient(90deg, #06b6d4 0%, #38bdf8 100%);
      }
    }
  }
}

.text-gold { color: $color-gold-light; }
.text-cyan { color: $color-cyan-light; }

.ranks-track {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
}

.rank-bubble {
  @include flex-column;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 56px;
  border-radius: $radius-md;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.08);

  .rank-digit {
    font-size: 16px;
    font-weight: 800;
  }

  .rank-seq {
    font-size: 10px;
    color: $text-muted;
  }

  &.rank-1 {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(180, 83, 9, 0.3) 100%);
    border-color: rgba(245, 158, 11, 0.5);
    .rank-digit { color: $color-gold-light; }
  }

  &.rank-2 {
    background: rgba(148, 163, 184, 0.15);
    .rank-digit { color: #cbd5e1; }
  }

  &.rank-3 {
    background: rgba(180, 83, 9, 0.2);
    .rank-digit { color: #fde68a; }
  }
}

.empty-view {
  text-align: center;
  padding: 80px 0;
  color: $text-secondary;
}
</style>
