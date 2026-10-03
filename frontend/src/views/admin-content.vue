<template>
  <div class="admin-content-view">
    <div class="page-header-card">
      <h2 class="page-title">内容管理</h2>
      <p class="page-desc">
        课程、资料、阵容手册与版本条目的草稿、审核、发布与版本复核。
        内容模型（草稿→审核→发布、修订版本、引用完整性校验）随 M2 内容底座上线。
      </p>
    </div>

    <!-- M1：内容管理 API 未上线，如实呈现；不提供假编辑入口 -->
    <div class="state-panel">
      <h3 class="state-title">内容管理后台建设中</h3>
      <p class="state-desc">
        内容草稿/审核/发布工作台随 M2 内容底座上线。
        当前可用的管理能力是<strong>来源与素材管理</strong>（数据源同步、素材原件上传与核验台账）。
      </p>
      <router-link to="/admin/sources" class="state-btn">前往来源与素材管理</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
// M1 空态视图：内容管理 API（/api/v1/admin/content/*）随 M2 内容底座接入。
// 素材/来源侧管理能力已在 /admin/sources 落地，此处只做指引，不重复实现。
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.admin-content-view {
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
  max-width: 560px;
  font-size: 13px;
  line-height: 1.8;
  color: $text-secondary;

  strong {
    color: $text-primary;
  }
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
