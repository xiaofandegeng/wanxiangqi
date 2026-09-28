<template>
  <div v-if="isOpen && player" class="history-modal-overlay" @click.self="emitClose">
    <div class="history-modal-dialog">
      <!-- 弹窗头部 -->
      <div class="modal-header">
        <div class="player-title-wrap">
          <span class="user-avatar-tag">{{ player.nickname.substring(0, 1) }}</span>
          <div class="player-meta-texts">
            <div class="name-row">
              <h3 class="player-name">{{ player.nickname }}</h3>
              <span class="score-pill">{{ player.rankScore }}★ {{ player.rankText || '最强王者' }}</span>
              <span v-if="player.title" class="title-pill">{{ player.title }}</span>
            </div>
            <span class="sub-text">{{ player.platform || '官方区服' }} · {{ player.serverZone || '手Q1区' }} · 本命英雄: {{ player.commander || '通用' }}</span>
          </div>
        </div>
        <button class="close-btn" @click="emitClose">×</button>
      </div>

      <!-- 核心指标摘要横幅 (基于真实统计) -->
      <div class="metrics-banner">
        <div class="metric-col">
          <span class="metric-num">
            {{ player.stats?.winRate !== null && player.stats?.winRate !== undefined ? `${(player.stats.winRate * 100).toFixed(1)}%` : '--' }}
          </span>
          <span class="metric-label">登顶率 (第 1 名)</span>
          <span class="metric-sub">{{ player.stats?.firstPlaces || 0 }} 场登顶</span>
        </div>
        <div class="metric-col">
          <span class="metric-num">
            {{ player.stats?.top3Rate !== null && player.stats?.top3Rate !== undefined ? `${(player.stats.top3Rate * 100).toFixed(1)}%` : '--' }}
          </span>
          <span class="metric-label">前三率 (保分)</span>
          <span class="metric-sub">{{ player.stats?.top3Places || 0 }} 场进前三</span>
        </div>
        <div class="metric-col">
          <span class="metric-num">
            {{ player.stats?.avgRank !== null && player.stats?.avgRank !== undefined ? player.stats.avgRank.toFixed(2) : '--' }}
          </span>
          <span class="metric-label">平均名次</span>
          <span class="metric-sub">{{ player.stats?.sampleCount || 0 }} 场总核验样本</span>
        </div>
      </div>

      <!-- 逐局战绩流水列表 (真实 API 结果) -->
      <div class="match-logs-section">
        <div class="logs-header-row">
          <h4 class="section-subtitle">逐局实战流水事实记录 (按时间倒序)</h4>
          <span class="logs-count">共 {{ matchLogs.length }} 场有效战绩</span>
        </div>

        <div v-if="isLoading" class="loading-state">
          正在加载选手实战流水...
        </div>

        <div v-else-if="matchLogs.length === 0" class="empty-logs">
          <p>暂无该选手的已核验逐局实战流水记录</p>
          <span class="sub-hint">当证据链核验工作台录入该选手比赛后，流水将在此自动呈现。</span>
        </div>

        <div v-else class="logs-scroll-area">
          <div v-for="m in matchLogs" :key="m.id" class="match-log-card">
            <div class="log-left-col">
              <span class="placement-badge" :class="'rank-' + m.finalRank">
                第 {{ m.finalRank }} 名
              </span>
              <span class="match-time-text">{{ formatTime(m.matchTime) }}</span>
            </div>

            <div class="log-mid-col">
              <div class="lineup-title-row">
                <span class="lineup-label">{{ m.lineup || '常规体系' }}</span>
                <span class="commander-tag">主弈者: {{ m.commander || '通用' }}</span>
                <span v-if="m.verified" class="verified-tag">✓ 存证已核验</span>
              </div>
              <div v-if="m.threeStars && m.threeStars.length > 0" class="heroes-wrap">
                <span class="heroes-label">三星核心:</span>
                <span v-for="h in m.threeStars" :key="h" class="hero-tag">★ {{ h }}</span>
              </div>
            </div>

            <div class="log-right-col">
              <div class="stat-box">
                <span class="lbl">存活轮次</span>
                <span class="val">{{ m.roundsSurvived || '--' }} 轮</span>
              </div>
              <div class="stat-box">
                <span class="lbl">对局模式</span>
                <span class="val">{{ m.mode || '巅峰排位' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { fetchPlayerMatches, type PlayerRecord, type MatchRecord } from '../api'

const props = defineProps<{
  isOpen: boolean
  player: PlayerRecord | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const matchLogs = ref<MatchRecord[]>([])
const isLoading = ref(false)

watch(() => [props.isOpen, props.player], async ([open, p]) => {
  if (open && p) {
    isLoading.value = true
    try {
      const logs = await fetchPlayerMatches((p as PlayerRecord).id)
      matchLogs.value = logs
    } catch (err) {
      console.error('加载流水失败:', err)
      matchLogs.value = []
    } finally {
      isLoading.value = false
    }
  } else {
    matchLogs.value = []
  }
})

function emitClose() {
  emit('close')
}

function formatTime(isoStr: string) {
  if (!isoStr) return '--'
  try {
    return new Date(isoStr).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return isoStr
  }
}
</script>

<style lang="scss" scoped>
.history-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
  box-sizing: border-box;
}

.history-modal-dialog {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.modal-header {
  padding: 18px 24px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.player-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar-tag {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #eff6ff;
  color: #2563eb;
  font-weight: 700;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.player-name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.score-pill {
  font-size: 11px;
  font-weight: 600;
  background: #eff6ff;
  color: #2563eb;
  padding: 2px 8px;
  border-radius: 4px;
}

.title-pill {
  font-size: 11px;
  background: #f1f5f9;
  color: #475569;
  padding: 2px 6px;
  border-radius: 4px;
}

.sub-text {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
  display: block;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  line-height: 1;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;

  &:hover {
    color: #0f172a;
  }
}

.metrics-banner {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding: 18px 24px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

.metric-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-num {
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
}

.metric-label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

.metric-sub {
  font-size: 11px;
  color: #94a3b8;
}

.match-logs-section {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.logs-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-subtitle {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #1e293b;
}

.logs-count {
  font-size: 12px;
  color: #64748b;
}

.loading-state,
.empty-logs {
  padding: 36px 16px;
  text-align: center;
  color: #64748b;
  font-size: 13px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px dashed #cbd5e1;

  .sub-hint {
    font-size: 11px;
    color: #94a3b8;
    margin-top: 4px;
    display: block;
  }
}

.logs-scroll-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.match-log-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;

  @media (max-width: 640px) {
    flex-direction: column;
    align-items: flex-start;
  }
}

.log-left-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 90px;
}

.placement-badge {
  font-size: 13px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  display: inline-block;
  background: #f1f5f9;
  color: #334155;

  &.rank-1 {
    background: #fef3c7;
    color: #b45309;
  }

  &.rank-2 {
    background: #e0f2fe;
    color: #0369a1;
  }

  &.rank-3 {
    background: #dcfce7;
    color: #15803d;
  }
}

.match-time-text {
  font-size: 11px;
  color: #94a3b8;
}

.log-mid-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lineup-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.lineup-label {
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
}

.commander-tag {
  font-size: 11px;
  color: #475569;
  background: #f1f5f9;
  padding: 1px 6px;
  border-radius: 3px;
}

.verified-tag {
  font-size: 10px;
  color: #16a34a;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  padding: 1px 5px;
  border-radius: 3px;
}

.heroes-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.heroes-label {
  font-size: 11px;
  color: #64748b;
}

.hero-tag {
  font-size: 11px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #334155;
  padding: 1px 5px;
  border-radius: 3px;
}

.log-right-col {
  display: flex;
  gap: 16px;
}

.stat-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;

  @media (max-width: 640px) {
    align-items: flex-start;
  }

  .lbl {
    font-size: 10px;
    color: #94a3b8;
  }

  .val {
    font-size: 12px;
    font-weight: 600;
    color: #334155;
  }
}
</style>
