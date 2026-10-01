<template>
  <div class="personal-import-view">
    <div class="view-header">
      <div class="title-col">
        <h2 class="view-title">单人真实战绩导入</h2>
        <p class="view-desc">
          个人授权材料逐局录入 · 上传原件 → 人工确认材料 → 绑定身份 → 逐局候选 → 待核验 → 逐条放行（导入记录不直接生效，核验通过后统计才计入）
        </p>
      </div>
      <div class="audit-counter">
        <span class="counter-label">材料来源口径:</span>
        <span class="counter-num">本人授权截图 · 人工接入</span>
      </div>
    </div>

    <!-- 顶部消息提示区 (真实反馈) -->
    <div v-if="alertMessage" class="alert-banner" :class="alertType">
      <span>{{ alertMessage }}</span>
      <button class="alert-close" @click="alertMessage = ''">×</button>
    </div>

    <!-- 管理凭证 + 操作人：写接口必须由运营者显式录入 Token；操作人写入核验审计字段 -->
    <div class="token-panel" :class="{ 'is-configured': tokenConfigured }">
      <div class="token-status-col">
        <span class="token-dot" :class="{ active: tokenConfigured }"></span>
        <div class="token-texts">
          <span class="token-title">{{ tokenConfigured ? '管理凭证已配置' : '管理凭证未配置' }}</span>
          <span class="token-sub">
            {{ tokenConfigured
              ? '已在本机记忆管理 Token（localStorage），可执行写操作；凭证不进入仓库与日志'
              : '上传 / 导入 / 核验等写接口需要管理 Token（服务端 ADMIN_TOKEN 环境变量），由运营者提供' }}
          </span>
        </div>
      </div>
      <div class="token-input-col">
        <input
          v-model="tokenInput"
          :type="showToken ? 'text' : 'password'"
          class="token-input font-mono"
          placeholder="粘贴管理 Token..."
          autocomplete="off"
        />
        <div class="token-btn-row">
          <button class="token-btn primary" @click="saveToken">保存凭证</button>
          <button class="token-btn ghost" @click="showToken = !showToken">{{ showToken ? '隐藏' : '显示' }}</button>
          <button v-if="tokenConfigured" class="token-btn ghost" @click="clearToken">清除</button>
        </div>
      </div>
      <div class="token-input-col operator-col">
        <label class="operator-label">操作人（verifiedBy，必填）</label>
        <input
          v-model="operatorInput"
          type="text"
          class="token-input font-mono"
          placeholder="例如：本人录入 / 运营-张三"
        />
      </div>
    </div>

    <!-- ① 材料原件上传（PERSONAL_SCREENSHOT；上传 ≠ 核验） -->
    <section class="stage-panel" :class="{ 'is-done': materialReady }">
      <div class="stage-head">
        <span class="stage-no">①</span>
        <h3 class="stage-title">上传个人材料原件</h3>
        <span class="stage-state" :class="materialReady ? 'done' : 'todo'">
          {{ materialReady ? '原件已入库' : '待上传' }}
        </span>
      </div>
      <div class="upload-meta-row">
        <div class="field-input-group flex-1">
          <label>材料采集时间（必填）</label>
          <input v-model="evidenceCapturedAt" type="datetime-local" class="input-text" />
        </div>
        <div class="field-input-group">
          <label>文件选择（PNG/JPEG/WebP/PDF）</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            class="input-file"
            @change="handleFileChange"
          />
        </div>
      </div>
      <div
        class="evidence-drop-zone"
        :class="{ 'is-dragover': isDragOver }"
        tabindex="0"
        @paste="handlePaste"
        @dragover.prevent="isDragOver = true"
        @dragleave.prevent="isDragOver = false"
        @drop.prevent="handleDrop"
      >
        <span class="drop-icon">🧾</span>
        <span class="drop-main">粘贴个人战绩截图（Cmd+V / Ctrl+V）、拖拽到此处或使用上方文件选择</span>
        <span class="drop-sub">
          {{ isUploading ? '原件正在上传入库…' : '原件字节直接上传服务端存证（服务端计算 SHA-256、校验真实文件类型），材料固定按「个人战绩截图」口径入库' }}
        </span>
      </div>
      <div v-if="currentEvidence" class="hash-meta-card">
        <div class="meta-row">
          <span class="label">证据编号:</span>
          <span class="hash-val font-mono">{{ currentEvidence.id }}</span>
        </div>
        <div class="meta-row">
          <span class="label">SHA-256 存证指纹:</span>
          <span class="hash-val font-mono">{{ currentEvidence.sha256 }}</span>
        </div>
        <div class="meta-row">
          <span class="label">材料状态:</span>
          <span :class="evidenceStatusClass(currentEvidence.status)" class="font-bold">
            {{ evidenceStatusText(currentEvidence.status) }}{{ currentEvidence.hasOriginal ? '' : '（无可恢复原件，不得放行）' }}
          </span>
        </div>
      </div>
    </section>

    <!-- ② 原件预览与放大对照（逐局录入时必须能对照原件，不凭记忆填数） -->
    <section class="stage-panel" :class="{ 'is-done': !!previewUrl }">
      <div class="stage-head">
        <span class="stage-no">②</span>
        <h3 class="stage-title">原件预览与放大对照</h3>
        <span class="stage-state" :class="previewUrl ? 'done' : 'todo'">{{ previewUrl ? '已载入' : '未载入' }}</span>
      </div>
      <div v-if="previewUrl" class="preview-wrap">
        <div class="preview-toolbar">
          <label class="zoom-toggle">
            <input v-model="previewZoomed" type="checkbox" />
            放大对照（200%）
          </label>
          <span class="preview-note">逐局录入请对照原件核实时间与名次，禁止凭记忆或推测填数</span>
        </div>
        <div class="preview-scroll" :class="{ 'is-zoomed': previewZoomed }">
          <img :src="previewUrl" alt="个人战绩材料原件预览" class="preview-img" />
        </div>
      </div>
      <div v-else class="stage-empty">尚无可预览的原件 —— 先完成①的上传</div>
    </section>

    <!-- ③ 人工确认材料有效（PENDING → VERIFIED；单人导入同六席入口的铁律） -->
    <section class="stage-panel" :class="{ 'is-done': evidenceVerified }">
      <div class="stage-head">
        <span class="stage-no">③</span>
        <h3 class="stage-title">人工确认材料有效</h3>
        <span class="stage-state" :class="evidenceVerified ? 'done' : 'todo'">
          {{ evidenceVerified ? '材料已确认有效' : currentEvidence ? '待人工确认' : '待上传材料' }}
        </span>
      </div>
      <p class="honest-note">
        上传不等于核验：只有运营者确认「原件清晰、可辨认、确属本人授权材料」后，证据才进入 VERIFIED；
        后续每一条候选记录与放行动作都必须绑定该证据（recordKey = ev:证据编号:材料内序号）。
      </p>
      <button
        class="action-btn"
        :disabled="!currentEvidence || currentEvidence.status !== 'PENDING' || isVerifyingEvidence"
        @click="confirmEvidence"
      >
        {{ isVerifyingEvidence ? '确认中…' : '确认材料有效（PENDING → VERIFIED）' }}
      </button>
    </section>

    <!-- ④ 归属身份确认（同名告警 / 当前档案名不一致需显式确认） -->
    <section class="stage-panel" :class="{ 'is-done': identityReady }">
      <div class="stage-head">
        <span class="stage-no">④</span>
        <h3 class="stage-title">归属身份确认</h3>
        <span class="stage-state" :class="identityReady ? 'done' : 'todo'">
          {{ identityReady ? '身份已确认' : '待核对' }}
        </span>
      </div>
      <div class="identity-row">
        <div class="field-input-group flex-1">
          <label>选手 ID（playerId，必填）</label>
          <input v-model="playerIdInput" type="text" class="input-text font-mono" placeholder="p-…" @input="resetIdentityCheck" />
        </div>
        <div class="field-input-group flex-1">
          <label>昵称（材料所示，必填）</label>
          <input v-model="nicknameInput" type="text" class="input-text" placeholder="材料上显示的昵称" @input="resetIdentityCheck" />
        </div>
        <div class="field-input-group">
          <label>&nbsp;</label>
          <button class="action-btn ghost" :disabled="!playerIdInput.trim() || !nicknameInput.trim() || isCheckingIdentity" @click="checkIdentity">
            {{ isCheckingIdentity ? '核对中…' : '在选手库核对身份' }}
          </button>
        </div>
      </div>

      <div v-if="identityChecked" class="identity-result">
        <p v-if="!idKnown" class="warn-line">
          ⚠ 选手 ID [{{ playerIdInput }}] 未在选手库登记：导入将仅登记该身份（昵称入库、属性全空），请确认 ID 拼写无误。
        </p>
        <p v-if="sameNicknamePlayers.length > 0" class="warn-line">
          ⚠ 选手库中另有 {{ sameNicknamePlayers.length }} 位同名昵称选手：
          <span class="font-mono">{{ sameNicknamePlayers.map(p => p.id).join('、') }}</span>
          —— 请核对 playerId 确认归属无误。
        </p>
        <p v-if="nicknameMismatch" class="warn-line">
          ⚠ 该选手当前档案昵称为「{{ archiveNickname }}」，与材料所示「{{ nicknameInput }}」不一致。
          <label class="confirm-check">
            <input v-model="nicknameMismatchConfirmed" type="checkbox" />
            我已核对：系同一人的历史昵称/改名，按材料原文录入
          </label>
        </p>
        <p v-if="identityReady" class="ok-line">✔ 身份核对完成，可继续录入候选对局</p>
      </div>
    </section>

    <!-- ⑤ 候选对局行（材料内序号恒定绑定证据；可选字段留空即 null，不造默认值） -->
    <section class="stage-panel" :class="{ 'is-done': candidatesValid }">
      <div class="stage-head">
        <span class="stage-no">⑤</span>
        <h3 class="stage-title">候选对局逐局录入</h3>
        <span class="stage-state" :class="candidatesValid ? 'done' : 'todo'">
          {{ candidateRows.length === 0 ? '待录入' : candidatesValid ? `${candidateRows.length} 局就绪` : '存在未完成行' }}
        </span>
      </div>
      <p class="honest-note">
        每一行对应材料内的一局对局：材料内序号（slot）是稳定键 ev:证据编号:序号 的组成段，提交后不可再改；
        时间填写错误只能以更高 revision 重新提交更正（旧候选被取代，不会裂成两条）。可选字段留空一律按 null 入库。
      </p>

      <div v-if="candidateRows.length === 0" class="stage-empty">尚无候选行 —— 点击下方按钮按材料逐局添加</div>
      <div v-else class="candidate-table-wrap">
        <table class="candidate-table">
          <thead>
            <tr>
              <th>序号</th>
              <th>对局时间（datetime-local）</th>
              <th>模式</th>
              <th>名次 1-6</th>
              <th>棋手(选填)</th>
              <th>阵容(选填)</th>
              <th>存活轮次(选填)</th>
              <th>材料内定位(选填)</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in candidateRows" :key="row.localId" :class="{ 'is-rejecting': row.rejecting }">
              <td class="center-cell">
                <span class="slot-chip font-mono">#{{ row.slot }}</span>
                <span v-if="rowKeyExists(row)" class="rev-chip" title="该序号已有待核验记录，本次提交为更正版本（revision+1，旧候选将被取代）">更正</span>
              </td>
              <td>
                <input v-model="row.matchTime" type="datetime-local" class="input-text input-sm" />
                <div v-if="row.matchTime && rowKeyExists(row)" class="row-warn">该序号已有候选：改时间将以更正版本替换，不新增键</div>
              </td>
              <td>
                <select v-model="row.mode" class="input-select input-sm">
                  <option value="">未指定</option>
                  <option value="RANKED_DIAMOND">巅峰排位</option>
                  <option value="TOURNAMENT">赛事对决</option>
                </select>
              </td>
              <td><input v-model="row.finalRank" type="number" min="1" max="6" step="1" class="input-text input-sm center-cell" /></td>
              <td><input v-model="row.commander" type="text" class="input-text input-sm" placeholder="留空=null" /></td>
              <td><input v-model="row.lineup" type="text" class="input-text input-sm" placeholder="留空=null" /></td>
              <td><input v-model="row.roundsSurvived" type="number" min="0" class="input-text input-sm" placeholder="留空=null" /></td>
              <td><input v-model="row.evidenceLocator" type="text" class="input-text input-sm font-mono" placeholder="如 第2页第3行" /></td>
              <td class="center-cell action-cell">
                <template v-if="!row.rejecting">
                  <button class="mini-btn ghost" @click="row.rejecting = true">驳回</button>
                </template>
                <template v-else>
                  <input v-model="row.rejectReason" type="text" class="input-text input-sm reject-reason" placeholder="驳回原因（留 UI 日志，不落库）" />
                  <button class="mini-btn danger" :disabled="!row.rejectReason.trim()" @click="rejectCandidate(row)">确认驳回</button>
                  <button class="mini-btn ghost" @click="row.rejecting = false; row.rejectReason = ''">取消</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="stage-actions">
        <button class="action-btn ghost" :disabled="!evidenceVerified" @click="addCandidate">+ 按材料添加一局</button>
      </div>

      <div v-if="rejectedLog.length > 0" class="rejected-log">
        <div class="log-head">本会话驳回日志（仅界面留痕，不落库）</div>
        <div v-for="(item, i) in rejectedLog" :key="i" class="log-line">
          <span class="font-mono">{{ item.time }}</span>
          <span>证据 {{ item.evidenceId }} · 序号 #{{ item.slot }}</span>
          <span>原因：{{ item.reason }}</span>
        </div>
      </div>
    </section>

    <!-- ⑥ 提交导入（verified 不随导入授予 → 全部 PENDING；不发送 availableAt） -->
    <section class="stage-panel">
      <div class="stage-head">
        <span class="stage-no">⑥</span>
        <h3 class="stage-title">提交导入（全部以待核验状态入库）</h3>
        <span class="stage-state" :class="importResult ? 'done' : 'todo'">{{ importResult ? '已提交' : '待提交' }}</span>
      </div>
      <p class="honest-note">
        提交只产生 PENDING 候选：统计口径不读取待核验记录，必须经⑦逐条人工放行后才计入选手统计。
        收录时间（availableAt）由服务端在导入/核验时刻生成，表单不填写、不回填历史时间。
      </p>
      <div class="stage-actions">
        <button class="action-btn primary" :disabled="!submitReady" @click="submitCandidates">
          {{ isSubmitting ? '提交中…' : `提交 ${candidateRows.length} 局候选（PENDING）` }}
        </button>
      </div>
      <div v-if="importResult" class="import-result-card">
        <span>批次 <span class="font-mono">{{ importResult.batchId }}</span></span>
        <span>新增 {{ importResult.inserted }} 条</span>
        <span v-if="(importResult.superseded ?? 0) > 0">更正取代 {{ importResult.superseded }} 条</span>
        <span v-if="importResult.duplicates > 0">重复忽略 {{ importResult.duplicates }} 条</span>
      </div>
    </section>

    <!-- ⑦ 待核验候选台账：逐条人工放行（verifyMatch：SCD-2，availableAt=实际核验时刻） -->
    <section class="stage-panel">
      <div class="stage-head">
        <span class="stage-no">⑦</span>
        <h3 class="stage-title">待核验候选 · 逐条放行</h3>
        <span class="stage-state todo">{{ pendingRows.length }} 条待核验</span>
      </div>
      <div class="pending-toolbar">
        <label class="zoom-toggle">
          <input v-model="pendingFilterEvidence" type="checkbox" />
          仅看当前证据的候选
        </label>
        <button class="action-btn ghost" :disabled="isLoadingPending" @click="loadPending">
          {{ isLoadingPending ? '刷新中…' : '刷新待核验列表' }}
        </button>
      </div>
      <div v-if="displayPendingRows.length === 0" class="stage-empty">
        {{ isLoadingPending ? '加载中…' : '当前没有待核验候选记录' }}
      </div>
      <div v-else class="candidate-table-wrap">
        <table class="candidate-table">
          <thead>
            <tr>
              <th>记录 ID</th>
              <th>稳定键 / 版本</th>
              <th>选手</th>
              <th>对局时间</th>
              <th>模式</th>
              <th>名次</th>
              <th>材料定位</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in displayPendingRows" :key="m.id">
              <td class="font-mono td-id">{{ m.id }}</td>
              <td class="font-mono">
                {{ m.recordKey || '—' }} · r{{ m.revision ?? '—' }}
              </td>
              <td class="font-mono">{{ m.playerId }}</td>
              <td>{{ formatDateTime(m.matchTime) }}</td>
              <td>{{ m.mode || '—' }}</td>
              <td class="center-cell">{{ m.finalRank }}</td>
              <td>{{ m.evidenceLocator ?? '—' }}</td>
              <td class="center-cell">
                <button
                  class="mini-btn"
                  :disabled="verifyingIds.has(m.id) || !operatorInput.trim()"
                  :title="operatorInput.trim() ? '' : '请先在顶部填写操作人（verifiedBy）'"
                  @click="confirmPending(m)"
                >
                  {{ verifyingIds.has(m.id) ? '放行中…' : '确认核验放行' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="honest-note">
        放行 = 以实际核验时刻建立新可见版本（SCD-2）：过去任何截点的统计不受回写影响。
        不放行的候选保持 PENDING，不计入任何公开统计。
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
// v4 W2 · 单人真实战绩人工导入页
//
// 铁律（任务书 W2）：
// - 只承接本人授权截图（PERSONAL_SCREENSHOT），一键都不碰账号/密码/会话
// - 上传 ≠ 核验：材料须人工确认有效（VERIFIED）后才能绑定候选记录
// - 单人导入不要求其余五席：一次只录一个人的对局，可选字段留空一律 null（不造默认值）
// - recordKey 恒为 ev:证据编号:材料内序号；时间/名次更正走 revision+1（SCD-2），不裂键
// - 表单不发送 availableAt（服务端以导入/核验时刻生成）
// - 驳回仅发生在提交前：移除候选行 + 原因留界面日志，不落库
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  setAdminToken,
  hasAdminToken,
  AdminTokenMissingError,
  uploadEvidence,
  verifyEvidence,
  fetchEvidenceObjectUrl,
  fetchPlayersList,
  importMatchRecords,
  fetchAdminMatches,
  verifyMatch,
  type EvidenceRecord,
  type ImportBatchResult,
  type MatchRecord,
  type PlayerRecord
} from '../api'

// —— 消息条 ——
const alertMessage = ref('')
const alertType = ref<'success' | 'error'>('success')

function showAlert(msg: string, type: 'success' | 'error' = 'success') {
  alertMessage.value = msg
  alertType.value = type
}

// —— 管理凭证 + 操作人 ——
const tokenConfigured = ref(hasAdminToken())
const tokenInput = ref('')
const showToken = ref(false)
const operatorInput = ref('')

function requireToken(): boolean {
  if (hasAdminToken()) return true
  showAlert('请先在顶部录入管理 Token（写接口未配置凭证时拒绝发起）', 'error')
  return false
}

function saveToken() {
  const t = tokenInput.value.trim()
  if (!t) {
    showAlert('请先粘贴管理 Token 再保存', 'error')
    return
  }
  setAdminToken(t)
  tokenConfigured.value = hasAdminToken()
  tokenInput.value = ''
  showAlert('管理凭证已保存（仅本机记忆），写接口已可用', 'success')
}

function clearToken() {
  setAdminToken(null)
  tokenConfigured.value = hasAdminToken()
  showToken.value = false
  showAlert('管理凭证已清除；写接口将拒绝发起', 'success')
}

// —— ①②③ 材料：上传 → 预览 → 人工确认 ——
const evidenceCapturedAt = ref(toLocalDatetime(new Date()))
const isUploading = ref(false)
const isVerifyingEvidence = ref(false)
const isDragOver = ref(false)
const currentEvidence = ref<EvidenceRecord | null>(null)
const previewUrl = ref('')
const previewZoomed = ref(false)

const materialReady = computed(() => !!currentEvidence.value?.hasOriginal)
const evidenceVerified = computed(
  () => currentEvidence.value?.status === 'VERIFIED' && currentEvidence.value.hasOriginal
)

function toLocalDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function evidenceStatusText(status: string): string {
  if (status === 'VERIFIED') return '已确认有效'
  if (status === 'QUARANTINED') return '已隔离'
  return '待人工确认（PENDING）'
}

function evidenceStatusClass(status: string): string {
  if (status === 'VERIFIED') return 'status-verified'
  if (status === 'QUARANTINED') return 'status-qua'
  return 'status-pending'
}

function setPreviewFromObjectUrl(url: string) {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = url
}

function setPreviewFromFile(file: File) {
  setPreviewFromObjectUrl(URL.createObjectURL(file))
}

async function loadServerPreview() {
  if (!currentEvidence.value?.hasOriginal) return
  try {
    setPreviewFromObjectUrl(await fetchEvidenceObjectUrl(currentEvidence.value.id))
  } catch (err: any) {
    if (err instanceof AdminTokenMissingError) {
      showAlert(err.message, 'error')
      return
    }
    showAlert(`原件载入失败: ${err?.message || '未知错误'}`, 'error')
  }
}

/** 新材料入库成功后重置下游阶段：证据变更则序号重新编排，旧候选/台账一并刷新 */
function resetDownstreamForNewEvidence() {
  candidateRows.value = []
  importResult.value = null
  void loadPending()
}

async function ingestMaterial(file: File) {
  if (!requireToken()) return
  const capturedMs = new Date(evidenceCapturedAt.value).getTime()
  if (!evidenceCapturedAt.value || Number.isNaN(capturedMs)) {
    showAlert('请先正确填写材料采集时间（必填的最小元信息）', 'error')
    return
  }
  isUploading.value = true
  try {
    const res = await uploadEvidence(file, {
      capturedAt: new Date(capturedMs).toISOString(),
      kind: 'PERSONAL_SCREENSHOT',
      usageScope: 'INTERNAL_ONLY'
    })
    currentEvidence.value = res.evidence
    setPreviewFromFile(file)
    resetDownstreamForNewEvidence()
    if (res.deduplicated) {
      showAlert(
        `该原件已入库为证据 ${res.evidence.id}（内容去重复用），状态如实回显：${evidenceStatusText(res.evidence.status)}`,
        'success'
      )
      if (res.evidence.hasOriginal && !previewUrl.value) void loadServerPreview()
    } else {
      showAlert(
        `原件已上传入库：${res.evidence.id}（${evidenceStatusText(res.evidence.status)}）—— 上传不等于核验，请先「确认材料有效」`,
        'success'
      )
    }
  } catch (err: any) {
    if (err instanceof AdminTokenMissingError) {
      showAlert(err.message, 'error')
      return
    }
    showAlert(`原件上传失败: ${err?.message || '未知错误'}${err?.code ? `（${err.code}）` : ''}`, 'error')
  } finally {
    isUploading.value = false
  }
}

function handleFileChange(e: Event) {
  const file = (e.target as HTMLInputElement)?.files?.[0]
  if (file) void ingestMaterial(file)
}

function handlePaste(e: ClipboardEvent) {
  const file = Array.from(e.clipboardData?.files || [])[0]
  if (file) void ingestMaterial(file)
}

function handleDrop(e: DragEvent) {
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) void ingestMaterial(file)
}

