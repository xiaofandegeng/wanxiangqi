<template>
  <div class="lineup-roster-view">
    <!-- 顶栏：第三方来源语义说明（不宣称任何我方未验证口径） -->
    <div class="page-header-card">
      <div class="header-main-row">
        <div class="title-wrap">
          <div class="badge-row">
            <span class="category-badge">第三方阵容聚合快照</span>
            <span class="basis-badge">来源公布什么就展示什么</span>
          </div>
          <h2 class="page-title">阵容聚合快照参考</h2>
          <p class="page-desc">
            本页陈列从第三方来源同步的<strong>全服阵容聚合快照</strong>（登顶率 / 前三率 / 样本量等均为来源公布口径），
            仅供流派环境参考，<strong>不代表任何个人真实战绩，也不构成任何对局决策依据</strong>。
            来源未公布的字段（梯级 / 窗口说明等）如实标注“未公布”。
          </p>
        </div>

        <div class="snapshot-meta-box">
          <span class="meta-label">快照采集时间:</span>
          <span class="meta-val font-mono">{{ formatTime(dataAsOf) }}</span>
        </div>
      </div>

      <!-- 来源口径提示（来自服务端 sourceNotice） -->
      <div v-if="sourceNotice" class="source-notice">{{ sourceNotice }}</div>

      <!-- 核心指标摘要（全部由已收录快照真实计算） -->
      <div class="stats-summary-grid">
        <div class="summary-item">
          <span class="item-num font-mono">{{ lineups.length }}</span>
          <span class="item-label">已收录快照</span>
        </div>
        <div class="summary-item">
          <span class="item-num font-mono">{{ distinctSources }}</span>
          <span class="item-label">来源数量</span>
        </div>
        <div class="summary-item">
          <span class="item-num font-mono">{{ staleCount }}</span>
          <span class="item-label">标记为过期的快照</span>
          <span class="item-hint">以来源数据截止/采集时间为准</span>
        </div>
        <div class="summary-item">
          <span class="item-num font-mono">{{ missingFieldCount }}</span>
          <span class="item-label">存在未公布字段的快照</span>
          <span class="item-hint">未知如实展示，不做兜底填充</span>
        </div>
      </div>
    </div>

    <!-- 失败 / 空态如实呈现 -->
    <div v-if="loadError" class="state-panel is-error">
      <p>阵容快照加载失败：{{ loadError }}</p>
      <button class="retry-btn" @click="loadLineups">重新加载</button>
    </div>

    <template v-else>
      <!-- 筛选与搜索工具条 -->
      <div class="filter-toolbar">
        <div class="sort-tabs">
          <span class="sort-lbl">排序方式:</span>
          <button
            class="sort-tab-btn"
            :class="{ active: sortField === 'winRate' }"
            @click="sortField = 'winRate'"
          >
            登顶率
          </button>
          <button
            class="sort-tab-btn"
            :class="{ active: sortField === 'top3Rate' }"
            @click="sortField = 'top3Rate'"
          >
            前三率
          </button>
          <button
            class="sort-tab-btn"
            :class="{ active: sortField === 'avgRank' }"
            @click="sortField = 'avgRank'"
          >
            平均名次
          </button>
          <button
            class="sort-tab-btn"
            :class="{ active: sortField === 'sampleCount' }"
            @click="sortField = 'sampleCount'"
          >
            样本规模
          </button>
        </div>

        <div class="search-box">
          <input
            v-model="searchKey"
            type="text"
            class="search-input"
            placeholder="搜索阵容名称 / 棋手..."
          />
        </div>
      </div>

      <!-- 阵容快照表格（字段为空 → 如实标注） -->
      <div class="table-card">
        <div v-if="loading" class="state-panel">正在加载阵容快照...</div>

        <div v-else-if="sortedLineups.length === 0" class="state-panel empty-state">
          <p>{{ searchKey ? '没有匹配的阵容快照' : '暂无已收录的阵容快照' }}</p>
          <span class="sub-hint">第三方来源同步成功后，快照将在此呈现（当前来源状态见数据源面板）。</span>
        </div>

        <!-- 复验3：按来源分组陈列 —— 不同来源样本口径互不可比，不跨来源混排总榜 -->
        <section v-for="grp in sourceGroups" :key="grp.sourceId" class="source-group">
          <header class="source-group-header">
            <div class="source-group-title">
              <span class="source-tag font-mono">{{ grp.sourceId }}</span>
              <strong class="source-group-name">{{ grp.sourceName }}</strong>
              <span class="source-status-badge" :class="{ 'is-ready': grp.sourceStatus === 'READY' }">
                {{ grp.sourceStatus || '未知状态' }}
              </span>
              <!-- v4 W4：来源公布的页面级快照版本徽标（未公布如实标注，不造默认版本） -->
              <span class="snapshot-version-chip font-mono" :class="{ 'is-missing': !grp.snapshotVersion }">
                {{ grp.snapshotVersion ? `快照版本 ${grp.snapshotVersion}` : '快照版本未公布' }}
              </span>
            </div>
            <span class="source-group-count">本来源快照 {{ grp.items.length }} 条 · 组内独立排序</span>
          </header>
          <!-- v4 W4：抓取行为与数据内容分列 —— 最后抓取成功（同步动作时刻）≠ 来源数据更新（页面公布的版本/窗口） -->
          <div class="source-sync-row">
            <span class="sync-item">
              <span class="sync-label">最后抓取成功:</span>
              <span class="font-mono">{{ grp.lastSuccessAt ? formatTime(grp.lastSuccessAt) : '从未成功' }}</span>
            </span>
            <span class="sync-item">
              <span class="sync-label">来源数据更新（页面公布）:</span>
              <span>版本 <span class="font-mono">{{ grp.snapshotVersion || '未公布' }}</span> · 窗口 {{ grp.windowText || '未公布' }}</span>
            </span>
            <span v-if="grp.lastError" class="sync-item is-error">
              <span class="sync-label">最近一次抓取错误:</span>
              <span>{{ grp.lastError }}</span>
            </span>
          </div>

          <div class="table-responsive">
            <table class="lineup-table">
              <thead>
                <tr>
                  <th class="th-rank">序号</th>
                  <th class="th-name">阵容名称</th>
                  <th class="th-commander">主棋手</th>
                  <th class="th-samples">样本量</th>
                  <th class="th-winrate">登顶率</th>
                  <th class="th-top3">前三率</th>
                  <th class="th-avg">平均名次</th>
                  <th class="th-window">窗口口径</th>
                  <th class="th-action">快照口径</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="(item, idx) in grp.items" :key="item.id">
                  <tr
                    class="lineup-row"
                    :class="{ 'is-expanded': expandedId === item.id }"
                    @click="toggleExpand(item.id)"
                  >
                    <td class="td-rank">
                      <span class="order-badge">{{ idx + 1 }}</span>
                    </td>
                    <td class="td-name">
                      <div class="lineup-title-cell">
                        <router-link :to="`/lineups/${item.id}`" class="lineup-name" @click.stop>
                          {{ item.lineupName }}
                        </router-link>
                        <span v-if="item.stale" class="stale-tag">已过期</span>
                      </div>
                    </td>
                    <td class="td-commander">
                      <span class="commander-tag">{{ item.commander || '未公布' }}</span>
                    </td>
                    <td class="td-samples font-mono">
                      {{ item.sampleCount != null ? `${item.sampleCount.toLocaleString()} ${item.sampleUnit || '局'}` : '未公布' }}
                    </td>
                    <td class="td-winrate font-mono highlight-gold">{{ formatRate(item.winRate) }}</td>
                    <td class="td-top3 font-mono highlight-cyan">{{ formatRate(item.top3Rate) }}</td>
                    <td class="td-avg font-mono">{{ item.avgRank != null ? item.avgRank.toFixed(2) : '—' }}</td>
                    <td class="td-window">
                      <span class="window-text">{{ item.windowText || '未公布' }}</span>
                    </td>
                    <td class="td-action">
                      <button class="expand-btn">
                        {{ expandedId === item.id ? '收起' : '展开' }}
                      </button>
                    </td>
                  </tr>

                  <!-- 快照口径展开抽屉：只展示来源给出的真实元数据 -->
                  <tr v-if="expandedId === item.id" class="expand-row">
                    <td colspan="9" class="expand-cell">
                    <div class="evidence-panel">
                      <div class="evidence-grid">
                        <div class="evidence-card">
                          <h4 class="ev-title">📎 快照元数据（来源公布字段）</h4>
                          <ul class="meta-list">
                            <li><strong>快照 ID:</strong> <span class="font-mono">{{ item.id }}</span></li>
                            <li><strong>梯级:</strong> {{ item.tier || '未公布（来源不做分级）' }}</li>
                            <li><strong>快照版本:</strong> {{ item.snapshotVersion || '未公布' }}</li>
                            <li><strong>范围:</strong> {{ item.scope || '未公布' }}</li>
                            <li><strong>样本单位:</strong> {{ item.sampleUnit || '未公布' }}</li>
                            <li><strong>比率单位:</strong> {{ item.rateUnit || '未公布（历史快照可能缺失）' }}</li>
                          </ul>
                        </div>
                        <div class="evidence-card">
                          <h4 class="ev-title">🕒 时间口径（采集时间 ≠ 数据截止时间）</h4>
                          <ul class="meta-list">
                            <li><strong>数据截止:</strong> {{ formatTime(item.dataCutoffAt) }}</li>
                            <li><strong>采集时间:</strong> {{ formatTime(item.updatedAt) }}</li>
                            <li v-if="item.windowStart || item.windowEnd">
                              <strong>统计窗口:</strong> {{ formatTime(item.windowStart) }} ~ {{ formatTime(item.windowEnd) }}
                            </li>
                            <li><strong>过期状态:</strong> {{ item.stale == null ? '未知' : (item.stale ? '已过期（距数据截止较久）' : '未过期') }}</li>
                          </ul>
                        </div>
                        <div v-if="item.coreHeroes && item.coreHeroes.length" class="evidence-card full-span">
                          <h4 class="ev-title">🎲 核心弈子（来源标注）</h4>
                          <div class="hero-tags-row">
                            <span v-for="h in item.coreHeroes" :key="h" class="hero-chip">{{ h }}</span>
                          </div>
                        </div>
                      </div>
                      <div class="drawer-foot-note">
                        以上字段全部来自来源快照原始数据；本站不做流派克制推断，不生成任何对局建议。
                      </div>
                    </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { fetchLineupSnapshots, fetchDataStatus, type LineupSnapshot } from '../api'

