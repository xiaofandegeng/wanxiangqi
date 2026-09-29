<template>
  <div class="player-roster-view">
    <!-- 顶部大盘指标横幅（计数全部来自真实 API 返回） -->
    <div class="roster-header-card">
      <div class="header-top-row">
        <div class="title-block">
          <div class="badge-row">
            <span class="header-badge">选手数据一览</span>
            <span class="source-badge">统计口径：仅已核验非合成记录</span>
          </div>
          <h2 class="view-title">已收录选手与真实核验统计</h2>
          <span class="view-sub">选手身份字段与战绩统计分开存放；天梯与赛事积分分列展示，未知字段如实标注，不做任何推算填充</span>
        </div>

        <div class="data-status-box">
          <span class="live-dot" :class="{ 'is-backend': isConnectedBackend }"></span>
          <span class="status-title">
            {{ isConnectedBackend ? '数据状态: API 服务已连接' : '数据状态: 暂未连接到后端服务' }}
          </span>
          <span v-if="dataAsOfTime" class="as-of-time">数据截点: {{ formatTime(dataAsOfTime) }}</span>
        </div>
      </div>

      <!-- 数据口径透明公示栏（不宣称任何未接入的来源） -->
      <div class="provenance-disclosure-bar">
        <div class="disclosure-icon">ℹ️</div>
        <div class="disclosure-content">
          <h4 class="disclosure-title">【数据口径公示】</h4>
          <p class="disclosure-desc">
            本页选手均来自人工核验录入的对局材料。登顶率 / 前三率 / 平均名次仅由
            <strong>已核验且状态为 ACTIVE 的非合成逐局记录</strong>统计得出，样本量为 0 时如实显示"暂无样本"。
            天梯段位与赛事积分为两个独立字段：天梯来源未配置真实数据源时显示"未采集"，
            赛事积分未关联时显示"未关联赛事"。本站不发布任何胜率预测或对局建议。
          </p>
        </div>
      </div>

      <!-- 核心指标摘要 (根据真实 API 结果动态汇总) -->
      <div class="metrics-grid">
        <div class="metric-card">
          <span class="metric-num">{{ players.length }} 位</span>
          <span class="metric-label">已收录选手</span>
          <span class="metric-hint">经核验已录入选手实体</span>
        </div>
        <div class="metric-card">
          <span class="metric-num">{{ maxRankScore != null ? `${maxRankScore}★` : '--' }}</span>
          <span class="metric-label">最高段位分</span>
          <span class="metric-hint">{{ topScorerName || '暂无段位数据' }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-num">{{ totalMatchesRecorded }} 场</span>
          <span class="metric-label">已核验实战对局</span>
          <span class="metric-hint">有效统计样本逐局累加</span>
        </div>
        <div class="metric-card">
          <span class="metric-num">{{ qualifiedStatsPlayerCount }} 位</span>
          <span class="metric-label">具备统计样本选手</span>
          <span class="metric-hint">有效局数 N > 0</span>
        </div>
      </div>
    </div>

    <!-- 过滤器与排序列 -->
    <div class="filter-bar">
      <div class="sort-tabs">
        <span class="sort-label">排序方式:</span>
        <button
          class="sort-btn"
          :class="{ active: sortBy === 'score' }"
          @click="sortBy = 'score'"
        >
          段位分
        </button>
        <button
          class="sort-btn"
          :class="{ active: sortBy === 'winRate' }"
          @click="sortBy = 'winRate'"
        >
          登顶率
        </button>
        <button
          class="sort-btn"
          :class="{ active: sortBy === 'top3' }"
          @click="sortBy = 'top3'"
        >
          前三率
        </button>
        <button
          class="sort-btn"
          :class="{ active: sortBy === 'avgRank' }"
          @click="sortBy = 'avgRank'"
        >
          平均名次
        </button>
      </div>

      <div class="search-wrap">
        <input
          v-model="searchKeyword"
          type="text"
          class="search-input"
          placeholder="搜索选手昵称 / 称号 / 常用棋手..."
        />
      </div>
    </div>

    <!-- 失败态如实呈现 -->
    <div v-if="loadError" class="empty-state-box">
      <div class="empty-icon">⚠️</div>
      <h3 class="empty-title">选手数据加载失败</h3>
      <p class="empty-desc">{{ loadError }}</p>
      <div class="empty-actions">
        <button class="primary-link-btn" @click="loadData">重新加载</button>
      </div>
    </div>

    <div v-else-if="isLoading" class="empty-state-box">
      <p class="empty-desc">正在加载选手数据...</p>
    </div>

    <!-- 真实空态提示 -->
    <div v-else-if="sortedPlayers.length === 0" class="empty-state-box">
      <div class="empty-icon">📊</div>
      <h3 class="empty-title">{{ searchKeyword ? '没有匹配的选手' : '当前暂无选手记录' }}</h3>
      <p class="empty-desc">
        请前往「证据核验工作台」录入实战对局材料，或通过管理端导入真实流水后，选手与统计将在此呈现。
      </p>
      <div class="empty-actions">
        <router-link to="/admin/verify" class="primary-link-btn">
          前往证据核验工作台录入
        </router-link>
        <button class="secondary-btn" @click="loadData">
          重新拉取接口
        </button>
      </div>
    </div>

    <!-- 选手大盘表格 (支持手机端水平顺畅滚动，外层容器不裁切) -->
    <div v-else class="table-container">
      <div class="table-scroll-wrapper">
        <table class="roster-table">
          <thead>
            <tr>
              <th class="th-rank">排名</th>
              <th class="th-player">选手档案</th>
              <th class="th-score">天梯段位</th>
              <th class="th-tournament">赛事积分</th>
              <th class="th-winrate">登顶率 (第一)</th>
              <th class="th-top3">前三率 (保分)</th>
              <th class="th-avg">平均名次</th>
              <th class="th-samples">样本局数</th>
              <th class="th-lineup">常用体系与棋手</th>
              <th class="th-action">历史战绩</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(p, idx) in sortedPlayers"
              :key="p.id"
              class="player-tr"
              @click="openPlayerDetail(p)"
            >
              <td class="td-rank">
                <span class="rank-badge" :class="'top-' + (idx + 1)">{{ idx + 1 }}</span>
              </td>

              <td class="td-player">
                <div class="player-info-cell">
                  <span class="avatar-tag">{{ p.nickname.substring(0, 1) }}</span>
                  <div class="name-meta">
                    <div class="name-line">
                      <span class="p-name">{{ p.nickname }}</span>
                      <span v-if="p.title" class="title-tag">{{ p.title }}</span>
                    </div>
                    <span class="p-platform">大区: {{ p.platform || '未知' }} · 区服: {{ p.serverZone || '未知' }}</span>
                  </div>
                </div>
              </td>

              <td class="td-score">
                <span class="score-text">{{ p.rankScore != null ? `${p.rankScore}★` : '未采集' }}</span>
                <span class="rank-tier-sub">{{ p.rankText || '段位未采集' }}</span>
              </td>

              <td class="td-tournament">
                <span class="score-text">{{ p.tournamentPoints != null ? `${p.tournamentPoints} 分` : '未关联赛事' }}</span>
                <span class="rank-tier-sub">
                  <template v-if="p.tournamentRank != null">第 {{ p.tournamentRank }} 名</template>
                  <template v-if="p.tournamentName">{{ p.tournamentName }}</template>
                  <template v-if="p.tournamentRank == null && !p.tournamentName">赛事名次未知</template>
                </span>
              </td>

              <td class="td-winrate">
                <div v-if="p.stats && p.stats.winRate !== null" class="rate-cell">
                  <span class="rate-val">{{ (p.stats.winRate * 100).toFixed(1) }}%</span>
                  <div class="rate-bar-track">
                    <div class="rate-bar-fill" :style="{ width: `${p.stats.winRate * 100}%` }"></div>
                  </div>
                </div>
                <span v-else class="text-muted">暂无样本</span>
              </td>

              <td class="td-top3">
                <div v-if="p.stats && p.stats.top3Rate !== null" class="rate-cell">
                  <span class="rate-val">{{ (p.stats.top3Rate * 100).toFixed(1) }}%</span>
                  <div class="rate-bar-track">
                    <div class="rate-bar-fill cyan-fill" :style="{ width: `${p.stats.top3Rate * 100}%` }"></div>
                  </div>
                </div>
                <span v-else class="text-muted">暂无样本</span>
              </td>

              <td class="td-avg">
                <span v-if="p.stats && p.stats.avgRank !== null" class="avg-text">
                  {{ p.stats.avgRank.toFixed(2) }} 名
                </span>
                <span v-else class="text-muted">--</span>
              </td>

              <td class="td-samples">
                <span class="samples-count">{{ p.stats ? p.stats.sampleCount : 0 }} 局</span>
                <span v-if="p.stats?.isSmallSample" class="sample-warn-badge">样本较少</span>
              </td>

              <td class="td-lineup">
                <div class="lineup-cell">
                  <span class="lineup-name">{{ p.style || '未记录' }}</span>
                  <span class="hero-tag">常用: {{ p.commander || '未记录' }}</span>
                </div>
              </td>

              <td class="td-action">
                <button class="action-view-btn" @click.stop="openPlayerDetail(p)">
                  查看明细
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 选手逐局明细弹窗 (真实 API 渲染) -->
    <PlayerHistoryModal
      :is-open="isHistoryModalOpen"
      :player="selectedPlayer"
      @close="isHistoryModalOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import PlayerHistoryModal from '../components/PlayerHistoryModal.vue'
import { fetchPlayersList, type PlayerRecord } from '../api'

const players = ref<PlayerRecord[]>([])
const searchKeyword = ref('')
const sortBy = ref<'score' | 'winRate' | 'top3' | 'avgRank'>('score')
const isConnectedBackend = ref(false)
const dataAsOfTime = ref('')
const isLoading = ref(true)
const loadError = ref<string | null>(null)
const isHistoryModalOpen = ref(false)
const selectedPlayer = ref<PlayerRecord | null>(null)

let loadAbort: AbortController | null = null

async function loadData() {
  loadAbort?.abort()
  loadAbort = new AbortController()
  isLoading.value = true
  loadError.value = null
  try {
    const res = await fetchPlayersList({}, loadAbort.signal)
    players.value = res.players
    dataAsOfTime.value = res.dataAsOf
    isConnectedBackend.value = true
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    loadError.value = err?.message || '未知错误'
    players.value = []
    isConnectedBackend.value = false
  } finally {
    if (!loadAbort?.signal.aborted) isLoading.value = false
  }
}

onMounted(loadData)
onUnmounted(() => loadAbort?.abort())

const totalMatchesRecorded = computed(() => {
  return players.value.reduce((acc, p) => acc + (p.stats?.sampleCount || 0), 0)
})

// 全部未知时如实返回 null（页面显示 '--'，不造任何默认段位）
const maxRankScore = computed((): number | null => {
  const scores = players.value.map(p => p.rankScore).filter((s): s is number => s != null)
  if (scores.length === 0) return null
  return Math.max(...scores)
})

const topScorerName = computed(() => {
  if (players.value.length === 0) return ''
  const sorted = [...players.value].sort((a, b) => (b.rankScore ?? -1) - (a.rankScore ?? -1))
  return sorted[0]?.rankScore != null ? sorted[0]?.nickname || '' : ''
})

const qualifiedStatsPlayerCount = computed(() => {
  return players.value.filter(p => (p.stats?.sampleCount || 0) > 0).length
})

const sortedPlayers = computed(() => {
  let list = players.value.filter(p => {
    if (!searchKeyword.value) return true
    const kw = searchKeyword.value.toLowerCase()
    return (
      p.nickname.toLowerCase().includes(kw) ||
      (p.title && p.title.toLowerCase().includes(kw)) ||
      (p.commander && p.commander.toLowerCase().includes(kw)) ||
      (p.style && p.style.toLowerCase().includes(kw))
    )
  })

  if (sortBy.value === 'winRate') {
    list.sort((a, b) => (b.stats?.winRate ?? -1) - (a.stats?.winRate ?? -1))
  } else if (sortBy.value === 'top3') {
    list.sort((a, b) => (b.stats?.top3Rate ?? -1) - (a.stats?.top3Rate ?? -1))
  } else if (sortBy.value === 'avgRank') {
    list.sort((a, b) => (a.stats?.avgRank ?? 99) - (b.stats?.avgRank ?? 99))
  } else {
    list.sort((a, b) => (b.rankScore ?? -1) - (a.rankScore ?? -1))
  }

  return list
})

function openPlayerDetail(player: PlayerRecord) {
  selectedPlayer.value = player
  isHistoryModalOpen.value = true
}

function formatTime(isoStr: string) {
  if (!isoStr) return '--'
  try {
    const d = new Date(isoStr)
    return d.toLocaleString('zh-CN', { hour12: false })
  } catch {
    return isoStr
  }
}
</script>

<style lang="scss" scoped>
.player-roster-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 16px 40px;
  box-sizing: border-box;
}

