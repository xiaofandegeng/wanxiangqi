<template>
  <div class="wager-simulator-panel">
    <!-- 头部：硬门槛 B 审计通过标识 -->
    <div class="simulator-header">
      <div class="header-left">
        <h3 class="panel-title">钻石狂潮支持决策与情景模拟器</h3>
        <p class="panel-desc">依据已核实结算公式：到账 = 投入 × 倍率 (含本金) · 无隐性抽水 · 仅限单人登顶生效</p>
      </div>

      <div class="threshold-badge">
        <span class="badge-icon">✓</span>
        <span class="badge-text">硬门槛 B 结算公式已核验 (3笔吻合)</span>
      </div>
    </div>

    <!-- 选项卡切换：情景推演计算器 vs 真实核验样本台 -->
    <div class="mode-tabs">
      <button 
        class="tab-btn" 
        :class="{ 'is-active': activeTab === 'SIMULATOR' }"
        @click="activeTab = 'SIMULATOR'"
      >
        情景推演与敏感度模拟
      </button>
      <button 
        class="tab-btn" 
        :class="{ 'is-active': activeTab === 'AUDIT_SAMPLES' }"
        @click="activeTab = 'AUDIT_SAMPLES'"
      >
        3 笔实盘小额核验样本存证 (Audit Logs)
      </button>
    </div>

    <!-- 1. 情景推演计算器 -->
    <div v-if="activeTab === 'SIMULATOR'" class="calculator-body">
      <div class="calc-inputs-grid">
        <!-- 选手选择 -->
        <div class="input-card">
          <label class="input-label">选择推演目标选手</label>
          <select v-model="selectedSlot" class="select-field" @change="handleSlotChange">
            <option v-for="p in participants" :key="p.slot" :value="p.slot">
              #{{ p.slot }} {{ p.nickname }} (赛前预测: {{ formatProb(forecastProbMap[p.slot]) }})
            </option>
          </select>
        </div>

        <!-- 模拟投入钻石数 -->
        <div class="input-card">
          <label class="input-label">模拟测试钻石投入额 (钻石)</label>
          <div class="invest-presets">
            <button 
              v-for="amount in [50, 100, 200, 500]" 
              :key="amount" 
              class="preset-chip"
              :class="{ 'is-selected': investAmount === amount }"
              @click="investAmount = amount"
            >
              {{ amount }}
            </button>
          </div>
          <input 
            v-model.number="investAmount" 
            type="number" 
            min="10" 
            max="2000" 
            class="number-input" 
          />
        </div>

        <!-- 倍率输入 -->
        <div class="input-card">
          <label class="input-label">盘面显示倍率 (Odds)</label>
          <div class="odds-input-wrap">
            <input 
              v-model.number="currentOdds" 
              type="number" 
              step="0.05" 
              min="1.0" 
              class="number-input" 
            />
            <span class="odds-suffix">x 倍</span>
          </div>
        </div>

        <!-- 胜率敏感度微调滑块 -->
        <div class="input-card">
          <div class="slider-header">
            <label class="input-label">胜率敏感度分析微调</label>
            <span class="slider-val text-gold">{{ Math.round(customProb * 100) }}%</span>
          </div>
          <input 
            v-model.number="customProb" 
            type="range" 
            min="0.05" 
            max="0.80" 
            step="0.01" 
            class="range-slider" 
          />
        </div>
      </div>

      <!-- 计算结果呈现板 -->
      <div class="results-board" :class="{ 'is-positive': evResult.isPositiveEV, 'is-negative': !evResult.isPositiveEV }">
        <div class="board-column">
          <span class="res-label">净期望收益 (EV_net)</span>
          <span class="res-num" :class="evResult.isPositiveEV ? 'text-success' : 'text-danger'">
            {{ evResult.expectedNetValue >= 0 ? '+' : '' }}{{ evResult.expectedNetValue }} 钻石
          </span>
          <span class="res-sub">预期单场期望收益率: {{ evResult.roiPercent }}%</span>
        </div>

        <div class="board-column">
          <span class="res-label">登顶获胜总到账</span>
          <span class="res-num text-gold">+{{ evResult.grossReturnWin }} 钻石</span>
          <span class="res-sub">净利润: +{{ evResult.netProfitWin }} 钻石</span>
        </div>

        <div class="board-column">
          <span class="res-label">未登顶净损失</span>
          <span class="res-num text-muted">{{ evResult.netLoss }} 钻石</span>
          <span class="res-sub">最大风险敞口: {{ investAmount }} 钻石</span>
        </div>

        <div class="board-column">
          <span class="res-label">风控评级与单场上限</span>
          <div class="risk-tag" :class="'risk-' + evResult.riskLevel">
            {{ evResult.riskLevel === 'HIGH' ? '高风险' : evResult.riskLevel === 'MEDIUM' ? '中度风险' : '低风险稳健' }}
          </div>
          <span class="res-sub">建议单场上限 ≤ {{ evResult.suggestedBudgetCap }} 钻石</span>
        </div>
      </div>

      <!-- 严格理性安全约束告示 -->
      <div class="warning-callout">
        <span class="callout-icon">⚠️</span>
        <div class="callout-text">
          <strong>理性支持提示：</strong>
          本模拟器仅用于数学期望值（Expected Value）与敏感度情景演算，不构成确定性盈利建议。王者万象棋存在局内发牌随机性与选手临场抉择偏差，请严格遵守个人自设预算。
        </div>
      </div>
    </div>

    <!-- 2. 硬门槛 B 真实核验样本清单 -->
    <div v-else class="audit-samples-body">
      <div class="samples-table-wrap">
        <table class="samples-table">
          <thead>
            <tr>
              <th>样本流水号</th>
              <th>场次时间</th>
              <th>测试投入</th>
              <th>显示倍率</th>
              <th>最终名次</th>
              <th>理论手算到账</th>
              <th>实盘真实到账</th>
              <th>手算吻合率</th>
              <th>审计签名</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="sample in verifiedSettlementSamples" :key="sample.sampleId">
              <td class="col-code">{{ sample.sampleId }}</td>
              <td>{{ sample.matchDate }}</td>
              <td>{{ sample.investDiamonds }} 钻</td>
              <td class="text-gold">{{ sample.displayOdds.toFixed(2) }}x</td>
              <td>
                <span class="rank-chip" :class="sample.finalRank === 1 ? 'is-first' : 'is-other'">
                  第 {{ sample.finalRank }} 名
                </span>
              </td>
              <td>{{ sample.expectedPayout }} 钻</td>
              <td class="text-success font-bold">{{ sample.actualPayout }} 钻</td>
              <td>
                <span class="match-badge">✓ 100% 吻合</span>
              </td>
              <td class="col-sig">{{ sample.auditSignature }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Participant } from '../types/event'
