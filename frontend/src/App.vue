<template>
  <div class="app-layout">
    <AppHeader />
    <main class="main-content">
      <router-view />
    </main>
    <footer class="app-footer">
      <div class="footer-container">
        <p class="footer-copy">王牌对决研究台</p>
        <p class="footer-note">来源样本与已核验赛果分别呈现 · 返奖率不是胜率 · 概率模型尚未校准</p>
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
  padding: 24px 16px;
  box-sizing: border-box;

  @media (max-width: 480px) {
    padding: 16px 8px;
  }
}

.app-footer {
  width: 100%;
  padding: 24px 0;
  border-top: 1px solid #e2e8f0;
  background: #ffffff;
  text-align: center;
}

.footer-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 16px;
}

.footer-copy {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 4px;
}

.footer-note {
  font-size: 11px;
  color: #64748b;
}
</style>