.roster-header-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.header-top-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid #f1f5f9;
}

.title-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.badge-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.header-badge {
  font-size: 11px;
  font-weight: 600;
  color: #2563eb;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  padding: 2px 8px;
  border-radius: 4px;
}

.source-badge {
  font-size: 11px;
  font-weight: 600;
  color: #059669;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  padding: 2px 8px;
  border-radius: 4px;
}

.provenance-disclosure-bar {
  display: flex;
  gap: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #3b82f6;
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 20px;

  .disclosure-icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .disclosure-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .disclosure-title {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: #1e293b;
  }

  .disclosure-desc {
    margin: 0;
    font-size: 12px;
    color: #475569;
    line-height: 1.6;
  }
}

.view-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
}

.view-sub {
  font-size: 13px;
  color: #64748b;
}

.data-status-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;

  @media (max-width: 768px) {
    align-items: flex-start;
  }
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
  display: inline-block;

  &.is-backend {
    background: #16a34a;
    box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.15);
  }
}

.status-title {
  font-size: 12px;
  font-weight: 600;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 6px;
}

.as-of-time {
  font-size: 11px;
  color: #94a3b8;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;

  @media (max-width: 960px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
}

.metric-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.metric-num {
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;
}

.metric-label {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.metric-hint {
  font-size: 11px;
  color: #64748b;
}

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.sort-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sort-label {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}

.sort-btn {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #475569;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #f1f5f9;
    color: #0f172a;
  }

  &.active {
    background: #2563eb;
    border-color: #2563eb;
    color: #ffffff;
    font-weight: 600;
  }
}

.search-wrap {
  flex: 1;
  max-width: 320px;

  @media (max-width: 600px) {
    max-width: 100%;
    width: 100%;
  }
}

.search-input {
  width: 100%;
  box-sizing: border-box;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
  color: #0f172a;

  &:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }
}

