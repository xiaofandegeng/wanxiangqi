<template>
  <div class="support-bar-container">
    <div class="support-bar-header">
      <span class="bar-title">赛前支持热度占比</span>
      <span class="bar-value">{{ ratioPercent }}%</span>
    </div>
    <div class="support-track">
      <div 
        class="support-fill"
        :class="{ 'is-high': ratioPercent >= 30, 'is-mid': ratioPercent >= 15 && ratioPercent < 30 }"
        :style="{ width: fillWidth }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    ratioPercent: number
  }>(),
  {
    ratioPercent: 0
  }
)

const fillWidth = computed(() => `${Math.min(Math.max(props.ratioPercent, 0), 100)}%`)
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.support-bar-container {
  width: 100%;
}

.support-bar-header {
  @include flex-between;
  font-size: 11px;
  color: $text-secondary;
  margin-bottom: 4px;

  .bar-value {
    font-weight: 700;
    color: $text-gold;
  }
}

.support-track {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: $radius-full;
  overflow: hidden;
}

.support-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.6) 0%, rgba(6, 182, 212, 0.8) 100%);
  border-radius: $radius-full;
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);

  &.is-mid {
    background: linear-gradient(90deg, #06b6d4 0%, #38bdf8 100%);
  }

  &.is-high {
    background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%);
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.4);
  }
}
</style>