async function confirmEvidence() {
  if (!currentEvidence.value || !requireToken()) return
  const operator = operatorInput.value.trim()
  if (!operator) {
    showAlert('请先在顶部填写操作人（verifiedBy）—— 人工确认必须留审计痕迹', 'error')
    return
  }
  isVerifyingEvidence.value = true
  try {
    currentEvidence.value = await verifyEvidence(currentEvidence.value.id, operator)
    showAlert(`材料 ${currentEvidence.value.id} 已确认有效（VERIFIED），可绑定候选对局`, 'success')
  } catch (err: any) {
    if (err instanceof AdminTokenMissingError) {
      showAlert(err.message, 'error')
      return
    }
    showAlert(`确认材料有效失败: ${err?.message || '未知错误'}`, 'error')
  } finally {
    isVerifyingEvidence.value = false
  }
}

// —— ④ 归属身份 ——
const playerIdInput = ref('')
const nicknameInput = ref('')
const isCheckingIdentity = ref(false)
const identityChecked = ref(false)
const idKnown = ref(false)
const archiveNickname = ref<string | null>(null)
const sameNicknamePlayers = ref<PlayerRecord[]>([])
const nicknameMismatchConfirmed = ref(false)

const nicknameMismatch = computed(
  () => idKnown.value && !!archiveNickname.value && archiveNickname.value !== nicknameInput.value.trim()
)
const identityReady = computed(
  () =>
    identityChecked.value &&
    !!playerIdInput.value.trim() &&
    !!nicknameInput.value.trim() &&
    (!nicknameMismatch.value || nicknameMismatchConfirmed.value)
)

