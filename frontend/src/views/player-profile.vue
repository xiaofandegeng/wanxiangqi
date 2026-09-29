<template>
  <div class="player-profile-view">
    <!-- 加载与失败态如实呈现 -->
    <div v-if="loading" class="state-panel">正在加载选手数据...</div>
    <div v-else-if="loadError" class="state-panel is-error">
      <p>选手数据加载失败：{{ loadError }}</p>
      <button class="retry-btn" @click="loadAll">重新加载</button>
    </div>

    <template v-else-if="player">
      <!-- 选手基础信息头卡 -->
      <div class="profile-header-card">
        <div class="header-nav-row">
          <button class="back-btn" @click="$router.back()">
            <span>←</span>
            <span>返回</span>
          </button>
          <span class="source-tag">已核验对局样本</span>
        </div>

        <div class="profile-main-meta">
          <div class="avatar-box">
            <span class="avatar-char">{{ player.nickname.substring(0, 1) }}</span>
          </div>
          <div class="profile-names">
            <div class="title-row">
              <h2 class="player-nickname">{{ player.nickname }}</h2>
              <RankBadge :rank-text="player.rankText" :rank-score="player.rankScore" />
            </div>
            <div class="sub-row">
              <span>大区: {{ player.platform || '未知' }}</span>
              <span>区服: {{ player.serverZone || '未知' }}</span>
              <span class="id-text">ID: {{ player.id }}</span>
            </div>
          </div>
        </div>

        <!-- 天梯与赛事积分分列（F06：不得互相推导伪装） -->
        <div class="score-split-grid">
          <div class="score-panel">
            <span class="score-title">天梯积分</span>
            <span class="score-num font-mono">{{ player.ladderScore != null ? player.ladderScore : '未采集' }}</span>
            <span class="score-sub">
              {{ player.ladderSource ? `来源: ${player.ladderSource}` : '来源: 未配置真实天梯来源' }}
              <template v-if="player.ladderAt"> · 采集: {{ formatTime(player.ladderAt) }}</template>
            </span>
          </div>
          <div class="score-panel">
            <span class="score-title">赛事积分（第三方平台公布）</span>
            <span class="score-num font-mono">{{ player.tournamentPoints != null ? player.tournamentPoints : '未采集' }}</span>
            <span class="score-sub">
              <template v-if="player.tournamentName">{{ player.tournamentName }}</template>
              <template v-else>未关联赛事</template>
              <template v-if="player.tournamentRank != null"> · 赛事排名: 第 {{ player.tournamentRank }} 名</template>
            </span>
          </div>
        </div>

        <!-- 核心统计大卡（N=0 → 如实空态） -->
        <div class="core-metrics-grid">
          <div class="metric-card">
            <span class="metric-num">{{ stats?.sampleCount ?? 0 }}</span>
            <span class="metric-label">已核验场次</span>
          </div>
          <div class="metric-card highlight-gold">
            <span class="metric-num">{{ formatRate(stats?.winRate) }}</span>
            <span class="metric-label">登顶率 (第1名)</span>
          </div>
          <div class="metric-card highlight-cyan">
            <span class="metric-num">{{ formatRate(stats?.top3Rate) }}</span>
            <span class="metric-label">前三率 (≤第3名)</span>
          </div>
          <div class="metric-card">
            <span class="metric-num">{{ stats?.avgRank != null ? stats!.avgRank!.toFixed(2) : '—' }}</span>
            <span class="metric-label">平均名次</span>
          </div>
        </div>
        <div v-if="stats?.coverageNote" class="coverage-note">{{ stats.coverageNote }}<template v-if="stats.isSmallSample"> · 样本量低于阈值，比率仅供参考</template></div>
      </div>

      <!-- 棋手/阵容偏好（仅当已核验对局中真实出现时统计） -->
      <div class="profile-content-grid">
        <div class="content-panel">
          <div class="panel-header">
            <h3 class="panel-title">局内棋手选用（按已核验对局统计）</h3>
            <span class="panel-sub">{{ commanderUsage.length ? `${commanderUsage.reduce((a, c) => a + c.count, 0)} 局有棋手记录` : '' }}</span>
          </div>

          <div v-if="commanderUsage.length" class="items-list">
            <div v-for="c in commanderUsage" :key="c.name" class="list-item-bar">
              <div class="item-title-row">
                <span class="item-name">{{ c.name }}</span>
                <div class="item-stats">
                  <span>选用 {{ c.count }} 局</span>
                </div>
              </div>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${c.usageRate * 100}%` }"></div>
              </div>
            </div>
          </div>
          <div v-else class="empty-panel">
            <p>暂无已核验对局的棋手记录</p>
            <span class="sub-hint">人工核验录入含棋手信息的对局后，此处将按真实出现次数统计。</span>
          </div>
        </div>

        <div class="content-panel">
          <div class="panel-header">
            <h3 class="panel-title">成型阵容记录（按已核验对局统计）</h3>
            <span class="panel-sub">{{ lineupUsage.length ? `${lineupUsage.reduce((a, c) => a + c.count, 0)} 局有阵容记录` : '' }}</span>
          </div>

          <div v-if="lineupUsage.length" class="items-list">
            <div v-for="lineup in lineupUsage" :key="lineup.name" class="list-item-bar">
              <div class="item-title-row">
                <span class="item-name">{{ lineup.name }}</span>
                <div class="item-stats">
                  <span>出现 {{ lineup.count }} 局</span>
                  <span class="text-cyan">前三率 {{ formatRate(lineup.top3Rate) }}</span>
                </div>
              </div>
              <div class="bar-track">
                <div class="bar-fill cyan-fill" :style="{ width: `${lineup.usageRate * 100}%` }"></div>
              </div>
            </div>
          </div>
          <div v-else class="empty-panel">
            <p>暂无已核验对局的阵容记录</p>
            <span class="sub-hint">阵容名称以核验材料实际标注为准，不做流派推测。</span>
          </div>
        </div>
      </div>

      <!-- 已核验名次记录 -->
      <div class="recent-ranks-panel">
        <div class="panel-header">
          <h3 class="panel-title">已核验对局名次记录（{{ verifiedMatches.length }} 局）</h3>
        </div>
        <div v-if="verifiedMatches.length" class="ranks-track">
          <div
            v-for="m in verifiedMatches"
            :key="m.id"
            class="rank-bubble"
            :class="'rank-' + m.finalRank"
          >
            <span class="rank-digit">#{{ m.finalRank }}</span>
            <span class="rank-seq">{{ formatTime(m.matchTime) }}</span>
          </div>
        </div>
        <div v-else class="empty-panel">
          <p>暂无该选手的已核验逐局记录</p>
          <span class="sub-hint">证据链核验工作台录入该选手比赛并通过核验后，记录将在此呈现。</span>
        </div>
      </div>
    </template>

    <div v-else class="empty-view">
      <p>未找到该选手（可能从未经核验录入）</p>
      <router-link to="/roster" class="back-link">返回选手列表</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import RankBadge from '../components/RankBadge.vue'
import {
  fetchPlayersList,
  fetchPlayerStats,
  fetchPlayerMatches,
  type PlayerRecord,
  type PlayerStats,
  type MatchRecord
} from '../api'

const route = useRoute()

const loading = ref(true)
const loadError = ref<string | null>(null)
const player = ref<PlayerRecord | null>(null)
const stats = ref<PlayerStats | null>(null)
const matches = ref<MatchRecord[]>([])

let loadAbort: AbortController | null = null

const verifiedMatches = computed(() =>
  matches.value.filter(m => m.verified && m.recordStatus !== 'QUARANTINED' && m.recordStatus !== 'REVOKED')
)

interface UsageItem {
  name: string
  count: number
  usageRate: number
  top3Rate: number | null
}

function buildUsage(field: 'commander' | 'lineup'): UsageItem[] {
  const total = verifiedMatches.value.length
  if (!total) return []
  const counts = new Map<string, { n: number; top3: number }>()
  for (const m of verifiedMatches.value) {
    const name = m[field]
    if (!name) continue
    const cur = counts.get(name) || { n: 0, top3: 0 }
    cur.n += 1
    if (m.finalRank <= 3) cur.top3 += 1
    counts.set(name, cur)
  }
  return Array.from(counts.entries())
    .map(([name, { n, top3 }]) => ({
      name,
      count: n,
      usageRate: n / total,
      top3Rate: n > 0 ? top3 / n : null
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

const commanderUsage = computed(() => buildUsage('commander'))
const lineupUsage = computed(() => buildUsage('lineup'))

function formatRate(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${Math.round(v * 100)}%`
}

function formatTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('zh-CN')
}

async function loadAll() {
  loadAbort?.abort()
  loadAbort = new AbortController()
  loading.value = true
  loadError.value = null
  const playerId = route.params.id as string
  try {
    const [listRes, statsRes, matchesRes] = await Promise.all([
      fetchPlayersList({}, loadAbort.signal),
      fetchPlayerStats(playerId, {}, loadAbort.signal).catch(() => null),
      fetchPlayerMatches(playerId, loadAbort.signal).catch(() => [] as MatchRecord[])
    ])
    player.value = listRes.players.find(p => p.id === playerId) || null
    stats.value = statsRes
    matches.value = matchesRes
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    loadError.value = err?.message || '未知错误'
  } finally {
    if (!loadAbort?.signal.aborted) loading.value = false
  }
}

onMounted(loadAll)
onUnmounted(() => loadAbort?.abort())
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
  background: $bg-tertiary;
  padding: 4px 8px;
  border-radius: $radius-sm;
}

.profile-main-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
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
    color: #ffffff;
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

    .id-text {
      font-family: monospace;
    }
  }
}

.score-split-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;

  @media (max-width: 640px) {
    grid-template-columns: 1fr;
  }
}

.score-panel {
  @include flex-column;
  gap: 4px;
  padding: 12px 16px;
  background: $bg-tertiary;
  border: 1px solid $border-color;
  border-radius: $radius-md;

  .score-title {
    font-size: 11px;
    color: $text-muted;
  }

  .score-num {
    font-size: 20px;
    font-weight: 800;
    color: $text-primary;
  }

  .score-sub {
    font-size: 11px;
    color: $text-muted;
  }
}

.core-metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.metric-card {
  @include flex-column;
  align-items: center;
  padding: 16px;
  background: $bg-tertiary;
  border: 1px solid $border-color;
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

  &.highlight-gold .metric-num { color: $color-gold; }
  &.highlight-cyan .metric-num { color: $color-cyan; }
}

.coverage-note {
  margin-top: 10px;
  font-size: 11px;
  color: $text-muted;
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

.empty-panel {
  padding: 28px 0;
  text-align: center;

  p {
    font-size: 14px;
    color: $text-secondary;
    margin: 0 0 6px 0;
  }

  .sub-hint {
    font-size: 11px;
    color: $text-muted;
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
    background: $bg-tertiary;
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

.text-cyan { color: $color-cyan; }

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
  min-width: 72px;
  height: 56px;
  border-radius: $radius-md;
  background: $bg-tertiary;
  border: 1px solid $border-color;

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
    .rank-digit { color: $color-gold; }
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

.empty-view {
  text-align: center;
  padding: 80px 0;
  color: $text-secondary;

  .back-link {
    color: $color-gold;
    text-decoration: none;
  }
}
</style>
