<template>
  <div class="event-detail-view">
    <!-- 加载与失败态如实呈现 -->
    <div v-if="loading" class="state-panel">正在加载场次数据...</div>
    <div v-else-if="loadError" class="state-panel is-error">
      <p>场次数据加载失败：{{ loadError }}</p>
      <button class="retry-btn" @click="loadEvent">重新加载</button>
    </div>

    <template v-else-if="event">
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
            <h2 class="match-title">{{ formatDateTime(event.scheduledAt) }} · {{ event.title || '王牌对决' }}</h2>
            <div class="match-tags">
              <span class="tag-item">场次编号: {{ event.id }}</span>
              <span class="tag-item">模式: {{ event.mode || '未知' }}</span>
              <span v-if="event.verifiedAt" class="tag-item">核验时间: {{ formatDateTime(event.verifiedAt) }}</span>
              <span v-if="event.evidenceId" class="tag-item highlight">存证: {{ shortHash(event.evidenceId) }}</span>
            </div>
          </div>
          <div class="banner-note">
            本页仅展示经人工核验入库的真实数据；未知字段如实标注，不填充默认值，不做任何胜率预测。
          </div>
        </div>
      </div>

      <!-- 6 席位已核验统计对比表（数据逐席位取自统计服务） -->
      <div class="roster-comparison-table-card">
        <div class="table-title-row">
          <h3 class="comp-title">六席位已核验战绩对比</h3>
          <span class="comp-tip">仅统计已核验（verified ∧ ACTIVE ∧ 非合成）的有效历史样本</span>
        </div>

        <div class="table-responsive">
          <table class="roster-comp-table">
            <thead>
              <tr>
                <th class="th-slot">席位</th>
                <th class="th-name">参赛选手</th>
                <th class="th-rank">段位（材料可见时）</th>
                <th class="th-sample">已核验样本 (N)</th>
                <th class="th-win">登顶率</th>
                <th class="th-top3">前三率</th>
                <th class="th-avg">平均名次</th>
                <th class="th-heat">支持热度（相对最高）</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in event.participants"
                :key="p.slot"
                class="comp-tr"
                @click="openPlayerHistory(p)"
              >
                <td class="font-mono text-gold font-bold">#{{ p.slot }}</td>
                <td class="player-name-cell">
                  <span class="name-text">{{ p.nickname }}</span>
                  <span v-if="p.playerId" class="view-history-tag">流水 🔍</span>
                </td>
                <td class="font-mono">
                  <template v-if="p.rankText || p.rankScore !== null && p.rankScore !== undefined">
                    {{ p.rankText || '—' }}<template v-if="p.rankScore != null"> ({{ p.rankScore }}★)</template>
                  </template>
                  <template v-else>未采集</template>
                </td>
                <td class="font-mono">{{ statOf(p)?.sampleCount ?? '—' }}</td>
                <td class="font-mono highlight-gold">{{ formatRate(statOf(p)?.winRate) }}</td>
                <td class="font-mono highlight-cyan">{{ formatRate(statOf(p)?.top3Rate) }}</td>
                <td class="font-mono">{{ statOf(p)?.avgRank != null ? statOf(p)!.avgRank!.toFixed(2) : '—' }}</td>
                <td class="heat-bar-cell">
                  <div v-if="hasSupportData" class="heat-bar-wrap">
                    <div
                      class="heat-bar-fill"
                      :style="{ width: `${relativeSupportPercent(p)}%` }"
                    ></div>
                    <span class="heat-bar-label font-mono">{{ supportText(p) }}</span>
                  </div>
                  <span v-else class="text-muted">未采集</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="anySmallSample" class="small-sample-note">
          * 存在样本量低于阈值的席位：其比率仅作参考，页面不据此生成任何预测结论。
        </div>
      </div>

      <!-- 6 名选手卡片（真实统计或未知态） -->
      <div class="section-title-wrap">
        <h3 class="section-title">六席位选手数据卡</h3>
        <span class="section-sub">点击行可查看该选手已核验逐局流水；未知字段如实展示</span>
      </div>

      <div class="participants-container">
        <PlayerSlot
          v-for="p in event.participants"
          :key="p.slot"
          :participant="toSlotParticipant(p)"
          :support-ratio="p.supportCount != null && maxSupport ? relativeSupportPercent(p) : null"
        />
      </div>

      <!-- 赛后结果（仅已录入时展示，不做赛前预测对照） -->
      <div v-if="allRanksKnown" class="comparison-panel">
        <div class="panel-header">
          <h3 class="panel-title">赛后名次（人工核验录入）</h3>
        </div>
        <div class="table-responsive">
          <table class="comparison-table">
            <thead>
              <tr>
                <th>席位</th>
                <th>选手</th>
                <th>当局棋手</th>
                <th>当局阵容</th>
                <th>最终名次</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in event.participants" :key="p.slot">
                <td class="col-slot">#{{ p.slot }}</td>
                <td class="col-name">{{ p.nickname }}</td>
                <td>{{ p.commander || '—' }}</td>
                <td>{{ p.lineup || '—' }}</td>
                <td>
                  <span class="result-badge" :class="'rank-' + p.finalRank">第 {{ p.finalRank }} 名</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else class="state-panel">赛后名次尚未录入（待人工核验）</div>
    </template>

    <div v-else class="empty-event">
      <p>未找到对应场次数据</p>
      <router-link to="/" class="back-link">返回今日赛程</router-link>
    </div>

    <!-- 已核验逐局战绩流水弹窗 -->
    <PlayerHistoryModal
      :is-open="isHistoryModalOpen"
      :player="selectedPlayerRecord"
      @close="isHistoryModalOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import StatusTag from '../components/StatusTag.vue'