const lineups = ref<LineupSnapshot[]>([])
const sourceNotice = ref('')
const dataAsOf = ref(new Date().toISOString())
const loading = ref(true)
const loadError = ref<string | null>(null)
const sortField = ref<'winRate' | 'top3Rate' | 'avgRank' | 'sampleCount'>('winRate')
const searchKey = ref('')
const expandedId = ref<string | null>(null)

let loadAbort: AbortController | null = null

const distinctSources = computed(() => new Set(lineups.value.map(l => l.sourceId).filter(Boolean)).size)
const staleCount = computed(() => lineups.value.filter(l => l.stale === true).length)
const missingFieldCount = computed(() =>
  lineups.value.filter(l =>
    l.tier == null || l.windowText == null || l.sampleCount == null ||
    l.winRate == null || l.avgRank == null
  ).length
)

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

// 排序：缺失值沉底（不参与名次比较，如实保留在列表中）
const sortedLineups = computed(() => {
  let list = [...lineups.value]
  if (searchKey.value) {
    const k = searchKey.value.toLowerCase()
    list = list.filter(l =>
      l.lineupName.toLowerCase().includes(k) ||
      (l.commander || '').toLowerCase().includes(k)
    )
  }

  list.sort((a, b) => {
    if (sortField.value === 'avgRank') {
      const av = a.avgRank ?? Number.POSITIVE_INFINITY
      const bv = b.avgRank ?? Number.POSITIVE_INFINITY
      return av - bv
    }
    const key = sortField.value
    const av = (a[key] as number | null) ?? -1
    const bv = (b[key] as number | null) ?? -1
    return bv - av
  })
  return list
})

