<template>
  <div v-if="isOpen && playerStats" class="history-modal-overlay" @click.self="emitClose">
    <div class="history-modal-dialog">
      <!-- 弹窗头部 -->
      <div class="modal-header">
        <div class="player-title-wrap">
          <span class="user-avatar-tag">{{ playerStats.nickname.substring(0, 1) }}</span>
          <div class="player-meta-texts">
            <div class="name-row">
              <h3 class="player-name">{{ playerStats.nickname }}</h3>
              <span class="playstyle-pill">{{ playerStats.playstyleType }}</span>
              <span class="score-pill">{{ playerStats.rankScore }}分</span>
            </div>
            <span class="sub-text">收录最近 {{ playerStats.sampleMatches }} 场高分王牌对决真实历史对局流水</span>
          </div>
        </div>
        <button class="close-btn" @click="emitClose">×</button>
      </div>

      <!-- 核心指标摘要横幅 -->
      <div class="metrics-banner">
        <div class="metric-col highlight-gold">
          <span class="metric-num">{{ Math.round(playerStats.firstPlaceRate * 100) }}%</span>
          <span class="metric-label">真实吃鸡率 (第1名)</span>
          <span class="metric-sub">{{ playerStats.firstPlaceCount }} 场登顶</span>
        </div>
        <div class="metric-col highlight-cyan">
          <span class="metric-num">{{ Math.round(playerStats.top3Rate * 100) }}%</span>
          <span class="metric-label">吃烂分率 (前三名)</span>
          <span class="metric-sub">{{ playerStats.top3Count }} 场进前三</span>
        </div>
        <div class="metric-col highlight-danger">
          <span class="metric-num">{{ Math.round((playerStats.eliminatedEarlyCount / playerStats.sampleMatches) * 100) }}%</span>
          <span class="metric-label">暴毙早夭率 (5~6名)</span>
          <span class="metric-sub">{{ playerStats.eliminatedEarlyCount }} 场后半程</span>
        </div>
        <div class="metric-col">
          <span class="metric-num">{{ playerStats.avgPlacement.toFixed(1) }}</span>
          <span class="metric-label">真实平均名次</span>
          <span class="metric-sub">中位数稳定位</span>
        </div>
      </div>

      <!-- 常用流派熟练度与吃鸡率 -->
      <div class="lineup-section">
        <h4 class="section-subtitle">常用流派熟练度与登顶/前三分布</h4>
        <div class="lineup-cards-grid">
          <div v-for="l in playerStats.lineupProficiencies" :key="l.lineupName" class="lineup-stat-card">
            <div class="card-top-row">
              <span class="lineup-title">{{ l.lineupName }}</span>
              <span class="games-tag">{{ l.gamesPlayed }} 场</span>
            </div>
            <div class="rates-row">
              <div class="rate-item">
                <span class="rate-lbl">吃鸡率:</span>
                <span class="rate-val text-gold">{{ Math.round(l.winRate * 100) }}%</span>
              </div>
              <div class="rate-item">
                <span class="rate-lbl">前三率:</span>
                <span class="rate-val text-cyan">{{ Math.round(l.top3Rate * 100) }}%</span>
              </div>
              <div class="rate-item">
                <span class="rate-lbl">平均存活:</span>
                <span class="rate-val">{{ l.avgRounds }} 回合</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 近期真实比赛流水流水卡 -->
      <div class="matches-section">
        <h4 class="section-subtitle">近期核验证明对局流水流水 (逐场复盘)</h4>
        <div class="matches-list">
          <div 
            v-for="m in playerStats.recentMatches" 
            :key="m.matchId" 
            class="match-log-card"
            :class="{ 'is-first': m.finalRank === 1, 'is-bottom': m.finalRank >= 5 }"
          >
            <div class="log-left-col">
              <div class="rank-badge" :class="'rank-' + m.finalRank">
                第 {{ m.finalRank }} 名
              </div>
              <span class="match-time">{{ m.timestamp }}</span>
            </div>

            <div class="log-center-col">
              <div class="comp-title-line">
                <span class="comp-name">{{ m.mainComp }}</span>
                <span class="commander-tag">棋手: {{ m.commander }}</span>
                <span 
                  class="contest-pill"
                  :class="{
                    'pill-low': m.contestedLevel === 'LOW',
                    'pill-high': m.contestedLevel === 'HIGH',
                    'pill-med': m.contestedLevel === 'MEDIUM'
                  }"
                >
                  {{ m.contestedLevel === 'LOW' ? '独家无同行' : m.contestedLevel === 'HIGH' ? '撞车卡牌内卷' : '轻度重叠' }}
                </span>
              </div>

              <!-- 羁绊标签 -->
              <div class="synergies-wrap">
                <span v-for="syn in m.compSynergies" :key="syn" class="synergy-tag">{{ syn }}</span>
              </div>

              <!-- 核心英雄 -->
              <div class="heroes-wrap">
                <span class="heroes-label">核心卡牌:</span>
                <span v-for="h in m.coreHeroes" :key="h" class="hero-tag">{{ h }}</span>
              </div>
            </div>

            <div class="log-right-col">
              <div class="stat-box">
                <span class="lbl">存活回合</span>
                <span class="val">{{ m.roundsSurvived }} 轮</span>
              </div>
              <div class="stat-box">
                <span class="lbl">评分</span>
                <span class="val text-gold">{{ m.combatScore }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlayerHistoricalStats } from '../mock/match-history'

