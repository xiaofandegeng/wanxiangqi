<template>
  <header class="app-header">
    <div class="header-container">
      <div class="header-main-row">
        <!-- 品牌标识 -->
        <div class="brand-section">
          <router-link to="/" class="brand-link">
            <div class="brand-icon">
              <span class="icon-text">弈</span>
            </div>
            <div class="brand-text">
              <h1 class="brand-title">王者万象棋 · 钻石预测平台</h1>
              <span class="brand-subtitle">王牌对决 6 席位胜率推演与博弈期望决策</span>
            </div>
          </router-link>
        </div>

        <!-- 右侧状态与操作 -->
        <div class="header-right">
          <button class="live-radar-trigger-btn" @click="openRadar">
            <span class="live-beacon"></span>
            <span class="btn-text">极速开盘雷达</span>
          </button>

          <div class="api-status-badge" :class="{ 'is-connected': isBackendOnline }">
            <span class="status-dot"></span>
            <span class="badge-text">{{ isBackendOnline ? 'API 已接通' : 'API 离线' }}</span>
          </div>
        </div>
      </div>

      <!-- 导航导航栏 (聚焦王牌对决钻石预测与数据依据) -->
      <nav class="nav-links-bar">
        <router-link to="/" class="nav-item" active-class="is-active">
          💎 王牌钻石预测
        </router-link>
        <router-link to="/roster" class="nav-item" active-class="is-active">
          📊 选手战力天梯
        </router-link>
        <router-link to="/lineups" class="nav-item" active-class="is-active">
          ⚔️ 阵容克制与依据
        </router-link>
        <router-link to="/archive" class="nav-item" active-class="is-active">
          📋 历史事实流水
        </router-link>
        <router-link to="/models/backtest" class="nav-item" active-class="is-active">
          📈 模型评估与回测
        </router-link>
        <router-link to="/admin/verify" class="nav-item" active-class="is-active">
          🔍 证据核验工作台
        </router-link>
      </nav>
    </div>

    <!-- 挂载全局实战雷达弹窗 -->
    <LiveRadarModal ref="radarModalRef" />
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import LiveRadarModal from './LiveRadarModal.vue'
import { fetchDataStatus } from '../api'

const radarModalRef = ref<InstanceType<typeof LiveRadarModal> | null>(null)
const isBackendOnline = ref(false)

function openRadar() {
  radarModalRef.value?.openModal()
}

onMounted(async () => {
  try {
    const status = await fetchDataStatus()
    isBackendOnline.value = Boolean(status)
  } catch {
    isBackendOnline.value = false
  }
})
</script>

<style lang="scss" scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  width: 100%;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.header-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 16px;
  display: flex;
  flex-direction: column;
}

.header-main-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 58px;
}

.brand-section {
  display: flex;
  align-items: center;
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.brand-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #2563eb;
  display: flex;
  align-items: center;
  justify-content: center;

  .icon-text {
    font-size: 16px;
    font-weight: 800;
    color: #ffffff;
  }
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-title {
  font-size: 16px;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  line-height: 1.2;
}

.brand-subtitle {
  font-size: 11px;
  color: #64748b;

  @media (max-width: 600px) {
    display: none;
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.live-radar-trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #2563eb;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: #dbeafe;
  }

  .live-beacon {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #2563eb;
  }

  @media (max-width: 480px) {
    .btn-text {
      font-size: 11px;
    }
  }
}

.api-status-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  font-size: 11px;
  color: #64748b;

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #94a3b8;
  }

  &.is-connected {
    background: #f0fdf4;
    border-color: #bbf7d0;
    color: #166534;

    .status-dot {
      background: #16a34a;
    }
  }

  @media (max-width: 640px) {
    display: none;
  }
}

.nav-links-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 8px;
  margin-top: -2px;

  &::-webkit-scrollbar {
    display: none;
  }
}

.nav-item {
  font-size: 13px;
  font-weight: 500;
  color: #475569;
  padding: 5px 12px;
  border-radius: 6px;
  text-decoration: none;
  white-space: nowrap;
  transition: all 0.15s ease;

  &:hover {
    color: #0f172a;
    background: #f1f5f9;
  }

  &.is-active {
    color: #2563eb;
    background: #eff6ff;
    font-weight: 600;
  }
}
</style>