import PlayerSlot from '../components/PlayerSlot.vue'
import PlayerHistoryModal from '../components/PlayerHistoryModal.vue'
import {
  fetchEventDetail,
  fetchPlayerStats,
  type EventRecord,
  type EventParticipant,
  type PlayerRecord,
  type PlayerStats
} from '../api'

const route = useRoute()

const loading = ref(true)
const loadError = ref<string | null>(null)
const event = ref<EventRecord | null>(null)
const statsByPlayer = ref<Record<string, PlayerStats>>({})

let loadAbort: AbortController | null = null

const isHistoryModalOpen = ref(false)
const selectedPlayerRecord = ref<PlayerRecord | null>(null)

function statOf(p: EventParticipant): PlayerStats | null {
  if (!p.playerId) return null
  return statsByPlayer.value[p.playerId] || null
}

const maxSupport = computed(() => {
  if (!event.value) return 0
  const counts = event.value.participants
    .map(p => p.supportCount)
    .filter((c): c is number => c != null)
  return counts.length ? Math.max(...counts) : 0
})

const hasSupportData = computed(() => maxSupport.value > 0)

const anySmallSample = computed(() => {
  return Object.values(statsByPlayer.value).some(s => s && s.isSmallSample && s.sampleCount > 0)
})

const allRanksKnown = computed(() => {
  if (!event.value || event.value.participants.length === 0) return false
  return event.value.participants.every(p => p.finalRank != null)
})

function relativeSupportPercent(p: EventParticipant): number {
  if (!maxSupport.value || p.supportCount == null) return 0
  return Number(((p.supportCount / maxSupport.value) * 100).toFixed(1))
}

function supportText(p: EventParticipant): string {
  if (p.supportCount == null) return '未采集'
  if (p.supportCount === 0) return '0.0%'
  return `${relativeSupportPercent(p)}% (相对最高)`
}

function toSlotParticipant(p: EventParticipant) {
  const s = statOf(p)
  return {
    slot: p.slot,
    playerId: p.playerId,
    nickname: p.nickname,
    rankText: p.rankText,
    rankScore: p.rankScore,
    finalRank: p.finalRank,
    commander: p.commander,
    lineup: p.lineup,
    winRateRecent: s ? s.winRate : undefined,
    top3RateRecent: s ? s.top3Rate : undefined,
    sampleMatches: s ? s.sampleCount : undefined
  }
}

function openPlayerHistory(p: EventParticipant) {
  if (!p.playerId) return
  // 只携带真实已知字段；段位/平台等未知即 null，弹窗内如实展示
  selectedPlayerRecord.value = {
    id: p.playerId,
    nickname: p.nickname,
    platform: null,
    serverZone: null,
    rankScore: p.rankScore ?? null,
    rankText: p.rankText ?? null
  }
  isHistoryModalOpen.value = true
}

function formatDateTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

