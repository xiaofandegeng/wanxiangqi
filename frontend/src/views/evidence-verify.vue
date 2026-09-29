<template>
  <div class="evidence-verify-view">
    <div class="view-header">
      <div class="title-col">
        <h2 class="view-title">证据核验工作台</h2>
        <p class="view-desc">
          SHA-256 材料存证 · 六席位人工校对落库 · 批量战绩导入（全部以待核验状态入库，核验通过后统计才生效）
        </p>
      </div>
      <div class="audit-counter">
        <span class="counter-label">持久化引擎:</span>
        <span class="counter-num">PostgreSQL 规范事实库</span>
      </div>
    </div>

    <!-- 顶部消息提示区 (真实反馈) -->
    <div v-if="alertMessage" class="alert-banner" :class="alertType">
      <span>{{ alertMessage }}</span>
      <button class="alert-close" @click="alertMessage = ''">×</button>
    </div>

    <!-- 管理凭证治理面板：写接口必须由运营者显式录入 Token（不落仓库、不写死） -->
    <div class="token-panel" :class="{ 'is-configured': tokenConfigured }">
      <div class="token-status-col">
        <span class="token-dot" :class="{ active: tokenConfigured }"></span>
        <div class="token-texts">
          <span class="token-title">{{ tokenConfigured ? '管理凭证已配置' : '管理凭证未配置' }}</span>
          <span class="token-sub">
            {{ tokenConfigured
              ? '已在本机记忆管理 Token（localStorage），可执行写操作；凭证不进入仓库与日志'
              : '席位确认 / 批量导入等写接口需要管理 Token（服务端 ADMIN_TOKEN 环境变量），由运营者提供' }}
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
    </div>

    <!-- 工作台双栏布局 (窄屏自动变为单栏，绝不裁切) -->
    <div class="verify-layout-grid">
      <!-- 左侧：证据原图与哈希存证 -->
      <div class="verify-panel">
        <div class="panel-top">
          <h3 class="panel-title">原始材料存证 (Evidence)</h3>
          <span class="evidence-type-badge">实盘对决房间截图</span>
        </div>

        <!-- 材料粘贴 / 拖拽上传（仅计算 SHA-256 哈希，不做识别） -->
        <div
          class="evidence-drop-zone"
          :class="{ 'is-dragover': isDragOver }"
          tabindex="0"
          @paste="handlePaste"
          @dragover.prevent="isDragOver = true"
          @dragleave.prevent="isDragOver = false"
          @drop.prevent="handleDrop"
        >
          <span class="drop-icon">📋</span>
          <span class="drop-main">粘贴截图（Cmd+V / Ctrl+V）或拖拽到此处</span>
          <span class="drop-sub">{{ isHashing ? '正在计算 SHA-256…' : '客户端仅计算材料哈希，席位信息由人工在右侧录入' }}</span>
        </div>

        <div class="hash-meta-card">
          <div class="meta-row">
            <span class="label">SHA-256 存证指纹:</span>
            <span class="hash-val font-mono">{{ evidenceSha256 || '尚未上传材料（可留空直接录入席位）' }}</span>
          </div>
          <div class="meta-row">
            <span class="label">存证状态:</span>
            <span class="status-verified font-bold">{{ evidenceSha256 ? '已计算哈希，随席位校对一并提交' : '未上传材料' }}</span>
          </div>
          <div class="meta-row">
            <span class="label">入库保护机制:</span>
            <span class="text-secondary">严格 1~6 整数名次校验 · 导入记录一律以待核验状态入库</span>
          </div>
        </div>

        <!-- 已录入席位摘要（如实反映右侧输入，未知即空） -->
        <div class="screenshot-preview-box">
          <div class="evidence-preview-card">
            <div class="preview-header">
              <span class="room-title">{{ matchTitle || '未命名对决' }}</span>
              <span class="room-tag">{{ evidenceSha256 ? '哈希就绪' : '待存证' }}</span>
            </div>
            <div class="slots-summary-list">
              <div v-for="slot in verifiedSlots" :key="slot.slot" class="slot-summary-item">
                <span class="s-slot">席位 {{ slot.slot }}</span>
                <span class="s-nick">{{ slot.nickname || '未录入' }}</span>
                <span class="s-rank">
                  {{ slot.rankScore != null ? `${slot.rankScore}★` : '' }}{{ slot.rankText || '' }}{{ (slot.rankScore == null && !slot.rankText) ? '段位未录入' : '' }}
                </span>
                <span class="s-odds">{{ slot.odds != null ? `${slot.odds}x` : '' }}</span>
                <span class="s-pos">{{ slot.finalRank != null ? `第 ${slot.finalRank} 名` : '名次未录入' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：逐席位核验与数据导入 -->
      <div class="verify-panel">
        <div class="panel-top">
          <h3 class="panel-title">席位校对与数据导入</h3>
          <div class="tab-switch">
            <button
              class="tab-btn"
              :class="{ active: currentTab === 'MANUAL' }"
              @click="currentTab = 'MANUAL'"
            >
              席位校对确认
            </button>
            <button
              class="tab-btn"
              :class="{ active: currentTab === 'BATCH' }"
              @click="currentTab = 'BATCH'"
            >
              批量战绩导入 (JSON)
            </button>
          </div>
        </div>

        <!-- Tab 1: 席位字段逐行校对与持久化（空白起步，无预填） -->
        <div v-if="currentTab === 'MANUAL'" class="fields-list">
          <div class="meta-inputs-row">
            <div class="field-input-group flex-2">
              <label>对决标题</label>
              <input v-model="matchTitle" type="text" class="input-text" placeholder="按材料原文填写" />
            </div>
            <div class="field-input-group flex-1">
              <label>比赛模式</label>
              <select v-model="matchMode" class="input-select">
                <option value="">未指定（人工核定后再改）</option>
                <option value="RANKED_DIAMOND">巅峰排位</option>
                <option value="TOURNAMENT">赛事对决</option>
              </select>
            </div>
          </div>

          <div class="table-scroll-wrapper">
            <table class="slots-edit-table">
              <thead>
                <tr>
                  <th style="width: 40px">席</th>
                  <th>选手昵称</th>
                  <th>段位/星级</th>
                  <th>名次 (1~6)</th>
                  <th>主弈者</th>
                  <th>核心体系</th>
                  <th>参考倍率</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="slot in verifiedSlots" :key="slot.slot">
                  <td class="td-slot">#{{ slot.slot }}</td>
                  <td>
                    <input v-model="slot.nickname" type="text" class="table-input" placeholder="必填" />
                  </td>
                  <td>
                    <div class="dual-input">
                      <input v-model="slot.rankText" type="text" class="table-input" style="width: 70px" placeholder="段位" />
                      <input v-model.number="slot.rankScore" type="number" class="table-input font-mono" style="width: 70px" placeholder="星级" />
                    </div>
                  </td>
                  <td>
                    <input
                      v-model.number="slot.finalRank"
                      type="number"
                      min="1"
                      max="6"
                      class="table-input font-mono center"
                      style="width: 50px"
                    />
                  </td>
                  <td>
                    <input v-model="slot.commander" type="text" class="table-input" style="width: 70px" placeholder="可空" />
                  </td>
                  <td>
                    <input v-model="slot.lineup" type="text" class="table-input" placeholder="可空" />
                  </td>
                  <td>
                    <input v-model.number="slot.odds" type="number" step="0.1" class="table-input font-mono" style="width: 55px" placeholder="可空" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p class="honest-note">
            段位 / 主弈者 / 体系 / 倍率材料中没有就留空——未知字段入库为 NULL 并如实展示，不做默认值填充。
          </p>

          <div class="panel-actions">
            <button
              class="btn-confirm"
              :disabled="isSubmitting"
              @click="submitSlotAudit"
            >
              <span v-if="isSubmitting">正在持久化存盘...</span>
              <span v-else-if="confirmedEventId">✓ 已存入主数据库 ({{ confirmedEventId }})</span>
              <span v-else>确认校对并持久化至主数据库</span>
            </button>
          </div>
        </div>

        <!-- Tab 2: 批量数据导入 (严格遵循后端校验，不伪造成功) -->
        <div v-else class="batch-import-wrap">
          <p class="import-tip">
            粘贴符合规范的 JSON 战绩流水。后端将严格校验必填项、有效 ISO 时间与 1~6 整数名次并执行幂等去重。
            注意：<strong>导入记录一律以待核验（PENDING）状态入库</strong>，入参中的 verified 字段会被服务端忽略，
            需在核验动作通过后统计才生效。
          </p>
          <textarea
            v-model="batchJsonText"
            class="import-textarea font-mono"
            rows="9"
            placeholder="[
  {
    &quot;playerId&quot;: &quot;p-xxx&quot;,
    &quot;matchTime&quot;: &quot;2026-09-27T11:20:00.000Z&quot;,
    &quot;finalRank&quot;: 1,
    &quot;commander&quot;: &quot;可空&quot;,
    &quot;lineup&quot;: &quot;可空&quot;,
    &quot;roundsSurvived&quot;: 34,
    &quot;threeStars&quot;: []
  }
]"
          ></textarea>

          <div class="import-actions">
            <button class="btn-import" :disabled="isImporting" @click="submitBatchImport">
              {{ isImporting ? '后端校验入库中...' : '提交批量战绩到主库' }}
            </button>
            <button class="btn-fill-template" @click="fillTemplate">
              填入格式示例（非真实数据，需替换）
            </button>
          </div>

          <!-- 真实导入结果呈现 (F05) -->
          <div v-if="importResult" class="import-result-card">
            <span class="result-title">后端持久化导入反馈:</span>
            <div class="result-grid">
              <span class="result-item">批次号: <code class="font-mono">{{ importResult.batchId }}</code></span>
              <span class="result-item text-success">成功新增事实: {{ importResult.inserted }} 条（待核验）</span>
              <span class="result-item text-secondary">重复跳过 (幂等): {{ importResult.duplicates }} 条</span>
              <span class="result-item text-primary">版本更正替换: {{ importResult.superseded || 0 }} 条</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import {
  confirmSlotAudit,
  importMatchRecords,
  getAdminToken,
  setAdminToken,
  hasAdminToken,
  AdminTokenMissingError,
  type ImportBatchResult
} from '../api'
import { computeFileSha256 } from '../utils/image-analyzer'

const currentTab = ref<'MANUAL' | 'BATCH'>('MANUAL')
const isSubmitting = ref(false)
const isImporting = ref(false)
const confirmedEventId = ref('')
const batchJsonText = ref('')
const importResult = ref<ImportBatchResult | null>(null)

const alertMessage = ref('')
const alertType = ref<'success' | 'error'>('success')

// —— 管理凭证（运营者显式录入；不硬编码、不入仓库） ——
const tokenConfigured = ref(hasAdminToken())
const tokenInput = ref('')
const showToken = ref(false)

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

// —— 材料存证：粘贴/拖拽计算 SHA-256（不做识别，不预填名单） ——
const evidenceSha256 = ref('')
const isHashing = ref(false)
const isDragOver = ref(false)

const matchTitle = ref('')
const matchMode = ref('')

interface EditableSlot {
  slot: number
  nickname: string
  rankText: string | null
  rankScore: number | null
  odds: number | null
  finalRank: number | null
  commander: string | null
  lineup: string | null
}

// 六席位空白起步：一切以材料原文人工录入，无任何预填假数据
const verifiedSlots = ref<EditableSlot[]>(
  Array.from({ length: 6 }, (_, i) => ({
    slot: i + 1,
    nickname: '',
    rankText: null,
    rankScore: null,
    odds: null,
    finalRank: null,
    commander: null,
    lineup: null
  }))
)

async function ingestMaterial(file: File) {
  if (!file.type.startsWith('image/')) {
    showAlert('仅支持图片材料（截图）', 'error')
    return
  }
  isHashing.value = true
  try {
    evidenceSha256.value = await computeFileSha256(file)
    showAlert(`材料哈希已计算：${evidenceSha256.value.slice(0, 16)}…，请在右侧录入席位信息`, 'success')
  } catch (err: any) {
    showAlert(`材料哈希计算失败: ${err?.message || '未知错误'}`, 'error')
  } finally {
    isHashing.value = false
  }
}

async function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      const file = items[i].getAsFile()
      if (file) {
        await ingestMaterial(file)
        return
      }
    }
  }
}

