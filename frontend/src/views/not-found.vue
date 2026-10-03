<template>
  <div class="not-found-view">
    <div class="nf-card">
      <template v-if="retiredHit">
        <div class="nf-badge is-retired">功能已退役</div>
        <h2 class="nf-title">该页面已随项目转型下线</h2>
        <p class="nf-desc">
          「<span class="font-mono">{{ retiredHit.path }}</span>」属于原赛事与玩家战绩数据站功能。
          本站已于 2026-10-03 转型为<strong>王者万象棋阵容研习站</strong>，
          赛事收录、选手战绩画像、已核验对局流水、实时预测与个人战绩导入等功能已整体退役，
          相关数据按归档流程处置，不再对外提供。
        </p>
        <p class="nf-desc">
          你现在可以进入<strong>新手学堂</strong>从零开始学阵容，或在<strong>阵容库</strong>查看第三方来源公布的真实阵容快照。
        </p>
      </template>
      <template v-else>
        <div class="nf-badge">404</div>
        <h2 class="nf-title">页面不存在</h2>
        <p class="nf-desc">
          地址「<span class="font-mono">{{ currentPath }}</span>」在本站没有对应页面。
          可能是链接拼写有误，或该内容尚未上线。
        </p>
      </template>

      <div class="nf-actions">
        <router-link to="/" class="nf-btn is-primary">返回首页</router-link>
        <router-link to="/learn" class="nf-btn">新手学堂</router-link>
        <router-link to="/lineups" class="nf-btn">阵容库</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

// 旧 v2–v5 对外路由前缀：退役即删除（不在路由表注册），
// 此处仅用于把误入旧链接的用户引导到转型后的对应新区。
const RETIRED_PREFIXES: Array<{ prefix: string; label: string }> = [
  { prefix: '/events', label: '赛事场次' },
  { prefix: '/players', label: '选手画像' },
  { prefix: '/roster', label: '选手一览' },
  { prefix: '/archive', label: '对局流水' },
  { prefix: '/matches', label: '对局流水' },
  { prefix: '/admin/verify', label: '证据核验工作台' },
  { prefix: '/admin/personal-import', label: '个人战绩导入' },
  { prefix: '/models/backtest', label: '预测模型状态' }
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
  font-size: 13px;
  line-height: 1.8;
  color: $text-secondary;

  strong {
    color: $text-primary;
  }
}

.font-mono {
  font-family: $font-mono;
  font-size: 12px;
  background: $bg-tertiary;
  padding: 1px 6px;
  border-radius: $radius-sm;
}

.nf-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.nf-btn {
  font-size: 13px;
  font-weight: 600;
  padding: 8px 18px;
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
</style>
