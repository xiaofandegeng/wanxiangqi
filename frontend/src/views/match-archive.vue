<template>
  <div class="match-archive-view">
    <!-- 顶部台账概览（数字全部来自 API 真实返回，无兜底常量） -->
    <div class="archive-header-card">
      <div class="header-top-row">
        <div class="title-block">
          <span class="header-badge">已核验战绩台账</span>
          <h2 class="view-title">逐局战绩流水与场次档案</h2>
          <span class="view-sub">仅陈列通过人工核验入库的真实对局记录；每条记录的来源与核验状态如实标注，未知字段不做填充</span>
        </div>

        <div class="ingestion-action-box">
          <div class="daemon-status">
            <span class="pulse-beacon" :class="{ active: isConnected }"></span>
            <span class="daemon-text">{{ isConnected ? 'API 服务已连接' : 'API 服务未连接' }}</span>
          </div>

          <button class="sync-now-btn" :disabled="isSyncing" @click="reloadAll">
            <span>{{ isSyncing ? '正在刷新...' : '刷新台账' }}</span>
          </button>
        </div>
      </div>

      <!-- 台账关键指标（真实计数；无数据即为 0，不显示任何预设数字） -->
      <div class="archive-metrics-grid">
        <div class="metric-card">
          <span class="metric-num">{{ campTotalCount }} 条</span>
          <span class="metric-label">已核验逐局记录</span>
          <span class="metric-sub">仅统计已核验且状态 ACTIVE 的非合成记录</span>
        </div>
        <div class="metric-card">
          <span class="metric-num">{{ playersCount }} 位</span>
          <span class="metric-label">已收录选手</span>
          <span class="metric-sub">身份与段位未知字段如实为空</span>
        </div>
        <div class="metric-card">
          <span class="metric-num">{{ eventsList.length }} 场</span>
          <span class="metric-label">王牌对决场次</span>
          <span class="metric-sub">六席位名次以人工核验录入为准</span>
        </div>
        <div class="metric-card">
          <span class="metric-num">0 条</span>
          <span class="metric-label">合成记录参与统计</span>
          <span class="metric-sub">合成 / 隔离 / 待核验记录不进入本台账</span>
        </div>
      </div>
    </div>

    <!-- 视图切换模式 Tab -->
    <div class="archive-view-tabs">
      <button
        class="view-tab-btn"
        :class="{ active: activeTab === 'MATCH_FEED' }"
        @click="activeTab = 'MATCH_FEED'"
      >
        <span>📋 逐局战绩流水 ({{ campTotalCount }} 条)</span>
      </button>
      <button
        class="view-tab-btn"
        :class="{ active: activeTab === 'TOURNAMENT_EVENTS' }"
        @click="activeTab = 'TOURNAMENT_EVENTS'"
      >
        <span>⚔️ 王牌对决场次 ({{ eventsList.length }} 场)</span>
      </button>
    </div>

    <!-- 提示消息 -->
    <div v-if="syncNotice" class="sync-notice-banner">
      {{ syncNotice }}
    </div>

    <!-- 视图 1：逐局战绩流水（真实 API 分页数据） -->
    <div v-if="activeTab === 'MATCH_FEED'" class="camp-feed-section">
      <div class="section-head-bar">
        <div class="head-title-wrap">
          <h3 class="section-title">逐局战绩流水记录</h3>
          <span class="section-tip">每条记录均为人工核验入库；记录编号、来源、核验状态逐条可溯</span>
        </div>
        <div class="feed-filter-bar">
          <span class="feed-count-badge">当前已展示 {{ matchRecords.length }} 条 / 共 {{ campTotalCount }} 条</span>
        </div>
      </div>

      <div v-if="feedLoadError" class="empty-state-box">
        <h3 class="empty-title">战绩流水加载失败</h3>
        <p class="empty-desc">{{ feedLoadError }}</p>
        <button class="link-btn" @click="loadCampMatches()">重新加载</button>
      </div>

      <div v-else-if="feedLoading" class="empty-state-box">
        <p class="empty-desc">正在加载战绩流水...</p>
      </div>

      <div v-else-if="matchRecords.length === 0" class="empty-state-box">
        <div class="empty-icon">📁</div>
        <h3 class="empty-title">暂无已核验逐局记录</h3>
        <p class="empty-desc">
          通过「证据核验工作台」录入并核验材料，或由管理端导入战绩后，流水将在此呈现。待核验记录不进入本页。
        </p>
      </div>

      <div v-else class="camp-table-responsive">
        <table class="camp-match-table">
          <thead>
            <tr>
              <th class="th-seq">记录编号</th>
              <th class="th-player">选手</th>
              <th class="th-rank">最终名次</th>
              <th class="th-lineup">使用体系 / 主弈</th>
              <th class="th-rounds">存活轮次</th>
              <th class="th-time">对局时间 / 模式</th>
              <th class="th-status">核验状态</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="m in matchRecords"
              :key="m.id"
              class="camp-tr"
              :class="{ 'is-win': m.finalRank === 1 }"
            >
              <td class="font-mono text-muted record-id-cell">
                <span class="record-id">{{ m.id }}</span>
                <span v-if="m.sourceId" class="source-chip">{{ m.sourceId }}</span>
              </td>
              <td class="player-cell">
                <span class="player-name font-bold">{{ getPlayerName(m.playerId) }}</span>
                <span class="player-uid font-mono">{{ m.playerId }}</span>
              </td>
              <td class="rank-cell">
                <span class="rank-badge-pill" :class="'rank-' + m.finalRank">
                  第 {{ m.finalRank }} 名 {{ m.finalRank === 1 ? '★ 登顶' : '' }}
                </span>
              </td>
              <td class="lineup-cell">
                <span class="lineup-name font-bold">{{ m.lineup || '未记录' }}</span>
                <span class="cmd-tag">{{ m.commander || '未记录' }}</span>
              </td>
              <td class="font-mono rounds-cell">
                {{ m.roundsSurvived != null ? `${m.roundsSurvived} 轮` : '未记录' }}
              </td>
              <td class="font-mono text-secondary time-cell">
                <span>{{ formatTime(m.matchTime) }}</span>
                <span class="mode-inline-tag">{{ m.mode || '模式未记录' }}</span>
              </td>
              <td class="status-cell">
                <span v-if="m.verified" class="verified-tag">✓ 已核验</span>
                <span v-else class="pending-tag">待核验</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页与加载更多 -->
      <div v-if="matchRecords.length < campTotalCount" class="load-more-row">
        <button class="load-more-btn" :disabled="isLoadingMore" @click="loadMoreCampMatches">
          <span>{{ isLoadingMore ? '正在拉取更多记录...' : '加载更多记录 (每次 50 条)' }}</span>
        </button>
      </div>
    </div>

    <!-- 视图 2：王牌对决场次（六席位事实） -->
    <div v-else-if="activeTab === 'TOURNAMENT_EVENTS'" class="matches-list-section">
      <!-- 真实空态展示 -->
      <div v-if="eventsList.length === 0" class="empty-state-box">
        <div class="empty-icon">📁</div>
        <h3 class="empty-title">当前暂无已归档的对局场次</h3>
        <p class="empty-desc">
          通过「证据核验工作台」录入并核验六席位材料后，场次将自动在此呈现。
        </p>
      </div>

      <!-- 历史对局场次流列表 -->
      <div v-else class="match-cards-container">
        <div
          v-for="e in eventsList"
          :key="e.id"
          class="match-archive-card"
        >
          <!-- 场次顶栏 -->
          <div class="card-header">
            <div class="match-meta-info">
              <span class="match-time">{{ formatTime(e.scheduledAt) }}</span>
              <h4 class="match-title">{{ e.title }}</h4>
              <span class="mode-tag">{{ e.mode || '模式未记录' }}</span>
              <span v-if="e.status === 'AUDITED'" class="audit-tag">✓ 已核验存证</span>
            </div>

            <div v-if="getWinner(e)" class="winner-trophy-box">
              <span class="trophy-icon">🏆</span>
              <div class="winner-info">
                <span class="winner-label">冠军登顶</span>
                <span class="winner-name">{{ getWinner(e)?.nickname }}{{ winnerDetail(e) }}</span>
              </div>
            </div>
          </div>

          <!-- 6 人实盘对决详情表格 -->
          <div class="participants-table-wrap">
            <table class="card-table">
              <thead>
                <tr>
                  <th style="width: 50px">席位</th>
                  <th>选手昵称</th>
                  <th>段位分</th>
                  <th>使用体系/主弈者</th>
                  <th>返奖倍率</th>
                  <th>支持热度</th>
                  <th>最终名次</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="p in e.participants"
                  :key="p.slot"
                  class="row-tr"
                  :class="{ 'is-winner': p.finalRank === 1 }"
                >
                  <td class="cell-slot">#{{ p.slot }}</td>
                  <td class="cell-name">
                    <span class="name-text">{{ p.nickname }}</span>
                    <span v-if="p.finalRank === 1" class="winner-pill">★ 登顶</span>
                  </td>
                  <td class="cell-score">{{ p.rankScore != null ? `${p.rankScore}★` : '—' }}</td>
                  <td class="cell-lineup">
                    {{ p.lineup || '未记录' }} · {{ p.commander || '未记录' }}
                  </td>
                  <td class="cell-odds">{{ p.odds != null ? `${p.odds}x` : '—' }}</td>
                  <td class="cell-support">{{ p.supportCount != null ? `${p.supportCount} 票` : '—' }}</td>
                  <td class="cell-rank">
                    <span v-if="p.finalRank != null" class="result-badge" :class="'rank-' + p.finalRank">
                      第 {{ p.finalRank }} 名
                    </span>
                    <span v-else class="result-badge is-unknown">名次未录入</span>
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
import { ref, onMounted, onUnmounted } from 'vue'
import { fetchEventsList, fetchMatchesList, fetchPlayersList, type EventRecord, type MatchRecord, type PlayerRecord } from '../api'

