<template>
  <span class="status-tag" :class="statusClass">
    <span class="indicator-dot"></span>
    <span class="status-label">{{ labelText }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { EventStatus } from '../types/event'

const props = defineProps<{
  status: EventStatus
}>()

const statusMeta: Record<EventStatus, { label: string; className: string }> = {
  PENDING_COLLECTION: { label: '待收集', className: 'status-pending' },
  PENDING_VERIFY: { label: '校验中', className: 'status-verify' },
  PREDICTABLE: { label: '可预测', className: 'status-predictable' },
  BET_CLOSED: { label: '比赛中', className: 'status-closed' },
  SETTLED: { label: '已结算', className: 'status-settled' },
  AUDITED: { label: '已复核', className: 'status-audited' }
}

const labelText = computed(() => statusMeta[props.status]?.label || props.status)
const statusClass = computed(() => statusMeta[props.status]?.className || '')
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: $radius-full;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  border: 1px solid transparent;

  .indicator-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  &.status-pending {
    background: rgba(107, 114, 128, 0.15);
    color: $text-secondary;
    border-color: rgba(107, 114, 128, 0.3);
    .indicator-dot { background: $text-secondary; }
  }

  &.status-verify {
    background: rgba(245, 158, 11, 0.12);
    color: $color-warning;
    border-color: rgba(245, 158, 11, 0.3);
    .indicator-dot { background: $color-warning; }
  }

  &.status-predictable {
    background: rgba(16, 185, 129, 0.15);
    color: $color-success;
    border-color: rgba(16, 185, 129, 0.3);
    .indicator-dot { 
      background: $color-success;
      box-shadow: 0 0 6px $color-success;
    }
  }

  &.status-closed {
    background: rgba(59, 130, 246, 0.15);
    color: $color-info;
    border-color: rgba(59, 130, 246, 0.3);
    .indicator-dot { background: $color-info; }
  }

  &.status-settled {
    background: rgba(139, 92, 246, 0.15);
    color: $color-purple-light;
    border-color: rgba(139, 92, 246, 0.3);
    .indicator-dot { background: $color-purple-light; }
  }

  &.status-audited {
    background: rgba(245, 158, 11, 0.15);
    color: $color-gold-light;
    border-color: rgba(245, 158, 11, 0.35);
    .indicator-dot { 
      background: $color-gold-light;
      box-shadow: 0 0 6px $color-gold;
    }
  }
}
</style>
