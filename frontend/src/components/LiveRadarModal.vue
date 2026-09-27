<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="closeModal">
    <div class="modal-dialog">
      <!-- 弹窗顶栏 -->
      <div class="modal-header">
        <div class="header-title-wrap">
          <span class="live-pulse-dot"></span>
          <h3 class="modal-title">电脑模拟器实时开盘雷达 (Live Assistant)</h3>
        </div>
        <button class="close-btn" @click="closeModal">×</button>
      </div>

      <!-- 操作工具条 -->
      <div class="toolbar-section">
        <div class="status-indicator">
          <span class="status-label">监听通道:</span>
          <span class="status-val text-success">SSE 实时长连接中</span>
        </div>

        <div class="action-buttons">
          <button class="action-btn primary" :disabled="isAnalyzing" @click="triggerCapture">
            <span class="btn-icon">📸</span>
            <span>{{ isAnalyzing ? '解析中...' : '即刻抓取模拟器画面' }}</span>
          </button>
          <button class="action-btn secondary" :disabled="isAnalyzing" @click="triggerSimulate">
            <span class="btn-icon">⚡</span>
            <span>实战开盘模拟演练</span>
          </button>
        </div>
      </div>

      <!-- 剪贴板快速粘贴区域 -->
      <div 
        class="paste-drop-zone"
        :class="{ 'is-dragover': isDragOver }"
        tabindex="0"
        @paste="handlePaste"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="handleDrop"
      >
        <div class="paste-hint-content">
          <span class="paste-icon">📋</span>
          <span class="paste-main-text">在游戏中截屏后，直接在此按 <kbd>Cmd+V</kbd> (或拖拽截图到此处)</span>
          <span class="paste-sub-text">极速视觉引擎将在 1 秒内提取 6 人名单并给出最优下注期望值</span>
        </div>
      </div>

      <!-- 实时计算结果卡片 (若已识别出场次) -->
      <div v-if="latestMatch" class="match-result-container">
        <!-- 核心推荐大Banner -->
        <div class="recommendation-banner" :class="bannerClass">
          <div class="banner-top">
            <span class="decision-badge">
              {{ bestPick?.recommendation === 'STRONG_BUY' ? '★ 强烈推荐支持' : '✔ 建议支持' }}
            </span>
            <span class="latency-tag">运算耗时: {{ latestMatch.latencyMs }}ms</span>
          </div>
          <div class="banner-main">
            <div class="best-player-info">
              <span class="best-slot">席位 #{{ bestPick?.slot }}</span>
              <span class="best-name">{{ bestPick?.nickname }}</span>
              <span class="best-rank">{{ bestPick?.rankText }} ({{ bestPick?.rankScore }}★)</span>
            </div>
            <div class="best-stats">
              <div class="best-stat-item">
                <span class="stat-l">预测第一名胜率</span>
                <span class="stat-v text-gold">{{ Math.round((bestPick?.probability || 0) * 100) }}%</span>
              </div>
              <div class="best-stat-item">
                <span class="stat-l">盘面参考倍率</span>
                <span class="stat-v text-cyan">{{ bestPick?.estimatedOdds }}x</span>
              </div>
              <div class="best-stat-item">
                <span class="stat-l">单注净期望收益 (EV)</span>
                <span class="stat-v text-success">+{{ bestPick?.netEV }} 钻</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 6席全量排行列表 -->
        <div class="ranking-panel">
          <h4 class="panel-subtitle">本局六人实时概率与收益期望全景 (结合 MMR 段位分与流派打法)</h4>
          <div class="ranking-list">
            <div 
              v-for="(item, idx) in latestMatch.recommendations" 
              :key="item.slot" 
              class="rank-row-card"
              :class="{ 'is-top': idx === 0, 'is-avoid': item.recommendation === 'AVOID' }"
            >
              <div class="row-left">
                <span class="rank-pos">{{ Number(idx) + 1 }}</span>
                <span class="row-slot">#{{ item.slot }}</span>
                <div class="name-block">
                  <div class="name-line">
                    <span class="row-name">{{ item.nickname }}</span>
                    <span class="mmr-tag">{{ item.rankScore }}分</span>
                  </div>
                  <div class="playstyle-line">
                    <span class="playstyle-badge">{{ item.playstyle }}</span>
                    <span v-if="item.commander" class="commander-tag">棋手: {{ item.commander }}</span>
                  </div>
                </div>
              </div>

              <div class="row-mid">
                <div class="bar-wrap">
                  <div class="bar-meta">
                    <span>预测胜率: {{ Math.round(item.probability * 100) }}%</span>
                    <span>返奖率: {{ item.odds }}x ({{ item.supportCount }}人次)</span>
                  </div>
                  <div class="mini-bar-track">
                    <div class="mini-bar-fill" :style="{ width: `${item.probability * 100}%` }"></div>
                  </div>
                  <div class="reason-text">{{ item.decisionReason }}</div>
                </div>
              </div>

              <div class="row-right">
                <div class="ev-badge" :class="item.netEV >= 0 ? 'ev-plus' : 'ev-minus'">
                  EV: {{ item.netEV >= 0 ? '+' : '' }}{{ item.netEV }} 钻
                </div>
                <span class="roi-text">ROI {{ item.roi }}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const isOpen = ref(false)