// 按来源分组（复验3）：不同来源的快照口径互不可比（样本窗口/统计范围各异），
// 不得跨来源混排成一张总榜；各组内独立排序与编号。
// v4 W4：组级页面元信息（快照版本/窗口说明组内一致才展示，多版本并存如实标注）＋
// 同步状态（最后抓取成功时刻来自 data-status，与页面公布的版本/窗口分列）
const sourceSyncMap = ref(new Map<string, { lastSuccessAt: string | null; lastError: string | null }>())

const sourceGroups = computed(() => {
  const groups = new Map<string, { sourceId: string; sourceName: string; sourceStatus: string | null; sourceType: string | null; items: LineupSnapshot[] }>()
  for (const l of sortedLineups.value) {
    if (!groups.has(l.sourceId)) {
      groups.set(l.sourceId, {
        sourceId: l.sourceId,
        sourceName: l.sourceName || l.sourceId,
        sourceStatus: l.sourceStatus ?? null,
        sourceType: l.sourceType ?? null,
        items: []
      })
    }
    groups.get(l.sourceId)!.items.push(l)
  }
  return [...groups.values()].map(g => {
    const versions = [...new Set(g.items.map(i => i.snapshotVersion ?? null))]
    const windows = [...new Set(g.items.map(i => i.windowText ?? null))]
    const sync = sourceSyncMap.value.get(g.sourceId)
    return {
      ...g,
      snapshotVersion: versions.length === 1 ? versions[0] : (versions.length > 1 ? '多版本并存' : null),
      windowText: windows.length === 1 ? windows[0] : (windows.length > 1 ? '多窗口并存' : null),
      lastSuccessAt: sync?.lastSuccessAt ?? null,
      lastError: sync?.lastError ?? null
    }
  })
})

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
    const res = await fetchLineupSnapshots(loadAbort.signal)
    lineups.value = res.lineups
    sourceNotice.value = res.sourceNotice
    dataAsOf.value = res.dataAsOf
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    loadError.value = err?.message || '未知错误'
    lineups.value = []
  } finally {
    if (!loadAbort?.signal.aborted) loading.value = false
  }
  // v4 W4：同步状态（最后抓取成功/最近错误）随快照一并拉取 —— 失败不阻断快照陈列，分列如实展示
  try {
    const status = await fetchDataStatus(loadAbort.signal)
    const map = new Map<string, { lastSuccessAt: string | null; lastError: string | null }>()
    for (const s of status.sources) {
      map.set(s.sourceId || s.id, { lastSuccessAt: s.lastSuccessAt ?? null, lastError: s.lastError ?? null })
    }
    sourceSyncMap.value = map
  } catch {
    sourceSyncMap.value = new Map()
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

.table-card {
  @include glass-panel;
  padding: 20px;
}

.table-responsive {
  width: 100%;
  overflow-x: auto;
}

.lineup-table {
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
    vertical-align: middle;
  }

  .lineup-row {
    cursor: pointer;
    transition: background 0.15s;

    &:hover {
      background: $bg-card-hover;
    }

    &.is-expanded {
      background: rgba(245, 158, 11, 0.04);
    }
  }

  .highlight-gold { color: $color-gold; }
  .highlight-cyan { color: $color-cyan; }
}

