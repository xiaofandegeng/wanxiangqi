<template>
  <div class="match-archive-view">
    <!-- 顶部数据源与巡检控制横幅 -->
    <div class="archive-header-card">
      <div class="header-top-row">
        <div class="title-block">
          <span class="header-badge">真实对局归档库</span>
          <h2 class="view-title">历史对战事实大盘档案库</h2>
          <span class="view-sub">沉淀已核验实盘对战流水事实，记录 6 席位名次排位与使用体系</span>
        </div>

        <div class="ingestion-action-box">
          <div class="daemon-status">
            <span class="pulse-beacon" :class="{ active: isConnected }"></span>
            <span class="daemon-text">{{ isConnected ? 'API 服务连接正常 (127.0.0.1:8080)' : 'API 服务未连接' }}</span>
          </div>

          <button class="sync-now-btn" :disabled="isSyncing" @click="triggerIngestionSync">
            <span>{{ isSyncing ? '正在刷新对局...' : '刷新对局归档' }}</span>
          </button>
        </div>
      </div>

      <!-- 归档大盘关键指标 (动态计算) -->
      <div class="archive-metrics-grid">
        <div class="metric-card">
          <span class="metric-num">{{ eventsList.length }} 场</span>
          <span class="metric-label">已归档对局场次</span>
          <span class="metric-sub">经审核入库事实</span>
        </div>
        <div class="metric-card">
          <span class="metric-num">{{ totalParticipantsCount }} 席</span>
          <span class="metric-label">参赛样本人次</span>
          <span class="metric-sub">每场包含 6 席位</span>
        </div>
        <div class="metric-card">
          <span class="metric-num">{{ auditedCount }} 场</span>
          <span class="metric-label">人工审核完成场次</span>
          <span class="metric-sub">存证与排位完全锁定</span>
        </div>
        <div class="metric-card">
          <span class="metric-num">{{ uniquePlayersCount }} 位</span>
          <span class="metric-label">涉及参赛选手</span>
          <span class="metric-sub">去重选手实体</span>
        </div>
      </div>
    </div>

    <!-- 提示消息 -->
    <div v-if="syncNotice" class="sync-notice-banner">
      {{ syncNotice }}
    </div>

    <!-- 真实空态展示 (A01, F07) -->
    <div v-if="eventsList.length === 0" class="empty-state-box">
      <div class="empty-icon">📁</div>
      <h3 class="empty-title">当前暂无已归档的历史对局</h3>
      <p class="empty-desc">
        系统遵循零 mock 冷启动规范。当通过证据链核验工作台或批量导入对局后，历史对局将自动在此呈现。
      </p>
      <router-link to="/admin/verify" class="link-btn">
        前往核验工作台录入新对局
      </router-link>
    </div>

    <!-- 历史对局场次流列表 -->
    <div v-else class="matches-list-section">
      <div class="section-head-bar">
        <h3 class="section-title">全量实战对局事实 (按时间倒序)</h3>
        <span class="section-tip">包含 6 席位名次排位、盘面赔率与使用流派</span>
      </div>

      <div class="match-cards-container">
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
              <span class="mode-tag">{{ e.mode || '巅峰排位' }}</span>
              <span v-if="e.status === 'AUDITED'" class="audit-tag">✓ 已核验存证</span>
            </div>

            <div v-if="getWinner(e)" class="winner-trophy-box">
              <span class="trophy-icon">🏆</span>
              <div class="winner-info">
                <span class="winner-label">冠军登顶</span>
                <span class="winner-name">{{ getWinner(e)?.nickname }} ({{ getWinner(e)?.lineup || getWinner(e)?.commander || '通用' }})</span>
              </div>
            </div>
          </div>

          <!-- 6 人实盘对决详情表格 (支持移动端平滑滚动) -->
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
                  <td class="cell-score">{{ p.rankScore }}★</td>
                  <td class="cell-lineup">
                    {{ p.lineup || '常规' }} · {{ p.commander || '通用' }}
                  </td>
                  <td class="cell-odds">{{ p.odds ? `${p.odds}x` : '--' }}</td>
                  <td class="cell-support">{{ p.supportCount || '--' }} 票</td>
                  <td class="cell-rank">
                    <span class="result-badge" :class="'rank-' + p.finalRank">
                      第 {{ p.finalRank || p.slot }} 名
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
import { ref, computed, onMounted } from 'vue'
import { fetchEventsList, type EventRecord } from '../api'

const eventsList = ref<EventRecord[]>([])
const isSyncing = ref(false)
const isConnected = ref(false)
const syncNotice = ref('')

async function loadMatches() {
  try {
    const list = await fetchEventsList()
    eventsList.value = list
    isConnected.value = true
  } catch (err) {
    console.error('加载对局列表失败:', err)
    eventsList.value = []
    isConnected.value = false
  }
}

onMounted(() => {
  loadMatches()
})

const totalParticipantsCount = computed(() => {
  return eventsList.value.reduce((acc, m) => acc + (m.participants?.length || 0), 0)
})

const auditedCount = computed(() => {
  return eventsList.value.filter(e => e.status === 'AUDITED').length
})

const uniquePlayersCount = computed(() => {
  const set = new Set<string>()
  eventsList.value.forEach(e => {
    e.participants?.forEach(p => set.add(p.nickname))
  })
  return set.size
})

function getWinner(event: EventRecord) {
  return event.participants?.find(p => p.finalRank === 1) || null
}

/**
 * 真实触发增量同步检查，绝不凭空捏造假对局 (F07)
 */
async function triggerIngestionSync() {
  isSyncing.value = true
  syncNotice.value = ''
  try {
    const prevCount = eventsList.value.length
    await loadMatches()
    const newCount = eventsList.value.length
    if (newCount > prevCount) {
      syncNotice.value = `同步检查完成：检测并入库了 ${newCount - prevCount} 场新对局事实！`
    } else {
      syncNotice.value = '已是最新数据，当前暂无新增核验对局事实。'
    }
  } catch (err: any) {
    syncNotice.value = `同步请求失败: ${err.message}`
  } finally {
    isSyncing.value = false
    setTimeout(() => {
      syncNotice.value = ''
    }, 4000)
  }
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
    text-decoration: none;

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
