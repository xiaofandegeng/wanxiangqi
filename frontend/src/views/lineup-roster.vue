<template>
  <div class="lineup-roster-view">
    <!-- 顶栏：阵容手册语义（教学实体为根，统计为快照子对象） -->
    <div class="page-header-card">
      <div class="header-main-row">
        <div class="title-wrap">
          <div class="badge-row">
            <span class="category-badge">阵容手册库</span>
            <span class="basis-badge">每套阵容一份手册 · 统计按来源口径原样挂接</span>
          </div>
          <h2 class="page-title">阵容研习库</h2>
          <p class="page-desc">
            这里陈列经过来源核查与审核发布的<strong>阵容手册</strong>（定阵条件、阶段操作、稳血成型、
            技能与站位、实战案例）。第三方来源公布的<strong>聚合统计</strong>（登顶率 / 前三率 / 样本量）
            经人工映射后作为手册的参考子对象陈列，口径原样保留、不跨来源平均，
            <strong>不代表任何个人真实战绩，也不构成对局决策依据</strong>。
          </p>
        </div>

        <div class="snapshot-meta-box">
          <span class="meta-label">列表刷新时间:</span>
          <span class="meta-val font-mono">{{ formatTime(dataAsOf) }}</span>
        </div>
      </div>

      <!-- 统计口径提示（来自服务端 statsNotice） -->
      <div v-if="statsNotice" class="source-notice">{{ statsNotice }}</div>

      <!-- 手册库摘要（全部由已发布手册真实计算） -->
      <div class="stats-summary-grid">
        <div class="summary-item">
          <span class="item-num font-mono">{{ manuals.length }}</span>
          <span class="item-label">已发布阵容手册</span>
        </div>
        <div class="summary-item">
          <span class="item-num font-mono">{{ newbieFitCount }}</span>
          <span class="item-label">标注新手友好的手册</span>
          <span class="item-hint">按手册标注的难度与理由，非胜率评分</span>
        </div>
        <div class="summary-item">
          <span class="item-num font-mono">{{ withSnapshots }}</span>
          <span class="item-label">挂接来源统计的手册</span>
          <span class="item-hint">未匹配来源快照的手册如实显示「暂无统计」</span>
        </div>
        <div class="summary-item">
          <span class="item-num font-mono">{{ openRecheckCount }}</span>
          <span class="item-label">待版本复核的手册</span>
          <span class="item-hint">新版本激活后旧版本内容待核对</span>
        </div>
      </div>
    </div>

    <!-- 失败 / 空态如实呈现 -->
    <div v-if="loadError" class="state-panel is-error">
      <p>阵容手册库加载失败：{{ loadError }}</p>
      <button class="retry-btn" @click="loadLineups">重新加载</button>
    </div>

    <template v-else>
      <!-- 筛选工具条 -->
      <div class="filter-toolbar">
        <div class="sort-tabs">
          <span class="sort-lbl">筛选:</span>
          <button class="sort-tab-btn" :class="{ active: onlyNewbieFit }" @click="onlyNewbieFit = !onlyNewbieFit">
            仅看新手友好（难度=低）
          </button>
        </div>

        <div class="search-box">
          <input
            v-model="searchKey"
            type="text"
            class="search-input"
            placeholder="搜索手册名称 / 棋手 / 构成英雄..."
          />
        </div>
      </div>

      <!-- 手册列表 -->
      <div class="manual-list-card">
        <div v-if="loading" class="state-panel">正在加载阵容手册...</div>

        <div v-else-if="filteredManuals.length === 0" class="state-panel empty-state">
          <p>{{ searchKey || onlyNewbieFit ? '没有匹配的阵容手册' : '暂无已发布的阵容手册' }}</p>
          <span class="sub-hint">
            阵容手册须经来源核查与审核发布；手册上线前，可先到新手学堂了解阵容学习路径。
          </span>
        </div>

        <article v-for="m in filteredManuals" :key="m.id" class="manual-card">
          <div class="manual-main">
            <div class="manual-title-row">
              <router-link :to="`/lineups/${m.slug}`" class="manual-name">{{ m.displayName }}</router-link>
              <span class="difficulty-badge" :class="difficultyClass(m.difficulty)">
                {{ difficultyLabel(m.difficulty) }}
              </span>
              <span v-if="m.hasOpenRecheck" class="recheck-tag">待版本复核</span>
            </div>
            <p v-if="m.oneLineSummary" class="manual-summary">{{ m.oneLineSummary }}</p>

            <div class="manual-meta-row">
              <span v-if="m.commander" class="meta-chip">
                棋手：<strong>{{ m.commander.displayName || m.commander.id }}</strong>
              </span>
              <span v-if="m.gameVersion" class="meta-chip">
                适用版本：<span class="font-mono">{{ m.gameVersion.versionId }}</span>
              </span>
              <span class="meta-chip">构成 {{ m.components.length }} 项</span>
              <span v-if="m.publishedAt" class="meta-chip">发布于 {{ formatTime(m.publishedAt) }}</span>
            </div>

            <!-- 构成清单（每张卡的角色与必需性） -->
            <div v-if="m.components.length" class="components-row">
              <span
                v-for="c in m.components"
                :key="c.entityId + c.role"
                class="component-chip"
                :class="{ 'is-required': c.necessity === 'REQUIRED' }"
              >
                {{ c.displayName || c.entityId }}
                <em class="comp-role">{{ roleLabel(c.role) }}</em>
              </span>
            </div>
            <div v-else class="components-empty">构成清单未登记</div>
          </div>

          <!-- 来源统计子对象（口径原样；未映射如实「暂无统计」） -->
          <div class="manual-snapshots">
            <div class="snap-head">来源统计（人工映射挂接）</div>
            <div v-if="m.snapshots.length === 0" class="snap-empty">暂无统计（无已映射的来源快照）</div>
            <div v-for="s in m.snapshots" :key="s.id" class="snap-block">
              <div class="snap-source-row">
                <strong>{{ s.sourceName || s.sourceId }}</strong>
                <span v-if="s.snapshotVersion" class="font-mono snap-ver">{{ s.snapshotVersion }}</span>
              </div>
              <div class="snap-metrics">
                <span class="snap-metric">
                  <em>登顶率</em>
                  <b class="font-mono">{{ formatRate(s.winRate) }}</b>
                </span>
                <span class="snap-metric">
                  <em>前三率</em>
                  <b class="font-mono">{{ formatRate(s.top3Rate) }}</b>
                </span>
                <span class="snap-metric">
                  <em>样本</em>
                  <b class="font-mono">{{ s.sampleCount != null ? s.sampleCount.toLocaleString() : '未公布' }}</b>
                </span>
                <span class="snap-metric">
                  <em>窗口</em>
                  <b>{{ s.windowText || '未公布' }}</b>
                </span>
              </div>
              <div v-if="s.scope || s.dataCutoffAt" class="snap-scope-row">
                <span v-if="s.scope">范围：{{ s.scope }}</span>
                <span v-if="s.dataCutoffAt">数据截止：{{ formatTime(s.dataCutoffAt) }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { fetchLineups, type LineupManual } from '../api'

const manuals = ref<LineupManual[]>([])
const statsNotice = ref('')
const dataAsOf = ref(new Date().toISOString())
const loading = ref(true)
const loadError = ref<string | null>(null)
const searchKey = ref('')
const onlyNewbieFit = ref(false)

let loadAbort: AbortController | null = null

const newbieFitCount = computed(() => manuals.value.filter(m => m.difficulty === 'LOW').length)
const withSnapshots = computed(() => manuals.value.filter(m => m.snapshots.length > 0).length)
const openRecheckCount = computed(() => manuals.value.filter(m => m.hasOpenRecheck === true).length)

const filteredManuals = computed(() => {
  let list = [...manuals.value]
  if (onlyNewbieFit.value) list = list.filter(m => m.difficulty === 'LOW')
  if (searchKey.value) {
    const k = searchKey.value.toLowerCase()
    list = list.filter(m =>
      m.displayName.toLowerCase().includes(k) ||
      (m.commander?.displayName || '').toLowerCase().includes(k) ||
      m.components.some(c => (c.displayName || '').toLowerCase().includes(k))
    )
  }
  return list
})

function difficultyLabel(d: string | null | undefined): string {
  if (d === 'LOW') return '难度：低'
  if (d === 'MEDIUM') return '难度：中'
  if (d === 'HIGH') return '难度：高'
  return '难度未标注'
}

function difficultyClass(d: string | null | undefined): string {
  if (d === 'LOW') return 'is-low'
  if (d === 'MEDIUM') return 'is-medium'
  if (d === 'HIGH') return 'is-high'
  return 'is-unknown'
}

const ROLE_LABELS: Record<string, string> = {
  CORE_OUTPUT: '核心输出',
  FRONTLINE: '前排',
  GROWTH_ENGINE: '成长引擎',
  RESOURCE_ENGINE: '资源引擎',
  PROTECTION: '保护',
  CONTROL: '控制',
  TRANSITION: '过渡',
  SUBSTITUTE: '替补',
  LATE_CEILING: '后期上限'
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role] || role
}

