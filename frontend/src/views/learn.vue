<template>
  <div class="learn-view">
    <div class="page-header-card">
      <h2 class="page-title">新手学堂</h2>
      <p class="page-desc">
        六个学习阶段带你从「第一次进入游戏」走到「独立变阵与复盘」。
        每门课程标注适用版本与来源；规则与数值只写经过第一方资料核实的内容。
      </p>
    </div>

    <!-- 学习阶段路线（教学框架；课程内容分阶段上线） -->
    <div class="stage-list">
      <div v-for="(stage, idx) in STAGES" :key="stage.key" class="stage-card">
        <div class="stage-head">
          <span class="stage-index font-mono">{{ String.fromCharCode(65 + idx) }}</span>
          <h3 class="stage-title">{{ stage.title }}</h3>
          <span class="stage-status">课程建设中</span>
        </div>
        <p class="stage-goal">
          <strong>学完能做什么：</strong>{{ stage.goal }}
        </p>
      </div>
    </div>

    <!-- 如实的空态：不放假课程链接，不冒充已有内容 -->
    <div class="state-panel empty-state">
      <p>首批课程正在建设中（随 M3 最小教学闭环上线）</p>
      <span class="sub-hint">
        课程上线前，可先到阵容库查看第三方来源公布的真实阵容快照，熟悉阵容的基本构成与统计口径。
      </span>
      <router-link to="/lineups" class="empty-action-btn">先逛阵容库</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
// 六阶段教学框架来自 v6 任务书 §4（产品结构，非游戏事实）。
// M1 阶段仅呈现框架与如实“建设中”状态；课程内容（规则图解/操作顺序/案例/练习）
// 须待 M2 内容底座 + M3 最小教学闭环逐课落地，未上线前不展示任何课程正文。
const STAGES = [
  {
    key: 'a-first-game',
    title: '第一次进入游戏',
    goal: '看懂界面，完成买牌、打出、查看技能等基础操作。'
  },
  {
    key: 'b-growth-resources',
    title: '认识成长和资源',
    goal: '解释为何现在买牌、刷新、升级或保留资源。'
  },
  {
    key: 'c-card-effects',
    title: '认识卡牌效果',
    goal: '能判断触发条件和操作顺序，而非只看战力数字。'
  },
  {
    key: 'd-transition',
    title: '学会过渡稳血',
    goal: '不为追最终阵容而空场或无预算搜牌。'
  },
  {
    key: 'e-first-lineup',
    title: '玩会第一套阵容',
    goal: '独立打完一局并解释主要决策。'
  },
  {
    key: 'f-adapt-review',
    title: '学会变阵与复盘',
    goal: '用条件改变计划，找出下一局要改的一件事。'
  }
]
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.learn-view {
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

.stage-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.stage-card {
  @include glass-panel;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stage-head {
  @include flex-between;
  gap: 10px;
}

.stage-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: $radius-md;
  background: $color-primary-light;
  color: $color-primary;
  font-size: 14px;
  font-weight: 800;
}

.stage-title {
  margin: 0;
  flex: 1;
  font-size: 15px;
  font-weight: 700;
  color: $text-primary;
}

.stage-status {
  font-size: 10px;
  color: $text-muted;
  background: $bg-tertiary;
  border: 1px solid $border-color;
  padding: 2px 8px;
  border-radius: $radius-sm;
  white-space: nowrap;
}

.stage-goal {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: $text-secondary;

  strong {
    color: $text-muted;
  }
}

.state-panel {
  @include glass-panel;
  padding: 40px 24px;
  text-align: center;
  color: $text-secondary;
  font-size: 14px;

  .sub-hint {
    display: block;
    margin-top: 8px;
    font-size: 12px;
    color: $text-muted;
  }
}

.empty-action-btn {
  display: inline-block;
  margin-top: 14px;
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
