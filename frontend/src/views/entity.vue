<template>
  <div class="entity-view">
    <div class="nav-back-row">
      <router-link to="/library" class="back-link">← 返回资料库</router-link>
    </div>

    <!-- M1：实体详情未上线，如实呈现；不渲染任何未核实的机制/数值 -->
    <div class="state-panel">
      <h3 class="state-title">实体档案建设中</h3>
      <p class="state-desc">
        「<span class="font-mono">{{ kind }}/{{ slug }}</span>」的实体档案随 M2 内容底座上线。
        档案内容（机制事实、版本差异、应用阵容、关联课程）须经来源核查与审核后发布。
      </p>
      <router-link to="/library" class="state-btn">返回资料库</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const kind = computed(() => (route.params.kind as string) || '')
const slug = computed(() => (route.params.slug as string) || '')
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.entity-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.back-link {
  font-size: 13px;
  color: $color-primary;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

.state-panel {
  @include glass-panel;
  padding: 48px 32px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.state-title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: $text-primary;
}

.state-desc {
  margin: 0;
  max-width: 520px;
  font-size: 13px;
  line-height: 1.8;
  color: $text-secondary;
}

.font-mono {
  font-family: $font-mono;
  font-size: 12px;
  background: $bg-tertiary;
  padding: 1px 6px;
  border-radius: $radius-sm;
}

.state-btn {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  color: $color-primary;
  text-decoration: none;
  padding: 8px 18px;
  border: 1px solid rgba(37, 99, 235, 0.35);
  border-radius: $radius-md;

  &:hover {
    background: $color-primary-light;
  }
}
</style>