async function handleDrop(e: DragEvent) {
  isDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) await ingestMaterial(file)
}

function showAlert(msg: string, type: 'success' | 'error' = 'success') {
  alertMessage.value = msg
  alertType.value = type
}

function requireToken(): boolean {
  if (getAdminToken()) return true
  showAlert('管理凭证未配置：请先在顶部「管理凭证」面板录入运营者提供的 Token', 'error')
  return false
}

/**
 * 真实提交席位校对持久化 (F05)
 */
async function submitSlotAudit() {
  if (!requireToken()) return

  // 前端名次合法性校验
  for (const s of verifiedSlots.value) {
    if (!Number.isInteger(s.finalRank) || (s.finalRank as number) < 1 || (s.finalRank as number) > 6) {
      showAlert(`席位 #${s.slot} 的名次必须是 1 到 6 的整数，当前为 ${s.finalRank ?? '未填写'}`, 'error')
      return
    }
    if (!s.nickname.trim()) {
      showAlert(`席位 #${s.slot} 的选手昵称不能为空`, 'error')
      return
    }
  }

  isSubmitting.value = true
  try {
    const res = await confirmSlotAudit({
      title: matchTitle.value.trim() || undefined,
      mode: matchMode.value || undefined,
      evidenceSha256: evidenceSha256.value || undefined,
      slots: verifiedSlots.value.map(s => ({
        slot: s.slot,
        nickname: s.nickname.trim(),
        rankText: s.rankText || null,
        rankScore: s.rankScore ?? null,
        odds: s.odds ?? null,
        finalRank: s.finalRank as number,
        commander: s.commander || null,
        lineup: s.lineup || null
      }))
    })

    confirmedEventId.value = res.id
    showAlert(`校对事实已成功持久化至主数据库！对局编号: ${res.id}`, 'success')
  } catch (err: any) {
    console.error('持久化保存失败:', err)
    if (err instanceof AdminTokenMissingError) {
      showAlert('管理凭证缺失或已失效，请重新在顶部面板录入 Token', 'error')
    } else {
      showAlert(`持久化失败: ${err.message}`, 'error')
    }
  } finally {
    isSubmitting.value = false
  }
}

