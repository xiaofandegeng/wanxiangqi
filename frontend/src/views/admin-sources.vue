<template>
  <div class="admin-sources-view">
    <div class="page-header-card">
      <h2 class="page-title">素材原件与存证管理</h2>
      <p class="page-desc">
        真实比赛截图与原件存证管理（上传 ≠ 核验）。核验前为 PENDING 状态，人工核验确认后方可作为赛果依据。
      </p>
    </div>

    <!-- 管理凭证 -->
    <div id="admin-credentials" class="panel-card">
      <div class="panel-head">
        <h3 class="panel-title">管理凭证</h3>
        <span class="token-state" :class="{ 'is-set': tokenReady }">
          {{ tokenReady ? '已配置' : '未配置' }}
        </span>
      </div>
      <div class="token-row">
        <input
          v-model="tokenInput"
          type="password"
          class="token-input"
          placeholder="服务端 ADMIN_TOKEN"
          autocomplete="off"
        />
        <button class="op-btn" @click="saveToken">保存凭证</button>
        <button class="op-btn is-ghost" @click="clearToken">清除</button>
      </div>
      <p class="hint-text">
        凭证仅保存在本浏览器（localStorage），写接口在凭证缺失时会直接拒绝发起。
      </p>
    </div>

    <div v-if="!tokenReady" class="panel-card">
      <h3 class="panel-title">管理功能尚未解锁</h3>
      <p class="hint-text">请先在上方配置当前后端的 ADMIN_TOKEN，再进行原件上传或核验操作。</p>
      <a href="#admin-credentials" class="op-btn is-primary">配置管理凭证</a>
    </div>

    <template v-else>
      <!-- 素材原件上传 -->
      <div class="panel-card">
        <div class="panel-head">
          <h3 class="panel-title">上传素材原件</h3>
        </div>
        <div class="upload-form">
          <div class="form-row">
            <label class="form-label">
              <span class="lbl-text">原件文件</span>
              <input ref="fileInputRef" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" @change="onFilePick" />
            </label>
            <label class="form-label">
              <span class="lbl-text">采集时间 (capturedAt)</span>
              <input v-model="uploadForm.capturedAt" type="datetime-local" class="form-input" />
            </label>
            <label class="form-label">
              <span class="lbl-text">材料类型 (kind)</span>
              <input v-model="uploadForm.kind" type="text" class="form-input" placeholder="CONTENT_ASSET" />
            </label>
          </div>
          <div class="form-row">
            <label class="form-label">
              <span class="lbl-text">使用范围 (usageScope)</span>
              <select v-model="uploadForm.usageScope" class="form-input">
                <option value="INTERNAL_ONLY">INTERNAL_ONLY（仅内部引用）</option>
                <option value="PUBLIC">PUBLIC（可公开引用）</option>
              </select>
            </label>
            <label class="form-label">
              <span class="lbl-text">提供人 (providedBy)</span>
              <input v-model="uploadForm.providedBy" type="text" class="form-input" placeholder="操作人或来源作者" />
            </label>
            <label class="form-label">
              <span class="lbl-text">备注 (note)</span>
              <input v-model="uploadForm.note" type="text" class="form-input" placeholder="材料说明与定位" />
            </label>
          </div>
          <div class="form-actions">
            <button class="op-btn is-primary" :disabled="!uploadFile || !uploadForm.capturedAt || uploading" @click="doUpload">
              {{ uploading ? '上传中…' : '上传原件（→ PENDING）' }}
            </button>
            <span v-if="uploadFile" class="file-summary">{{ uploadFile.name }} · {{ uploadFile.type || '未知类型' }} · {{ uploadFile.size }} 字节</span>
          </div>
          <div v-if="uploadFeedback" class="feedback-line" :class="{ 'is-ok': uploadFeedback.ok }">
            {{ uploadFeedback.text }}
          </div>
        </div>
        <p class="hint-text">
          上传仅产生 PENDING 证据（服务端校验 SHA-256 并进行魔数嗅探）；上传不等于核验，引用前须人工核验确认有效。
        </p>
      </div>

      <!-- 素材证据台账 -->
      <div class="panel-card">
        <div class="panel-head">
          <h3 class="panel-title">素材证据台账</h3>
          <div class="filter-row">
            <select v-model="evidenceFilter" class="form-input is-small" @change="loadEvidences">
              <option value="">全部状态</option>
              <option value="PENDING">PENDING（待核验）</option>
              <option value="VERIFIED">VERIFIED（已核验）</option>
              <option value="QUARANTINED">QUARANTINED（已隔离）</option>
            </select>
            <label class="inline-label">
              核验人
              <input v-model="operatorName" type="text" class="form-input is-small" placeholder="操作人标识" />
            </label>
            <button class="op-btn is-ghost" :disabled="!tokenReady" @click="loadEvidences">刷新</button>
          </div>
        </div>
        <div v-if="evidenceError" class="error-line">台账加载失败：{{ evidenceError }}</div>
        <div v-else-if="evidences.length === 0" class="empty-line">暂无素材证据记录</div>
        <div v-else class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>证据 ID</th>
                <th>类型</th>
                <th>状态</th>
                <th>原件规格</th>
                <th>采集时间</th>
                <th>核验信息</th>
                <th>范围</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in evidences" :key="e.id">
                <td>
                  <div class="cell-strong cell-mono">{{ e.id }}</div>
                  <span class="cell-mono cell-sub">{{ e.sha256.slice(0, 12) }}…</span>
                </td>
                <td>{{ e.kind || '—' }}</td>
                <td>
                  <span class="status-pill" :class="statusClass(e.status)">{{ e.status }}</span>
                </td>
                <td>
                  <span v-if="e.hasOriginal">{{ e.mimeType || '未知' }} · {{ e.sizeBytes ?? '—' }}B</span>
                  <span v-else class="cell-error">无原件</span>
                </td>
                <td class="cell-mono">{{ formatTime(e.capturedAt) }}</td>
                <td class="cell-mono">
                  {{ e.verifiedAt ? `${formatTime(e.verifiedAt)} · ${e.verifiedBy || '—'}` : '未核验' }}
                </td>
                <td>{{ e.usageScope || '—' }}</td>
                <td>
                  <div class="row-actions">
                    <button
                      v-if="e.hasOriginal"
                      class="op-btn is-small"
                      @click="previewOriginal(e.id)"
                    >查看原件</button>
                    <button
                      v-if="e.status === 'PENDING' && e.hasOriginal"
                      class="op-btn is-small is-primary"
                      :disabled="verifyingId === e.id"
                      @click="verifyOne(e.id)"
                    >
                      {{ verifyingId === e.id ? '核验中…' : '确认有效' }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="evidenceFeedback" class="feedback-line" :class="{ 'is-ok': evidenceFeedback.ok }">
          {{ evidenceFeedback.text }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  setAdminToken, hasAdminToken,
  uploadEvidence, fetchEvidences, verifyEvidence, fetchEvidenceObjectUrl,
  type EvidenceRecord
} from '../api'

// ---------------- 凭证 ----------------
const tokenInput = ref('')
const tokenReady = ref(hasAdminToken())

function saveToken() {
  const v = tokenInput.value.trim()
  if (!v) return
  setAdminToken(v)
  tokenReady.value = true
  tokenInput.value = ''
  loadEvidences()
}

function clearToken() {
  setAdminToken(null)
  tokenReady.value = false
  evidences.value = []
}

// ---------------- 素材原件上传 ----------------
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploadFile = ref<File | null>(null)
const uploadForm = ref<{
  capturedAt: string
  kind: string
  usageScope: 'INTERNAL_ONLY' | 'PUBLIC'
  providedBy: string
  note: string
}>({
  capturedAt: '',
  kind: 'CONTENT_ASSET',
  usageScope: 'INTERNAL_ONLY',
  providedBy: '',
  note: ''
})
const uploading = ref(false)
const uploadFeedback = ref<{ ok: boolean; text: string } | null>(null)

function onFilePick(e: Event) {
  const input = e.target as HTMLInputElement
  uploadFile.value = input.files?.[0] || null
}

async function doUpload() {
  if (!uploadFile.value || !uploadForm.value.capturedAt) return
  uploading.value = true
  uploadFeedback.value = null
  try {
    const isoCaptured = new Date(uploadForm.value.capturedAt).toISOString()
    const res = await uploadEvidence(uploadFile.value, {
      capturedAt: isoCaptured,
      kind: uploadForm.value.kind || undefined,
      usageScope: uploadForm.value.usageScope,
      providedBy: uploadForm.value.providedBy || undefined,
      note: uploadForm.value.note || undefined
    })
    uploadFeedback.value = {
      ok: true,
      text: res.deduplicated
        ? `该原件已存在，复用既有证据：${res.evidenceId}`
        : `上传成功，已生成证据：${res.evidenceId}（状态 PENDING，请人工核验）`
    }
    uploadFile.value = null
    if (fileInputRef.value) fileInputRef.value.value = ''
    await loadEvidences()
  } catch (err: any) {
    uploadFeedback.value = {
      ok: false,
      text: `上传失败：${err.message || String(err)}`
    }
  } finally {
    uploading.value = false
  }
}

// ---------------- 素材证据台账 ----------------
const evidences = ref<EvidenceRecord[]>([])
const evidenceFilter = ref<string>('')
const evidenceError = ref<string | null>(null)
const operatorName = ref('AUDIT_STAFF')
const verifyingId = ref<string | null>(null)
const evidenceFeedback = ref<{ ok: boolean; text: string } | null>(null)

async function loadEvidences() {
  if (!tokenReady.value) return
  evidenceError.value = null
  try {
    evidences.value = await fetchEvidences(evidenceFilter.value || undefined)
  } catch (err: any) {
    evidenceError.value = err.message || String(err)
  }
}

async function verifyOne(id: string) {
  const op = operatorName.value.trim()
  if (!op) {
    evidenceFeedback.value = { ok: false, text: '核验人标识不能为空' }
    return
  }
  verifyingId.value = id
  evidenceFeedback.value = null
  try {
    const updated = await verifyEvidence(id, op)
    evidenceFeedback.value = {
      ok: true,
      text: `证据 [${id}] 已成功核验（${updated.status}）`
    }
    await loadEvidences()
  } catch (err: any) {
    evidenceFeedback.value = {
      ok: false,
      text: `核验失败：${err.message || String(err)}`
    }
  } finally {
    verifyingId.value = null
  }
}

async function previewOriginal(id: string) {
  try {
    const url = await fetchEvidenceObjectUrl(id)
    window.open(url, '_blank')
  } catch (err: any) {
    alert(`获取原件失败：${err.message || String(err)}`)
  }
}

function statusClass(status: string | null | undefined): string {
  switch (status) {
    case 'VERIFIED':
      return 'is-ok'
    case 'QUARANTINED':
      return 'is-bad'
    case 'PENDING':
      return 'is-warn'
    default:
      return ''
  }
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

onMounted(() => {
  if (tokenReady.value) {
    loadEvidences()
  }
})
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.admin-sources-view {
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
  max-width: 820px;
}

.panel-card {
  @include glass-panel;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-head {
  @include flex-between;
  flex-wrap: wrap;
  gap: 10px;
}

.panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: $text-primary;
}

.token-state {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: $radius-full;
  background: $bg-tertiary;
  color: $text-muted;
  border: 1px solid $border-color;

  &.is-set {
    background: $color-success-light;
    color: $color-success;
    border-color: rgba(22, 163, 74, 0.3);
  }
}

.token-row {
  display: flex;
  gap: 8px;
  align-items: center;
  max-width: 520px;
}

.token-input {
  flex: 1;
  padding: 7px 12px;
  font-size: 13px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: #ffffff;
  color: $text-primary;

  &:focus {
    outline: none;
    border-color: $color-primary;
  }
}

.op-btn {
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: $radius-md;
  border: 1px solid $border-color;
  background: #ffffff;
  color: $text-primary;
  cursor: pointer;
  transition: all $transition-base;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover:not(:disabled) {
    background: $bg-tertiary;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.is-primary {
    background: $color-primary;
    color: #ffffff;
    border-color: $color-primary;

    &:hover:not(:disabled) {
      background: $color-primary-dark;
      border-color: $color-primary-dark;
    }
  }

  &.is-ghost {
    background: transparent;
    border-color: transparent;

    &:hover:not(:disabled) {
      background: $bg-tertiary;
      border-color: $border-color;
    }
  }

  &.is-small {
    padding: 4px 8px;
    font-size: 12px;
  }
}

.upload-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.form-label {
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lbl-text {
  font-size: 12px;
  font-weight: 600;
  color: $text-secondary;
}

.form-input {
  padding: 7px 10px;
  font-size: 13px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: #ffffff;
  color: $text-primary;

  &:focus {
    outline: none;
    border-color: $color-primary;
  }

  &.is-small {
    padding: 4px 8px;
    font-size: 12px;
  }
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-summary {
  font-size: 12px;
  color: $text-muted;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.inline-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: $text-secondary;
}

.table-responsive {
  width: 100%;
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th, td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid $border-color;
  }

  th {
    font-size: 12px;
    color: $text-muted;
    font-weight: 600;
    background: $bg-tertiary;
  }
}

.cell-strong {
  font-weight: 600;
}

.cell-mono {
  font-family: monospace;
}

.cell-sub {
  display: block;
  font-size: 11px;
  color: $text-muted;
}

.cell-error {
  color: $color-danger;
}

.row-actions {
  display: flex;
  gap: 6px;
}

.status-pill {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: $radius-full;
  background: $bg-tertiary;
  color: $text-muted;

  &.is-ok {
    background: $color-success-light;
    color: $color-success;
  }

  &.is-bad {
    background: $color-danger-light;
    color: $color-danger;
  }

  &.is-warn {
    background: rgba(234, 179, 8, 0.15);
    color: #a16207;
  }
}

.feedback-line {
  padding: 8px 12px;
  border-radius: $radius-md;
  font-size: 12px;
  background: $color-danger-light;
  color: $color-danger;

  &.is-ok {
    background: $color-success-light;
    color: $color-success;
  }
}

.error-line {
  padding: 10px 14px;
  border-radius: $radius-md;
  background: $color-danger-light;
  color: $color-danger;
  font-size: 13px;
}

.empty-line {
  padding: 24px;
  text-align: center;
  color: $text-muted;
  font-size: 13px;
}

.hint-text {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: $text-muted;
}
</style>