function resetIdentityCheck() {
  identityChecked.value = false
  idKnown.value = false
  archiveNickname.value = null
  sameNicknamePlayers.value = []
  nicknameMismatchConfirmed.value = false
}

async function checkIdentity() {
  const pid = playerIdInput.value.trim()
  const nick = nicknameInput.value.trim()
  if (!pid || !nick) {
    showAlert('选手 ID 与昵称均为必填（材料所示原文）', 'error')
    return
  }
  isCheckingIdentity.value = true
  try {
    const { players } = await fetchPlayersList({})
    const byId = players.find(p => p.id === pid) || null
    idKnown.value = !!byId
    archiveNickname.value = byId?.nickname ?? null
    sameNicknamePlayers.value = players.filter(p => p.nickname === nick && p.id !== pid)
    identityChecked.value = true
  } catch (err: any) {
    showAlert(`选手库核对失败: ${err?.message || '未知错误'}`, 'error')
  } finally {
    isCheckingIdentity.value = false
  }
}

// —— ⑤ 候选行 ——
interface CandidateRow {
  localId: number
  slot: number
  matchTime: string
  mode: string
  finalRank: string
  commander: string
  lineup: string
  roundsSurvived: string
  evidenceLocator: string
  rejecting: boolean
  rejectReason: string
}

