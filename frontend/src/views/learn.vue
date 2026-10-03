<template>
  <div class="learn-view">
    <div class="page-header-card">
      <h2 class="page-title">新手学堂</h2>
      <p class="page-desc">
        六个学习阶段带你从「第一次进入游戏」走到「独立变阵与复盘」。
        每门课程标注适用版本与来源；规则与数值只写经过第一方资料核实的内容。
      </p>
    </div>

    <div v-if="isLoading" class="state-panel">正在加载学习路径...</div>

    <div v-else-if="loadError" class="state-panel is-error">
      <p>学习路径加载失败：{{ loadError }}</p>
      <button class="empty-action-btn" @click="loadPath">重新加载</button>
    </div>

    <template v-else>
      <!-- 学习阶段路线：课程来自 /api/v1/learn 已发布课程；无课程阶段如实「暂无课程」 -->
      <div class="stage-list">
        <div v-for="stage in stageCards" :key="stage.key" class="stage-card">
          <div class="stage-head">
            <span class="stage-index font-mono">{{ stage.letter }}</span>
            <h3 class="stage-title">{{ stage.title }}</h3>
            <span class="stage-status" :class="{ 'has-lessons': stage.lessons.length > 0 }">
              {{ stage.lessons.length > 0 ? `${stage.lessons.length} 门课程` : '暂无课程' }}
            </span>
          </div>
          <p class="stage-goal">
            <strong>学完能做什么：</strong>{{ stage.goal }}
          </p>

          <div v-if="stage.lessons.length" class="lesson-list">
            <router-link
              v-for="lesson in stage.lessons"
              :key="lesson.id"
              :to="`/learn/${lesson.slug}`"
              class="lesson-row"
            >
              <span class="lesson-title">
                {{ lesson.title }}
                <span v-if="lesson.hasOpenRecheck" class="recheck-chip">待版本复核</span>
              </span>
              <span class="lesson-meta">
                <span v-if="lesson.gameVersion" class="font-mono">{{ lesson.gameVersion.versionId }}</span>
                <span v-if="lesson.prerequisites.length" class="prereq-count">
                  先修 {{ lesson.prerequisites.length }} 门
                </span>
              </span>
            </router-link>
          </div>
        </div>
      </div>

      <!-- 如实空态：不放假课程链接，不冒充已有内容 -->
      <div v-if="total === 0" class="state-panel empty-state">
        <p>首批课程正在建设中（随 M3 最小教学闭环上线）</p>
        <span class="sub-hint">
          课程上线前，可先到阵容库查看第三方来源公布的真实阵容快照，熟悉阵容的基本构成与统计口径。
        </span>
        <router-link to="/lineups" class="empty-action-btn">先逛阵容库</router-link>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchLearnPath, type LessonSummary } from '../api'

// 六阶段教学框架来自 v6 任务书 §4（产品结构，非游戏事实）。
// 课程清单来自内容底座 /api/v1/learn（仅已发布课程；缺席阶段如实为空，不造占位课程）。
const STAGE_TITLES: Array<{ letter: string; title: string; goal: string }> = [
  { letter: 'A', title: '第一次进入游戏', goal: '看懂界面，完成买牌、打出、查看技能等基础操作。' },
  { letter: 'B', title: '认识成长和资源', goal: '解释为何现在买牌、刷新、升级或保留资源。' },
  { letter: 'C', title: '认识卡牌效果', goal: '能判断触发条件和操作顺序，而非只看战力数字。' },
  { letter: 'D', title: '学会过渡稳血', goal: '不为追最终阵容而空场或无预算搜牌。' },
  { letter: 'E', title: '玩会第一套阵容', goal: '独立打完一局并解释主要决策。' },
  { letter: 'F', title: '学会变阵与复盘', goal: '用条件改变计划，找出下一局要改的一件事。' }
]

const stages = ref<Array<{ stage: string; lessons: LessonSummary[] }>>([])
const total = ref(0)
const isLoading = ref(true)
const loadError = ref<string | null>(null)

async function loadPath() {
  isLoading.value = true
  loadError.value = null
  try {
    const res = await fetchLearnPath()
    stages.value = res.stages
    total.value = res.total
  } catch (err: any) {
    loadError.value = err?.message || '未知错误'
    stages.value = []
    total.value = 0
  } finally {
    isLoading.value = false
  }
}

const stageCards = computed(() =>
  STAGE_TITLES.map(meta => {
    const remote = stages.value.find(s => s.stage === meta.letter)
    return {
      key: `stage-${meta.letter}`,
      letter: meta.letter,
      title: meta.title,
      goal: meta.goal,
      lessons: remote ? remote.lessons : []
    }
  })
)

onMounted(loadPath)
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

  &.has-lessons {
    color: $color-primary;
    background: $color-primary-light;
    border-color: rgba(37, 99, 235, 0.3);
  }
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

.lesson-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lesson-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: $bg-tertiary;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  text-decoration: none;
  transition: $transition-base;

  &:hover {
    border-color: rgba(37, 99, 235, 0.4);
    background: $color-primary-light;
  }
}

.lesson-title {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.recheck-chip {
  font-size: 10px;
  font-weight: 600;
  color: $color-primary;
  background: $color-primary-light;
  border: 1px solid rgba(37, 99, 235, 0.35);
  padding: 0 6px;
  border-radius: $radius-sm;
}

.lesson-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: $text-muted;

  .font-mono {
    background: rgba(0, 0, 0, 0.04);
    padding: 0 6px;
    border-radius: $radius-sm;
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

  &.is-error {
    color: $color-danger;
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
  background: transparent;
  cursor: pointer;

  &:hover {
    background: $color-primary-light;
  }
}
</style>