.lineup-title-cell {
  display: flex;
  align-items: center;
  gap: 8px;

  .lineup-name {
    font-weight: 700;
    color: $text-primary;
    text-decoration: none;

    &:hover {
      color: $color-gold;
      text-decoration: underline;
    }
  }
}

.stale-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(107, 114, 128, 0.2);
  color: $text-muted;
  border: 1px solid rgba(107, 114, 128, 0.35);
}

.source-tag {
  font-size: 11px;
  color: $text-secondary;
}

/* 复验3：来源分组容器 —— 组间隔 + 组头（来源身份 + 状态徽标 + 组内计数） */
.source-group {
  & + .source-group {
    margin-top: 26px;
    padding-top: 22px;
    border-top: 1px dashed $border-color;
  }
}

.source-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.source-group-title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.source-group-name {
  font-size: 15px;
  color: $text-primary;
}

.source-status-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
  color: $text-muted;
  background: rgba(107, 114, 128, 0.12);
  border: 1px solid rgba(107, 114, 128, 0.3);

  &.is-ready {
    color: #059669;
    background: rgba(5, 150, 105, 0.08);
    border-color: rgba(5, 150, 105, 0.35);
  }
}

.source-group-count {
  font-size: 11px;
  color: $text-muted;
}

// v4 W4：来源公布的页面级快照版本徽标
.snapshot-version-chip {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  color: #2563eb;
  background: rgba(37, 99, 235, 0.08);
  border: 1px solid rgba(37, 99, 235, 0.3);

  &.is-missing {
    color: $text-muted;
    background: rgba(107, 114, 128, 0.12);
    border-color: rgba(107, 114, 128, 0.3);
  }
}

// v4 W4：抓取行为（最后抓取成功）与数据内容（页面公布版本/窗口）分列
.source-sync-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  padding: 6px 2px 10px;
  font-size: 11px;
  color: $text-secondary;

  .sync-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;

    .sync-label {
      color: $text-muted;
    }

    &.is-error {
      color: #b91c1c;
    }
  }
}

.commander-tag {
  font-size: 12px;
  color: $text-secondary;
}

.window-text {
  font-size: 11px;
  color: $text-muted;
}

.order-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  color: $text-secondary;
  background: $bg-tertiary;
}

.expand-btn {
  font-size: 11px;
  padding: 3px 10px;
  border: 1px solid $border-color-hover;
  background: transparent;
  color: $text-secondary;
  border-radius: $radius-sm;
  cursor: pointer;

  &:hover {
    border-color: rgba(245, 158, 11, 0.4);
    color: $color-gold;
  }
}

.expand-row .expand-cell {
  background: #f8fafc;
  padding: 0;

  .evidence-panel {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
}

.evidence-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

.evidence-card {
  background: $bg-tertiary;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  padding: 14px;

  &.full-span {
    grid-column: 1 / -1;
  }

  .ev-title {
    font-size: 13px;
    font-weight: 700;
    color: $text-primary;
    margin: 0 0 10px 0;
  }
}

.meta-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;

  li {
    font-size: 12px;
    color: $text-secondary;
    line-height: 1.5;

    strong {
      color: $text-muted;
    }
  }
}

.hero-tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.hero-chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: $radius-sm;
  background: rgba(2, 132, 199, 0.08);
  color: $color-cyan;
  border: 1px solid rgba(2, 132, 199, 0.35);
}

.drawer-foot-note {
  font-size: 11px;
  color: $text-muted;
  border-top: 1px dashed $border-color;
  padding-top: 10px;
}
</style>