const candidateRows = ref<CandidateRow[]>([])
const rejectedLog = ref<Array<{ time: string; evidenceId: string; slot: number; reason: string }>>([])
let localIdSeq = 1

function rowRecordKey(row: CandidateRow): string {
  return currentEvidence.value ? `ev:${currentEvidence.value.id}:${row.slot}` : ''
}

function rowKeyExists(row: CandidateRow): boolean {
  const key = rowRecordKey(row)
  return !!key && pendingRows.value.some(p => p.recordKey === key)
}

function nextRevisionFor(recordKey: string): number {
  const revisions = pendingRows.value.filter(p => p.recordKey === recordKey).map(p => p.revision ?? 1)
  return (revisions.length > 0 ? Math.max(...revisions) : 0) + 1
}

function rowValid(row: CandidateRow): boolean {
  const t = new Date(row.matchTime).getTime()
  const rank = Number(row.finalRank)
  if (!row.matchTime || Number.isNaN(t)) return false
  if (!Number.isInteger(rank) || rank < 1 || rank > 6) return false
  if (row.roundsSurvived !== '' && !Number.isInteger(Number(row.roundsSurvived))) return false
  return true
}

const candidatesValid = computed(
  () => candidateRows.value.length > 0 && candidateRows.value.every(rowValid)
)

