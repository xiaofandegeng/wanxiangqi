<template>
  <div class="admin-sources-view">
    <div class="page-header-card">
      <h2 class="page-title">来源与素材管理</h2>
      <p class="page-desc">
        数据源状态、快照同步、失败原因与原文复核；素材原件上传与核验台账（上传 ≠ 核验）。
        管理接口需要凭证；所有操作结果如实呈现服务端响应。
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
        公开只读信息（数据源状态）不需要凭证；同步任务与素材台账需要。
      </p>
    </div>

    <!-- 数据源状态与同步 -->
    <div class="panel-card">
      <div class="panel-head">
        <h3 class="panel-title">数据源状态</h3>
        <button class="op-btn is-ghost" @click="loadAll">刷新</button>
      </div>

      <div v-if="statusError" class="error-line">数据源状态加载失败：{{ statusError }}</div>

      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>来源</th>
              <th>类型</th>
              <th>状态</th>
              <th>最后抓取尝试</th>
              <th>最后抓取成功</th>
              <th>最近错误</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in sources" :key="s.id">
              <td>
                <div class="cell-strong">{{ s.name }}</div>
                <span class="cell-mono">{{ s.id }}</span>
              </td>
              <td>{{ s.type }}</td>
              <td>
                <span class="status-pill" :class="statusClass(s.status)">{{ s.status }}</span>
              </td>
              <td class="cell-mono">{{ formatTime(s.lastAttemptAt) }}</td>
              <td class="cell-mono">{{ formatTime(s.lastSuccessAt) }}</td>
              <td class="cell-error">{{ s.lastError || '—' }}</td>
              <td>
                <button class="op-btn is-small" :disabled="syncingId === s.id || !tokenReady" @click="syncOne(s.id)">
                  {{ syncingId === s.id ? '同步中…' : '触发同步' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="syncFeedback" class="feedback-line" :class="{ 'is-ok': syncFeedback.ok }">
        {{ syncFeedback.text }}
      </div>
      <p class="hint-text">
        v6 起唯一自动同步来源是 hokace 阵容快照；datatft 已停用（原路径写玩家/赛事数据），
        其余来源未配置自动同步 —— 服务端会如实返回 400/409 说明。
      </p>
    </div>

    <div v-if="!tokenReady" class="panel-card">
      <h3 class="panel-title">管理功能尚未解锁</h3>
      <p class="hint-text">请先在上方保存当前后端的 ADMIN_TOKEN，再查看同步任务、上传素材或核验原件。浏览课程、阵容和资料无需管理凭证。</p>
      <a href="#admin-credentials" class="op-btn">配置管理凭证</a>
    </div>
    <template v-if="tokenReady">
    <!-- 同步任务台账 -->
    <div class="panel-card">
      <div class="panel-head">
        <h3 class="panel-title">同步任务台账</h3>
        <button class="op-btn is-ghost" :disabled="!tokenReady" @click="loadJobs">刷新</button>
      </div>
      <div v-if="jobsError" class="error-line">台账加载失败：{{ jobsError }}</div>
      <div v-else-if="syncJobs.length === 0" class="empty-line">暂无同步任务记录</div>
      <div v-else class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>来源</th>
              <th>状态</th>
              <th>开始</th>
              <th>结束</th>
              <th>抓取/入库/去重/失败</th>
              <th>错误摘要</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in syncJobs" :key="j.id">
              <td class="cell-mono">{{ j.id }}</td>
              <td class="cell-mono">{{ j.sourceId }}</td>
              <td>
                <span class="status-pill" :class="statusClass(j.status)">{{ j.status }}</span>
              </td>
              <td class="cell-mono">{{ formatTime(j.startedAt) }}</td>
              <td class="cell-mono">{{ formatTime(j.finishedAt) }}</td>
              <td class="cell-mono">
                {{ j.fetchedCount ?? '—' }} / {{ j.insertedCount ?? '—' }} /
                {{ j.duplicateCount ?? '—' }} / {{ j.failedCount ?? '—' }}
              </td>
              <td class="cell-error">{{ j.errorSummary || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

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
            <input v-model="uploadForm.providedBy" type="text" class="form-input" />
          </label>
          <label class="form-label">
            <span class="lbl-text">备注 (note)</span>
            <input v-model="uploadForm.note" type="text" class="form-input" />
          </label>
        </div>
        <div class="form-row">
          <button class="op-btn is-primary" :disabled="!uploadFile || !uploadForm.capturedAt || uploading" @click="doUpload">
            {{ uploading ? '上传中…' : '上传原件（→ PENDING）' }}
          </button>
          <span v-if="uploadFile" class="hint-text">{{ uploadFile.name }} · {{ uploadFile.type || '未知类型' }} · {{ uploadFile.size }} 字节</span>
        </div>
        <div v-if="uploadFeedback" class="feedback-line" :class="{ 'is-ok': uploadFeedback.ok }">
          {{ uploadFeedback.text }}
        </div>
      </div>
      <p class="hint-text">
        上传只产生 PENDING 证据（服务端做魔数嗅探与 SHA256 校验）；上传不等于核验，
        引用前须在下方台账人工确认材料有效。
      </p>
    </div>

    <!-- 素材证据台账 -->
    <div class="panel-card">
      <div class="panel-head">
        <h3 class="panel-title">素材证据台账</h3>
        <div class="filter-row">
          <select v-model="evidenceFilter" class="form-input is-small" @change="loadEvidences">
            <option value="">全部状态</option>
            <option value="PENDING">PENDING</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="QUARANTINED">QUARANTINED</option>
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
              <th>原件</th>
              <th>采集时间</th>
              <th>核验</th>
              <th>范围</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in evidences" :key="e.id">
              <td>
                <div class="cell-strong cell-mono">{{ e.id }}</div>
                <span class="cell-mono">{{ e.sha256.slice(0, 12) }}…</span>
              </td>
              <td>{{ e.kind || '—' }}</td>
              <td>
                <span class="status-pill" :class="statusClass(e.status)">{{ e.status }}</span>
              </td>
              <td>
                <span v-if="e.hasOriginal">{{ e.mimeType || '未知' }} · {{ e.sizeBytes ?? '—' }}B</span>
                <span v-else class="cell-error">无原件（哈希存量）</span>
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

    <!-- 原始材料存证 -->
    <div class="panel-card">
      <div class="panel-head">
        <h3 class="panel-title">原始材料存证（同步原文复核）</h3>
        <button class="op-btn is-ghost" :disabled="!tokenReady" @click="loadRawMaterials">刷新</button>
      </div>
      <div v-if="rawError" class="error-line">存证加载失败：{{ rawError }}</div>
      <div v-else-if="rawMaterials.length === 0" class="empty-line">暂无原始材料存证</div>
      <div v-else class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>存证 ID</th>
              <th>来源</th>
              <th>记录键</th>
              <th>抓取时间</th>
              <th>正文指纹</th>
              <th>解析器</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in rawMaterials" :key="String(m.id)">
              <td class="cell-mono">{{ m.id }}</td>
              <td class="cell-mono">{{ m.sourceId }}</td>
              <td class="cell-mono">{{ m.recordKey }}</td>
              <td class="cell-mono">{{ formatTime(m.fetchedAt as string | null) }}</td>
              <td class="cell-mono">{{ String(m.contentSha256 || '').slice(0, 12) }}…</td>
              <td class="cell-mono">{{ m.parserVersion || '—' }}</td>
              <td>{{ m.note || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  setAdminToken, hasAdminToken,
  fetchDataStatus, syncSource, fetchSyncJobs,
  uploadEvidence, fetchEvidences, verifyEvidence, fetchEvidenceObjectUrl,
  fetchRawMaterials, AdminTokenMissingError,
  type DataSourceStatus, type SyncJobRecord, type EvidenceRecord
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
  loadAll()
}
function clearToken() {
  setAdminToken(null)
  tokenReady.value = false
  syncJobs.value = []
  evidences.value = []
  rawMaterials.value = []
  jobsError.value = null
  evidenceError.value = null
  rawError.value = null
}

// ---------------- 数据源状态（公开只读） ----------------
const sources = ref<DataSourceStatus[]>([])
const statusError = ref<string | null>(null)

// ---------------- 同步 ----------------
const syncingId = ref<string | null>(null)
const syncFeedback = ref<{ ok: boolean; text: string } | null>(null)
const syncJobs = ref<SyncJobRecord[]>([])
const jobsError = ref<string | null>(null)

async function syncOne(sourceId: string) {
  syncingId.value = sourceId
  syncFeedback.value = null
  try {
    const res: any = await syncSource(sourceId)
    syncFeedback.value = { ok: res.code === 0, text: res.message || JSON.stringify(res.result) }
  } catch (err: any) {
    syncFeedback.value = { ok: false, text: `同步未完成（${err?.status ?? ''}${err?.code ? ' ' + err.code : ''}）：${err?.message || '未知错误'}` }
  } finally {
    syncingId.value = null
    await Promise.all([loadStatus(), loadJobs()])
  }
}

// ---------------- 素材上传 ----------------
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploadFile = ref<File | null>(null)
const uploading = ref(false)
const uploadFeedback = ref<{ ok: boolean; text: string } | null>(null)
const uploadForm = ref({
  capturedAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
  kind: 'CONTENT_ASSET',
  usageScope: 'INTERNAL_ONLY' as 'INTERNAL_ONLY' | 'PUBLIC',
  providedBy: '',
  note: ''
})

function onFilePick(ev: Event) {
  const files = (ev.target as HTMLInputElement).files
  uploadFile.value = files && files.length ? files[0] : null
}

async function doUpload() {
  if (!uploadFile.value) return
  uploading.value = true
  uploadFeedback.value = null
  try {
    const res = await uploadEvidence(uploadFile.value, {
      capturedAt: new Date(uploadForm.value.capturedAt).toISOString(),
      kind: uploadForm.value.kind || undefined,
      usageScope: uploadForm.value.usageScope,
      providedBy: uploadForm.value.providedBy || undefined,
      note: uploadForm.value.note || undefined
    })
    uploadFeedback.value = {
      ok: true,
      text: res.deduplicated
        ? `该原件内容已存在，复用既有证据 ${res.evidenceId}（状态 ${res.evidence.status}）`
        : `原件已入库：证据 ${res.evidenceId}，状态 PENDING —— 请在台账中人工核验`
    }
    if (fileInputRef.value) fileInputRef.value.value = ''
    uploadFile.value = null
    await loadEvidences()
  } catch (err: any) {
    uploadFeedback.value = { ok: false, text: `上传失败（${err?.status ?? ''}${err?.code ? ' ' + err.code : ''}）：${err?.message || '未知错误'}` }
  } finally {
    uploading.value = false
  }
}

// ---------------- 证据台账 ----------------
const evidences = ref<EvidenceRecord[]>([])
const evidenceFilter = ref('')
const evidenceError = ref<string | null>(null)
const evidenceFeedback = ref<{ ok: boolean; text: string } | null>(null)
const verifyingId = ref<string | null>(null)
const operatorName = ref('')

async function loadEvidences() {
  evidenceError.value = null
  try {
    evidences.value = await fetchEvidences(evidenceFilter.value || undefined)
  } catch (err: any) {
    if (err instanceof AdminTokenMissingError || err?.status === 401) {
      evidenceError.value = '凭证无效或已过期，请重新配置当前后端的 ADMIN_TOKEN'
    } else {
      evidenceError.value = err?.message || '未知错误'
    }
    evidences.value = []
  }
}

async function verifyOne(id: string) {
  verifyingId.value = id
  evidenceFeedback.value = null
  try {
    const ev = await verifyEvidence(id, operatorName.value.trim() || 'CONSOLE_OPERATOR')
    evidenceFeedback.value = { ok: true, text: `证据 ${id} 已确认为有效（VERIFIED by ${ev.verifiedBy}）` }
    await loadEvidences()
  } catch (err: any) {
    evidenceFeedback.value = { ok: false, text: `核验失败（${err?.status ?? ''}${err?.code ? ' ' + err.code : ''}）：${err?.message || '未知错误'}` }
  } finally {
    verifyingId.value = null
  }
}

async function previewOriginal(id: string) {
  try {
    const url = await fetchEvidenceObjectUrl(id)
    window.open(url, '_blank')
    // objectURL 由浏览器进程持有；延迟回收避免弹窗竞态
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err: any) {
    evidenceFeedback.value = { ok: false, text: `原件获取失败（${err?.status ?? ''}${err?.code ? ' ' + err.code : ''}）：${err?.message || '未知错误'}` }
  }
}

// ---------------- 原始材料存证 ----------------
const rawMaterials = ref<Array<Record<string, unknown>>>([])
const rawError = ref<string | null>(null)

async function loadRawMaterials() {
  rawError.value = null
  try {
    rawMaterials.value = await fetchRawMaterials({ limit: 20 })
  } catch (err: any) {
    if (err instanceof AdminTokenMissingError || err?.status === 401) {
      rawError.value = '凭证无效或已过期，请重新配置当前后端的 ADMIN_TOKEN'
    } else {
      rawError.value = err?.message || '未知错误'
    }
    rawMaterials.value = []
  }
}

// ---------------- 通用 ----------------
async function loadStatus() {
  statusError.value = null
  try {
    const status = await fetchDataStatus()
    sources.value = status.sources
  } catch (err: any) {
    statusError.value = err?.message || '未知错误'
    sources.value = []
  }
}

async function loadJobs() {
  jobsError.value = null
  try {
    syncJobs.value = await fetchSyncJobs(20)
  } catch (err: any) {
    if (err instanceof AdminTokenMissingError || err?.status === 401) {
      jobsError.value = '凭证无效或已过期，请重新配置当前后端的 ADMIN_TOKEN'
    } else {
      jobsError.value = err?.message || '未知错误'
    }
    syncJobs.value = []
  }
}

async function loadAll() {
  await Promise.all([loadStatus(), ...(tokenReady.value ? [loadJobs(), loadEvidences(), loadRawMaterials()] : [])])
}

function statusClass(status: string | null | undefined): string {
  switch (status) {
    case 'ACTIVE':
    case 'READY':
    case 'SUCCESS':
    case 'VERIFIED':
      return 'is-ok'
    case 'FAILED':
    case 'QUARANTINED':
      return 'is-bad'
    case 'PENDING':
    case 'RUNNING':
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

onMounted(loadAll)
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
  gap: 10px;
  flex-wrap: wrap;
}

.token-input,
.form-input {
  padding: 7px 12px;
  font-size: 13px;
  border: 1px solid $border-color-hover;
  border-radius: $radius-sm;
  background: $bg-secondary;
  color: $text-primary;

  &.is-small {
    padding: 4px 8px;
    font-size: 12px;
  }
}

.token-input {
  flex: 1;
  min-width: 220px;
}

.op-btn {
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 600;
  border-radius: $radius-sm;
  border: 1px solid $border-color-hover;
  background: $bg-secondary;
  color: $text-secondary;
  cursor: pointer;
  transition: $transition-base;

  &:hover:not(:disabled) {
    border-color: $color-primary;
    color: $color-primary;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.is-primary {
    background: $color-primary;
    border-color: $color-primary;
    color: #ffffff;

    &:hover:not(:disabled) {
      background: $color-primary-dark;
      color: #ffffff;
    }
  }

  &.is-ghost {
    background: transparent;
  }

  &.is-small {
    padding: 4px 10px;
    font-size: 12px;
  }
}

.hint-text {
  margin: 0;
  font-size: 11px;
  line-height: 1.7;
  color: $text-muted;
}

.error-line,
.feedback-line {
  font-size: 12px;
  line-height: 1.7;
  padding: 8px 12px;
  border-radius: $radius-sm;
}

.error-line {
  color: $color-danger;
  background: $color-danger-light;
}

.feedback-line {
  color: $text-secondary;
  background: $bg-tertiary;

  &.is-ok {
    color: $color-success;
    background: $color-success-light;
  }
}

.empty-line {
  font-size: 13px;
  color: $text-muted;
  padding: 16px 0;
  text-align: center;
}

.table-responsive {
  width: 100%;
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  text-align: left;

  th {
    padding: 8px 10px;
    color: $text-muted;
    font-weight: 600;
    border-bottom: 1px solid $border-color;
    white-space: nowrap;
  }

  td {
    padding: 10px;
    border-bottom: 1px solid #eef2f7;
    vertical-align: middle;
  }
}

.cell-strong {
  font-weight: 600;
  color: $text-primary;
}

.cell-mono {
  font-family: $font-mono;
  font-size: 11px;
  color: $text-secondary;
}

.cell-error {
  color: $color-danger;
  font-size: 11px;
  max-width: 260px;
}

.status-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: $radius-sm;
  background: $bg-tertiary;
  color: $text-muted;
  border: 1px solid $border-color;
  white-space: nowrap;

  &.is-ok {
    background: $color-success-light;
    color: $color-success;
    border-color: rgba(22, 163, 74, 0.3);
  }

  &.is-bad {
    background: $color-danger-light;
    color: $color-danger;
    border-color: rgba(220, 38, 38, 0.3);
  }

  &.is-warn {
    background: $color-warning-light;
    color: $color-warning;
    border-color: rgba(217, 119, 6, 0.3);
  }
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.inline-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: $text-muted;
}

.upload-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  align-items: flex-end;
}

.form-label {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .lbl-text {
    font-size: 11px;
    color: $text-muted;
  }
}

.row-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
</style>
