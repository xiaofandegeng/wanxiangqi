<template>
  <div class="app-layout">
    <AppHeader />
    <main class="main-content">
      <router-view />
    </main>
    <footer class="app-footer">
      <div class="footer-container">
        <p class="footer-copy">王牌对决研究台 · 王者万象棋</p>
        <p class="footer-note">来源样本与已核验赛果分别呈现 · 返奖率不是胜率 · 概率模型尚未校准</p>
      </div>
    </footer>
    <MobileTabBar />
  </div>
</template>

<script setup lang="ts">
import AppHeader from './components/AppHeader.vue'
import MobileTabBar from './components/MobileTabBar.vue'
</script>

<style lang="scss" scoped>
@use './styles/variables.scss' as *;
@use './styles/mixins.scss' as *;

.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: $bg-canvas;
}

.main-content {
  flex: 1;
  max-width: 1240px;
  width: 100%;
  margin: 0 auto;
  padding: 28px 20px;
  box-sizing: border-box;

  @media (max-width: $bp-md) {
    padding: 16px 12px 24px;
  }
}

.app-footer {
  width: 100%;
  padding: 24px 0;
  border-top: 1px solid $border-subtle;
  background: $bg-surface;
  text-align: center;

  @media (max-width: $bp-md) {
    padding: 20px 0 calc($mobile-tabbar-height + env(safe-area-inset-bottom) + 20px);
  }
}

.footer-container {
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 20px;
}

.footer-copy {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: 4px;
}

.footer-note {
  font-size: 12px;
  color: $text-muted;
}
</style>