function addCandidate() {
  if (!currentEvidence.value) {
    showAlert('请先上传材料原件（序号是稳定键的组成段，必须先有证据编号）', 'error')
    return
  }
  const maxSlot = candidateRows.value.reduce((m, r) => Math.max(m, r.slot), 0)
  candidateRows.value.push({
    localId: localIdSeq++,
    slot: maxSlot + 1,
    matchTime: '',
    mode: '',
    finalRank: '',
    commander: '',
    lineup: '',
    roundsSurvived: '',
    evidenceLocator: '',
    rejecting: false,
    rejectReason: ''
  })
}

function rejectCandidate(row: CandidateRow) {
  const reason = row.rejectReason.trim()
  if (!reason) return
  candidateRows.value = candidateRows.value.filter(r => r.localId !== row.localId)
  rejectedLog.value.unshift({
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    evidenceId: currentEvidence.value?.id || '—',
    slot: row.slot,
    reason
  })
}

// —— ⑥ 提交（PENDING；不发送 availableAt） ——
const isSubmitting = ref(false)
const importResult = ref<ImportBatchResult | null>(null)

const submitReady = computed(
  () =>
    evidenceVerified.value &&
    identityReady.value &&
    candidatesValid.value &&
    !isSubmitting.value &&
    candidateRows.value.length > 0
)