function fillTemplate() {
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 3600000)
  batchJsonText.value = JSON.stringify([
    {
      playerId: 'p-替换为真实选手ID',
      matchTime: oneHourAgo.toISOString(),
      finalRank: 1,
      commander: null,
      lineup: null,
      roundsSurvived: 34,
      threeStars: []
    },
    {
      playerId: 'p-替换为真实选手ID',
      matchTime: oneHourAgo.toISOString(),
      finalRank: 2,
      commander: null,
      lineup: null,
      roundsSurvived: 32,
      threeStars: []
    }
  ], null, 2)
}

/**
 * 真实提交批量导入 (F05, F08)
 */
async function submitBatchImport() {
  if (!requireToken()) return
  if (!batchJsonText.value.trim()) {
    showAlert('请输入要导入的 JSON 记录', 'error')
    return
  }

  isImporting.value = true
  importResult.value = null

  try {
    let records: any
    try {
      records = JSON.parse(batchJsonText.value)
    } catch (e: any) {
      showAlert(`JSON 格式解析失败: ${e.message}`, 'error')
      isImporting.value = false
      return
    }

    if (!Array.isArray(records) || records.length === 0) {
      showAlert('批量导入数据必须为非空数组格式', 'error')
      isImporting.value = false
      return
    }

    const res = await importMatchRecords(records, 'ADMIN_WORKBENCH')
    importResult.value = res
    showAlert(`导入成功！新增 ${res.inserted} 条（待核验），跳过重复 ${res.duplicates} 条`, 'success')
  } catch (err: any) {
    console.error('批量导入失败:', err)
    if (err instanceof AdminTokenMissingError) {
      showAlert('管理凭证缺失或已失效，请重新在顶部面板录入 Token', 'error')
    } else {
      // 真实报错，绝不伪装成功！
      showAlert(`导入失败: ${err.message}`, 'error')
    }
  } finally {
    isImporting.value = false
  }
}
</script>

