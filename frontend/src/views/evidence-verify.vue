<template>
  <div class="evidence-verify-view">
    <div class="view-header">
      <div>
        <h2 class="view-title">证据链存证与人工核验工作台</h2>
        <p class="view-desc">严格遵循 SHA-256 原图存证 · OCR 候选比对 · 逐字段校验落库</p>
      </div>
      <div class="audit-counter">
        <span class="counter-label">待审核证据</span>
        <span class="counter-num">1 笔待确认</span>
      </div>
    </div>

    <!-- 上传与审核工作台主体 -->
    <div class="verify-layout-grid">
      <!-- 左侧：证据原图与哈希存证 -->
      <div class="verify-panel">
        <div class="panel-top">
          <h3 class="panel-title">原始截图存证 (Evidence)</h3>
          <span class="evidence-type-badge">赛前选拔名单 (15:00 场次)</span>
        </div>

        <div class="screenshot-preview-box">
          <div class="mock-screenshot">
            <div class="screenshot-header">
              <span>王者万象棋 · 王牌对决 房间截图</span>
              <span>14:52:10</span>
            </div>
            <div class="screenshot-content">
              <div class="mock-lobby-item">席位1: 白虹贯日 (万象宗师 II 80★)</div>
              <div class="mock-lobby-item">席位2: 雷霆千军 (无双王者 I 66★)</div>
              <div class="mock-lobby-item">席位3: 凌波微步 (万象宗师 III 90★)</div>
              <div class="mock-lobby-item">席位4: 破晓之星 (最强王者 II 50★)</div>
              <div class="mock-lobby-item">席位5: 飞将巡天 (万象宗师 I 110★)</div>
              <div class="mock-lobby-item">席位6: 山河永寂 (无双王者 III 42★)</div>
            </div>
          </div>
        </div>

        <div class="hash-meta-card">
          <div class="meta-row">
            <span class="label">SHA-256 指纹:</span>
            <span class="hash-val">e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</span>
          </div>
          <div class="meta-row">
            <span class="label">采集时间戳:</span>
            <span class="text-secondary">2026-09-27 14:55:00 CST</span>
          </div>
          <div class="meta-row">
            <span class="label">去重校验:</span>
            <span class="text-success">唯一有效 (无历史碰撞)</span>
          </div>
        </div>
      </div>

      <!-- 右侧：OCR 候选比对与人工确认表单 -->
      <div class="verify-panel">
        <div class="panel-top">
          <h3 class="panel-title">逐席位 OCR 识别校验表</h3>
          <span class="text-gold">关联场次: evt-20260927-1500</span>
        </div>

        <div class="fields-list">
          <div v-for="slot in 6" :key="slot" class="field-item-row">
            <span class="slot-idx">#{{ slot }}</span>
            <div class="field-input-group">
              <label>选手昵称</label>
              <input v-model="verifiedSlots[slot - 1].nickname" type="text" class="input-text" />
            </div>
            <div class="field-input-group">
              <label>段位文本</label>
              <input v-model="verifiedSlots[slot - 1].rankText" type="text" class="input-text" />
            </div>
            <div class="field-input-group small">
              <label>星级/胜点</label>
              <input v-model.number="verifiedSlots[slot - 1].rankScore" type="number" class="input-text" />
            </div>
            <div class="check-box-wrap">
              <span class="ocr-confidence text-success">置信 98%</span>
            </div>
          </div>
        </div>

        <div class="panel-actions">
          <button class="btn-cancel">打回重测</button>
          <button class="btn-confirm" @click="handleConfirm">
            <span v-if="!isConfirmed">确认并发布赛前预测</span>
            <span v-else>✓ 审核已入库 (状态已流转)</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useEventStore } from '../stores/event-store'

const eventStore = useEventStore()
const isConfirmed = ref(false)

const verifiedSlots = ref([
  { slot: 1, nickname: '白虹贯日', rankText: '万象宗师 II', rankScore: 80 },
  { slot: 2, nickname: '雷霆千军', rankText: '无双王者 I', rankScore: 66 },
  { slot: 3, nickname: '凌波微步', rankText: '万象宗师 III', rankScore: 90 },
  { slot: 4, nickname: '破晓之星', rankText: '最强王者 II', rankScore: 50 },
  { slot: 5, nickname: '飞将巡天', rankText: '万象宗师 I', rankScore: 110 },
  { slot: 6, nickname: '山河永寂', rankText: '无双王者 III', rankScore: 42 }
])

function handleConfirm() {
  isConfirmed.value = true
  eventStore.updateEventStatus('evt-20260927-1500', 'PREDICTABLE')
}
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.evidence-verify-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.view-header {
  @include flex-between;
}

.view-title {
  font-size: 24px;
  font-weight: 800;
  color: $text-primary;
}

.view-desc {
  font-size: 13px;
  color: $text-secondary;
  margin-top: 4px;
}

.audit-counter {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: $radius-full;

  .counter-label {
    font-size: 12px;
    color: $text-secondary;
  }
  .counter-num {
    font-size: 12px;
    font-weight: 700;
    color: $color-gold-light;
  }
}

.verify-layout-grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 20px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

.verify-panel {
  @include glass-panel;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-top {
  @include flex-between;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);

  .panel-title {
    font-size: 16px;
    font-weight: 700;
  }
}

.evidence-type-badge {
  font-size: 11px;
  padding: 2px 8px;
  background: rgba(6, 182, 212, 0.15);
  border: 1px solid rgba(6, 182, 212, 0.3);
  border-radius: $radius-sm;
  color: $color-cyan-light;
}

.screenshot-preview-box {
  background: #000;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  overflow: hidden;
}

.mock-screenshot {
  padding: 16px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  min-height: 240px;

  .screenshot-header {
    @include flex-between;
    font-size: 12px;
    color: $text-muted;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .mock-lobby-item {
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: $radius-sm;
    font-size: 13px;
    margin-bottom: 6px;
    color: $text-primary;
  }
}

.hash-meta-card {
  background: rgba(0, 0, 0, 0.3);
  padding: 12px;
  border-radius: $radius-md;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;

  .meta-row {
    display: flex;
    gap: 8px;
  }

  .label {
    color: $text-muted;
    min-width: 80px;
  }

  .hash-val {
    font-family: monospace;
    color: $text-gold;
    word-break: break-all;
  }
}

.fields-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.field-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: $radius-md;

  .slot-idx {
    font-size: 12px;
    font-weight: 700;
    color: $text-muted;
    min-width: 24px;
  }

  .field-input-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;

    &.small {
      flex: 0.6;
    }

    label {
      font-size: 10px;
      color: $text-muted;
    }

    .input-text {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: $radius-sm;
      padding: 4px 8px;
      color: $text-primary;
      font-size: 12px;
      outline: none;

      &:focus {
        border-color: $color-gold;
      }
    }
  }

  .ocr-confidence {
    font-size: 11px;
    white-space: nowrap;
  }
}

.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;

  .btn-cancel {
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid $border-color;
    border-radius: $radius-md;
    color: $text-secondary;
    font-size: 13px;
  }

  .btn-confirm {
    padding: 8px 20px;
    background: linear-gradient(135deg, $color-gold 0%, $color-gold-dark 100%);
    border-radius: $radius-md;
    color: #111827;
    font-size: 13px;
    font-weight: 700;
    box-shadow: $glow-gold;
    transition: $transition-base;

    &:hover {
      transform: translateY(-1px);
    }
  }
}

.text-success { color: $color-success; }
.text-gold { color: $color-gold-light; }
.text-secondary { color: $text-secondary; }
</style>
