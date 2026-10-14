<template>
  <header class="app-header">
    <div class="header-container">
      <div class="header-main-row">
        <!-- 品牌标识（v6：阵容研习站） -->
        <div class="brand-section">
          <router-link to="/" class="brand-link">
            <div class="brand-icon">
              <span class="icon-text">弈</span>
            </div>
            <div class="brand-text">
              <h1 class="brand-title">王者万象棋 · 阵容研习站</h1>
              <span class="brand-subtitle">新手教学 · 阵容研习 · 资料与版本</span>
            </div>
          </router-link>
        </div>

        <!-- 右侧状态（管理入口不进新手主导航，折叠为次级链接） -->
        <div class="header-right">
          <router-link to="/admin/sources" class="admin-entry-link">管理</router-link>

          <div class="api-status-badge" :class="{ 'is-connected': isBackendOnline }">
            <span class="status-dot"></span>
            <span class="badge-text">{{ isBackendOnline ? '内容服务正常' : '内容服务暂不可用' }}</span>
          </div>
        </div>
      </div>

      <!-- 全站搜索（§验收：一次命中阵容/英雄/规则/课程；已熟悉玩家可直接搜阵容） -->
      <div class="header-search-row">
        <GlobalSearch />
        <p v-if="storageNotice" class="storage-note">{{ storageNotice }}</p>
      </div>

      <!-- 公开主导航（v6 §3 固定五项） -->
      <nav class="nav-links-bar">
        <router-link to="/" class="nav-item" active-class="is-active">
          首页
        </router-link>
        <router-link to="/learn" class="nav-item" active-class="is-active">
          新手学堂
        </router-link>
        <router-link to="/lineups" class="nav-item" active-class="is-active">
          阵容库
        </router-link>
        <router-link to="/library" class="nav-item" active-class="is-active">
          资料库
        </router-link>
        <router-link to="/updates" class="nav-item" active-class="is-active">
          版本动态
        </router-link>
      </nav>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchLearnPath } from '../api'
import GlobalSearch from './GlobalSearch.vue'
import { storageNotice } from '../composables/local-prefs'

const isBackendOnline = ref(false)

onMounted(async () => {
  try {
    const status = await fetchLearnPath()
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

.header-search-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;

  .storage-note {
    margin: 0;
    font-size: 11px;
    color: #92400e;
    background: #fef3c7;
    border: 1px solid #fde68a;
    border-radius: 6px;
    padding: 3px 8px;
  }
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

.admin-entry-link {
  font-size: 12px;
  color: #64748b;
  text-decoration: none;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid transparent;

  &:hover {
    color: #0f172a;
    background: #f1f5f9;
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

@media (min-width: 1000px) {
 .header-container { display: grid; grid-template-columns: minmax(0, 1fr) 340px; column-gap: 24px; }
 .header-main-row { grid-column: 1; }
 .header-search-row { grid-column: 2; grid-row: 1; justify-content: center; padding: 0; }
 .nav-links-bar { grid-column: 1 / -1; }
}
.brand-icon { background: #35635b; }
.nav-item.is-active { background: #edf3f0; color: #35635b; }
</style>
