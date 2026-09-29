<template>
  <div class="lineup-detail-view">
    <div class="nav-back-row">
      <router-link to="/lineups" class="back-link">← 返回阵容快照参考</router-link>
    </div>

    <div v-if="isLoading" class="loading-state">
      正在加载阵容详情...
    </div>

    <div v-else-if="loadError" class="not-found-state">
      <h3>阵容详情加载失败</h3>
      <p>{{ loadError }}</p>
      <button class="primary-btn" @click="loadDetail">重新加载</button>
    </div>

    <div v-else-if="!lineup" class="not-found-state">
      <h3>未找到该阵容详情</h3>
      <p>当前阵容标识不存在或已被下线更新</p>
      <router-link to="/lineups" class="primary-btn">返回列表</router-link>
    </div>

    <div v-else class="detail-content-wrap">
      <!-- 阵容头部卡片（梯级缺失如实显示"无梯级"） -->
      <div class="lineup-header-card">
        <div class="header-left">
          <div v-if="lineup.tier" class="tier-badge" :class="'tier-' + lineup.tier.toLowerCase().replace('.', '')">
            {{ lineup.tier }} 梯级
          </div>
          <div v-else class="tier-badge is-unknown">无梯级</div>
          <div class="title-meta">
            <h2 class="lineup-name">
              {{ lineup.lineupName }}
              <span v-if="lineup.stale" class="stale-chip">已过期</span>
            </h2>
            <span class="sub-scope">
              {{ lineup.scope || '范围未公布' }} · {{ lineup.windowText || '窗口未公布' }}
              <template v-if="lineup.snapshotVersion"> · 快照版本 {{ lineup.snapshotVersion }}</template>
            </span>
          </div>
        </div>

        <div class="header-right">
          <span class="update-time">快照采集于: {{ formatTime(lineup.updatedAt) }}</span>
          <span class="source-tag">来源: {{ lineup.sourceId || '未知来源' }}</span>
        </div>
      </div>

      <!-- 核心指标卡片（来源未公布 → 如实标注，不做 0 兜底） -->
      <div class="metrics-grid">
        <div class="metric-card">
          <span class="metric-num text-primary">{{ formatRate(lineup.winRate) }}</span>
          <span class="metric-label">登顶吃鸡率</span>
          <span class="metric-hint">来源公布口径{{ lineup.rateUnit ? `（${lineup.rateUnit}）` : '' }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-num text-cyan">{{ formatRate(lineup.top3Rate) }}</span>
          <span class="metric-label">前三保分率</span>
          <span class="metric-hint">来源公布口径</span>
        </div>
        <div class="metric-card">
          <span class="metric-num">{{ lineup.avgRank != null ? lineup.avgRank.toFixed(2) + ' 名' : '未公布' }}</span>
          <span class="metric-label">平均名次</span>
          <span class="metric-hint">来源未公布时不显示</span>
        </div>
        <div class="metric-card">
          <span class="metric-num">
            {{ lineup.sampleCount != null ? `${lineup.sampleCount.toLocaleString()} ${lineup.sampleUnit || '席'}` : '未公布' }}
          </span>
          <span class="metric-label">观测样本规模</span>
          <span class="metric-hint">第三方聚合出场人次口径</span>
        </div>
      </div>

      <!-- 构成核心与英雄 -->
      <div class="lineup-composition-card">
        <h3 class="section-title">核心英雄配置与羁绊构成（来源标注）</h3>
        <div class="commander-row">
          <span class="lbl">来源标注主弈者:</span>
          <span class="val font-bold">{{ lineup.commander || '未公布' }}</span>
        </div>

        <div v-if="lineup.coreHeroes && lineup.coreHeroes.length > 0" class="heroes-display-grid">
          <div v-for="hero in lineup.coreHeroes" :key="hero" class="hero-chip">
            <span class="hero-icon">⚔️</span>
            <span class="hero-name">{{ hero }}</span>
            <span class="hero-role">核心战力</span>
          </div>
        </div>
        <div v-else class="heroes-empty">
          来源未标注该阵容的核心英雄构成。
        </div>
      </div>

      <!-- 快照口径元数据（来源语义，全部如实） -->
      <div class="notice-card">
        <h4 class="notice-title">📊 快照元数据与口径说明</h4>
        <ul class="meta-list">
          <li><strong>数据来源:</strong> {{ lineup.sourceId || '未知来源' }}（第三方聚合快照）</li>
          <li><strong>统计窗口:</strong> {{ windowText }}</li>
          <li><strong>数据截止:</strong> {{ lineup.dataCutoffAt ? formatTime(lineup.dataCutoffAt) : '来源未公布' }}</li>
          <li><strong>快照采集:</strong> {{ formatTime(lineup.updatedAt) }}（采集时间 ≠ 数据截止时间）</li>
          <li><strong>过期状态:</strong> {{ lineup.stale == null ? '未知' : (lineup.stale ? '已过期（距数据截止较久，仅供参考）' : '未过期') }}</li>
        </ul>
        <p class="notice-text">
          本页数据为第三方来源公布的聚合快照，仅供天梯环境参考，不代表任何个人真实战绩。
          本站不做流派克制推断，不结合选手历史做任何赛前修正或预测，也不生成对局建议。
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchLineupDetail, type LineupSnapshot } from '../api'

