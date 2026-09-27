<template>
  <div class="match-archive-view">
    <!-- 顶部数据源与巡检控制横幅 -->
    <div class="archive-header-card">
      <div class="header-top-row">
        <div class="title-block">
          <span class="header-badge">自动对局归档引擎 (Auto Ingestion Engine)</span>
          <h2 class="view-title">全服王牌对决 · 历史对战大盘档案库</h2>
          <span class="view-sub">全天候持续归档全服顶尖王者实盘对战流水，支撑赛前流派相克与 EV 真实回测</span>
        </div>

        <div class="ingestion-action-box">
          <div class="daemon-status">
            <span class="pulse-beacon"></span>
            <span class="daemon-text">后台模拟器监听服务: 守护中 (端口 8080)</span>
          </div>

          <button class="sync-now-btn" :disabled="isSyncing" @click="triggerIngestionSync">
            <span class="btn-icon">⚡</span>
            <span>{{ isSyncing ? '正在同步天梯新局...' : '触发增量巡检入库' }}</span>
          </button>
        </div>
      </div>

      <!-- 归档大盘关键指标 -->
      <div class="archive-metrics-grid">
        <div class="metric-card">
          <span class="metric-num">{{ matches.length }} 场</span>
          <span class="metric-label">已沉淀实盘对战</span>
          <span class="metric-sub">覆盖冠军支持全流程</span>
        </div>
        <div class="metric-card highlight-gold">
          <span class="metric-num">{{ totalParticipantsCount }} 席</span>
          <span class="metric-label">参赛样本人次</span>
          <span class="metric-sub">段位 9400★ ~ 18824★</span>
        </div>
        <div class="metric-card highlight-cyan">
          <span class="metric-num">75.0%</span>
          <span class="metric-label">正期望席位命中率</span>
          <span class="metric-sub">推荐第一名与实际夺冠契合度</span>
        </div>
        <div class="metric-card highlight-green">
          <span class="metric-num">+84.2 钻</span>
          <span class="metric-label">平均正期望净值 (EV)</span>
          <span class="metric-sub">挖掘大众跟风低估机会</span>
        </div>
      </div>
    </div>

    <!-- 历史对局场次流列表 -->
    <div class="matches-list-section">
      <div class="section-head-bar">
        <h3 class="section-title">全量对局流水归档 (按时序排列)</h3>
        <span class="section-tip">包含 6 席位名次排位、盘面赔率与 EV 精算复盘</span>
      </div>

      <div class="match-cards-container">
        <div 
          v-for="m in matches" 
          :key="m.matchId" 
          class="match-archive-card"
        >
          <!-- 场次顶栏 -->
          <div class="card-header">
            <div class="match-meta-info">
              <span class="match-time">{{ m.matchDate }}</span>
              <h4 class="match-title">{{ m.matchTitle }}</h4>
              <span class="version-tag">{{ m.gameVersion }}</span>
            </div>

            <div class="winner-trophy-box">
              <span class="trophy-icon">🏆</span>
              <div class="winner-info">
                <span class="winner-label">最终夺冠登顶</span>
                <span class="winner-name text-gold">{{ m.winnerNickname }} ({{ m.winningLineup }})</span>
              </div>
            </div>
          </div>

          <!-- 6 人实盘对决详情网格 -->
          <div class="participants-table-wrap">
            <table class="card-table">
              <thead>
                <tr>
                  <th>席位</th>
                  <th>选手昵称</th>
                  <th>段位分</th>
                  <th>使用体系</th>
                  <th>返奖赔率</th>
                  <th>赛前推演 EV</th>
                  <th>最终名次</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="p in m.participants" 
                  :key="p.slot" 
                  class="row-tr"
                  :class="{ 'is-winner': p.finalRank === 1, 'is-best-ev': p.isBestEV }"
                >
                  <td class="cell-slot">#{{ p.slot }}</td>
                  <td class="cell-name">
                    <span class="name-text">{{ p.nickname }}</span>
                    <span v-if="p.isBestEV" class="best-ev-pill">★ 最优EV</span>
                  </td>
                  <td class="cell-score">{{ p.rankScore }}★</td>
                  <td class="cell-lineup">{{ p.lineup }}</td>
                  <td class="cell-odds text-cyan">{{ p.odds }}x</td>
                  <td class="cell-ev">
                    <span :class="p.evNet >= 0 ? 'text-success' : 'text-danger'">
                      {{ p.evNet >= 0 ? '+' : '' }}{{ p.evNet }} 钻
                    </span>
                  </td>
                  <td class="cell-rank">
                    <span class="result-badge" :class="'rank-' + p.finalRank">
                      第 {{ p.finalRank }} 名
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { masterMatchesList, type MasterMatchItem } from '../mock/master-database'

const matches = ref<MasterMatchItem[]>(masterMatchesList)
const isSyncing = ref(false)

const totalParticipantsCount = computed(() => {
  return matches.value.reduce((acc, m) => acc + m.participants.length, 0)
})