async function submitCandidates() {
  if (!currentEvidence.value || !submitReady.value) return
  const pid = playerIdInput.value.trim()
  const nick = nicknameInput.value.trim()
  isSubmitting.value = true
  try {
    // 不发送 availableAt：服务端以导入时刻生成（任务书 W2 表格）；
    // 同键更正 → revision+1，旧候选被取代（SCD-2），不会裂成两条 ACTIVE
    const records = candidateRows.value.map(r => ({
      playerId: pid,
      nickname: nick,
      matchTime: new Date(r.matchTime).toISOString(),
      finalRank: Number(r.finalRank),
      mode: r.mode || null,
      commander: r.commander.trim() || null,
      lineup: r.lineup.trim() || null,
      roundsSurvived: r.roundsSurvived === '' ? null : Number(r.roundsSurvived),
      evidenceId: currentEvidence.value!.id,
      slot: r.slot,
      evidenceLocator: r.evidenceLocator.trim() || null,
      revision: nextRevisionFor(rowRecordKey(r))
    }))
    importResult.value = await importMatchRecords(records, 'PERSONAL_IMPORT')
    candidateRows.value = []
    showAlert(
      `已提交 ${records.length} 局候选（批次 ${importResult.value.batchId}）：全部 PENDING 待核验，统计尚未计入 —— 请在⑦逐条放行`,
      'success'
    )
    await loadPending()
  } catch (err: any) {
    if (err instanceof AdminTokenMissingError) {
      showAlert(err.message, 'error')
      return
    }
    showAlert(`候选提交失败: ${err?.message || '未知错误'}`, 'error')
  } finally {
    isSubmitting.value = false
  }
}