function formatRate(v: number | null | undefined): string {
  if (v === null || v === undefined) return '未公布'
  return `${(v * 100).toFixed(1)}%`
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '未公布'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { hour12: false })
}

async function loadLineups() {
  loadAbort?.abort()
  loadAbort = new AbortController()
  loading.value = true
  loadError.value = null
  try {
    const res = await fetchLineups(loadAbort.signal)
    manuals.value = res.manuals
    statsNotice.value = res.statsNotice
    dataAsOf.value = res.dataAsOf
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    loadError.value = err?.message || '未知错误'
    manuals.value = []
  } finally {
    if (!loadAbort?.signal.aborted) loading.value = false
  }
}

onMounted(loadLineups)
onUnmounted(() => loadAbort?.abort())
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.lineup-roster-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header-card {
  @include glass-panel;
  padding: 20px 24px;
}

.header-main-row {
  @include flex-between;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: wrap;
}

.badge-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;

  .category-badge {
    background: $color-purple-light;
    color: $color-purple;
    border: 1px solid rgba(139, 92, 246, 0.35);
    font-size: 11px;
    font-weight: 700;
    padding: 2px 10px;
    border-radius: $radius-sm;
  }

  .basis-badge {
    background: $bg-tertiary;
    color: $text-muted;
    font-size: 11px;
    padding: 2px 10px;
    border-radius: $radius-sm;
    border: 1px solid $border-color;
  }
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: $text-primary;
  margin: 0 0 6px 0;
}

