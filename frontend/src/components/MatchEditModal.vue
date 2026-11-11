<template>
  <div v-if="modelValue" class="modal-backdrop" @click.self="handleClose">
    <div class="modal-card" role="dialog" aria-modal="true" :aria-label="isEditing ? '修改对局战绩' : '录入新对局战绩'">
      <!-- 模态框头部 -->
      <header class="modal-header">
        <div class="header-titles">
          <span class="badge-tag">{{ isEditing ? '✏️ 修改对局战绩' : '➕ 录入新对局战绩' }}</span>
          <h3 class="header-title">{{ isEditing ? `校准战绩：${formData.day} 第 ${formData.ordinal} 场` : '手动录入一场王牌对决实战对局' }}</h3>
          <p class="header-desc">
            {{ isEditing ? '录入错误或选手姓名、阵容、胜者有误时，可直接在此更正。保存后将即时刷新战绩库并重新推演克制数据。' : '录入 6 席对局实况，完善历史实战样本池，录入后自动计入选手登顶榜与战力模型。' }}
          </p>
        </div>
        <button type="button" class="btn-close" aria-label="关闭" @click="handleClose">✕</button>
      </header>

      <!-- 模态框主体内容 -->
      <div class="modal-body">
        <form @submit.prevent="handleSubmit">
          <!-- 1. 基础元信息区 (日期、场次序号、Ban位) -->
          <div class="form-section-meta">
            <div class="meta-field">
              <label for="match-day" class="field-label">比赛日期 (YYYY-MM-DD)</label>
              <input
                id="match-day"
                v-model="formData.day"
                type="text"
                class="form-input"
                placeholder="例如 2026-11-09"
                required
              />
            </div>

            <div class="meta-field">
              <label for="match-ordinal" class="field-label">场次序号</label>
              <div class="ordinal-stepper">
                <button
                  type="button"
                  class="stepper-btn"
                  :disabled="formData.ordinal <= 1"
                  @click="formData.ordinal = Math.max(1, formData.ordinal - 1)"
                >
                  -
                </button>
                <input
                  id="match-ordinal"
                  v-model.number="formData.ordinal"
                  type="number"
                  class="form-input text-center"
                  min="1"
                  max="16"
                  required
                />
                <button
                  type="button"
                  class="stepper-btn"
                  :disabled="formData.ordinal >= 16"
                  @click="formData.ordinal = Math.min(16, formData.ordinal + 1)"
                >
                  +
                </button>
              </div>
            </div>

            <div class="meta-field">
              <label for="match-ban" class="field-label">本场禁用阵营 (Ban 位)</label>
              <select id="match-ban" v-model="formData.ban" class="form-select">
                <option :value="null">无禁用 (常规赛)</option>
                <option value="三分">三分 (禁用三分倒转/三分登场)</option>
                <option value="大河">大河 (禁用大河龙蛇/开团)</option>
                <option value="逐鹿">逐鹿 (禁用逐鹿蒙恬/蒙犽)</option>
                <option value="河洛">河洛 (禁用河洛木兰/李信)</option>
                <option value="日落海">日落海 (禁用日落海倒转/整备)</option>
              </select>
            </div>
          </div>

          <!-- 2. 六席对局详细信息列表 -->
          <div class="seats-editor-container">
            <div class="seats-editor-header">
              <h4>6 席出战名单与最终名次 (请标记 1 位登顶胜者)</h4>
              <span class="winner-current-hint">
                当前登顶胜者：<strong>第 {{ formData.winnerSlot }} 席 - {{ currentWinnerNickname || '未填写' }}</strong>
              </span>
            </div>

            <div class="seats-grid">
              <div
                v-for="(seat, idx) in formData.seats"
                :key="seat.slot"
                class="seat-edit-card"
                :class="{ 'is-winner': seat.winner }"
              >
                <div class="seat-card-top">
                  <span class="seat-badge">#{{ seat.slot }} 席</span>
                  <button
                    type="button"
                    class="btn-set-winner"
                    :class="{ active: seat.winner }"
                    @click="setWinner(idx)"
                  >
                    <span class="crown-icon">👑</span>
                    {{ seat.winner ? '登顶第 1 名' : '设为胜者' }}
                  </button>
                </div>

                <div class="seat-field">
                  <label :for="`player-name-${idx}`" class="field-sub-label">选手昵称</label>
                  <div class="player-input-wrap">
                    <input
                      :id="`player-name-${idx}`"
                      v-model="seat.nickname"
                      type="text"
                      class="form-input player-input"
                      placeholder="选手名字 / 战队马甲"
                      required
                      @focus="activeSuggestSlot = idx"
                      @blur="handleInputBlur"
                    />
                    <!-- 选手联想下拉建议框 -->
                    <div
                      v-if="activeSuggestSlot === idx && getSuggestions(seat.nickname).length"
                      class="suggest-popover"
                    >
                      <button
                        v-for="sug in getSuggestions(seat.nickname)"
                        :key="sug"
                        type="button"
                        class="suggest-item"
                        @mousedown.prevent="selectSuggestPlayer(idx, sug)"
                      >
                        {{ sug }}
                      </button>
                    </div>
                  </div>
                </div>

                <div class="seat-field">
                  <label :for="`player-build-${idx}`" class="field-sub-label">实战流派阵容</label>
                  <input
                    :id="`player-build-${idx}`"
                    v-model="seat.build"
                    type="text"
                    class="form-input"
                    placeholder="例如 三分倒转、逐鹿蒙恬"
                    required
                  />
                  <!-- 常用流派快捷选择条 -->
                  <div class="quick-builds-row">
                    <button
                      v-for="b in QUICK_BUILDS.slice(0, 4)"
                      :key="b"
                      type="button"
                      class="quick-build-btn"
                      :class="{ selected: seat.build === b }"
                      @click="seat.build = b"
                    >
                      {{ b }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 错误提示 -->
          <div v-if="validationError" class="form-error-alert" role="alert">
            ⚠️ {{ validationError }}
          </div>

          <!-- 底部动作条 -->
          <footer class="modal-footer">
            <button type="button" class="btn-cancel" @click="handleClose">取消</button>
            <button type="submit" class="btn-submit">
              💾 保存{{ isEditing ? '修改' : '录入' }}并即时生效
            </button>
          </footer>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  type StoredMatch,
  type StoredSeat,
  saveStoredMatch
} from '../utils/match-storage'

