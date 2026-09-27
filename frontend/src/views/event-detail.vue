<template>
  <div v-if="event" class="event-detail-view">
    <!-- 顶部导航与元信息 -->
    <div class="detail-header-card">
      <div class="nav-back-row">
        <router-link to="/" class="back-link">
          <span class="back-arrow">←</span>
          <span>返回今日赛程列表</span>
        </router-link>
        <StatusTag :status="event.status" />
      </div>

      <div class="match-meta-banner">
        <div class="banner-title-area">
          <h2 class="match-title">{{ formatTime(event.scheduledAt) }} 王牌对决 · 钻石狂潮</h2>
          <div class="match-tags">
            <span class="tag-item">场次编号: {{ event.id }}</span>
            <span class="tag-item">客户端版本: {{ event.gameVersion }}</span>
            <span v-if="event.forecast" class="tag-item highlight">预测模型: {{ event.forecast.modelVersion }}</span>
          </div>
        </div>

        <div v-if="event.forecast" class="banner-stat-area">
          <div class="stat-pill">
            <span class="stat-title">截点时间 (Cutoff)</span>
            <span class="stat-data">{{ event.forecast.asOf }}</span>
          </div>
          <div class="stat-pill">
            <span class="stat-title">有效对局样本</span>
            <span class="stat-data text-gold">{{ event.forecast.sampleSize }} 场</span>
          </div>
          <div class="stat-pill">
            <span class="stat-title">数据覆盖率</span>
            <span class="stat-data text-cyan">{{ Math.round(event.forecast.coverageRate * 100) }}%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 钻石支持决策与情景模拟器 (硬门槛 B 结算规则已验证) -->
    <WagerSimulator
      v-if="event.forecast"
      :participants="event.participants"
      :forecast-prob-map="event.forecast.probabilities"
    />

    <!-- 6名选手网格卡片 -->
    <div class="section-title-wrap">
      <h3 class="section-title">六席参赛选手数据对阵画像</h3>
      <span class="section-sub">点击选手昵称可查看历史偏好阵容与对局详情</span>
    </div>

    <div class="participants-container">
      <PlayerSlot
        v-for="p in event.participants"
        :key="p.slot"
        :participant="p"
        :forecast-prob="event.forecast?.probabilities[p.slot]"
        :support-ratio="event.supportSnapshot ? event.supportSnapshot[p.slot]?.ratioPercent : undefined"
      />
    </div>

    <!-- 六人概率 vs 均匀基线对比表格 -->
    <div v-if="event.forecast" class="comparison-panel">
      <div class="panel-header">
        <h3 class="panel-title">六人胜率 vs 均匀基准模型对比 (总和 = 100%)</h3>
      </div>
      <div class="table-responsive">
        <table class="comparison-table">
          <thead>
            <tr>
              <th>席位</th>
              <th>选手昵称</th>
              <th>当前段位</th>
              <th>均匀基准 (1/6)</th>
              <th>可解释模型预测</th>
              <th>相对基线优势</th>
              <th>实际赛后结果</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in event.participants" :key="p.slot">
              <td class="col-slot">#{{ p.slot }}</td>
              <td class="col-name">{{ p.nickname }}</td>
              <td class="col-rank">{{ p.rankText }} ({{ p.rankScore }}★)</td>
              <td class="col-baseline">16.7%</td>
              <td class="col-forecast text-gold">
                {{ Math.round((event.forecast?.probabilities[p.slot] || 0) * 100) }}%
              </td>
              <td class="col-diff" :class="diffClass(p.slot)">
                {{ calcDiff(p.slot) }}
              </td>
              <td class="col-result">
                <span v-if="p.finalRank" class="result-badge" :class="'rank-' + p.finalRank">
                  第 {{ p.finalRank }} 名
                </span>
                <span v-else class="text-muted">待公布</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 证据链溯源模块 -->
    <div v-if="event.evidences && event.evidences.length > 0" class="evidence-panel">
      <div class="panel-header">
        <h3 class="panel-title">关联证据链截图（SHA-256 存证）</h3>
      </div>
      <div class="evidence-grid">
        <div v-for="ev in event.evidences" :key="ev.id" class="evidence-card">
          <div class="ev-header">
            <span class="ev-type">{{ evidenceTypeLabel(ev.evidenceType) }}</span>
            <span class="ev-status text-success">{{ ev.status }}</span>
          </div>
          <div class="ev-hash-box">
            <span class="hash-label">SHA-256:</span>
            <span class="hash-code">{{ ev.sha256 }}</span>
          </div>
          <div class="ev-time">采集时间: {{ ev.capturedAt }}</div>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="empty-event">
    <p>未找到对应场次数据</p>
    <router-link to="/" class="back-link">返回今日赛程</router-link>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useEventStore } from '../stores/event-store'
import StatusTag from '../components/StatusTag.vue'
import PlayerSlot from '../components/PlayerSlot.vue'
import WagerSimulator from '../components/WagerSimulator.vue'