.page-desc {
  font-size: 13px;
  color: $text-muted;
  margin: 0;
  line-height: 1.7;
  max-width: 760px;

  strong {
    color: $text-secondary;
  }
}

.snapshot-meta-box {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;

  .meta-label {
    color: $text-muted;
  }

  .meta-val {
    color: $text-secondary;
  }
}

.source-notice {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.7;
  color: $text-secondary;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: $radius-md;
  padding: 8px 14px;
}

.stats-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 16px;

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.summary-item {
  @include flex-column;
  gap: 2px;
  padding: 14px;
  background: $bg-tertiary;
  border: 1px solid $border-color;
  border-radius: $radius-md;

  .item-num {
    font-size: 20px;
    font-weight: 800;
    color: $text-primary;
  }

  .item-label {
    font-size: 12px;
    color: $text-muted;
  }

  .item-hint {
    font-size: 10px;
    color: $text-muted;
    opacity: 0.8;
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

  .sub-hint {
    display: block;
    margin-top: 8px;
    font-size: 11px;
    color: $text-muted;
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

.filter-toolbar {
  @include glass-panel;
  @include flex-between;
  padding: 12px 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.sort-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;

  .sort-lbl {
    font-size: 12px;
    color: $text-muted;
  }
}

.sort-tab-btn {
  padding: 5px 12px;
  font-size: 12px;
  border: 1px solid $border-color;
  background: transparent;
  color: $text-secondary;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: $transition-base;

  &:hover {
    border-color: rgba(245, 158, 11, 0.4);
    color: $color-gold;
  }

  &.active {
    background: rgba(245, 158, 11, 0.15);
    border-color: rgba(245, 158, 11, 0.5);
    color: $color-gold;
    font-weight: 700;
  }
}

.search-input {
  padding: 6px 12px;
  font-size: 13px;
  border: 1px solid $border-color-hover;
  border-radius: $radius-sm;
  background: $bg-tertiary;
  color: $text-primary;
  min-width: 220px;
}

.manual-list-card {
  @include glass-panel;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.manual-card {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 18px;
  padding: 18px;
  background: $bg-secondary;
  border: 1px solid $border-color;
  border-radius: $radius-md;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
}

.manual-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.manual-name {
  font-size: 17px;
  font-weight: 700;
  color: $text-primary;
  text-decoration: none;

  &:hover {
    color: $color-gold;
    text-decoration: underline;
  }
}

.difficulty-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: $radius-sm;

  &.is-low {
    background: rgba(5, 150, 105, 0.1);
    color: #059669;
    border: 1px solid rgba(5, 150, 105, 0.35);
  }

  &.is-medium {
    background: rgba(245, 158, 11, 0.1);
    color: $color-gold;
    border: 1px solid rgba(245, 158, 11, 0.35);
  }

  &.is-high {
    background: rgba(220, 38, 38, 0.08);
    color: #b91c1c;
    border: 1px solid rgba(220, 38, 38, 0.3);
  }

  &.is-unknown {
    background: $bg-tertiary;
    color: $text-muted;
    border: 1px solid $border-color;
  }
}

.recheck-tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 3px;
  background: rgba(37, 99, 235, 0.08);
  color: $color-primary;
  border: 1px solid rgba(37, 99, 235, 0.3);
}

.manual-summary {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: $text-secondary;
}

.manual-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;

  .meta-chip {
    font-size: 11px;
    color: $text-muted;
    background: $bg-tertiary;
    border: 1px solid $border-color;
    padding: 2px 8px;
    border-radius: $radius-sm;

    strong {
      color: $text-secondary;
    }
  }
}

.components-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.component-chip {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: $radius-sm;
  background: rgba(2, 132, 199, 0.06);
  color: $text-secondary;
  border: 1px solid rgba(2, 132, 199, 0.25);

  &.is-required {
    background: rgba(2, 132, 199, 0.1);
    border-color: rgba(2, 132, 199, 0.4);
  }

  .comp-role {
    font-style: normal;
    font-size: 10px;
    color: $color-cyan;
    margin-left: 4px;
  }
}

.components-empty {
  margin-top: 12px;
  font-size: 11px;
  color: $text-muted;
}

.manual-snapshots {
  @include flex-column;
  gap: 8px;
  padding: 14px;
  background: $bg-tertiary;
  border: 1px dashed $border-color;
  border-radius: $radius-md;
}

.snap-head {
  font-size: 11px;
  font-weight: 700;
  color: $text-muted;
}

.snap-empty {
  font-size: 12px;
  color: $text-muted;
}

.snap-block {
  @include flex-column;
  gap: 6px;
  padding: 10px;
  background: $bg-secondary;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
}

.snap-source-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: $text-primary;

  .snap-ver {
    font-size: 10px;
    color: #2563eb;
  }
}

.snap-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
}

.snap-metric {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;

  em {
    font-style: normal;
    font-size: 10px;
    color: $text-muted;
  }

  b {
    font-size: 12px;
    color: $text-secondary;
  }
}

.snap-scope-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 10px;
  color: $text-muted;
}
</style>
