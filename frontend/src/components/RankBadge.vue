<template>
  <div class="rank-badge" :class="rankTierClass">
    <span class="rank-text">{{ rankText }}</span>
    <span v-if="rankScore !== undefined" class="rank-score">{{ rankScore }}★</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  rankText: string
  rankScore?: number
}>()

const rankTierClass = computed(() => {
  if (props.rankText.includes('宗师')) return 'tier-grandmaster'
  if (props.rankText.includes('无双')) return 'tier-peerless'
  if (props.rankText.includes('王者')) return 'tier-king'
  return 'tier-default'
})
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.rank-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: $radius-sm;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid transparent;

  .rank-text {
    letter-spacing: 0.2px;
  }

  .rank-score {
    padding: 0 4px;
    border-radius: 2px;
    background: rgba(0, 0, 0, 0.25);
    font-size: 10px;
  }

  &.tier-grandmaster {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(180, 83, 9, 0.2) 100%);
    color: $color-gold-light;
    border-color: rgba(245, 158, 11, 0.35);
  }

  &.tier-peerless {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(109, 40, 217, 0.2) 100%);
    color: $color-purple-light;
    border-color: rgba(139, 92, 246, 0.35);
  }

  &.tier-king {
    background: linear-gradient(135deg, rgba(6, 182, 212, 0.2) 0%, rgba(14, 116, 144, 0.2) 100%);
    color: $color-cyan-light;
    border-color: rgba(6, 182, 212, 0.35);
  }

  &.tier-default {
    background: rgba(255, 255, 255, 0.08);
    color: $text-secondary;
    border-color: $border-color;
  }
}
</style>
