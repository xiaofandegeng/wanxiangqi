<template>
  <header class="app-header">
    <div class="header-container">
      <div class="brand-section">
        <router-link to="/" class="brand-link">
          <div class="brand-icon">
            <span class="icon-text">弈</span>
          </div>
          <div class="brand-text">
            <h1 class="brand-title">王者万象棋 · 王牌对决</h1>
            <span class="brand-subtitle">钻石狂潮赛前画像与决策辅助</span>
          </div>
        </router-link>
      </div>

      <nav class="nav-links">
        <router-link to="/" class="nav-item" active-class="is-active">
          今日对决
        </router-link>
        <router-link to="/models/backtest" class="nav-item" active-class="is-active">
          模型与回测
        </router-link>
        <router-link to="/admin/verify" class="nav-item" active-class="is-active">
          证据链核验
        </router-link>
      </nav>

      <div class="header-right">
        <div class="disclaimer-badge">
          <span class="status-dot"></span>
          <span class="badge-text">结算公式验证中 · 暂不推导EV</span>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
// 无状态纯展示导航头
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  width: 100%;
  height: 64px;
  background: rgba(11, 15, 25, 0.85);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid $border-color;
}

.header-container {
  max-width: 1280px;
  height: 100%;
  margin: 0 auto;
  padding: 0 24px;
  @include flex-between;
}

.brand-section {
  @include flex-center;
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-icon {
  width: 36px;
  height: 36px;
  border-radius: $radius-md;
  background: linear-gradient(135deg, $color-gold-light 0%, $color-gold-dark 100%);
  @include flex-center;
  box-shadow: $glow-gold;

  .icon-text {
    font-size: 18px;
    font-weight: 800;
    color: #111827;
  }
}

.brand-text {
  @include flex-column;
}

.brand-title {
  font-size: 16px;
  font-weight: 700;
  color: $text-primary;
  letter-spacing: 0.5px;
}

.brand-subtitle {
  font-size: 11px;
  color: $text-secondary;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nav-item {
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: $text-secondary;
  border-radius: $radius-md;
  transition: $transition-base;

  &:hover {
    color: $text-primary;
    background: rgba(255, 255, 255, 0.05);
  }

  &.is-active {
    color: $color-gold;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.2);
  }
}

.header-right {
  display: flex;
  align-items: center;
}

.disclaimer-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: $radius-full;
  font-size: 12px;
  color: $color-gold-light;

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: $color-gold;
    box-shadow: 0 0 8px $color-gold;
    animation: pulse 2s infinite;
  }
}

@keyframes pulse {
  0% {
    opacity: 0.5;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
  100% {
    opacity: 0.5;
    transform: scale(0.9);
  }
}

@media (max-width: 768px) {
  .brand-subtitle, .disclaimer-badge {
    display: none;
  }
}
</style>