const activeTab = ref<'MATCH_FEED' | 'TOURNAMENT_EVENTS'>('MATCH_FEED')
const eventsList = ref<EventRecord[]>([])
const matchRecords = ref<MatchRecord[]>([])
const campTotalCount = ref(0)
const playersMap = ref<Record<string, string>>({})
const playersCount = ref(0)
const isSyncing = ref(false)
const isLoadingMore = ref(false)
const isConnected = ref(false)
const syncNotice = ref('')
const feedLoading = ref(true)
const feedLoadError = ref<string | null>(null)

let loadAbort: AbortController | null = null

async function loadCampMatches(isLoadMore = false, signal?: AbortSignal) {
  if (!isLoadMore) {
    feedLoading.value = true
    feedLoadError.value = null
  }
  try {
    const offset = isLoadMore ? matchRecords.value.length : 0
    const res = await fetchMatchesList({ limit: 50, offset }, signal)
    if (isLoadMore) {
      matchRecords.value.push(...res.data)
    } else {
      matchRecords.value = res.data
    }
    campTotalCount.value = res.total
    isConnected.value = true
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    if (!isLoadMore) {
      feedLoadError.value = err?.message || '未知错误'
      matchRecords.value = []
      campTotalCount.value = 0
    }
    console.error('加载战绩流水失败:', err)
  } finally {
    if (!isLoadMore) feedLoading.value = false
  }
}