<style lang="scss" scoped>
.evidence-verify-view {
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
  color: #2563eb;
}

.alert-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;

  &.success {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
  }

  &.error {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: #991b1b;
  }

  .alert-close {
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: inherit;
  }
}

.token-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  background: #ffffff;
  border: 1px solid #fde68a;
  border-radius: 12px;
  padding: 14px 18px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

  &.is-configured {
    border-color: #bbf7d0;
  }

  .token-status-col {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .token-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #d97706;
    flex-shrink: 0;

    &.active {
      background: #16a34a;
      box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.15);
    }
  }

  .token-texts {
    display: flex;
    flex-direction: column;
    gap: 2px;

    .token-title {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
    }

    .token-sub {
      font-size: 11px;
      color: #64748b;
      max-width: 480px;
    }
  }

  .token-input-col {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .token-input {
    width: 240px;
    padding: 6px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 12px;
    color: #0f172a;

    &:focus {
      outline: none;
      border-color: #2563eb;
    }
  }

  .token-btn-row {
    display: flex;
    gap: 6px;
  }

  .token-btn {
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;

    &.primary {
      background: #2563eb;
      border: 1px solid #2563eb;
      color: #ffffff;

      &:hover {
        background: #1d4ed8;
      }
    }

    &.ghost {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      color: #334155;

      &:hover {
        background: #e2e8f0;
      }
    }
  }
}

.verify-layout-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  width: 100%;
  box-sizing: border-box;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
}

.verify-panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0; // 解决 flex/grid 子项宽度溢出
}

.panel-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-bottom: 14px;
  border-bottom: 1px solid #f1f5f9;
}

.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
}