const isAnalyzing = ref(false)
const isDragOver = ref(false)
const latestMatch = ref<any>(null)
let sseSource: EventSource | null = null

const bestPick = computed(() => latestMatch.value?.bestRecommendation || null)
const bannerClass = computed(() => {
  if (bestPick.value?.recommendation === 'STRONG_BUY') return 'style-strong'
  if (bestPick.value?.recommendation === 'BUY') return 'style-buy'
  return 'style-neutral'
})

function openModal() {
  isOpen.value = true
}

function closeModal() {
  isOpen.value = false
}

// 建立 SSE 长连接
function connectSSE() {
  try {
    sseSource = new EventSource('/api/live/stream')
    sseSource.addEventListener('MATCH_DETECTED', (e: any) => {
      try {
        const data = JSON.parse(e.data)
        latestMatch.value = data
        isOpen.value = true // 自动弹出
      } catch (err) {
        console.error('SSE JSON error', err)
      }
    })
  } catch (err) {
    console.warn('SSE Connect failed, proxy may be initializing', err)
  }
}

// 触发主动抓屏
async function triggerCapture() {
  isAnalyzing.value = true
  try {
    const res = await fetch('/api/live/capture', { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      latestMatch.value = data
    }
  } catch (err) {
    console.error('Capture error', err)
  } finally {
    isAnalyzing.value = false
  }
}

// 触发开盘模拟
async function triggerSimulate() {
  isAnalyzing.value = true
  try {
    const res = await fetch('/api/live/simulate', { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      latestMatch.value = data
    }
  } catch (err) {
    console.error('Simulate error', err)
  } finally {
    isAnalyzing.value = false
  }
}

// 剪贴板粘贴事件监听
async function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return

  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      const file = items[i].getAsFile()
      if (file) {
        await uploadAndAnalyze(file)
        break
      }
    }
  }
}

// 拖拽文件释放
async function handleDrop(e: DragEvent) {
  isDragOver.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0 && files[0].type.startsWith('image/')) {
    await uploadAndAnalyze(files[0])
  }
}

// 上传到本地接口分析
async function uploadAndAnalyze(file: File) {
  isAnalyzing.value = true
  try {
    const buffer = await file.arrayBuffer()
    const res = await fetch('/api/live/analyze', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'image/png' },
      body: buffer
    })
    if (res.ok) {
      const data = await res.json()
      latestMatch.value = data
    }
  } catch (err) {
    console.error('Upload analyze error', err)
  } finally {
    isAnalyzing.value = false
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isOpen.value) {
    closeModal()
  }
}

onMounted(() => {
  connectSSE()
  // 全局 Cmd+V / Ctrl+V 快捷唤醒
  window.addEventListener('paste', handlePaste)
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  if (sseSource) sseSource.close()
  window.removeEventListener('paste', handlePaste)
  window.removeEventListener('keydown', handleKeyDown)
})

defineExpose({
  openModal,
  closeModal
})
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 40px 20px;
}

.modal-dialog {
  width: 100%;
  max-width: 880px;
  max-height: 85vh;
  margin: auto;
  overflow-y: auto;
  background: #111827;
  border: 1px solid rgba(245, 158, 11, 0.45);
  border-radius: $radius-xl;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), $glow-gold;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}

.modal-header {
  @include flex-between;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;

  .live-pulse-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #10b981;
    box-shadow: 0 0 10px #10b981;
    animation: livePulse 1.5s infinite;
  }

  .modal-title {
    font-size: 18px;
    font-weight: 800;
    color: $text-primary;
  }
}

.close-btn {
  font-size: 22px;
  color: $text-muted;
  line-height: 1;
  transition: $transition-base;

  &:hover {
    color: $text-primary;
  }
}

.toolbar-section {
  @include flex-between;
  flex-wrap: wrap;
  gap: 12px;
  background: rgba(0, 0, 0, 0.3);
  padding: 10px 16px;
  border-radius: $radius-md;
}

.status-indicator {
  display: flex;
  gap: 8px;
  font-size: 12px;

  .status-label {
    color: $text-muted;
  }
}

.action-buttons {
  display: flex;
  gap: 10px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: $radius-md;
  font-size: 13px;
  font-weight: 600;
  transition: $transition-base;

  &.primary {
    background: linear-gradient(135deg, $color-gold 0%, $color-gold-dark 100%);
    color: #111827;
    box-shadow: $glow-gold;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
    }
  }

  &.secondary {
    background: rgba(255, 255, 255, 0.08);
    color: $text-primary;
    border: 1px solid $border-color;

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.15);
    }
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.paste-drop-zone {
  border: 2px dashed rgba(245, 158, 11, 0.35);
  border-radius: $radius-lg;
  padding: 20px;
  background: rgba(245, 158, 11, 0.03);
  text-align: center;
  outline: none;
  cursor: pointer;
  transition: $transition-base;

  &:focus, &.is-dragover {
    border-color: $color-gold;
    background: rgba(245, 158, 11, 0.08);
  }
}

