<template>
  <div class="home-view">
    <!-- 站点定位：首次访问突出“从零开始” -->
    <div class="hero-card">
      <div class="hero-main">
        <div class="hero-badge">新手友好 · 内容逐项核实</div>
        <h2 class="hero-title">从零开始，学会一套阵容并理解它为什么成立</h2>
        <p class="hero-desc">
          这里是面向新手的王者万象棋阵容研习站：先用第一方资料讲清规则与术语，
          再带你打出第一套成型阵容，最后学会看版本环境变阵。
          所有教学内容标注适用版本与来源；阵容统计如实标注第三方来源、统计窗口与样本口径。
        </p>
        <div class="hero-actions">
          <router-link to="/learn" class="hero-btn is-primary">从零开始学</router-link>
          <router-link to="/lineups" class="hero-btn">先看看阵容库</router-link>
        </div>
      </div>

      <!-- 站点真实状态（来自 /api/v1/data-status，空态如实展示） -->
      <div class="hero-side">
        <div class="status-block">
          <span class="status-label">已核实游戏版本</span>
          <span class="status-val">{{ verifiedVersionText }}</span>
        </div>
        <div class="status-block">
          <span class="status-label">阵容库收录快照</span>
          <span class="status-val font-mono">{{ counts?.lineups ?? '—' }}</span>
        </div>
        <div class="status-block">
          <span class="status-label">教学内容（课程/资料/手册）</span>
          <span class="status-val">{{ contentCountText }}</span>
        </div>
        <div class="status-block">
          <span class="status-label">数据源状态</span>
          <span class="status-val">{{ apiError ? 'API 暂不可达' : `${sources.length} 个已注册来源` }}</span>
        </div>
      </div>
    </div>

    <!-- 站点公告：转型说明（对老访客如实交代，不装作无事发生） -->
    <div class="notice-card">
      <strong>站点已转型（2026-10-03）：</strong>
      原「赛事与玩家战绩数据站」功能（赛事收录 / 选手画像 / 对局流水 / 实时预测 / 个人战绩导入）已整体退役。
      现站点专注阵容研习与新手教学，教学与内容建设正在分阶段进行中。
    </div>

    <!-- 四大内容区入口 -->
    <div class="section-grid">
      <router-link to="/learn" class="section-card">
        <div class="section-icon">🎓</div>
        <h3 class="section-title">新手学堂</h3>
        <p class="section-desc">按阶段组织的课程路径：从认识界面、理解资源，到独立打出并复盘第一套阵容。</p>
        <span class="section-state">{{ learnStateText }}</span>
      </router-link>

      <router-link to="/lineups" class="section-card">
        <div class="section-icon">⚔️</div>
        <h3 class="section-title">阵容库</h3>
        <p class="section-desc">第三方来源公布的阵容聚合快照（登顶率 / 前三率 / 样本量），按来源分组陈列并标注口径。</p>
        <span class="section-state">
          {{ counts ? `已收录 ${counts.lineups ?? 0} 条快照` : '建设中' }}
        </span>
      </router-link>

      <router-link to="/library" class="section-card">
        <div class="section-icon">📚</div>
        <h3 class="section-title">资料库</h3>
        <p class="section-desc">英雄、棋手、装备、效果牌、天赋、阵营与机制的统一资料检索，每条事实只维护一份。</p>
        <span class="section-state">建设中</span>
      </router-link>

      <router-link to="/updates" class="section-card">
        <div class="section-icon">📜</div>
        <h3 class="section-title">版本动态</h3>
        <p class="section-desc">官方版本调整，以及本站受影响的内容清单（哪些课程与手册需要重新核对）。</p>
        <span class="section-state">建设中</span>
      </router-link>
    </div>

    <!-- API 不可达如实呈现 -->
    <div v-if="apiError" class="state-panel is-error">
      <p>数据源状态加载失败：{{ apiError }}</p>
      <button class="retry-btn" @click="loadStatus">重新加载</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchDataStatus, type DataSourceStatus } from '../api'

// 首页数字全部来自真实 /api/v1/data-status：
// 内容计数为 0 或接口缺失时如实展示“暂无/建设中”，不做兜底数字。
const sources = ref<DataSourceStatus[]>([])
const counts = ref<Record<string, number> | null>(null)
const apiError = ref<string | null>(null)

// 已核实版本：M2 内容底座（game_versions）上线前如实为“暂无”。
const verifiedVersionText = computed(() => '暂无（版本库建设中）')
const contentCountText = computed(() => '0（建设中）')
const learnStateText = computed(() => '课程建设中（M3 上线首批课程）')

async function loadStatus() {
  apiError.value = null
  try {
    const status = await fetchDataStatus()
    sources.value = status.sources
    counts.value = status.counts
  } catch (err: any) {
    apiError.value = err?.message || '未知错误'
    sources.value = []
    counts.value = null
  }
}

onMounted(loadStatus)
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.home-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero-card {
  @include glass-panel;
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 24px;
  padding: 28px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

.hero-badge {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: $radius-sm;
  background: $color-primary-light;
  color: $color-primary;
  border: 1px solid rgba(37, 99, 235, 0.3);
}

.hero-title {
  margin: 10px 0 8px;
  font-size: 24px;
  font-weight: 800;
  color: $text-primary;
  line-height: 1.4;
}

.hero-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.8;
  color: $text-secondary;
}

.hero-actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
  flex-wrap: wrap;
}

.hero-btn {
  font-size: 14px;
  font-weight: 600;
  padding: 10px 22px;
  border-radius: $radius-md;
  border: 1px solid $border-color;
  color: $text-secondary;
  text-decoration: none;
  transition: $transition-base;

  &:hover {
    border-color: $border-color-hover;
    color: $text-primary;
  }

  &.is-primary {
    background: $color-primary;
    border-color: $color-primary;
    color: #ffffff;

    &:hover {
      background: $color-primary-dark;
      color: #ffffff;
    }
  }
}

.hero-side {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.status-block {
  @include flex-column;
  gap: 3px;
  padding: 12px 14px;
  background: $bg-tertiary;
  border: 1px solid $border-color;
  border-radius: $radius-md;

  .status-label {
    font-size: 11px;
    color: $text-muted;
  }

  .status-val {
    font-size: 15px;
    font-weight: 700;
    color: $text-primary;
  }
}

.notice-card {
  font-size: 12px;
  line-height: 1.8;
  color: $text-secondary;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: $radius-md;
  padding: 10px 16px;

  strong {
    color: $text-primary;
  }
}

.section-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;

  @media (max-width: 960px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
}

.section-card {
  @include glass-panel;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  text-decoration: none;
}

.section-icon {
  font-size: 26px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: $text-primary;
}

.section-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: $text-muted;
  flex: 1;
}

.section-state {
  font-size: 11px;
  color: $color-primary;
  background: $color-primary-light;
  border: 1px solid rgba(37, 99, 235, 0.25);
  align-self: flex-start;
  padding: 2px 10px;
  border-radius: $radius-sm;
}

.state-panel {
  @include glass-panel;
  padding: 32px 24px;
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
</style>