defineProps<{
  isOpen: boolean
  playerStats: PlayerHistoricalStats | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

function emitClose() {
  emit('close')
}
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;

.history-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  z-index: 1050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.history-modal-dialog {
  background: #141923;
  border: 1px solid rgba($color-gold, 0.35);
  border-radius: 10px;
  width: 100%;
  max-width: 820px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85);
}

.modal-header {
  padding: 16px 20px;
  background: rgba(0, 0, 0, 0.4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;

  .player-title-wrap {
    display: flex;
    align-items: center;
    gap: 12px;

    .user-avatar-tag {
      width: 42px;
      height: 42px;
      border-radius: 8px;
      background: linear-gradient(135deg, $color-gold, #c89b3c);
      color: #0b0e14;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      font-weight: 800;
    }

    .player-meta-texts {
      display: flex;
      flex-direction: column;
      gap: 3px;

      .name-row {
        display: flex;
        align-items: center;
        gap: 8px;

        .player-name {
          font-size: 1.15rem;
          font-weight: 700;
          color: $text-primary;
          margin: 0;
        }

        .playstyle-pill {
          font-size: 0.75rem;
          background: rgba($color-cyan-light, 0.15);
          color: $color-cyan-light;
          border: 1px solid rgba($color-cyan-light, 0.3);
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: 600;
        }

        .score-pill {
          font-size: 0.75rem;
          background: rgba($color-gold, 0.15);
          color: $color-gold;
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: 600;
        }
      }

      .sub-text {
        font-size: 0.78rem;
        color: $text-muted;
      }
    }
  }

  .close-btn {
    background: transparent;
    border: none;
    color: $text-secondary;
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 4px;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: $text-primary;
    }
  }
}

.metrics-banner {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding: 16px 20px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  .metric-col {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 3px;

    &.highlight-gold {
      border-color: rgba($color-gold, 0.4);
      .metric-num { color: $color-gold; }
    }

    &.highlight-cyan {
      border-color: rgba($color-cyan-light, 0.4);
      .metric-num { color: $color-cyan-light; }
    }

    &.highlight-danger {
      border-color: rgba($color-danger, 0.4);
      .metric-num { color: #ff7875; }
    }

    .metric-num {
      font-size: 1.35rem;
      font-weight: 800;
      color: $text-primary;
    }

    .metric-label {
      font-size: 0.78rem;
      color: $text-secondary;
      font-weight: 600;
    }

    .metric-sub {
      font-size: 0.7rem;
      color: $text-muted;
    }
  }
}

.lineup-section {
  padding: 14px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  .section-subtitle {
    font-size: 0.88rem;
    font-weight: 700;
    color: $text-secondary;
    margin: 0 0 10px 0;
  }

  .lineup-cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 10px;
  }

  .lineup-stat-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;

    .card-top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;

      .lineup-title {
        font-size: 0.85rem;
        font-weight: 700;
        color: $text-primary;
      }

      .games-tag {
        font-size: 0.72rem;
        color: $text-muted;
      }
    }

    .rates-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.75rem;

      .rate-item {
        display: flex;
        gap: 3px;

        .rate-lbl {
          color: $text-muted;
        }

        .rate-val {
          font-weight: 700;
        }
      }
    }
  }
}