// —— ⑦ 待核验台账与逐条放行 ——
const pendingRows = ref<MatchRecord[]>([])
const isLoadingPending = ref(false)
const verifyingIds = ref(new Set<string>())
const pendingFilterEvidence = ref(true)

const displayPendingRows = computed(() =>
  pendingFilterEvidence.value && currentEvidence.value
    ? pendingRows.value.filter(m => m.evidenceId === currentEvidence.value!.id)
    : pendingRows.value
)

async function loadPending() {
  if (!hasAdminToken()) return
  isLoadingPending.value = true
  try {
    const res = await fetchAdminMatches({ recordStatus: 'PENDING', limit: 200 })
    pendingRows.value = res.data
  } catch (err: any) {
    if (err instanceof AdminTokenMissingError) return
    showAlert(`待核验列表加载失败: ${err?.message || '未知错误'}`, 'error')
  } finally {
    isLoadingPending.value = false
  }
}

async function confirmPending(m: MatchRecord) {
  const operator = operatorInput.value.trim()
  if (!operator) {
    showAlert('请先在顶部填写操作人（verifiedBy）—— 放行动作必须留审计痕迹', 'error')
    return
  }
  verifyingIds.value.add(m.id)
  try {
    const updated = await verifyMatch(m.id, {
      verifiedBy: operator,
      ...(m.evidenceId ? { evidenceId: m.evidenceId } : {})
    })
    showAlert(
      `记录 ${m.recordKey || m.id} 已核验放行（revision ${updated.revision ?? '—'}，availableAt=实际核验时刻），统计口径现已计入`,
      'success'
    )
    await loadPending()
  } catch (err: any) {
    if (err instanceof AdminTokenMissingError) {
      showAlert(err.message, 'error')
      return
    }
    showAlert(`放行失败: ${err?.message || '未知错误'}`, 'error')
  } finally {
    verifyingIds.value.delete(m.id)
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('zh-CN', { hour12: false })
}

onMounted(() => {
  void loadPending()
})

onBeforeUnmount(() => {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<style lang="scss" scoped>
.personal-import-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 16px 40px;
  box-sizing: border-box;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.title-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.view-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0f172a;
}

.view-desc {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.audit-counter {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;

  @media (max-width: 600px) {
    align-items: flex-start;
  }
}

.counter-label {
  font-size: 11px;
  color: #94a3b8;
}

.counter-num {
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.alert-banner {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.6;
  border: 1px solid;

  &.success {
    background: #f0fdf4;
    border-color: #bbf7d0;
    color: #166534;
  }

  &.error {
    background: #fef2f2;
    border-color: #fecaca;
    color: #991b1b;
  }
}

.alert-close {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: inherit;
  padding: 0 2px;
}

// —— 凭证 + 操作人面板 ——
.token-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 16px 20px;

  .token-status-col {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 240px;
    flex: 1;
  }

  .token-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #cbd5e1;
    flex-shrink: 0;

    &.active {
      background: #22c55e;
    }
  }

  .token-texts {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .token-title {
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
  }

  .token-sub {
    font-size: 12px;
    color: #64748b;
  }

  .token-input-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 220px;
  }

  .operator-col {
    .operator-label {
      font-size: 12px;
      color: #475569;
      font-weight: 600;
    }
  }

  .token-btn-row {
    display: flex;
    gap: 8px;
  }
}

.token-input {
  height: 34px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 13px;
  background: #f8fafc;

  &:focus {
    outline: none;
    border-color: #6366f1;
    background: #ffffff;
  }
}

.token-btn {
  border: 1px solid #cbd5e1;
  background: #ffffff;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  color: #334155;

  &.primary {
    background: #1e293b;
    border-color: #1e293b;
    color: #ffffff;
  }

  &.ghost:hover {
    border-color: #94a3b8;
  }
}

// —— 阶段面板 ——
.stage-panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;

  &.is-done {
    border-color: #86efac;
  }
}

.stage-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.stage-no {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #eef2ff;
  color: #4338ca;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.stage-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.stage-state {
  margin-left: auto;
  font-size: 12px;
  border-radius: 999px;
  padding: 3px 10px;
  border: 1px solid;

  &.done {
    background: #f0fdf4;
    border-color: #bbf7d0;
    color: #166534;
  }

  &.todo {
    background: #f8fafc;
    border-color: #e2e8f0;
    color: #64748b;
  }
}

.stage-empty {
  border: 1px dashed #cbd5e1;
  border-radius: 10px;
  padding: 18px;
  text-align: center;
  font-size: 13px;
  color: #94a3b8;
}

.stage-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.honest-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: #64748b;
  background: #f8fafc;
  border-left: 3px solid #cbd5e1;
  border-radius: 0 8px 8px 0;
  padding: 8px 12px;
}