.empty-state-box {
  background: #ffffff;
  border: 1px dashed #cbd5e1;
  border-radius: 12px;
  padding: 48px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-icon {
  font-size: 40px;
}

.empty-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
}

.empty-desc {
  margin: 0;
  max-width: 520px;
  font-size: 13px;
  line-height: 1.6;
  color: #64748b;
}

.empty-actions {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.primary-link-btn {
  background: #2563eb;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 6px;
  text-decoration: none;
  border: none;
  cursor: pointer;

  &:hover {
    background: #1d4ed8;
  }
}

.secondary-btn {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #334155;
  font-size: 13px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    background: #e2e8f0;
  }
}

.table-container {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  width: 100%;
}

.table-scroll-wrapper {
  overflow-x: auto;
  width: 100%;
  -webkit-overflow-scrolling: touch;
}

.roster-table {
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  text-align: left;

  th {
    background: #f8fafc;
    color: #475569;
    font-size: 12px;
    font-weight: 600;
    padding: 12px 14px;
    border-bottom: 1px solid #e2e8f0;
    white-space: nowrap;
  }

  td {
    padding: 14px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 13px;
    color: #1e293b;
    vertical-align: middle;
  }

  .player-tr {
    cursor: pointer;
    transition: background 0.1s ease;

    &:hover {
      background: #f8fafc;
    }
  }
}