function formatRate(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${Math.round(v * 100)}%`
}

function shortHash(id: string): string {
  return id.length > 16 ? `${id.slice(0, 16)}…` : id
}

async function loadEvent() {
  loadAbort?.abort()
  loadAbort = new AbortController()
  loading.value = true
  loadError.value = null
  const eventId = route.params.id as string
  try {
    const data = await fetchEventDetail(eventId, loadAbort.signal)
    event.value = data
    // 逐席位拉取真实统计（仅已核验有效样本）
    if (data) {
      const ids = Array.from(new Set(data.participants.map(p => p.playerId).filter((i): i is string => Boolean(i))))
      const results = await Promise.allSettled(
        ids.map(id => fetchPlayerStats(id, {}, loadAbort!.signal))
      )
      const map: Record<string, PlayerStats> = {}
      ids.forEach((id, idx) => {
        const r = results[idx]
        if (r.status === 'fulfilled' && r.value) map[id] = r.value
      })
      statsByPlayer.value = map
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    loadError.value = err?.message || '未知错误'
    event.value = null
  } finally {
    if (!loadAbort?.signal.aborted) loading.value = false
  }
}

onMounted(loadEvent)
onUnmounted(() => loadAbort?.abort())
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
  font-size: 24px;
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
    background: $bg-tertiary;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    color: $text-secondary;

    &.highlight {
      color: $color-gold;
      border-color: rgba(245, 158, 11, 0.3);
      background: rgba(245, 158, 11, 0.1);
    }
  }
}

.banner-note {
  max-width: 340px;
  font-size: 12px;
  line-height: 1.6;
  color: $text-muted;
  border-left: 2px solid rgba(245, 158, 11, 0.4);
  padding-left: 10px;
}

.text-gold { color: $color-gold; }
.text-muted { color: $text-muted; }

.state-panel {
  @include glass-panel;
  padding: 40px 24px;
  text-align: center;
  color: $text-secondary;
  font-size: 14px;

  &.is-error {
    color: $color-danger;
  }
}

.retry-btn {
  margin-top: 12px;
  padding: 6px 16px;
  border: 1px solid rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.1);
  color: $color-gold;
  border-radius: $radius-sm;
  cursor: pointer;
}

.roster-comparison-table-card {
  @include glass-panel;
  padding: 20px;

  .table-title-row {
    @include flex-between;
    margin-bottom: 14px;

    .comp-title {
      font-size: 16px;
      font-weight: 700;
      color: $text-primary;
    }

    .comp-tip {
      font-size: 11px;
      color: $text-muted;
    }
  }
}

.table-responsive {
  width: 100%;
  overflow-x: auto;
}

.roster-comp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;

  th {
    padding: 10px 12px;
    color: $text-muted;
    font-weight: 600;
    border-bottom: 1px solid $border-color;
    white-space: nowrap;
  }

  td {
    padding: 12px;
    border-bottom: 1px solid #eef2f7;
  }

  .comp-tr {
    cursor: pointer;
    transition: background 0.15s;

    &:hover {
      background: $bg-card-hover;
    }
  }

  .player-name-cell {
    .name-text {
      font-weight: 600;
      color: $text-primary;
    }

    .view-history-tag {
      font-size: 11px;
      margin-left: 6px;
      color: $text-muted;
    }
  }

  .highlight-gold { color: $color-gold; }
  .highlight-cyan { color: $color-cyan; }

  .heat-bar-cell {
    min-width: 140px;
  }

  .heat-bar-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .heat-bar-fill {
    height: 6px;
    border-radius: $radius-full;
    background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);
    transition: width 0.4s ease;
  }

  .heat-bar-label {
    font-size: 11px;
    color: $text-secondary;
    white-space: nowrap;
  }
}

.small-sample-note {
  margin-top: 10px;
  font-size: 11px;
  color: $text-muted;
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

.comparison-panel {
  @include glass-panel;
  padding: 20px;

  .panel-header {
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid $border-color;

    .panel-title {
      font-size: 16px;
      font-weight: 700;
      color: $text-primary;
    }
  }
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
    border-bottom: 1px solid $border-color;
  }

  td {
    padding: 12px;
    border-bottom: 1px solid #eef2f7;
  }

  .col-slot {
    font-weight: 700;
    color: $text-muted;
  }

  .col-name {
    font-weight: 600;
    color: $text-primary;
  }

  .result-badge {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: $radius-sm;

    &.rank-1 {
      background: linear-gradient(135deg, $color-gold 0%, $color-gold-dark 100%);
      color: #ffffff;
    }
    &.rank-2 { background: #94a3b8; color: #0f172a; }
    &.rank-3 { background: #b45309; color: #fef3c7; }
  }
}

.empty-event {
  text-align: center;
  padding: 60px 0;
  color: $text-secondary;
}
</style>