.evidence-type-badge {
  font-size: 11px;
  font-weight: 600;
  background: #eff6ff;
  color: #2563eb;
  padding: 2px 8px;
  border-radius: 4px;
}

.evidence-drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  padding: 18px;
  background: #f8fafc;
  text-align: center;
  outline: none;
  transition: all 0.15s ease;

  &:focus,
  &.is-dragover {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .drop-icon {
    font-size: 22px;
  }

  .drop-main {
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
  }

  .drop-sub {
    font-size: 11px;
    color: #64748b;
  }
}

.tab-switch {
  display: flex;
  gap: 6px;
}

.tab-btn {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #475569;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;

  &.active {
    background: #2563eb;
    border-color: #2563eb;
    color: #ffffff;
    font-weight: 600;
  }
}

.screenshot-preview-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
}

.evidence-preview-card {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 8px;

  .room-tag {
    font-size: 11px;
    background: #dcfce7;
    color: #15803d;
    padding: 1px 6px;
    border-radius: 3px;
  }
}

.slots-summary-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.slot-summary-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  padding: 4px 0;
  border-bottom: 1px dashed #f1f5f9;

  .s-slot {
    font-weight: 600;
    color: #64748b;
  }
  .s-nick {
    font-weight: 600;
    color: #1e293b;
    flex: 1;
    margin-left: 8px;
  }
  .s-rank {
    color: #475569;
    margin-right: 8px;
  }
  .s-odds {
    color: #2563eb;
    font-family: monospace;
    margin-right: 8px;
  }
  .s-pos {
    font-weight: 700;
    color: #b45309;
  }
}

.hash-meta-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  flex-wrap: wrap;

  .label {
    color: #64748b;
    font-weight: 500;
  }

  .hash-val {
    word-break: break-all;
    font-size: 11px;
    color: #334155;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .status-verified {
    color: #16a34a;
  }
  .text-secondary {
    color: #475569;
  }
}

.meta-inputs-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;

  .flex-2 {
    flex: 2;
  }
  .flex-1 {
    flex: 1;
  }
}

.field-input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    font-size: 11px;
    font-weight: 600;
    color: #475569;
  }

  .input-text,
  .input-select {
    padding: 6px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    font-size: 12px;
    color: #0f172a;

    &:focus {
      outline: none;
      border-color: #2563eb;
    }
  }
}

.table-scroll-wrapper {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.slots-edit-table {
  width: 100%;
  min-width: 540px;
  border-collapse: collapse;
  text-align: left;

  th {
    background: #f8fafc;
    color: #475569;
    font-size: 11px;
    font-weight: 600;
    padding: 8px 10px;
    border-bottom: 1px solid #e2e8f0;
  }

  td {
    padding: 6px 8px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: middle;
  }

  .td-slot {
    font-weight: 700;
    color: #64748b;
    font-size: 11px;
  }

  .table-input {
    width: 100%;
    box-sizing: border-box;
    padding: 4px 6px;
    border: 1px solid #cbd5e1;
    border-radius: 4px;
    font-size: 12px;

    &.center {
      text-align: center;
    }

    &:focus {
      outline: none;
      border-color: #2563eb;
    }
  }

  .dual-input {
    display: flex;
    gap: 4px;
  }
}

.honest-note {
  margin: 0;
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.6;
}

.panel-actions {
  margin-top: 14px;
}

.btn-confirm {
  width: 100%;
  padding: 10px;
  background: #2563eb;
  border: none;
  border-radius: 6px;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: #1d4ed8;
  }

  &:disabled {
    background: #94a3b8;
    cursor: not-allowed;
  }
}

.batch-import-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.import-tip {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;

  strong {
    color: #b45309;
  }
}

.import-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: #0f172a;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: #2563eb;
  }
}

.import-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.btn-import {
  padding: 8px 16px;
  background: #2563eb;
  border: none;
  border-radius: 6px;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #1d4ed8;
  }
  &:disabled {
    background: #94a3b8;
    cursor: not-allowed;
  }
}

.btn-fill-template {
  padding: 8px 14px;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  color: #334155;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;

  &:hover {
    background: #e2e8f0;
  }
}

.import-result-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.result-title {
  font-size: 12px;
  font-weight: 700;
  color: #0f172a;
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;

  @media (max-width: 500px) {
    grid-template-columns: 1fr;
  }
}

.result-item {
  font-size: 12px;
}

.text-success {
  color: #16a34a;
  font-weight: 600;
}
.text-secondary {
  color: #64748b;
}
.text-primary {
  color: #2563eb;
  font-weight: 600;
}
</style>