async function triggerIngestionSync() {
  isSyncing.value = true
  try {
    // 模拟后台对局巡检引擎同步新历史场次
    await new Promise(resolve => setTimeout(resolve, 800))
    // 增量录入最新历史模拟场次
    const newMatch: MasterMatchItem = {
      matchId: `m-${Date.now()}`,
      matchDate: new Date().toLocaleString(),
      matchTitle: '巅峰狂潮 · 巡检增量归档实盘局',
      gameVersion: 'v1.12.3',
      spectatorCount: 65,
      winnerNickname: 'DY校长神Gin',
      winningLineup: '尧天男刺极速切入',
      participants: [
        { slot: 1, nickname: 'EZ夜余', rankScore: 18835, finalRank: 2, lineup: '九稷下长城射', odds: 1.7, evNet: -22.5, isBestEV: false },
        { slot: 2, nickname: 'DY校长神Gin', rankScore: 12105, finalRank: 1, lineup: '尧天男刺极速切入', odds: 7.2, evNet: 95.0, isBestEV: true },
        { slot: 3, nickname: '白白白白3', rankScore: 11770, finalRank: 3, lineup: '尧天射手大核', odds: 4.0, evNet: 18.2, isBestEV: false },
        { slot: 4, nickname: '抖音一茗', rankScore: 11180, finalRank: 4, lineup: '长城守卫射手阵', odds: 3.6, evNet: 2.5, isBestEV: false },
        { slot: 5, nickname: '抖音刺痛', rankScore: 9645, finalRank: 5, lineup: '尧天纯射极致输出', odds: 8.0, evNet: 12.0, isBestEV: false },
        { slot: 6, nickname: 'Asen', rankScore: 10135, finalRank: 6, lineup: '坦射玄雍坚韧壁垒', odds: 7.0, evNet: 15.0, isBestEV: false }
      ]
    }

    matches.value.unshift(newMatch)
  } finally {
    isSyncing.value = false
  }
}
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.match-archive-view {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.archive-header-card {
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

    .ingestion-action-box {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;

      .daemon-status {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        color: $color-success;
        background: rgba(16, 185, 129, 0.1);
        padding: 4px 10px;
        border-radius: $radius-full;
        border: 1px solid rgba(16, 185, 129, 0.3);

        .pulse-beacon {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: $color-success;
          box-shadow: 0 0 8px $color-success;
          animation: pulse 1.5s infinite;
        }
      }

      .sync-now-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        background: linear-gradient(135deg, $color-gold 0%, $color-gold-dark 100%);
        border: none;
        border-radius: $radius-md;
        color: #111827;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: $transition-base;

        &:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: $glow-gold;
        }

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
      }
    }
  }

  .archive-metrics-grid {
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

      .metric-sub {
        font-size: 11px;
        color: $text-muted;
      }
    }
  }
}

.matches-list-section {
  display: flex;
  flex-direction: column;
  gap: 14px;

  .section-head-bar {
    @include flex-between;
    align-items: center;

    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: $text-primary;
      margin: 0;
    }

    .section-tip {
      font-size: 12px;
      color: $text-muted;
    }
  }

  .match-cards-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .match-archive-card {
    background: $bg-card;
    border: 1px solid $border-color;
    border-radius: $radius-lg;
    overflow: hidden;
    transition: $transition-base;

    &:hover {
      border-color: rgba(245, 158, 11, 0.3);
    }

    .card-header {
      @include flex-between;
      padding: 14px 20px;
      background: rgba(0, 0, 0, 0.35);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);

      .match-meta-info {
        display: flex;
        align-items: center;
        gap: 12px;

        .match-time {
          font-size: 12px;
          color: $text-muted;
          font-family: monospace;
        }

        .match-title {
          font-size: 15px;
          font-weight: 700;
          color: $text-primary;
          margin: 0;
        }

        .version-tag {
          font-size: 10px;
          padding: 2px 6px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 4px;
          color: $text-secondary;
        }
      }

      .winner-trophy-box {
        display: flex;
        align-items: center;
        gap: 8px;

        .trophy-icon {
          font-size: 18px;
        }

        .winner-info {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 1px;

          .winner-label {
            font-size: 10px;
            color: $text-muted;
          }

          .winner-name {
            font-size: 13px;
            font-weight: 700;
          }
        }
      }
    }

    .participants-table-wrap {
      overflow-x: auto;
    }

    .card-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;

      th {
        padding: 10px 16px;
        background: rgba(0, 0, 0, 0.2);
        color: $text-muted;
        font-weight: 600;
        text-align: left;
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      }

      td {
        padding: 10px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      }

      .row-tr {
        &.is-winner {
          background: rgba(245, 158, 11, 0.03);
        }

        &.is-best-ev {
          border-left: 2px solid $color-success;
        }
      }

      .cell-slot {
        font-weight: 700;
        color: $text-muted;
      }

      .cell-name {
        display: flex;
        align-items: center;
        gap: 6px;

        .name-text {
          font-size: 13px;
          font-weight: 700;
          color: $text-primary;
        }

        .best-ev-pill {
          font-size: 10px;
          background: rgba(16, 185, 129, 0.15);
          color: $color-success;
          padding: 1px 6px;
          border-radius: 10px;
          font-weight: 600;
        }
      }

      .cell-score {
        color: $color-gold-light;
        font-weight: 600;
      }

      .cell-lineup {
        color: $text-secondary;
      }

      .cell-rank {
        .result-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;

          &.rank-1 {
            background: linear-gradient(135deg, $color-gold, #c89b3c);
            color: #000;
          }
          &.rank-2 {
            background: #94a3b8;
            color: #0f172a;
          }
          &.rank-3 {
            background: #b45309;
            color: #fef3c7;
          }
          &.rank-4, &.rank-5, &.rank-6 {
            color: $text-muted;
            background: rgba(255, 255, 255, 0.05);
          }
        }
      }
    }
  }
}

.text-gold { color: $color-gold-light; }
.text-cyan { color: $color-cyan-light; }
.text-success { color: $color-success; }
.text-danger { color: #ff7875; }

@keyframes pulse {
  0% { transform: scale(0.9); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.6; }
}
</style>