.upload-meta-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.field-input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 12px;
    color: #475569;
    font-weight: 600;
  }

  &.flex-1 {
    flex: 1;
    min-width: 200px;
  }
}

.input-text,
.input-select {
  height: 34px;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0 10px;
  font-size: 13px;
  background: #ffffff;
  min-width: 0;

  &:focus {
    outline: none;
    border-color: #6366f1;
  }
}

.input-sm {
  height: 30px;
  font-size: 12px;
  padding: 0 8px;
}

.input-file {
  font-size: 12px;
  color: #475569;
}

.evidence-drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
  padding: 22px 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s ease;

  &.is-dragover {
    border-color: #6366f1;
    background: #eef2ff;
  }

  .drop-icon {
    font-size: 22px;
  }

  .drop-main {
    font-size: 13px;
    font-weight: 600;
    color: #334155;
  }

  .drop-sub {
    font-size: 12px;
    color: #64748b;
    max-width: 560px;
  }
}

.hash-meta-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  .meta-row {
    display: flex;
    gap: 8px;
    font-size: 12px;
    flex-wrap: wrap;
    word-break: break-all;

    .label {
      color: #64748b;
      flex-shrink: 0;
    }

    .hash-val {
      color: #0f172a;
    }
  }
}

.status-verified {
  color: #166534;
}

.status-pending {
  color: #b45309;
}

.status-qua {
  color: #b91c1c;
}

// —— 预览 ——
.preview-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.zoom-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #334155;
  cursor: pointer;
}

.preview-note {
  font-size: 12px;
  color: #94a3b8;
}

.preview-scroll {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  overflow: auto;
  max-height: 480px;
  background: #f1f5f9;

  &.is-zoomed .preview-img {
    transform: scale(2);
    transform-origin: top left;
  }
}

.preview-img {
  display: block;
  max-width: 100%;
}

// —— 身份 ——
.identity-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.identity-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.warn-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 8px 12px;
}

.ok-line {
  margin: 0;
  font-size: 12px;
  color: #166534;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 8px 12px;
}

.confirm-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
  cursor: pointer;
  color: #92400e;
}

// —— 候选表 ——
.candidate-table-wrap {
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.candidate-table {
  width: 100%;
  min-width: 960px;
  border-collapse: collapse;
  font-size: 12px;

  th,
  td {
    padding: 8px 10px;
    border-bottom: 1px solid #f1f5f9;
    text-align: left;
    vertical-align: top;
    white-space: nowrap;
  }

  th {
    background: #f8fafc;
    color: #475569;
    font-weight: 600;
  }

  tr.is-rejecting td {
    background: #fef2f2;
  }
}

.center-cell {
  text-align: center !important;
}

.td-id {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.slot-chip {
  display: inline-block;
  background: #eef2ff;
  color: #4338ca;
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
}

.rev-chip {
  display: inline-block;
  margin-left: 4px;
  background: #fff7ed;
  color: #9a3412;
  border: 1px solid #fed7aa;
  border-radius: 6px;
  padding: 0 5px;
  font-size: 11px;
}

.row-warn {
  margin-top: 4px;
  font-size: 11px;
  color: #b45309;
  white-space: normal;
  width: 180px;
}

.reject-reason {
  width: 160px;
  white-space: normal;
}

.action-cell {
  min-width: 150px;

  button,
  input {
    margin-bottom: 4px;
  }
}

.rejected-log {
  border: 1px dashed #fca5a5;
  border-radius: 10px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  .log-head {
    font-size: 12px;
    font-weight: 700;
    color: #991b1b;
  }

  .log-line {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 12px;
    color: #7f1d1d;
  }
}

.mini-btn {
  border: 1px solid #2563eb;
  background: #2563eb;
  color: #ffffff;
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.ghost {
    background: #ffffff;
    color: #2563eb;
  }

  &.danger {
    background: #dc2626;
    border-color: #dc2626;
  }
}

.action-btn {
  border: 1px solid #1e293b;
  background: #1e293b;
  color: #ffffff;
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  align-self: flex-start;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  &.primary {
    background: #4338ca;
    border-color: #4338ca;
  }

  &.ghost {
    background: #ffffff;
    color: #1e293b;
  }
}

.import-result-card {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
}

.pending-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .stage-state {
    margin-left: 0;
  }

  .candidate-table {
    min-width: 860px;
  }
}
</style>