const route = useRoute()
const eventStore = useEventStore()

const event = computed(() => {
  const eventId = route.params.id as string
  return eventStore.getEventById(eventId)
})

function formatTime(scheduledAt: string): string {
  if (!scheduledAt) return ''
  const parts = scheduledAt.split(' ')
  return parts.length > 1 ? parts[1].substring(0, 5) : scheduledAt
}

function calcDiff(slot: number): string {
  if (!event.value?.forecast?.probabilities) return '-'
  const prob = event.value.forecast.probabilities[slot] || 0
  const baseline = 0.1667
  const diff = (prob - baseline) * 100
  return diff >= 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`
}

function diffClass(slot: number): string {
  if (!event.value?.forecast?.probabilities) return ''
  const prob = event.value.forecast.probabilities[slot] || 0
  return prob >= 0.1667 ? 'text-success' : 'text-muted'
}

function evidenceTypeLabel(type: string): string {
  if (type === 'PRE_MATCH_LOBBY') return '赛前备战与段位'
  if (type === 'SUPPORT_STAGE') return '支持热度对比条'
  if (type === 'POST_MATCH_SUMMARY') return '赛后名次简报'
  return type
}
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.event-detail-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.detail-header-card {
  @include glass-panel;
  padding: 24px;
}

.nav-back-row {
  @include flex-between;
  margin-bottom: 16px;
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: $text-secondary;
  transition: $transition-base;

  &:hover {
    color: $color-gold;
    transform: translateX(-2px);
  }
}

.match-meta-banner {
  @include flex-between;
  flex-wrap: wrap;
  gap: 20px;
}

.match-title {
  font-size: 26px;
  font-weight: 800;
  color: $text-primary;
  margin-bottom: 8px;
}

.match-tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;

  .tag-item {
    font-size: 12px;
    padding: 3px 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: $radius-sm;
    color: $text-secondary;

    &.highlight {
      color: $color-gold-light;
      border-color: rgba(245, 158, 11, 0.3);
      background: rgba(245, 158, 11, 0.1);
    }
  }
}

.banner-stat-area {
  display: flex;
  gap: 12px;
}

.stat-pill {
  @include flex-column;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: $radius-md;
  text-align: center;

  .stat-title {
    font-size: 11px;
    color: $text-muted;
    margin-bottom: 4px;
  }

  .stat-data {
    font-size: 14px;
    font-weight: 700;
  }
}

.text-gold { color: $color-gold-light; }
.text-cyan { color: $color-cyan-light; }
.text-success { color: $color-success; }
.text-muted { color: $text-muted; }

.disclaimer-alert {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 20px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: $radius-lg;

  .alert-icon {
    font-size: 24px;
  }

  .alert-title {
    font-size: 14px;
    font-weight: 700;
    color: $color-gold-light;
    margin-bottom: 4px;
  }

  .alert-desc {
    font-size: 12px;
    color: $text-secondary;
    line-height: 1.6;
  }
}

.section-title-wrap {
  .section-title {
    font-size: 18px;
    font-weight: 700;
    color: $text-primary;
  }
  .section-sub {
    font-size: 12px;
    color: $text-muted;
  }
}

.participants-container {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;

  @media (max-width: 1024px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
}

.comparison-panel, .evidence-panel {
  @include glass-panel;
  padding: 20px;

  .panel-header {
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);

    .panel-title {
      font-size: 16px;
      font-weight: 700;
      color: $text-primary;
    }
  }
}

.table-responsive {
  width: 100%;
  overflow-x: auto;
}

.comparison-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;

  th {
    padding: 10px 12px;
    color: $text-muted;
    font-weight: 600;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  td {
    padding: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .col-slot {
    font-weight: 700;
    color: $text-muted;
  }

  .col-name {
    font-weight: 600;
    color: $text-primary;
  }

  .col-rank {
    color: $text-secondary;
  }

  .result-badge {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: $radius-sm;

    &.rank-1 {
      background: linear-gradient(135deg, $color-gold 0%, $color-gold-dark 100%);
      color: #111827;
    }
    &.rank-2 { background: #94a3b8; color: #0f172a; }
    &.rank-3 { background: #b45309; color: #fef3c7; }
  }
}

.evidence-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
}

.evidence-card {
  background: rgba(0, 0, 0, 0.3);
  padding: 12px;
  border-radius: $radius-md;
  border: 1px solid rgba(255, 255, 255, 0.05);

  .ev-header {
    @include flex-between;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .ev-hash-box {
    font-size: 11px;
    color: $text-muted;
    word-break: break-all;
    font-family: monospace;
    background: rgba(0, 0, 0, 0.2);
    padding: 6px;
    border-radius: $radius-sm;
    margin-bottom: 6px;
  }

  .ev-time {
    font-size: 11px;
    color: $text-muted;
  }
}

.empty-event {
  text-align: center;
  padding: 60px 0;
  color: $text-secondary;
}
</style>