.matches-section {
  padding: 14px 20px;
  overflow-y: auto;
  flex: 1;

  .section-subtitle {
    font-size: 0.88rem;
    font-weight: 700;
    color: $text-secondary;
    margin: 0 0 10px 0;
  }

  .matches-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .match-log-card {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 6px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 14px;

    &.is-first {
      border-color: rgba($color-gold, 0.5);
      background: rgba($color-gold, 0.04);
    }

    &.is-bottom {
      border-color: rgba($color-danger, 0.3);
      opacity: 0.85;
    }

    .log-left-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      min-width: 65px;

      .rank-badge {
        font-size: 0.75rem;
        font-weight: 800;
        padding: 3px 8px;
        border-radius: 4px;
        color: #fff;

        &.rank-1 {
          background: linear-gradient(135deg, $color-gold, #c89b3c);
          color: #000;
        }
        &.rank-2 {
          background: #718096;
        }
        &.rank-3 {
          background: #a0522d;
        }
        &.rank-4, &.rank-5, &.rank-6 {
          background: rgba(255, 255, 255, 0.1);
          color: $text-muted;
        }
      }

      .match-time {
        font-size: 0.68rem;
        color: $text-muted;
      }
    }

    .log-center-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 5px;

      .comp-title-line {
        display: flex;
        align-items: center;
        gap: 8px;

        .comp-name {
          font-size: 0.9rem;
          font-weight: 700;
          color: $text-primary;
        }

        .commander-tag {
          font-size: 0.72rem;
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 6px;
          border-radius: 3px;
          color: $text-secondary;
        }

        .contest-pill {
          font-size: 0.68rem;
          padding: 1px 6px;
          border-radius: 10px;

          &.pill-low {
            background: rgba($color-success, 0.2);
            color: $color-success;
          }
          &.pill-high {
            background: rgba($color-danger, 0.2);
            color: #ff7875;
          }
          &.pill-med {
            background: rgba($color-gold, 0.2);
            color: $color-gold;
          }
        }
      }

      .synergies-wrap, .heroes-wrap {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        align-items: center;

        .synergy-tag {
          font-size: 0.7rem;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 1px 6px;
          border-radius: 3px;
          color: $text-secondary;
        }

        .heroes-label {
          font-size: 0.7rem;
          color: $text-muted;
        }

        .hero-tag {
          font-size: 0.7rem;
          color: $color-gold;
          background: rgba($color-gold, 0.08);
          padding: 1px 6px;
          border-radius: 3px;
        }
      }
    }

    .log-right-col {
      display: flex;
      gap: 12px;
      text-align: right;

      .stat-box {
        display: flex;
        flex-direction: column;
        gap: 2px;

        .lbl {
          font-size: 0.68rem;
          color: $text-muted;
        }

        .val {
          font-size: 0.85rem;
          font-weight: 700;
        }
      }
    }
  }
}

.text-gold {
  color: $color-gold;
}

.text-cyan {
  color: $color-cyan-light;
}
</style>
