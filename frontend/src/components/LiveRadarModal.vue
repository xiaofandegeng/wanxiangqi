<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="closeModal">
    <div class="modal-dialog">
      <!-- 弹窗顶栏 -->
      <div class="modal-header">
        <div class="header-title-wrap">
          <span class="live-pulse-dot"></span>
          <h3 class="modal-title">存证材料录入台（材料哈希核对）</h3>
        </div>
        <button class="close-btn" @click="closeModal">×</button>
      </div>

      <!-- 说明条 -->
      <div class="intro-bar">
        上传对局截图材料后，本站只做 <strong>SHA-256 存证哈希核对</strong>：命中已存证材料即显示其已核验席位；
        未命中仅回执“材料已收到，待人工核验”。本站不做视觉识别，也不提供任何预测或对局建议。
      </div>

      <!-- 剪贴板快速粘贴 / 拖拽上传区域 -->
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
          <span class="paste-main-text">在游戏中截屏后，直接在此按 <kbd>Cmd+V</kbd> / <kbd>Ctrl+V</kbd>（或拖拽截图到此处）</span>
          <span class="paste-sub-text">{{ isAnalyzing ? '正在计算材料哈希…' : '上传后仅做存证哈希核对，席位以人工核验录入为准' }}</span>
        </div>
      </div>

      <!-- 回执结果：客户端只回执哈希，席位与核验状态以服务端人工核验为准 -->
      <div v-if="receipt" class="receipt-container">
        <div class="receipt-card is-pending">
          <div class="receipt-head">
            <span class="receipt-badge pending">材料已收到，待人工核验</span>
            <span class="latency-tag font-mono">{{ receipt.matchTitle }}</span>
          </div>
          <div class="hash-box">
            <span class="hash-label">SHA-256:</span>
            <span class="hash-code font-mono">{{ receipt.sha256 }}</span>
          </div>
          <div class="receipt-note">
            本站不做自动识别与名单推测。请携带该哈希前往「证据核验工作台」逐席位人工录入；
            录入并通过核验后，相关统计才会生效。
          </div>
          <router-link to="/admin/verify" class="goto-verify-btn" @click="closeModal">
            前往证据核验工作台 →
          </router-link>
        </div>
      </div>

      <!-- 处理失败如实呈现 -->
      <div v-if="uploadError" class="receipt-card is-error">
        <span class="receipt-badge error">材料处理失败</span>
        <div class="receipt-note">{{ uploadError }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { detectMatchFromImage, type ExtractedLobbyResult } from '../utils/image-analyzer'

const isOpen = ref(false)
const isAnalyzing = ref(false)
const isDragOver = ref(false)
const receipt = ref<ExtractedLobbyResult | null>(null)
const uploadError = ref<string | null>(null)

function openModal() {
  isOpen.value = true
}

function closeModal() {
  isOpen.value = false
}

// 剪贴板粘贴事件监听
async function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return

  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      const file = items[i].getAsFile()
      if (file) {
        await uploadMaterial(file)
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
    await uploadMaterial(files[0])
  }
}

// 上传材料：仅做 SHA-256 存证哈希核对（v3 P2-C：推演/求解引擎已退役，无预测路径）
async function uploadMaterial(file: File) {
  isAnalyzing.value = true
  uploadError.value = null
  receipt.value = null
  try {
    const result = await detectMatchFromImage(file)
    receipt.value = result
    isOpen.value = true
  } catch (err: any) {
    uploadError.value = err?.message || '材料哈希计算失败'
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
  window.addEventListener('paste', handlePaste)
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
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
  max-width: 720px;
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

.intro-bar {
  font-size: 12px;
  line-height: 1.7;
  color: $text-secondary;
  background: rgba(0, 0, 0, 0.3);
  border-radius: $radius-md;
  padding: 10px 14px;

  strong {
    color: $color-gold-light;
  }
}

.paste-drop-zone {
  border: 2px dashed rgba(245, 158, 11, 0.35);
  border-radius: $radius-lg;
  padding: 24px;
  background: rgba(245, 158, 11, 0.03);
  text-align: center;
  outline: none;
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

.receipt-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.receipt-card {
  border-radius: $radius-lg;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;


  &.is-pending {
    background: rgba(245, 158, 11, 0.06);
    border: 1px solid rgba(245, 158, 11, 0.35);
  }

  &.is-error {
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.35);
  }
}

.receipt-head {
  @include flex-between;
  flex-wrap: wrap;
  gap: 8px;
}

.receipt-badge {
  font-size: 13px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: $radius-sm;


  &.pending {
    background: rgba(245, 158, 11, 0.18);
    color: $color-gold-light;
  }

  &.error {
    background: rgba(239, 68, 68, 0.18);
    color: #f87171;
  }
}

.latency-tag {
  font-size: 12px;
  color: $text-secondary;
}

.hash-box {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.3);
  padding: 6px 10px;
  border-radius: $radius-sm;
  word-break: break-all;

  .hash-label {
    color: $text-muted;
    white-space: nowrap;
  }

  .hash-code {
    color: $text-secondary;
  }
}

.receipt-note {
  font-size: 12px;
  line-height: 1.7;
  color: $text-secondary;
}




.goto-verify-btn {
  align-self: flex-start;
  font-size: 13px;
  font-weight: 700;
  color: $color-gold-light;
  text-decoration: none;
  padding: 6px 14px;
  border: 1px solid rgba(245, 158, 11, 0.4);
  background: rgba(245, 158, 11, 0.1);
  border-radius: $radius-sm;

  &:hover {
    background: rgba(245, 158, 11, 0.2);
  }
}

@keyframes livePulse {
  0% { transform: scale(0.9); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.6; }
}
</style>