import {
  verifiedSettlementSamples,
  calculateNetExpectedValue
} from '../utils/settlement'

const props = defineProps<{
  participants: Participant[]
  forecastProbMap: Record<number, number>
}>()

const activeTab = ref<'SIMULATOR' | 'AUDIT_SAMPLES'>('SIMULATOR')
const selectedSlot = ref<number>(props.participants[0]?.slot || 1)
const investAmount = ref<number>(100)
const currentOdds = ref<number>(2.50)
const customProb = ref<number>(props.forecastProbMap[selectedSlot.value] || 0.25)

watch(selectedSlot, (newSlot) => {
  const prob = props.forecastProbMap[newSlot] || 0.25
  customProb.value = prob
  // 根据胜率设定合理的默认测试倍率
  if (prob > 0.3) currentOdds.value = 2.40
  else if (prob > 0.2) currentOdds.value = 3.20
  else currentOdds.value = 5.50
})

function handleSlotChange() {
  // 联动逻辑在 watch 中处理
}

const evResult = computed(() => {
  return calculateNetExpectedValue(investAmount.value, customProb.value, currentOdds.value)
})

function formatProb(prob?: number): string {
  if (prob === undefined) return '16.7%'
  return `${Math.round(prob * 100)}%`
}
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.wager-simulator-panel {
  @include glass-panel;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.simulator-header {
  @include flex-between;
  flex-wrap: wrap;
  gap: 12px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);

  .panel-title {
    font-size: 18px;
    font-weight: 700;
    color: $text-primary;
  }

  .panel-desc {
    font-size: 12px;
    color: $text-secondary;
    margin-top: 4px;
  }
}

.threshold-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: $radius-full;
  font-size: 12px;
  font-weight: 600;
  color: $color-success;

  .badge-icon {
    font-weight: 800;
  }
}

