<template>
  <div class="lineup-detail-view">
    <div class="nav-back-row">
      <router-link to="/lineups" class="back-link">← 返回阵容环境大盘</router-link>
    </div>

    <div v-if="isLoading" class="loading-state">
      正在加载阵容详情...
    </div>

    <div v-else-if="!lineup" class="not-found-state">
      <h3>未找到该阵容详情</h3>
      <p>当前阵容标识不存在或已被下线更新</p>
      <router-link to="/lineups" class="primary-btn">返回列表</router-link>
    </div>

    <div v-else class="detail-content-wrap">
      <!-- 阵容头部卡片 -->
      <div class="lineup-header-card">
        <div class="header-left">
          <div class="tier-badge" :class="'tier-' + lineup.tier.toLowerCase().replace('.', '')">
            {{ lineup.tier }} 梯级
          </div>
          <div class="title-meta">
            <h2 class="lineup-name">{{ lineup.lineupName }}</h2>
            <span class="sub-scope">{{ lineup.scope }} · {{ lineup.windowText }} · 快照版本 {{ lineup.snapshotVersion }}</span>
          </div>
        </div>

        <div class="header-right">
          <span class="update-time">快照更新于: {{ formatTime(lineup.updatedAt) }}</span>
          <span class="source-tag">来源: {{ lineup.sourceId }}</span>
        </div>
      </div>

      <!-- 核心指标卡片 -->
      <div class="metrics-grid">
        <div class="metric-card">
          <span class="metric-num text-primary">{{ (lineup.winRate * 100).toFixed(1) }}%</span>
          <span class="metric-label">登顶吃鸡率</span>
          <span class="metric-hint">第 1 名完赛概率</span>
        </div>
        <div class="metric-card">
          <span class="metric-num text-cyan">{{ (lineup.top3Rate * 100).toFixed(1) }}%</span>
          <span class="metric-label">前三保分率</span>
          <span class="metric-hint">排位稳定上分能力</span>
        </div>
        <div class="metric-card">
          <span class="metric-num">{{ lineup.avgRank.toFixed(2) }} 名</span>
          <span class="metric-label">平均名次</span>
          <span class="metric-hint">全服对决期望落点</span>
        </div>
        <div class="metric-card">
          <span class="metric-num">{{ lineup.sampleCount.toLocaleString() }} 席</span>
          <span class="metric-label">观测样本规模</span>
          <span class="metric-hint">第三方聚合出场人次</span>
        </div>
      </div>

      <!-- 构成核心与英雄 -->
      <div class="lineup-composition-card">
        <h3 class="section-title">核心英雄配置与羁绊构成</h3>
        <div class="commander-row">
          <span class="lbl">推荐主弈者:</span>
          <span class="val font-bold">{{ lineup.commander }}</span>
        </div>

        <div class="heroes-display-grid">
          <div v-for="hero in lineup.coreHeroes" :key="hero" class="hero-chip">
            <span class="hero-icon">⚔️</span>
            <span class="hero-name">{{ hero }}</span>
            <span class="hero-role">核心战力</span>
          </div>
        </div>
      </div>

      <!-- 数据口径说明 (F13) -->
      <div class="notice-card">
        <h4 class="notice-title">📊 数据来源与口径说明</h4>
        <p class="notice-text">
          本页面阵容数据由第三方数据源 ({{ lineup.sourceId }}) 聚合快照提供，仅供天梯环境对阵参考。
          样本规模反映该体系在统计窗口内的出场人次，不等于独立非重叠对局总数。系统在赛前推演时，将结合本对局实际 6 名选手的历史熟练度与卡池内卷进行实时修正。
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { fetchLineupDetail, type LineupSnapshot } from '../api'

const route = useRoute()
const lineup = ref<LineupSnapshot | null>(null)
const isLoading = ref(true)

async function loadDetail() {
  isLoading.value = true
  const id = route.params.id as string
  try {
    const data = await fetchLineupDetail(id)
    lineup.value = data
  } catch (err) {
    console.error('加载阵容详情失败:', err)
    lineup.value = null
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadDetail()
})

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
}

.primary-btn {
  display: inline-block;
  margin-top: 12px;
  background: #2563eb;
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 6px;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
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

  .notice-title {
    margin: 0 0 8px 0;
    font-size: 13px;
    font-weight: 700;
    color: #334155;
  }

  .notice-text {
    margin: 0;
    font-size: 12px;
    color: #64748b;
    line-height: 1.6;
  }
}
</style>
