<template>
  <div class="app-layout">
    <AppHeader />
    <main class="main-content">
      <router-view />
    </main>
    <footer class="app-footer">
      <div class="footer-container">
        <p class="footer-copy">王者万象棋 · 王牌对决数据站 (v1.0-MVP)</p>
        <p class="footer-note">严守数据真实性 · 赛前画像切片防泄漏 · 杜绝虚构接口</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import AppHeader from './components/AppHeader.vue'
</script>

<style lang="scss" scoped>
@use './styles/variables.scss' as *;
@use './styles/mixins.scss' as *;

.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: $bg-primary;
}

.main-content {
  flex: 1;
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  padding: 24px;
}

.app-footer {
  width: 100%;
  padding: 24px 0;
  border-top: 1px solid $border-color;
  background: rgba(11, 15, 25, 0.9);
  text-align: center;
}

.footer-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px;
}

.footer-copy {
  font-size: 13px;
  font-weight: 600;
  color: $text-secondary;
  margin-bottom: 4px;
}

.footer-note {
  font-size: 11px;
  color: $text-muted;
}
</style>