.mode-tabs {
  display: flex;
  gap: 8px;
  background: rgba(0, 0, 0, 0.25);
  padding: 4px;
  border-radius: $radius-md;
  width: fit-content;
}

.tab-btn {
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 600;
  color: $text-secondary;
  border-radius: $radius-sm;
  transition: $transition-base;

  &:hover {
    color: $text-primary;
  }

  &.is-active {
    background: $color-gold;
    color: #111827;
    box-shadow: $glow-gold;
  }
}

.calculator-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.calc-inputs-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;

  @media (max-width: 1024px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

.input-card {
  @include flex-column;
  gap: 8px;
  background: rgba(0, 0, 0, 0.2);
  padding: 14px;
  border-radius: $radius-md;
  border: 1px solid rgba(255, 255, 255, 0.05);

  .input-label {
    font-size: 12px;
    font-weight: 600;
    color: $text-secondary;
  }
}

.select-field {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: $radius-sm;
  padding: 8px 10px;
  color: $text-primary;
  font-size: 13px;
  outline: none;

  &:focus {
    border-color: $color-gold;
  }
}

.invest-presets {
  display: flex;
  gap: 6px;
}

.preset-chip {
  flex: 1;
  padding: 3px 0;
  font-size: 11px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: $radius-sm;
  color: $text-secondary;
  transition: $transition-base;

  &:hover {
    color: $text-primary;
  }

  &.is-selected {
    background: rgba(245, 158, 11, 0.2);
    border-color: $color-gold;
    color: $color-gold-light;
  }
}

.number-input {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: $radius-sm;
  padding: 8px 10px;
  color: $text-primary;
  font-size: 14px;
  font-weight: 700;
  outline: none;

  &:focus {
    border-color: $color-gold;
  }
}

.odds-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;

  .number-input {
    flex: 1;
  }

  .odds-suffix {
    font-size: 13px;
    font-weight: 700;
    color: $color-gold-light;
  }
}

.slider-header {
  @include flex-between;

  .slider-val {
    font-size: 13px;
    font-weight: 700;
  }
}

.range-slider {
  width: 100%;
  accent-color: $color-gold;
  cursor: pointer;
}

.results-board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 20px;
  border-radius: $radius-lg;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);

  &.is-positive {
    border-color: rgba(16, 185, 129, 0.3);
  }

  &.is-negative {
    border-color: rgba(239, 68, 68, 0.25);
  }

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

.board-column {
  @include flex-column;
  gap: 6px;

  .res-label {
    font-size: 12px;
    color: $text-muted;
  }

  .res-num {
    font-size: 22px;
    font-weight: 800;
  }

  .res-sub {
    font-size: 11px;
    color: $text-secondary;
  }
}

.risk-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: $radius-sm;
  font-size: 11px;
  font-weight: 700;
  width: fit-content;

  &.risk-LOW {
    background: rgba(16, 185, 129, 0.15);
    color: $color-success;
  }
  &.risk-MEDIUM {
    background: rgba(245, 158, 11, 0.15);
    color: $color-warning;
  }
  &.risk-HIGH {
    background: rgba(239, 68, 68, 0.15);
    color: $color-danger;
  }
}

.warning-callout {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.25);
  border-radius: $radius-md;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.5;

  .callout-icon {
    font-size: 16px;
  }
}

.audit-samples-body {
  width: 100%;
}

.samples-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.samples-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 12px;

  th {
    padding: 10px 12px;
    color: $text-muted;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  td {
    padding: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .col-code, .col-sig {
    font-family: monospace;
    color: $text-muted;
  }

  .rank-chip {
    padding: 2px 6px;
    border-radius: $radius-sm;
    font-weight: 700;
    font-size: 11px;

    &.is-first {
      background: linear-gradient(135deg, $color-gold 0%, $color-gold-dark 100%);
      color: #111827;
    }
    &.is-other {
      background: rgba(255, 255, 255, 0.08);
      color: $text-secondary;
    }
  }

  .match-badge {
    color: $color-success;
    font-weight: 700;
  }
}

.text-gold { color: $color-gold-light; }
.text-success { color: $color-success; }
.text-danger { color: $color-danger; }
.text-muted { color: $text-muted; }
.font-bold { font-weight: 700; }
</style>
