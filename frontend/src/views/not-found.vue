<template>
  <div class="not-found-view">
    <div class="nf-card">
      <template v-if="retiredHit">
        <div class="nf-badge is-retired">功能已退役</div>
        <h2 class="nf-title">该页面已随产品精简下线</h2>
        <p class="nf-desc">
          「<span class="font-mono">{{ retiredHit.path }}</span>」属于旧版功能。
          当前系统为<strong>王牌对决研究台</strong>，专注于真实赛果整理、选手统计与赛前研究。
        </p>
        <p class="nf-desc">
          请返回首页进入场次赛果与赛前研究工作台。
        </p>
      </template>
      <template v-else>
        <div class="nf-badge">404</div>
        <h2 class="nf-title">页面不存在</h2>
        <p class="nf-desc">
          地址「<span class="font-mono">{{ currentPath }}</span>」在本站没有对应页面。
          可能是链接拼写有误，或该内容已被移除。
        </p>
      </template>

      <div class="nf-actions">
        <router-link to="/" class="nf-btn is-primary">返回总览</router-link>
        <router-link to="/research/matches" class="nf-btn">场次赛果</router-link>
        <router-link to="/research/predict" class="nf-btn">赛前研究</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const RETIRED_PREFIXES: Array<{ prefix: string; label: string }> = [
  { prefix: '/events', label: '赛事场次' },
  { prefix: '/players', label: '选手画像' },
  { prefix: '/roster', label: '选手一览' },
  { prefix: '/archive', label: '对局流水' },
  { prefix: '/matches', label: '对局流水' },
  { prefix: '/admin/verify', label: '证据核验工作台' },
  { prefix: '/admin/personal-import', label: '个人战绩导入' },
  { prefix: '/models/backtest', label: '预测模型状态' },
  { prefix: '/learn', label: '新手学堂' },
  { prefix: '/lineups', label: '阵容库' },
  { prefix: '/library', label: '资料库' },
  { prefix: '/updates', label: '版本动态' },
  { prefix: '/admin/content', label: '内容管理' }
]

const route = useRoute()
const currentPath = computed(() => route.path)
const retiredHit = computed(() => {
  const hit = RETIRED_PREFIXES.find(r => currentPath.value === r.prefix || currentPath.value.startsWith(r.prefix + '/'))
  return hit ? { ...hit, path: currentPath.value } : null
})
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.not-found-view {
  display: flex;
  justify-content: center;
  padding: 40px 0;
}

.nf-card {
  @include glass-panel;
  max-width: 640px;
  width: 100%;
  padding: 40px 32px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.nf-badge {
  align-self: flex-start;
  font-size: 12px;
  font-weight: 700;
  padding: 3px 12px;
  border-radius: $radius-full;
  background: $bg-tertiary;
  color: $text-muted;
  border: 1px solid $border-color;

  &.is-retired {
    background: $color-danger-light;
    color: $color-danger;
    border-color: rgba(220, 38, 38, 0.25);
  }
}

.nf-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: $text-primary;
}

.nf-desc {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: $text-secondary;

  strong {
    color: $color-primary-dark;
  }
}

.font-mono {
  font-family: monospace;
  font-size: 13px;
  background: $bg-tertiary;
  padding: 2px 6px;
  border-radius: $radius-sm;
  color: $text-primary;
}

.nf-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.nf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 600;
  border-radius: $radius-md;
  border: 1px solid $border-color;
  background: #ffffff;
  color: $text-primary;
  text-decoration: none;
  transition: all $transition-base;

  &:hover {
    background: $bg-tertiary;
  }

  &.is-primary {
    background: $color-primary;
    color: #ffffff;
    border-color: $color-primary;

    &:hover {
      background: $color-primary-dark;
    }
  }
}
</style>
