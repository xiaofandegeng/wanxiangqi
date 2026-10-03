<template>
  <div class="library-view">
    <div class="page-header-card">
      <h2 class="page-title">资料库</h2>
      <p class="page-desc">
        英雄、棋手、装备、效果牌、天赋、阵营与机制的统一资料检索。
        每类实体一份档案、每条事实只维护一份，并标注适用版本与来源。
      </p>
    </div>

    <!-- M1：实体档案库随 M2 内容底座上线；如实空态，不放假实体卡片 -->
    <div class="state-panel">
      <h3 class="state-title">资料库建设中</h3>
      <p class="state-desc">
        实体档案（英雄 / 棋手 / 装备 / 效果牌 / 天赋 / 阵营 / 机制）正在随内容底座建设。
        技能数值、商店概率、经验表等必须经过当前版本第一方资料核对后才会写入，
        在此之前不会展示任何未核实数值。
      </p>
      <router-link to="/lineups" class="state-btn">先逛阵容库</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
// M1 空态视图：资料实体 API（/api/v1/library/*）随 M2 内容底座接入。
// 本页在 M1 不发起任何请求、不展示占位实体 —— 占位内容不得宣称完成。
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.library-view {
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
