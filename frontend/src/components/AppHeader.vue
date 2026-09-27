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
        <button class="live-radar-trigger-btn" @click="openRadar">
          <span class="live-beacon"></span>
          <span class="btn-text">模拟器实时雷达</span>
        </button>

        <div class="disclaimer-badge is-verified">
          <span class="status-dot"></span>
          <span class="badge-text">硬门槛 B 已核验 · 开启 EV 情景模拟</span>
        </div>
      </div>
    </div>

    <!-- 挂载全局实时雷达弹窗 -->
    <LiveRadarModal ref="radarModalRef" />
  </header>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import LiveRadarModal from './LiveRadarModal.vue'

const radarModalRef = ref<InstanceType<typeof LiveRadarModal> | null>(null)

function openRadar() {
  radarModalRef.value?.openModal()
}
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
  gap: 12px;
}

.live-radar-trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(6, 182, 212, 0.2) 100%);
  border: 1px solid rgba(16, 185, 129, 0.4);
  border-radius: $radius-full;
  font-size: 13px;
  font-weight: 700;
  color: #a7f3d0;
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.2);
  transition: $transition-base;

  &:hover {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.3) 0%, rgba(6, 182, 212, 0.3) 100%);
    border-color: #34d399;
    transform: translateY(-1px);
    box-shadow: 0 0 16px rgba(16, 185, 129, 0.35);
  }

  .live-beacon {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 8px #10b981;
    animation: beaconPulse 1.5s infinite;
  }
}

@keyframes beaconPulse {
  0% { transform: scale(0.9); opacity: 0.6; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.6; }
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

  &.is-verified {
    background: rgba(16, 185, 129, 0.1);
    border-color: rgba(16, 185, 129, 0.35);
    color: $color-success;

    .status-dot {
      background-color: $color-success;
      box-shadow: 0 0 8px $color-success;
    }
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