const route = useRoute()
const lineup = ref<LineupSnapshot | null>(null)
const isLoading = ref(true)
const loadError = ref<string | null>(null)

let loadAbort: AbortController | null = null

async function loadDetail() {
  loadAbort?.abort()
  loadAbort = new AbortController()
  isLoading.value = true
  loadError.value = null
  const id = route.params.id as string
  try {
    const data = await fetchLineupDetail(id, loadAbort.signal)
    lineup.value = data
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    console.error('加载阵容详情失败:', err)
    loadError.value = err?.message || '未知错误'
    lineup.value = null
  } finally {
    if (!loadAbort?.signal.aborted) isLoading.value = false
  }
}

onMounted(loadDetail)
onUnmounted(() => loadAbort?.abort())
watch(() => route.params.id, () => {
  if (route.name === 'lineup-detail') loadDetail()
})

const windowText = computed(() => {
  const l = lineup.value
  if (!l) return '未公布'
  if (l.windowText) return l.windowText
  if (l.windowStart || l.windowEnd) {
    return `${l.windowStart ? formatTime(l.windowStart) : '?'} ~ ${l.windowEnd ? formatTime(l.windowEnd) : '?'}`
  }
  return '来源未公布'
})

function formatRate(v: number | null | undefined): string {
  if (v === null || v === undefined) return '未公布'
  return `${(v * 100).toFixed(1)}%`
}

function formatTime(isoStr: string | null | undefined) {
  if (!isoStr) return '未公布'
  try {
    return new Date(isoStr).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return isoStr
  }
}
</script>

<style lang="scss" scoped>
.lineup-detail-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 16px 40px;
  box-sizing: border-box;
}

.nav-back-row {
  margin-top: 4px;
}

.back-link {
  font-size: 13px;
  font-weight: 500;
  color: #2563eb;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

.loading-state,
.not-found-state {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 48px 24px;
  text-align: center;
  color: #64748b;

  h3 {
    margin: 0 0 8px;
    color: #1e293b;
  }

  p {
    margin: 0;
    font-size: 13px;
  }
}

.primary-btn {
  display: inline-block;
  margin-top: 12px;
  background: #2563eb;
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.detail-content-wrap {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.lineup-header-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.tier-badge {
  font-size: 14px;
  font-weight: 800;
  padding: 6px 12px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #334155;

  &.is-unknown {
    font-weight: 600;
    color: #94a3b8;
  }

  &.tier-t0,
  &.tier-t05 {
    background: #fef3c7;
    color: #b45309;
  }

  &.tier-t1 {
    background: #eff6ff;
    color: #2563eb;
  }

  &.tier-t15 {
    background: #f0fdf4;
    color: #16a34a;
  }
}

.title-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lineup-name {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 8px;

  .stale-chip {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 8px;
    border-radius: 4px;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    color: #64748b;
  }
}

.sub-scope {
  font-size: 12px;
  color: #64748b;
}

.header-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;

  @media (max-width: 600px) {
    align-items: flex-start;
  }
}

.update-time {
  font-size: 12px;
  color: #64748b;
}

.source-tag {
  font-size: 11px;
  background: #f1f5f9;
  color: #475569;
  padding: 1px 6px;
  border-radius: 3px;
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
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.metric-num {
  font-size: 24px;
  font-weight: 800;
  color: #0f172a;

  &.text-primary {
    color: #2563eb;
  }
  &.text-cyan {
    color: #0284c7;
  }
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

.lineup-composition-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.commander-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;

  .lbl {
    color: #64748b;
  }
  .val {
    color: #0f172a;
  }
}

.heroes-display-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.heroes-empty {
  font-size: 13px;
  color: #94a3b8;
  background: #f8fafc;
  border: 1px dashed #e2e8f0;
  border-radius: 8px;
  padding: 16px;
}

.hero-chip {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 8px;

  .hero-icon {
    font-size: 18px;
  }
  .hero-name {
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
    flex: 1;
  }
  .hero-role {
    font-size: 10px;
    color: #2563eb;
    background: #eff6ff;
    padding: 1px 4px;
    border-radius: 2px;
  }
}

.notice-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  .notice-title {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: #334155;
  }

  .meta-list {
    margin: 0;
    padding: 0 0 0 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;

    li {
      font-size: 12px;
      color: #475569;
      line-height: 1.6;

      strong {
        color: #64748b;
      }
    }
  }

  .notice-text {
    margin: 0;
    font-size: 12px;
    color: #64748b;
    line-height: 1.6;
    border-top: 1px dashed #e2e8f0;
    padding-top: 10px;
  }
}
</style>