const props = defineProps<{
  modelValue: boolean
  match: StoredMatch | null
  candidatePlayers?: string[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'save', savedMatch: StoredMatch): void
  (e: 'close'): void
}>()

const QUICK_BUILDS = [
  '三分倒转',
  '日落海倒转',
  '逐鹿蒙恬',
  '雷霆战机',
  '传统养猪',
  '大河龙蛇',
  '伞半月',
  '河洛木兰',
  '三分登场',
  '稷下坦射',
  '镜猪转吕布'
]

const isEditing = computed(() => Boolean(props.match?.id))
const activeSuggestSlot = ref<number | null>(null)
const validationError = ref('')

interface EditFormState {
  id: string
  day: string
  ordinal: number
  ban: string | null
  winnerSlot: number
  seats: StoredSeat[]
  isCustom?: boolean
  sourceUrl?: string
  materialSha256?: string
  matchType?: 'full_transcribed' | 'winner_snapshot'
}

const formData = ref<EditFormState>({
  id: '',
  day: new Date().toISOString().slice(0, 10),
  ordinal: 1,
  ban: null,
  winnerSlot: 1,
  seats: Array.from({ length: 6 }, (_, i) => ({
    slot: i + 1,
    nickname: '',
    build: '三分倒转',
    winner: i === 0
  }))
})

watch(
  () => [props.modelValue, props.match],
  ([visible]) => {
    if (!visible) return
    validationError.value = ''
    activeSuggestSlot.value = null

    if (props.match) {
      // 回填已有比赛数据
      const rawSeats = props.match.seats || []
      const wSlot = props.match.winnerSlot || (rawSeats.find(s => s.winner)?.slot || 1)
      formData.value = {
        id: props.match.id,
        day: props.match.day || new Date().toISOString().slice(0, 10),
        ordinal: props.match.ordinal || 1,
        ban: props.match.ban || null,
        winnerSlot: wSlot,
        isCustom: props.match.isCustom,
        sourceUrl: props.match.sourceUrl,
        materialSha256: props.match.materialSha256,
        matchType: props.match.matchType,
        seats: Array.from({ length: 6 }, (_, i) => {
          const s = rawSeats[i]
          const isWinner = s?.winner ?? (i + 1 === wSlot)
          return {
            slot: i + 1,
            nickname: s?.nickname || '',
            build: s?.build || '三分倒转',
            winner: isWinner,
            playerId: s?.playerId
          }
        })
      }
    } else {
      // 录入新比赛初值
      const today = new Date().toISOString().slice(0, 10)
      formData.value = {
        id: `custom_${today}_m${Date.now()}`,
        day: today,
        ordinal: 1,
        ban: null,
        winnerSlot: 1,
        isCustom: true,
        matchType: 'full_transcribed',
        seats: Array.from({ length: 6 }, (_, i) => ({
          slot: i + 1,
          nickname: '',
          build: QUICK_BUILDS[i % QUICK_BUILDS.length] || '三分倒转',
          winner: i === 0
        }))
      }
    }
  },
  { immediate: true }
)

