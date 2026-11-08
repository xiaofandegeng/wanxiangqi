<template>
  <header class="app-header">
    <div class="header-inner">
      <router-link class="brand-link" to="/">
        <span class="brand-mark">弈</span>
        <div class="brand-titles">
          <strong class="brand-name">王牌对决研究台</strong>
          <small class="brand-sub">王者万象棋 · 真实赛果与赛前研究</small>
        </div>
      </router-link>

      <nav class="nav-links" aria-label="主导航">
        <router-link to="/" exact-active-class="is-active" class="nav-item">总览</router-link>
        <router-link to="/research/matches" active-class="is-active" class="nav-item">场次赛果</router-link>
        <router-link to="/research/players" active-class="is-active" class="nav-item">选手统计</router-link>
        <router-link to="/research/roster" active-class="is-active" class="nav-item">玩法档案</router-link>
        <router-link to="/research/predict" active-class="is-active" class="nav-item">赛前研究</router-link>
        <router-link to="/research/sources" active-class="is-active" class="nav-item">来源资料</router-link>
        <router-link to="/research/import" active-class="is-active" class="nav-item">数据录入</router-link>
      </nav>

      <div class="header-actions">
        <router-link class="source-admin-pill" to="/admin/sources">
          <span class="dot"></span>
          原件与来源
        </router-link>
      </div>
    </div>
  </header>
</template>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background-color: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid $border-subtle;
  transition: $transition-base;
}

.header-inner {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 12px 24px;
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 12px;
  user-select: none;
  flex-shrink: 0;
}

.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, $color-primary 0%, $color-primary-dark 100%);
  color: $text-inverse;
  font-weight: 700;
  font-size: 19px;
  border-radius: $radius-md;
  box-shadow: 0 2px 4px rgba(30, 70, 58, 0.2);
  line-height: 1;
}

.brand-titles {
  display: flex;
  flex-direction: column;
}

.brand-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: $text-primary;
}

.brand-sub {
  font-size: 11px;
  color: $text-muted;
  letter-spacing: 0.2px;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.nav-item {
  display: inline-flex;
  align-items: center;
  padding: 7px 12px;
  font-size: 13px;
  font-weight: 500;
  color: $text-secondary;
  border-radius: $radius-sm;
  white-space: nowrap;
  transition: $transition-base;

  &:hover {
    color: $color-primary;
    background-color: $color-primary-light;
  }

  &.is-active {
    color: $color-primary;
    background-color: $color-primary-light;
    font-weight: 600;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.source-admin-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: $text-secondary;
  background: $bg-subtle;
  border: 1px solid $border-color;
  border-radius: $radius-full;
  transition: $transition-base;

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: $color-success;
  }

  &:hover {
    border-color: $border-hover;
    background-color: $bg-surface;
    color: $color-primary;
  }
}

@media (max-width: 980px) {
  .header-inner {
    flex-wrap: wrap;
    padding: 10px 16px;
    gap: 12px;
  }

  .nav-links {
    order: 3;
    width: 100%;
    padding: 4px 0;
  }

  .nav-item {
    padding: 6px 10px;
    font-size: 12.5px;
  }
}
</style>
