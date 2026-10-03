<template>
  <div class="updates-view">
    <div class="page-header-card">
      <h2 class="page-title">版本动态</h2>
      <p class="page-desc">
        官方版本调整公告，以及本站受影响的内容清单：哪些课程、阵容手册与资料需要重新核对。
        版本条目以官方公告为唯一来源，不做推测性改动汇总。
      </p>
    </div>

    <!-- M1：版本库随 M2 内容底座上线；如实空态 -->
    <div class="state-panel">
      <h3 class="state-title">版本动态建设中</h3>
      <p class="state-desc">
        游戏版本库与官方调整公告收录随 M2 内容底座上线。
        上线前本页不会展示任何版本条目或影响分析。
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
// M1 空态视图：patch_notes / content_impacts API 随 M2 内容底座接入。
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
</style>