const currentWinnerNickname = computed(() => {
  const w = formData.value.seats.find(s => s.slot === formData.value.winnerSlot)
  return w?.nickname || ''
})

function setWinner(seatIdx: number) {
  const targetSlot = seatIdx + 1
  formData.value.winnerSlot = targetSlot
  formData.value.seats.forEach((s, idx) => {
    s.winner = idx === seatIdx
  })
}

function handleInputBlur() {
  setTimeout(() => {
    activeSuggestSlot.value = null
  }, 200)
}

function selectSuggestPlayer(seatIdx: number, nickname: string) {
  formData.value.seats[seatIdx].nickname = nickname
  activeSuggestSlot.value = null
}

function getSuggestions(query: string): string[] {
  if (!props.candidatePlayers?.length) return []
  const q = query.trim().toLowerCase()
  if (!q) return props.candidatePlayers.slice(0, 6)
  return props.candidatePlayers.filter(p => p.toLowerCase().includes(q)).slice(0, 8)
}

function handleClose() {
  emit('update:modelValue', false)
  emit('close')
}

function handleSubmit() {
  validationError.value = ''

  // 1. 验证日期格式
  const day = formData.value.day.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    validationError.value = '比赛日期格式错误，必须为 YYYY-MM-DD（如 2026-11-09）'
    return
  }

  // 2. 验证 6 席选手昵称与阵容
  for (let i = 0; i < 6; i++) {
    const s = formData.value.seats[i]
    if (!s.nickname || !s.nickname.trim()) {
      validationError.value = `第 ${i + 1} 席选手昵称尚未填写`
      return
    }
    if (!s.build || !s.build.trim()) {
      validationError.value = `第 ${i + 1} 席实战流派阵容尚未填写`
      return
    }
  }

  // 3. 验证胜者
  const winner = formData.value.seats.find(s => s.winner)
  if (!winner) {
    validationError.value = '必须指定 1 位登顶胜者（点击席位卡片右上角的「设为胜者」）'
    return
  }

  const matchToSave: StoredMatch = {
    id: formData.value.id,
    day,
    ordinal: Number(formData.value.ordinal) || 1,
    ban: formData.value.ban || null,
    winnerBuild: winner.build.trim(),
    winnerSlot: winner.slot,
    winnerNickname: winner.nickname.trim(),
    seats: formData.value.seats.map(s => ({
      slot: s.slot,
      playerId: s.playerId,
      nickname: s.nickname.trim(),
      build: s.build.trim(),
      winner: Boolean(s.winner)
    })),
    sourceUrl: formData.value.sourceUrl,
    materialSha256: formData.value.materialSha256,
    matchType: formData.value.matchType || 'full_transcribed',
    isCustom: Boolean(formData.value.isCustom)
  }

  const saved = saveStoredMatch(matchToSave)
  emit('save', saved)
  emit('update:modelValue', false)
}
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background-color: rgba(10, 25, 20, 0.65);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  overflow-y: auto;
}

.modal-card {
  @include glass-panel;
  width: 100%;
  max-width: 920px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: $radius-lg;
  box-shadow: 0 20px 40px rgba(10, 30, 24, 0.25);
  overflow: hidden;
  animation: modal-enter 0.2s $ease-bounce;
}

