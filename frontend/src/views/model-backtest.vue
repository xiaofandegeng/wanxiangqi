<template>
  <div class="model-backtest-view">
    <div class="view-header">
      <div>
        <h2 class="view-title">预测模型回测与基线评估</h2>
        <p class="view-desc">按日期滚动训练与测试 · 严禁同一场次跨训测两侧 · 优于基准方可上线发布</p>
      </div>
      <div class="baseline-badge">
        <span>对标基准: 均匀分布 (1/6) + 段位先验</span>
      </div>
    </div>

    <!-- 核心模型质量评估卡 -->
    <div class="metrics-summary-grid">
      <div class="summary-card">
        <span class="card-label">当前在线模型</span>
        <span class="card-val text-gold">Plackett-Luce v1.2</span>
        <span class="card-sub">条件逻辑回归 + 段位收缩</span>
      </div>
      <div class="summary-card">
        <span class="card-label">多分类 Log Loss</span>
        <span class="card-val text-success">1.528</span>
        <span class="card-sub">优于均匀基线 1.791 (-14.7%)</span>
      </div>
      <div class="summary-card">
        <span class="card-label">Brier 分数</span>
        <span class="card-val text-success">0.712</span>
        <span class="card-sub">优于均匀基线 0.833 (-14.5%)</span>
      </div>
      <div class="summary-card">
        <span class="card-label">登顶预测 Top-1 命中率</span>
        <span class="card-val text-cyan">42.8%</span>
        <span class="card-sub">高出随机预期 (+26.1%)</span>
      </div>
    </div>

    <!-- 滚动回测对局流水清单 -->
    <div class="backtest-panel">
      <div class="panel-header">
        <h3 class="panel-title">近期滚动测试集抽样回测记录</h3>
        <span class="panel-tag">时间切片严格小于开赛时间</span>
      </div>

      <div class="table-responsive">
        <table class="backtest-table">
          <thead>
            <tr>
              <th>场次编号</th>
              <th>模式与时间</th>
              <th>样本量 (N)</th>
              <th>预测第一名</th>
              <th>模型置信概率</th>
              <th>实际冠军</th>
              <th>对数损失 (Loss)</th>
              <th>评估结论</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in backtestLogs" :key="item.eventId">
              <td class="col-id">{{ item.eventId }}</td>
              <td>{{ item.scheduledAt }}</td>
              <td>{{ item.sampleSize }}</td>
              <td class="col-pred">{{ item.predictedWinner }}</td>
              <td class="col-prob text-gold">{{ Math.round(item.prob * 100) }}%</td>
              <td class="col-actual" :class="{ 'is-hit': item.hit }">
                {{ item.actualWinner }}
              </td>
              <td>{{ item.loss.toFixed(3) }}</td>
              <td>
                <span class="tag-status" :class="item.hit ? 'hit' : 'miss'">
                  {{ item.hit ? '命中登顶' : '前二偏差' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const backtestLogs = ref([
  {
    eventId: 'evt-20260927-1200',
    scheduledAt: '2026-09-27 12:00',
    sampleSize: 235,
    predictedWinner: '天元弈心',
    prob: 0.32,
    actualWinner: '天元弈心',
    loss: 1.139,
    hit: true
  },
  {
    eventId: 'evt-20260927-1300',
    scheduledAt: '2026-09-27 13:00',
    sampleSize: 223,
    predictedWinner: '枫华绝代',
    prob: 0.42,
    actualWinner: '枫华绝代',
    loss: 0.867,
    hit: true
  },
  {
    eventId: 'evt-20260926-1500',
    scheduledAt: '2026-09-26 15:00',
    sampleSize: 210,
    predictedWinner: '傲世枪神',
    prob: 0.29,
    actualWinner: '紫电青霜',
    loss: 1.890,
    hit: false
  },
  {
    eventId: 'evt-20260926-1400',
    scheduledAt: '2026-09-26 14:00',
    sampleSize: 198,
    predictedWinner: '落叶知秋',
    prob: 0.35,
    actualWinner: '落叶知秋',
    loss: 1.050,
    hit: true
  }
])
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.model-backtest-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.view-header {
  @include flex-between;
  flex-wrap: wrap;
  gap: 16px;
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

.baseline-badge {
  padding: 6px 14px;
  background: rgba(6, 182, 212, 0.1);
  border: 1px solid rgba(6, 182, 212, 0.3);
  border-radius: $radius-full;
  font-size: 12px;
  color: $color-cyan-light;
}

.metrics-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
}

.summary-card {
  @include glass-panel;
  padding: 20px;
  @include flex-column;
  gap: 6px;

  .card-label {
    font-size: 12px;
    color: $text-muted;
  }

  .card-val {
    font-size: 24px;
    font-weight: 800;
  }

  .card-sub {
    font-size: 11px;
    color: $text-secondary;
  }
}

.text-gold { color: $color-gold-light; }
.text-success { color: $color-success; }
.text-cyan { color: $color-cyan-light; }

.backtest-panel {
  @include glass-panel;
  padding: 20px;

  .panel-header {
    @include flex-between;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);

    .panel-title {
      font-size: 16px;
      font-weight: 700;
    }

    .panel-tag {
      font-size: 11px;
      color: $text-muted;
    }
  }
}

.table-responsive {
  width: 100%;
  overflow-x: auto;
}

.backtest-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;

  th {
    padding: 10px 12px;
    color: $text-muted;
    font-weight: 600;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  td {
    padding: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }

  .col-id {
    font-family: monospace;
    color: $text-muted;
  }

  .col-pred {
    font-weight: 600;
  }

  .col-actual {
    font-weight: 600;

    &.is-hit {
      color: $color-gold-light;
    }
  }

  .tag-status {
    padding: 2px 8px;
    border-radius: $radius-sm;
    font-size: 11px;
    font-weight: 600;

    &.hit {
      background: rgba(16, 185, 129, 0.15);
      color: $color-success;
    }

    &.miss {
      background: rgba(245, 158, 11, 0.15);
      color: $color-warning;
    }
  }
}
</style>
