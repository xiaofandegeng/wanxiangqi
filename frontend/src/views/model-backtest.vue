<template>
  <div class="model-backtest-view">
    <div class="view-header">
      <div>
        <h2 class="view-title">预测模型回测与发布评估标准</h2>
        <p class="view-desc">
          遵循 v2 任务书规范：预测模型必须在真实历史数据积累充分并通过滚动回测后方可发布，严禁填报未经实际运行的虚假指标。
        </p>
      </div>
      <div class="baseline-badge">
        <span>对标基准: 6 人均匀分布 (1/6 ≈ 16.7%)</span>
      </div>
    </div>

    <!-- 阶段状态提示条 -->
    <div class="status-banner">
      <div class="banner-icon">⚖️</div>
      <div class="banner-body">
        <h4 class="banner-title">当前阶段状态：数据积累与基线准备中（预测未发布）</h4>
        <p class="banner-text">
          根据《王者万象棋数据站 v2 任务书》第 7.3 节与第 11 节要求：P1–P3 阶段不以预测可用作为前提，当前正在进行多源对局样本积累与入库校验。只有当真实逐局样本量充足且严格执行双截点防泄漏（match_time &lt; cutoff 且 available_at &le; cutoff）时，方可启动正式回测并考虑发布。
        </p>
      </div>
    </div>

    <!-- 回测科学评估体系与公式定义 (符合 A18 验收标准) -->
    <div class="standards-grid">
      <div class="standard-card">
        <h4 class="card-title">1. 多分类完整 Brier 分数定义</h4>
        <p class="card-formula font-mono">
          Brier = (1 / M) &times; &sum; &sum; (p_ij - y_ij)&sup2;
        </p>
        <p class="card-desc">
          每场计算 6 位选手全概率向量与真实独热标签 (One-Hot) 的均方误差，并在测试集 M 场取均值。严禁仅计算冠军单项误差。
        </p>
        <div class="card-foot">
          <span class="foot-label">均匀基线参考值:</span>
          <span class="foot-val font-mono">0.833 (5/6)</span>
        </div>
      </div>

      <div class="standard-card">
        <h4 class="card-title">2. 对数损失 (Multi-class Log Loss)</h4>
        <p class="card-formula font-mono">
          Log Loss = - (1 / M) &times; &sum; ln(p_winner)
        </p>
        <p class="card-desc">
          严格度量概率校准度，对过度自信的错误预测施加严厉惩罚。设定概率下界截断 (如 0.001) 防止溢出。
        </p>
        <div class="card-foot">
          <span class="foot-label">均匀基线参考值:</span>
          <span class="foot-val font-mono">1.792 (-ln(1/6))</span>
        </div>
      </div>

      <div class="standard-card">
        <h4 class="card-title">3. 双时间截点防泄漏红线 (As-of Cutoff)</h4>
        <p class="card-formula font-mono">
          match_time &lt; T_cutoff &amp;&amp; available_at &le; T_cutoff
        </p>
        <p class="card-desc">
          赛前特征提取时，严禁使用任何赛后公布的数据；历史战绩即使发生在比赛前，若在截点后才被系统录入，亦不得进入历史特征。
        </p>
        <div class="card-foot">
          <span class="foot-label">执行状态:</span>
          <span class="foot-val text-success">函数级物理约束</span>
        </div>
      </div>
    </div>

    <!-- 暂无回测结果空态卡片 -->
    <div class="empty-backtest-card">
      <div class="empty-content">
        <span class="empty-icon">📊</span>
        <h3 class="empty-title">暂无正式回测结果</h3>
        <p class="empty-subtitle">
          当前数据站处于真实样本持续收录阶段（已收录王者天梯样本），待样本量达到正式发布门槛后，系统将自动输出多时间窗口滚动切片的真实评估报告。
        </p>
        <div class="empty-actions">
          <router-link to="/roster" class="action-link">查看当前已收录选手大盘</router-link>
          <router-link to="/lineups" class="action-link secondary">查看第三方阵容环境快照</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// 遵循 v2 规范：无实际评估时显式展示“暂无回测结果”，不再伪造数值
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;

.model-backtest-view {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 20px 60px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  background: var(--color-surface, #1e2538);
  border: 1px solid var(--color-border, #2a344d);
  border-radius: 8px;
  padding: 24px;

  .view-title {
    font-size: 22px;
    font-weight: 700;
    color: var(--color-text, #f1f5f9);
    margin: 0 0 6px;
  }
  .view-desc {
    font-size: 13px;
    color: var(--color-text-secondary, #94a3b8);
    margin: 0;
    line-height: 1.5;
  }
  .baseline-badge {
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--color-border, #2a344d);
    color: #cbd5e1;
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 6px;
    white-space: nowrap;
  }
}

.status-banner {
  display: flex;
  gap: 16px;
  background: rgba(234, 179, 8, 0.08);
  border: 1px solid rgba(234, 179, 8, 0.25);
  border-radius: 8px;
  padding: 16px 20px;
  align-items: flex-start;

  .banner-icon {
    font-size: 24px;
    line-height: 1;
  }
  .banner-body {
    .banner-title {
      font-size: 15px;
      font-weight: 700;
      color: #facc15;
      margin: 0 0 4px;
    }
    .banner-text {
      font-size: 13px;
      color: #cbd5e1;
      margin: 0;
      line-height: 1.5;
    }
  }
}

.standards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }

  .standard-card {
    background: var(--color-surface, #1e2538);
    border: 1px solid var(--color-border, #2a344d);
    border-radius: 8px;
    padding: 20px;
    display: flex;
    flex-direction: column;

    .card-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--color-text, #f1f5f9);
      margin: 0 0 10px;
    }
    .card-formula {
      font-size: 13px;
      color: #38bdf8;
      background: rgba(0, 0, 0, 0.3);
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 12px;
      border: 1px solid rgba(255, 255, 255, 0.04);
    }
    .card-desc {
      font-size: 13px;
      color: var(--color-text-secondary, #94a3b8);
      margin: 0 0 16px;
      line-height: 1.5;
      flex: 1;
    }
    .card-foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      padding-top: 12px;

      .foot-label {
        color: #64748b;
      }
      .foot-val {
        color: #cbd5e1;
        font-weight: 600;
      }
      .text-success {
        color: #4ade80;
      }
    }
  }
}

.empty-backtest-card {
  background: var(--color-surface, #1e2538);
  border: 1px dashed var(--color-border, #2a344d);
  border-radius: 8px;
  padding: 60px 20px;
  text-align: center;

  .empty-icon {
    font-size: 40px;
    display: block;
    margin-bottom: 16px;
  }
  .empty-title {
    font-size: 18px;
    font-weight: 600;
    color: #e2e8f0;
    margin: 0 0 8px;
  }
  .empty-subtitle {
    font-size: 13px;
    color: #64748b;
    max-width: 600px;
    margin: 0 auto 24px;
    line-height: 1.6;
  }
  .empty-actions {
    display: flex;
    justify-content: center;
    gap: 12px;

    .action-link {
      background: #2563eb;
      color: #fff;
      text-decoration: none;
      font-size: 13px;
      padding: 8px 18px;
      border-radius: 6px;
      font-weight: 500;
      transition: background 0.2s;

      &:hover {
        background: #1d4ed8;
      }

      &.secondary {
        background: rgba(255, 255, 255, 0.08);
        color: #cbd5e1;
        border: 1px solid rgba(255, 255, 255, 0.1);

        &:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }
      }
    }
  }
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