@keyframes modal-enter {
  from {
    opacity: 0;
    transform: scale(0.97) translateY(12px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 20px 24px;
  background: linear-gradient(180deg, #fafcfb 0%, #f4f7f5 100%);
  border-bottom: 1px solid $border-subtle;

  .header-titles {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .badge-tag {
    align-self: flex-start;
    padding: 3px 8px;
    font-size: 11.5px;
    font-weight: 600;
    color: $color-primary;
    background-color: $color-primary-light;
    border-radius: $radius-full;
  }

  .header-title {
    margin: 4px 0 0 0;
    font-size: 17px;
    font-weight: 700;
    color: $text-primary;
  }

  .header-desc {
    margin: 0;
    font-size: 12px;
    color: $text-muted;
    line-height: 1.5;
  }

  .btn-close {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: $radius-sm;
    background-color: transparent;
    color: $text-muted;
    font-size: 16px;
    cursor: pointer;
    transition: $transition-fast;

    &:hover {
      background-color: rgba(0, 0, 0, 0.06);
      color: $text-primary;
    }
  }
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.form-section-meta {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding-bottom: 18px;
  border-bottom: 1px dashed $border-subtle;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.meta-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: $text-secondary;
}

.field-sub-label {
  font-size: 11px;
  font-weight: 600;
  color: $text-muted;
}

.form-input {
  padding: 8px 12px;
  font-size: 13.5px;
  color: $text-primary;
  background-color: #ffffff;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  transition: $transition-fast;

  &:focus {
    outline: none;
    border-color: $color-primary;
    box-shadow: 0 0 0 3px rgba(30, 70, 58, 0.12);
  }

  &.text-center {
    text-align: center;
  }
}

.form-select {
  padding: 8px 12px;
  font-size: 13px;
  color: $text-primary;
  background-color: #ffffff;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  transition: $transition-fast;

  &:focus {
    outline: none;
    border-color: $color-primary;
  }
}

.ordinal-stepper {
  display: flex;
  align-items: center;
  gap: 4px;

  .stepper-btn {
    width: 32px;
    height: 36px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    background-color: $bg-subtle;
    font-size: 16px;
    font-weight: 700;
    color: $text-secondary;
    cursor: pointer;
    transition: $transition-fast;

    &:hover:not(:disabled) {
      background-color: $border-color;
      color: $text-primary;
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  .form-input {
    width: 60px;
    flex: 1;
  }
}

.seats-editor-container {
  margin-top: 18px;

  .seats-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;

    h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: $text-primary;
    }

    .winner-current-hint {
      font-size: 12px;
      color: $text-secondary;

      strong {
        color: $color-accent;
      }
    }
  }
}

.seats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.seat-edit-card {
  padding: 12px 14px;
  background-color: #fbfdfc;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: $transition-fast;

  &.is-winner {
    background-color: #fffdf5;
    border-color: #f0ce7d;
    box-shadow: 0 2px 8px rgba(194, 120, 3, 0.12);
  }

  .seat-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;

    .seat-badge {
      font-size: 12px;
      font-weight: 700;
      color: $text-secondary;
    }

    .btn-set-winner {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      font-size: 11.5px;
      font-weight: 600;
      border: 1px solid $border-color;
      border-radius: $radius-full;
      background-color: #ffffff;
      color: $text-muted;
      cursor: pointer;
      transition: $transition-fast;

      &:hover {
        border-color: $color-accent;
        color: $color-accent;
      }

      &.active {
        border-color: $color-accent;
        background-color: $color-accent-light;
        color: $color-accent-dark;
        font-weight: 700;
      }
    }
  }

  .seat-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .player-input-wrap {
    position: relative;
  }

  .player-input {
    width: 100%;
    box-sizing: border-box;
  }

  .suggest-popover {
    position: absolute;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    z-index: 50;
    max-height: 160px;
    overflow-y: auto;
    background-color: #ffffff;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    box-shadow: $shadow-md;
    display: flex;
    flex-direction: column;

    .suggest-item {
      padding: 6px 12px;
      text-align: left;
      font-size: 12.5px;
      border: none;
      background: transparent;
      color: $text-primary;
      cursor: pointer;
      transition: $transition-fast;

      &:hover {
        background-color: $color-primary-light;
        color: $color-primary;
      }
    }
  }

  .quick-builds-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;

    .quick-build-btn {
      padding: 2px 7px;
      font-size: 10.5px;
      border: 1px solid $border-color;
      border-radius: $radius-xs;
      background-color: #ffffff;
      color: $text-secondary;
      cursor: pointer;
      transition: $transition-fast;

      &:hover {
        border-color: $color-primary;
        color: $color-primary;
      }

      &.selected {
        border-color: $color-primary;
        background-color: $color-primary-light;
        color: $color-primary-dark;
        font-weight: 600;
      }
    }
  }
}

.form-error-alert {
  margin-top: 14px;
  padding: 10px 14px;
  font-size: 12.5px;
  color: $color-danger;
  background-color: $color-danger-light;
  border: 1px solid $color-danger-border;
  border-radius: $radius-sm;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid $border-subtle;

  .btn-cancel {
    padding: 8px 16px;
    font-size: 13.5px;
    font-weight: 500;
    color: $text-secondary;
    background-color: #ffffff;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    cursor: pointer;
    transition: $transition-fast;

    &:hover {
      background-color: $bg-subtle;
    }
  }

  .btn-submit {
    padding: 8px 20px;
    font-size: 13.5px;
    font-weight: 600;
    color: #ffffff;
    background: linear-gradient(135deg, $color-primary 0%, $color-primary-dark 100%);
    border: none;
    border-radius: $radius-sm;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(30, 70, 58, 0.2);
    transition: $transition-fast;

    &:hover {
      opacity: 0.95;
      transform: translateY(-1px);
    }
  }
}
</style>