async function loadPlayers(signal?: AbortSignal) {
  try {
    const res = await fetchPlayersList({}, signal)
    const map: Record<string, string> = {}
    for (const p of res.players as PlayerRecord[]) {
      map[p.id] = p.nickname
      if (p.id.startsWith('p-')) {
        map[p.id.replace('p-', '')] = p.nickname
      }
    }
    playersMap.value = map
    playersCount.value = res.players.length
  } catch (err) {
    console.warn('选手列表映射加载失败:', err)
  }
}

async function loadMatches(signal?: AbortSignal) {
  try {
    const list = await fetchEventsList({}, signal)
    eventsList.value = list
    isConnected.value = true
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    eventsList.value = []
    isConnected.value = false
  }
}

function getPlayerName(playerId?: string): string {
  if (!playerId) return '未知选手'
  return playersMap.value[playerId] || playersMap.value[playerId.replace('p-', '')] || playerId
}

async function loadMoreCampMatches() {
  isLoadingMore.value = true
  await loadCampMatches(true)
  isLoadingMore.value = false
}

async function reloadAll() {
  isSyncing.value = true
  syncNotice.value = ''
  loadAbort?.abort()
  loadAbort = new AbortController()
  const signal = loadAbort.signal
  try {
    await Promise.all([loadCampMatches(false, signal), loadPlayers(signal), loadMatches(signal)])
    syncNotice.value = `台账已刷新：已核验逐局记录 ${campTotalCount.value} 条，场次 ${eventsList.value.length} 场`
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      syncNotice.value = `刷新请求失败: ${err?.message || '未知错误'}`
    }
  } finally {
    isSyncing.value = false
    setTimeout(() => {
      syncNotice.value = ''
    }, 4000)
  }
}

