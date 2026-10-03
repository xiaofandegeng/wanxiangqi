<template>
  <div class="updates-view">
    <div class="page-header-card">
      <h2 class="page-title">版本动态</h2>
      <p class="page-desc">
        官方版本调整公告，以及本站受影响的内容清单：哪些课程、阵容手册与资料需要重新核对。
        版本条目以官方公告为唯一来源，不做推测性改动汇总。
      </p>
    </div>

    <div v-if="isLoading" class="state-panel">正在加载版本动态…</div>

    <div v-else-if="loadError" class="state-panel is-error">
      <p>版本动态加载失败：{{ loadError }}</p>
      <button class="state-btn" @click="loadUpdates">重新加载</button>
    </div>

    <template v-else>
      <!-- 版本登记列表（status CURRENT/HISTORICAL 如实呈现） -->
      <div v-if="versions.length" class="section-card">
        <h3 class="section-title">游戏版本登记</h3>
        <div class="version-table-wrap">
          <table class="version-table">
            <thead>
              <tr>
                <th>版本</th>
                <th>状态</th>
                <th>生效时间</th>
                <th>已发布公告</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="v in versions" :key="v.versionId">
                <td class="font-mono">{{ v.versionId }}</td>
                <td>
                  <span class="version-status" :class="v.status === 'CURRENT' ? 'is-current' : 'is-historical'">
                    {{ v.status === 'CURRENT' ? '当前版本' : '历史版本' }}
                  </span>
                </td>
                <td>{{ formatTime(v.effectiveAt) }}</td>
                <td>{{ v.publishedNotes ?? 0 }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="section-hint">
          版本登记以官方依据（officialBasis）为准；「当前版本」决定新发布内容的默认版本约束。
        </p>
      </div>

      <!-- 官方更新公告列表 -->
      <div class="section-card">
        <h3 class="section-title">官方更新公告</h3>
        <div v-if="!updates.length" class="section-empty">
          暂无已发布的官方更新公告（公告录入以官方来源为唯一依据，未核实不发布）
        </div>
        <div v-else class="update-list">
          <router-link
            v-for="u in updates"
            :key="u.id"
            :to="`/updates/${u.slug}`"
            class="update-card"
          >
            <div class="update-head">
              <span class="update-version font-mono">{{ u.versionId }}</span>
              <span class="update-title">{{ u.title }}</span>
            </div>
            <p v-if="u.summary" class="update-summary">{{ u.summary }}</p>
            <div class="update-meta">
              <span v-if="u.officialPublishedAt">官方发布于 {{ formatTime(u.officialPublishedAt) }}</span>
              <a
                v-if="u.officialUrl"
                :href="u.officialUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="official-link"
                @click.stop
              >官方原文 ↗</a>
            </div>
          </router-link>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchUpdates, fetchVersions, type UpdateNote, type GameVersion } from '../api'

const versions = ref<GameVersion[]>([])
const updates = ref<UpdateNote[]>([])
const isLoading = ref(true)
const loadError = ref<string | null>(null)

async function loadUpdates() {
  isLoading.value = true
  loadError.value = null
  try {
    const [v, u] = await Promise.all([fetchVersions(), fetchUpdates()])
    versions.value = v
    updates.value = u
  } catch (err: any) {
    loadError.value = err?.message || '未知错误'
    versions.value = []
    updates.value = []
  } finally {
    isLoading.value = false
  }
}

function formatTime(isoStr: string | null | undefined) {
  if (!isoStr) return '—'
  try {
    return new Date(isoStr).toLocaleDateString('zh-CN')
  } catch {
    return isoStr
  }
}

onMounted(loadUpdates)
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.updates-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header-card {
  @include glass-panel;
  padding: 20px 24px;
}

.page-title {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 700;
  color: $text-primary;
}

.page-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: $text-muted;
  max-width: 760px;
}

.state-panel {
  @include glass-panel;
  padding: 40px 28px;
  text-align: center;
  color: $text-secondary;
  font-size: 14px;

  &.is-error {
    color: $color-danger;
  }
}

.state-btn {
  margin-top: 12px;
  font-size: 13px;
  font-weight: 600;
  color: $color-primary;
  padding: 8px 18px;
  border: 1px solid rgba(37, 99, 235, 0.35);
  border-radius: $radius-md;
  background: transparent;
  cursor: pointer;

  &:hover {
    background: $color-primary-light;
  }
}

.section-card {
  @include glass-panel;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: $text-primary;
}

.section-hint {
  margin: 0;
  font-size: 11px;
  color: $text-muted;
}

.section-empty {
  font-size: 13px;
  color: $text-muted;
  background: $bg-tertiary;
  border: 1px dashed $border-color;
  border-radius: $radius-md;
  padding: 14px;
}

.font-mono {
  font-family: $font-mono;
  font-size: 12px;
  background: $bg-tertiary;
  padding: 1px 6px;
  border-radius: $radius-sm;
}

.version-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.version-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;

  th {
    padding: 8px 12px;
    color: $text-muted;
    font-weight: 600;
    border-bottom: 1px solid $border-color;
    white-space: nowrap;
  }

  td {
    padding: 10px 12px;
    border-bottom: 1px solid $bg-tertiary;
    color: $text-secondary;
  }
}

.version-status {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: $radius-sm;

  &.is-current {
    color: #059669;
    background: rgba(5, 150, 105, 0.08);
    border: 1px solid rgba(5, 150, 105, 0.3);
  }

  &.is-historical {
    color: $text-muted;
    background: $bg-tertiary;
    border: 1px solid $border-color;
  }
}

.update-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.update-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  background: $bg-tertiary;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  text-decoration: none;
  transition: $transition-base;

  &:hover {
    border-color: rgba(37, 99, 235, 0.4);
    background: $color-primary-light;
  }
}

.update-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.update-version {
  font-size: 11px;
  color: $color-primary;
  background: $color-primary-light;
  border: 1px solid rgba(37, 99, 235, 0.3);
}

.update-title {
  font-size: 14px;
  font-weight: 700;
  color: $text-primary;
}

.update-summary {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: $text-secondary;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.update-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: $text-muted;
  flex-wrap: wrap;
}

.official-link {
  color: $color-primary;
  text-decoration: none;
  font-weight: 600;

  &:hover {
    text-decoration: underline;
  }
}
</style>