.paste-hint-content {
  @include flex-column;
  align-items: center;
  gap: 6px;

  .paste-icon {
    font-size: 24px;
  }

  .paste-main-text {
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;

    kbd {
      background: rgba(255, 255, 255, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: monospace;
      color: $color-gold-light;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }
  }

  .paste-sub-text {
    font-size: 12px;
    color: $text-muted;
  }
}

.match-result-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.recommendation-banner {
  padding: 16px 20px;
  border-radius: $radius-lg;
  display: flex;
  flex-direction: column;
  gap: 10px;

  &.style-strong {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(16, 185, 129, 0.15) 100%);
    border: 1px solid rgba(245, 158, 11, 0.5);
  }

  &.style-buy {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.35);
  }
}

.banner-top {
  @include flex-between;

  .decision-badge {
    font-size: 13px;
    font-weight: 800;
    color: $color-gold-light;
  }

  .latency-tag {
    font-size: 11px;
    color: $text-muted;
  }
}

.banner-main {
  @include flex-between;
  flex-wrap: wrap;
  gap: 16px;
}

.best-player-info {
  display: flex;
  align-items: center;
  gap: 10px;

  .best-slot {
    font-size: 13px;
    font-weight: 700;
    color: $text-muted;
    background: rgba(0, 0, 0, 0.3);
    padding: 2px 8px;
    border-radius: $radius-sm;
  }

  .best-name {
    font-size: 20px;
    font-weight: 800;
    color: $text-primary;
  }

  .best-rank {
    font-size: 12px;
    color: $text-gold;
  }
}

.best-stats {
  display: flex;
  gap: 16px;
}

.best-stat-item {
  @include flex-column;
  align-items: center;

  .stat-l {
    font-size: 10px;
    color: $text-muted;
  }

  .stat-v {
    font-size: 16px;
    font-weight: 800;
  }
}

.ranking-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;

  .panel-subtitle {
    font-size: 13px;
    font-weight: 700;
    color: $text-secondary;
  }
}

.ranking-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rank-row-card {
  @include flex-between;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: $radius-md;
  transition: $transition-base;

  &.is-top {
    border-color: rgba(245, 158, 11, 0.35);
    background: rgba(245, 158, 11, 0.05);
  }

  &.is-avoid {
    opacity: 0.65;
  }
}

.row-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 250px;

  .rank-pos {
    font-size: 13px;
    font-weight: 800;
    color: $text-muted;
    width: 16px;
  }

  .row-slot {
    font-size: 11px;
    font-weight: 700;
    color: $text-muted;
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .name-block {
    @include flex-column;
    gap: 2px;
  }

  .name-line {
    display: flex;
    align-items: center;
    gap: 6px;

    .row-name {
      font-size: 14px;
      font-weight: 700;
      color: $text-primary;
    }

    .mmr-tag {
      font-size: 11px;
      font-weight: 700;
      color: $color-gold-light;
      background: rgba(245, 158, 11, 0.15);
      padding: 1px 5px;
      border-radius: 3px;
    }
  }

  .playstyle-line {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;

    .playstyle-badge {
      color: $color-cyan-light;
      background: rgba(6, 182, 212, 0.12);
      padding: 1px 5px;
      border-radius: 3px;
    }

    .commander-tag {
      color: $text-muted;
    }
  }
}

.row-mid {
  flex: 1;
  margin: 0 16px;

  .bar-meta {
    @include flex-between;
    font-size: 11px;
    color: $text-secondary;
    margin-bottom: 4px;
  }

  .reason-text {
    font-size: 10px;
    color: $text-muted;
    margin-top: 4px;
    line-height: 1.3;
  }

  .mini-bar-track {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: $radius-full;
    overflow: hidden;

    .mini-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #8b5cf6 0%, #f59e0b 100%);
      border-radius: $radius-full;
    }
  }
}

.row-right {
  display: flex;
  align-items: center;
  gap: 12px;

  .ev-badge {
    padding: 2px 8px;
    border-radius: $radius-sm;
    font-size: 12px;
    font-weight: 700;

    &.ev-plus {
      background: rgba(16, 185, 129, 0.15);
      color: $color-success;
    }

    &.ev-minus {
      background: rgba(239, 68, 68, 0.15);
      color: $color-danger;
    }
  }

  .roi-text {
    font-size: 11px;
    color: $text-muted;
    min-width: 50px;
    text-align: right;
  }
}

@keyframes livePulse {
  0% { transform: scale(0.9); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.6; }
}

.text-gold { color: $color-gold-light; }
.text-cyan { color: $color-cyan-light; }
.text-success { color: $color-success; }
</style>