onMounted(() => {
  loadAbort = new AbortController()
  const signal = loadAbort.signal
  loadPlayers(signal)
  loadCampMatches(false, signal)
  loadMatches(signal)
})

onUnmounted(() => loadAbort?.abort())

function getWinner(event: EventRecord) {
  return event.participants?.find(p => p.finalRank === 1) || null
}

function winnerDetail(event: EventRecord): string {
  const w = getWinner(event)
  if (!w) return ''
  const detail = w.lineup || w.commander
  return detail ? ` (${detail})` : ''
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
.match-archive-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 16px 40px;
  box-sizing: border-box;
}

.archive-header-card {
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

.header-badge {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 600;
  color: #2563eb;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  padding: 2px 8px;
  border-radius: 4px;
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

.ingestion-action-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;

  @media (max-width: 768px) {
    align-items: flex-start;
  }
}

.daemon-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #475569;
}

.pulse-beacon {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;

  &.active {
    background: #16a34a;
    box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.15);
  }
}

.sync-now-btn {
  background: #2563eb;
  border: none;
  color: #ffffff;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #1d4ed8;
  }

  &:disabled {
    background: #94a3b8;
    cursor: not-allowed;
  }
}

.archive-metrics-grid {
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

.archive-view-tabs {
  display: flex;
  gap: 12px;
  margin-top: 4px;

  .view-tab-btn {
    flex: 1;
    padding: 12px 18px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    color: #475569;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;

    &:hover {
      border-color: #b45309;
      color: #b45309;
      background: #fffbeb;
    }

    &.active {
      background: #b45309;
      color: #ffffff;
      border-color: #b45309;
      box-shadow: 0 2px 4px rgba(180, 83, 9, 0.2);
    }
  }
}

.camp-feed-section {
  display: flex;
  flex-direction: column;
  gap: 16px;

  .section-head-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;

    .head-title-wrap {
      display: flex;
      flex-direction: column;
      gap: 4px;

      .section-title {
        font-size: 1.15rem;
        font-weight: 700;
        color: #0f172a;
        margin: 0;
      }

      .section-tip {
        font-size: 0.82rem;
        color: #64748b;
      }
    }

    .feed-count-badge {
      font-size: 0.8rem;
      background: #f1f5f9;
      color: #475569;
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid #e2e8f0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
  }

  .camp-table-responsive {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    overflow-x: auto;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

    .camp-match-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.88rem;

      th {
        background: #f8fafc;
        color: #475569;
        font-weight: 600;
        padding: 12px 16px;
        border-bottom: 1px solid #e2e8f0;
        white-space: nowrap;
      }

      td {
        padding: 12px 16px;
        border-bottom: 1px solid #f1f5f9;
        color: #1e293b;
      }

      .camp-tr {
        transition: background 0.15s ease;

        &:hover {
          background: #f8fafc;
        }

        &.is-win {
          background: rgba(180, 83, 9, 0.03);

          .rank-badge-pill {
            background: #fef3c7;
            color: #b45309;
            border-color: #fde68a;
            font-weight: 700;
          }
        }
      }

      .record-id-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;

        .record-id {
          font-size: 0.78rem;
          word-break: break-all;
        }

        .source-chip {
          font-size: 0.7rem;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #64748b;
          padding: 1px 6px;
          border-radius: 4px;
          width: fit-content;
        }
      }

      .player-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;

        .player-name {
          color: #0f172a;
        }

        .player-uid {
          font-size: 0.75rem;
          color: #94a3b8;
        }
      }

      .rank-badge-pill {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.78rem;
        background: #f1f5f9;
        border: 1px solid #e2e8f0;
        white-space: nowrap;
      }

      .lineup-cell {
        display: flex;
        align-items: center;
        gap: 6px;

        .cmd-tag {
          font-size: 0.72rem;
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
          color: #64748b;
          white-space: nowrap;
        }
      }

      .time-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;

        .mode-inline-tag {
          font-size: 0.7rem;
          color: #94a3b8;
        }
      }

      .verified-tag {
        font-size: 0.75rem;
        color: #16a34a;
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        padding: 2px 8px;
        border-radius: 4px;
        white-space: nowrap;
      }

      .pending-tag {
        font-size: 0.75rem;
        color: #b45309;
        background: #fffbeb;
        border: 1px solid #fde68a;
        padding: 2px 8px;
        border-radius: 4px;
        white-space: nowrap;
      }
    }
  }

  .load-more-row {
    display: flex;
    justify-content: center;
    margin-top: 8px;

    .load-more-btn {
      padding: 10px 24px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      color: #334155;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;

      &:hover:not(:disabled) {
        border-color: #b45309;
        color: #b45309;
        background: #fffbeb;
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }
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

.metric-sub {
  font-size: 11px;
  color: #64748b;
}

.sync-notice-banner {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
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
    max-width: 480px;
    font-size: 13px;
    color: #64748b;
    line-height: 1.6;
  }

  .link-btn {
    margin-top: 8px;
    background: #2563eb;
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    padding: 8px 16px;
    border-radius: 6px;
    border: none;
    cursor: pointer;

    &:hover {
      background: #1d4ed8;
    }
  }
}

.matches-list-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-head-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.section-tip {
  font-size: 12px;
  color: #64748b;
}

.match-cards-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.match-archive-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.card-header {
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  background: #fafafa;
}

.match-meta-info {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.match-time {
  font-size: 12px;
  color: #64748b;
}

.match-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.mode-tag {
  font-size: 11px;
  background: #f1f5f9;
  color: #475569;
  padding: 1px 6px;
  border-radius: 3px;
}

.audit-tag {
  font-size: 11px;
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
  padding: 1px 6px;
  border-radius: 3px;
}

.winner-trophy-box {
  display: flex;
  align-items: center;
  gap: 8px;
}

.trophy-icon {
  font-size: 20px;
}

.winner-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.winner-label {
  font-size: 10px;
  color: #94a3b8;
}

.winner-name {
  font-size: 13px;
  font-weight: 700;
  color: #b45309;
}

.participants-table-wrap {
  overflow-x: auto;
  width: 100%;
  -webkit-overflow-scrolling: touch;
}

.card-table {
  width: 100%;
  min-width: 650px;
  border-collapse: collapse;
  text-align: left;

  th {
    background: #f8fafc;
    color: #475569;
    font-size: 12px;
    font-weight: 600;
    padding: 10px 14px;
    border-bottom: 1px solid #e2e8f0;
  }

  td {
    padding: 12px 14px;
    border-bottom: 1px solid #f1f5f9;
    font-size: 13px;
    color: #1e293b;
    vertical-align: middle;
  }

  .row-tr.is-winner {
    background: #fffbeb;
  }
}

.cell-slot {
  font-weight: 700;
  color: #64748b;
  font-size: 12px;
}

.name-text {
  font-weight: 600;
  color: #0f172a;
}

.winner-pill {
  font-size: 10px;
  background: #fef3c7;
  color: #b45309;
  padding: 1px 5px;
  border-radius: 3px;
  margin-left: 6px;
}

.cell-score {
  font-weight: 600;
  color: #334155;
}

.cell-odds {
  font-family: monospace;
  font-weight: 600;
  color: #2563eb;
}

.result-badge {
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  display: inline-block;
  background: #f1f5f9;
  color: #475569;
  white-space: nowrap;

  &.is-unknown {
    font-weight: 500;
    color: #94a3b8;
  }

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
</style>