.rank-badge {
  display: inline-block;
  width: 24px;
  height: 24px;
  line-height: 24px;
  text-align: center;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
  background: #f1f5f9;

  &.top-1 {
    background: #fef3c7;
    color: #b45309;
  }

  &.top-2 {
    background: #e0f2fe;
    color: #0369a1;
  }

  &.top-3 {
    background: #dcfce7;
    color: #15803d;
  }
}

.player-info-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-tag {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #eff6ff;
  color: #2563eb;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.name-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.p-name {
  font-weight: 600;
  color: #0f172a;
}

.title-tag {
  font-size: 10px;
  background: #f1f5f9;
  color: #475569;
  padding: 1px 5px;
  border-radius: 3px;
}

.p-platform {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}

.score-text {
  font-weight: 700;
  color: #0f172a;
  display: block;
  white-space: nowrap;
}

.rank-tier-sub {
  font-size: 10px;
  color: #64748b;
  white-space: nowrap;
}

.rate-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rate-val {
  font-weight: 600;
  color: #0f172a;
}

.rate-bar-track {
  width: 70px;
  height: 4px;
  background: #e2e8f0;
  border-radius: 2px;
  overflow: hidden;
}

.rate-bar-fill {
  height: 100%;
  background: #2563eb;
  border-radius: 2px;

  &.cyan-fill {
    background: #0284c7;
  }
}

.avg-text {
  font-weight: 600;
  color: #0f172a;
}

.samples-count {
  font-weight: 500;
  color: #334155;
  display: block;
}

.sample-warn-badge {
  font-size: 10px;
  color: #d97706;
  background: #fef3c7;
  padding: 1px 4px;
  border-radius: 2px;
}

.lineup-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lineup-name {
  font-weight: 500;
  color: #1e293b;
}

.hero-tag {
  font-size: 11px;
  color: #64748b;
}

.text-muted {
  font-size: 12px;
  color: #94a3b8;
}

.action-view-btn {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #2563eb;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: #eff6ff;
    border-color: #93c5fd;
  }
}
</style>
