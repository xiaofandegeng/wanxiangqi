<template>
  <div class="support-bar-container">
    <div class="support-bar-header">
      <span class="bar-title">{{ titleText }}</span>
      <span class="bar-value" :class="{ 'is-unknown': isUnknown }">{{ valueText }}</span>
    </div>
    <div class="support-track" :class="{ 'is-unknown-track': isUnknown }">
      <div 
        v-if="!isUnknown"
        class="support-fill"
        :style="{ width: fillWidth }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    type?: 'relative_to_max' | 'share_of_total' | 'unknown'
    value?: number | null
    label?: string
  }>(),
  {
    type: 'relative_to_max',
    value: null,
    label: ''
  }
)

const isUnknown = computed(() => {
  return props.type === 'unknown' || props.value === null || props.value === undefined
})

const titleText = computed(() => {
  if (props.label) return props.label
  if (props.type === 'relative_to_max') return '相对最高支持热度'
  if (props.type === 'share_of_total') return '支持票总份额占比'
  return '支持热度'
})

const valueText = computed(() => {
  if (isUnknown.value) return '暂无数据'
  // 严格显示真实百分比，0 必须是 0.0% (F12)
  return `${(props.value as number).toFixed(1)}%`
})

const fillWidth = computed(() => {
  if (isUnknown.value) return '0%'
  const val = Math.min(Math.max(props.value as number, 0), 100)
  return `${val}%`
})
</script>

<style lang="scss" scoped>
.support-bar-container {
  width: 100%;
}

.support-bar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #64748b;
  margin-bottom: 4px;

  .bar-value {
    font-weight: 700;
    color: #2563eb;

    &.is-unknown {
      color: #94a3b8;
      font-weight: 500;
    }
  }
}

.support-track {
  width: 100%;
  height: 6px;
  background: #e2e8f0;
  border-radius: 3px;
  overflow: hidden;

  &.is-unknown-track {
    background: repeating-linear-gradient(
      -45deg,
      #f1f5f9,
      #f1f5f9 4px,
      #e2e8f0 4px,
      #e2e8f0 8px
    );
  }
}

.support-fill {
  height: 100%;
  background: #2563eb;
  border-radius: 3px;
  transition: width 0.3s ease;
}
</style>
