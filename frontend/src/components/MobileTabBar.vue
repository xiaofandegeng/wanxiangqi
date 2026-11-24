<template>
  <nav class="mobile-tabbar" aria-label="移动端底部导航">
    <router-link to="/" exact-active-class="is-active" class="tab-item">
      <span class="tab-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      </span>
      <span class="tab-label">总览</span>
    </router-link>

    <router-link to="/research/matches" active-class="is-active" class="tab-item">
      <span class="tab-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      </span>
      <span class="tab-label">赛果</span>
    </router-link>

    <router-link to="/research/players" active-class="is-active" class="tab-item">
      <span class="tab-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </span>
      <span class="tab-label">选手</span>
    </router-link>

    <router-link to="/research/roster" active-class="is-active" class="tab-item">
      <span class="tab-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
          <path d="M8 7h8" />
          <path d="M8 11h6" />
        </svg>
      </span>
      <span class="tab-label">档案</span>
    </router-link>

    <router-link to="/research/predict" active-class="is-active" class="tab-item">
      <span class="tab-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
      </span>
      <span class="tab-label">推演</span>
    </router-link>
  </nav>
</template>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;

.mobile-tabbar {
  display: none;

  @media (max-width: $bp-md) {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 200;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    align-items: center;
    min-height: $mobile-tabbar-height;
    padding: 6px 6px calc(6px + env(safe-area-inset-bottom));
    background-color: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-top: 1px solid $border-subtle;
    box-shadow: 0 -4px 16px rgba(18, 38, 32, 0.06);
  }
}

.tab-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 4px 2px;
  color: $text-muted;
  border-radius: $radius-md;
  transition: $transition-fast;
  user-select: none;

  &:active {
    transform: scale(0.95);
  }

  &.is-active {
    color: $color-primary;

    .tab-icon {
      background-color: $color-primary-light;
    }

    .tab-label {
      font-weight: 700;
    }
  }
}

.tab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 28px;
  border-radius: $radius-full;
  transition: $transition-base;

  svg {
    width: 19px;
    height: 19px;
  }
}

.tab-label {
  font-size: 11px;
  line-height: 1.2;
  font-weight: 500;
}
</style>
