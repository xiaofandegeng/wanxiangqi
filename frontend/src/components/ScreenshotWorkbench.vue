<template>
<section class="shot-workbench">
  <div class="workbench-header-bar">
    <div>
      <h2>王牌对决 · 本场分析 (实战推演工作台)</h2>
      <p class="muted">纯本地引擎毫秒级实时计算 · 针对 2 分钟极速投比窗口优化</p>
    </div>
    <div class="workbench-tabs">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'instant' }"
        @click="activeTab = 'instant'"
      >
        ⚡ 2分钟极速推演 (实战秒推)
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'audit' }"
        @click="activeTab = 'audit'"
      >
        📁 截图审计与存档 (复盘台账)
      </button>
    </div>
  </div>

  <!-- 1. 极速实战推演模式 (专为 2 分钟实战投比打造，5~10 秒出决策) -->
  <div v-show="activeTab === 'instant'" class="instant-mode-panel">
    <!-- 极速倒计时与实战提示条 -->
    <div class="instant-countdown-banner">
      <div class="countdown-badge">
        <span class="pulse-icon">⏱️</span>
        <strong>投比窗口 ~120 秒</strong>
      </div>
      <div class="banner-tips">
        <span><strong>极速决策提示：</strong>计算耗时仅需 <strong>&lt;15ms</strong>。可通过下方<strong>「一键填入名单」</strong>或<strong>「点击明星选手」</strong>快速选人，选完 1 秒直接看结论，留足 1 分 45 秒下注！</span>
        <small class="tip-shortcut">💡 支持全局快捷键：在网页任意位置直接按 <code>Ctrl+V / Cmd+V</code> 即可秒贴截图识别！</small>
      </div>
    </div>

    <!-- 快捷名单输入与选手速点盘 -->
    <div class="quick-roster-box">
      <div class="batch-paste-row">
        <input
          v-model="batchPasteText"
          placeholder="从微信/直播间直接复制名单（如：小谷芷 诸葛亮 北念 梦飞 祥子 白白，自动模糊补全）"
          aria-label="一键批量粘贴名单"
          @keydown.enter.prevent="applyBatchPaste"
        />
        <button type="button" class="btn-tool" @click="applyBatchPaste">一键分发 6 席</button>
        <button type="button" class="btn-tool btn-danger-soft" @click="clearAllSeats">清空席位</button>
      </div>
      <p v-if="batchFeedback" class="batch-feedback-pill">{{ batchFeedback }}</p>

      <!-- 明星活跃选手一键点选盘 -->
      <div class="star-players-bar">
        <span class="bar-title">🔥 明星选手快捷入座：</span>
        <div class="star-pills-list">
          <button
            v-for="name in starPlayers"
            :key="name"
            type="button"
            class="star-pill-btn"
            :class="{ 'in-roster': players.some(p => p.nickname === name) }"
            :title="players.some(p => p.nickname === name) ? '该选手已在席位中' : '点击填入空席位并自动匹配招牌棋手'"
            @click="addStarPlayer(name)"
          >
            <img :src="getPlayerAvatar(name)" class="star-avatar" alt="" />
            <span>{{ name.replace('抖音', '').replace('EGM', '').replace('大大', '') }}</span>
            <span v-if="players.some(p => p.nickname === name)" class="check-mark">✓</span>
          </button>
        </div>
      </div>

      <!-- 6 席位实时网格卡片 (双核预测：选手 ID + 棋手) -->
      <div class="seats-grid">
        <div v-for="(p, idx) in players" :key="idx" class="seat-card">
          <div class="seat-head">
            <span class="seat-number">#{{ idx + 1 }} 席</span>
            <span v-if="p.nickname && getMasterPlayerName(p.nickname) !== p.nickname" class="master-pill">
              {{ getMasterPlayerName(p.nickname) }}
            </span>
            <button
              v-if="p.nickname || p.commander"
              type="button"
              class="seat-clear-btn"
              title="清空此席位"
              @click="removeSeat(idx)"
            >
              ✕
            </button>
          </div>

          <!-- 1. 选手 ID 输入与模糊联想 -->
          <div class="seat-player-row">
            <img :src="getPlayerAvatar(p.nickname)" class="seat-avatar" alt="" />
            <div class="seat-input-wrap">
              <input
                v-model="p.nickname"
                placeholder="输入/搜选手 (如诸葛/北念/白白)"
                maxlength="160"
                class="seat-input"
                @focus="activeDropdownSeat = idx"
                @input="activeDropdownSeat = idx"
              />

              <!-- 模糊联想悬浮下拉列表 -->
              <div
                v-if="activeDropdownSeat === idx && getSeatSuggestions(p.nickname).length"
                class="autocomplete-dropdown"
              >
                <div class="dropdown-header">匹配历史战绩选手（点击直接填入）：</div>
                <div
                  v-for="cand in getSeatSuggestions(p.nickname)"
                  :key="cand.nickname"
                  class="dropdown-item"
                  @mousedown.prevent="selectCandidate(idx, cand)"
                >
                  <img :src="getPlayerAvatar(cand.nickname)" class="cand-avatar" alt="" />
                  <div class="cand-meta">
                    <div class="cand-name-row">
                      <strong class="cand-name">{{ cand.nickname }}</strong>
                      <span v-if="cand.masterName !== cand.nickname" class="cand-master">({{ cand.masterName }})</span>
                    </div>
                    <small class="cand-stats">
                      {{ cand.wins }} 冠 · 常用：{{ cand.topBuild || '多流派' }}
                      <span v-if="cand.signatureCommander" class="cand-cmd-tag">· 招牌棋手: {{ cand.signatureCommander }}</span>
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 2. 所选棋手 (Commander) 选择框：纯棋手选择，共 21 位官方棋手，无虚构阵容后缀 -->
          <div class="seat-commander-row">
            <span class="cmd-icon" title="棋手">♟️</span>
            <select v-model="p.commander" class="seat-commander-select" aria-label="选择棋手">
              <option value="">未选棋手 / 未知</option>
              <option v-for="cmd in OFFICIAL_COMMANDERS" :key="cmd.name" :value="cmd.name">
                {{ cmd.name }} ({{ cmd.tier }})
              </option>
            </select>
          </div>

          <!-- 3. 根据选手擅长推断的本场阵容与棋手协同（阵容由选手擅长决定） -->
          <div v-if="p.nickname" class="seat-inferred-row">
            <div class="inferred-lineup" :class="{ 'fallback-warning': getSeatInferredLineup(p.nickname, p.commander)?.isFallback }">
              <span class="inferred-label">预期阵容：</span>
              <strong class="inferred-name">{{ getSeatInferredLineup(p.nickname, p.commander)?.lineupName }}</strong>
              <small v-if="getSeatInferredLineup(p.nickname, p.commander)?.isFallback" class="ban-alert-tag">
                (主力受Ban变阵)
              </small>
            </div>
            <div
              v-if="p.commander && getSeatSynergy(p.nickname, p.commander)"
              class="seat-synergy-tag"
              :class="getSeatSynergy(p.nickname, p.commander)!.level"
              :title="getSeatSynergy(p.nickname, p.commander)!.text"
            >
              {{ getSeatSynergy(p.nickname, p.commander)!.label }}
            </div>
          </div>

          <!-- 4. 同场克制关系雷达 (直接显出压制谁、被谁克制、胜负分) -->
          <div v-if="p.nickname && getSeatMatchupInfo(idx)" class="seat-h2h-row">
            <div
              v-if="getSeatMatchupInfo(idx)!.activeSuppresses.length"
              class="h2h-tag-item suppress"
              :title="`历史同场压制：${getSeatMatchupInfo(idx)!.activeSuppresses.map(x => `#${x.seat} ${x.nickname} (${x.scoreText})`).join('、')}`"
            >
              <span class="tag-label">⚡ 克制：</span>
              <span class="tag-body">
                <span v-for="opp in getSeatMatchupInfo(idx)!.activeSuppresses.slice(0, 2)" :key="opp.seat" class="opp-badge">
                  #{{ opp.seat }}{{ opp.nickname.slice(0, 3) }} ({{ opp.scoreText }})
                </span>
                <span v-if="getSeatMatchupInfo(idx)!.activeSuppresses.length > 2">...</span>
              </span>
              <span class="tag-score">+{{ getSeatMatchupInfo(idx)!.h2hBonus }}</span>
            </div>

            <div
              v-if="getSeatMatchupInfo(idx)!.activeSuppressedBy.length"
              class="h2h-tag-item nemesis"
              :title="`历史遇克星苦主：${getSeatMatchupInfo(idx)!.activeSuppressedBy.map(x => `#${x.seat} ${x.nickname} (${x.scoreText})`).join('、')}`"
            >
              <span class="tag-label">⚠️ 苦主：</span>
              <span class="tag-body">
                <span v-for="opp in getSeatMatchupInfo(idx)!.activeSuppressedBy.slice(0, 2)" :key="opp.seat" class="opp-badge">
                  #{{ opp.seat }}{{ opp.nickname.slice(0, 3) }} ({{ opp.scoreText }})
                </span>
                <span v-if="getSeatMatchupInfo(idx)!.activeSuppressedBy.length > 2">...</span>
              </span>
              <span class="tag-score">{{ getSeatMatchupInfo(idx)!.h2hBonus }}</span>
            </div>

            <div
              v-if="!getSeatMatchupInfo(idx)!.activeSuppresses.length && !getSeatMatchupInfo(idx)!.activeSuppressedBy.length"
              class="h2h-tag-item neutral"
            >
              <span class="tag-label">⚖️ 势均力敌</span>
              <span class="tag-body">同场无明显偏向</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 6人同场两两交锋克制矩阵与压制链图解 (用户最关心的压制关系全景透视) -->
      <div v-if="matchupResult && (matchupResult.suppressionChains.length || matchupResult.crossMatrix)" class="h2h-matrix-board">
        <div class="matrix-board-header">
          <div class="board-title">
            <span class="title-icon">⚡</span>
            <strong>本场 6 人同场交锋克制矩阵与压制链图解</strong>
            <small class="title-sub">(基于王牌对决历史真实同场战绩 · 实时双向克制修正)</small>
          </div>
        </div>

        <!-- 压制链流向图 (A 压制 B) -->
        <div v-if="matchupResult.suppressionChains.length" class="suppression-chains-flow">
          <div class="chain-flow-title">⚔️ 实时同场压制链条 (高胜率克制关系)：</div>
          <div class="chain-tags-wrap">
            <div
              v-for="(chain, cIdx) in matchupResult.suppressionChains"
              :key="cIdx"
              class="chain-pill"
            >
              <span class="winner-tag">#{{ chain.winnerSeat }} {{ chain.winnerName }}</span>
              <span class="chain-arrow">── {{ chain.wins }}胜 {{ chain.losses }}负 ({{ ((chain.wins / (chain.wins + chain.losses)) * 100).toFixed(0) }}%) ──➔</span>
              <span class="loser-tag">#{{ chain.loserSeat }} {{ chain.loserName }}</span>
            </div>
          </div>
        </div>
        <div v-else class="chain-empty-tip">
          🤝 本场 6 位选手历史同场交锋记录中战绩持平或首度同场，暂无单边绝对压制链。
        </div>

        <!-- 6x6 两两交锋微型对战矩阵表格 -->
        <div v-if="matchupResult.crossMatrix" class="cross-table-wrap">
          <table class="cross-h2h-table">
            <thead>
              <tr>
                <th class="corner-th">交手胜负 (横对纵)</th>
                <th v-for="s in matchupResult.crossMatrix.seats" :key="s.seat">
                  #{{ s.seat }} {{ s.nickname }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, rIdx) in matchupResult.crossMatrix.cells" :key="rIdx">
                <th class="row-seat-th">
                  #{{ matchupResult.crossMatrix.seats[rIdx]?.seat }} {{ matchupResult.crossMatrix.seats[rIdx]?.nickname }}
                </th>
                <td
                  v-for="(cell, cIdx) in row"
                  :key="cIdx"
                  :class="['h2h-cell', cell.status.toLowerCase()]"
                  :title="cell.tooltip"
                >
                  {{ cell.label }}
                </td>
              </tr>
            </tbody>
          </table>
          <div class="table-legend">
            <span class="legend-item win">■ 绿色：同场占优压制</span>
            <span class="legend-item lose">■ 红色：遭遇克星苦主</span>
            <span class="legend-item tied">■ 黄色：历史战平</span>
            <span class="legend-item none">■ 灰色：无直接交手</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 禁选阵营一键点选胶囊与当前版本 -->
    <div class="quick-conditions-row">
      <div class="quick-ban-selector">
        <span class="condition-label">🛡️ 本场禁选阵营 (一键点击)：</span>
        <div class="ban-pills-group">
          <button
            v-for="b in quickBans"
            :key="b"
            type="button"
            class="ban-pill-btn"
            :class="{ active: (bannedFaction || '') === b }"
            @click="bannedFaction = b"
          >
            {{ b ? `${b}阵营` : '无禁选' }}
          </button>
        </div>
      </div>

      <div class="quick-version-selector">
        <span class="condition-label">🎮 锚定版本：</span>
        <select v-model="version" class="version-select-mini">
          <option v-for="v in GAME_VERSIONS" :key="v.version" :value="v.version">
            {{ v.version }} {{ v.isLatest ? '(官方最新)' : '' }}
          </option>
        </select>
      </div>
    </div>

    <!-- 极速投比决策速览卡片 (2 分钟快速决胜) -->
    <div v-if="matchupResult && rankedPlayers.length >= 2" class="decision-hub-card">
      <div class="decision-header">
        <div class="dh-title-wrap">
          <span class="dh-badge">⚡ 投比速览</span>
          <h3>本场 6 人同台博弈与投比决策建议（双核：选手 + 棋手）</h3>
        </div>
        <span class="calc-tag">运算耗时 &lt;15ms · 实时响应</span>
      </div>

      <!-- 推荐支持与高危避坑两栏并列 -->
      <div class="decision-core-grid">
        <!-- 1. 首选推荐 (Top 1) -->
        <div v-if="topPick" class="recommend-box top-1">
          <div class="box-tag">🥇 投比首选建议 (Top 1)</div>
          <div class="player-feature-row">
            <img :src="getPlayerAvatar(topPick.nickname)" class="feature-avatar" alt="" />
            <div class="feature-info">
              <h4>{{ topPick.nickname }} <small v-if="topPick.masterName !== topPick.nickname">({{ topPick.masterName }})</small></h4>
              <div v-if="topPick.inferredLineup" class="lineup-badge-line">
                🎯 推断出战阵容：<strong>{{ topPick.inferredLineup.lineupName }}</strong>
                <small class="lineup-origin">({{ topPick.inferredLineup.isFallback ? '主力受Ban变阵' : '选手擅长招牌' }})</small>
              </div>
              <div v-if="topPick.commander" class="commander-badge-line">
                ♟️ 所选棋手：<strong>{{ topPick.commander }}</strong>
                <span class="cmd-pill" :class="topPick.commanderEvaluation?.tier.toLowerCase()">
                  {{ topPick.commanderEvaluation?.levelLabel }}
                </span>
              </div>
              <div class="prob-highlight">
                <span>预测登顶率：</span>
                <strong>{{ (topPick.adjustedProbability * 100).toFixed(1) }}%</strong>
              </div>
            </div>
          </div>
          <div class="reasons-list">
            <span v-if="topPick.commanderModifier > 0" class="reason-tag positive">
              ♟️ 棋手协同 (+{{ (topPick.commanderModifier * 100).toFixed(0) }}%)
            </span>
            <span v-if="topPick.versionModifier > 0" class="reason-tag positive">
              🔥 版本红利 (+{{ (topPick.versionModifier * 100).toFixed(0) }}%)
            </span>
            <span v-if="topPick.activeSuppresses?.length" class="reason-tag positive">
              ⚡ 同场压制 {{ topPick.activeSuppresses.map(x => `#${x.seat}${x.nickname}(${x.scoreText})`).join('、') }}
            </span>
            <span v-else-if="topPick.h2hBonus > 0" class="reason-tag positive">
              ⚡ 同场克制 {{ topPick.suppresses.length }} 名对手
            </span>
            <span v-if="!topPick.activeSuppressedBy?.length && !topPick.suppressedBy.length" class="reason-tag positive">
              🛡️ 全场无苦主压制
            </span>
            <span v-if="topPick.banModifier > 0" class="reason-tag positive">
              🎯 避开禁选享受利好
            </span>
          </div>
          <p class="summary-verdict">
            {{ topPick.commander ? `结合棋手【${topPick.commander}】：${topPick.commanderEvaluation?.summary || ''}。` : '' }}
            综合战力登顶率全场最高，为本局最具性价比支持首选。
          </p>
        </div>

        <!-- 2. 次选备用 (Top 2) -->
        <div v-if="secondPick" class="recommend-box top-2">
          <div class="box-tag">🥈 稳健次选备选 (Top 2)</div>
          <div class="player-feature-row">
            <img :src="getPlayerAvatar(secondPick.nickname)" class="feature-avatar" alt="" />
            <div class="feature-info">
              <h4>{{ secondPick.nickname }} <small v-if="secondPick.masterName !== secondPick.nickname">({{ secondPick.masterName }})</small></h4>
              <div v-if="secondPick.inferredLineup" class="lineup-badge-line">
                🎯 推断出战阵容：<strong>{{ secondPick.inferredLineup.lineupName }}</strong>
                <small class="lineup-origin">({{ secondPick.inferredLineup.isFallback ? '主力受Ban变阵' : '选手擅长招牌' }})</small>
              </div>
              <div v-if="secondPick.commander" class="commander-badge-line">
                ♟️ 所选棋手：<strong>{{ secondPick.commander }}</strong>
                <span class="cmd-pill" :class="secondPick.commanderEvaluation?.tier.toLowerCase()">
                  {{ secondPick.commanderEvaluation?.levelLabel }}
                </span>
              </div>
              <div class="prob-highlight">
                <span>预测登顶率：</span>
                <strong>{{ (secondPick.adjustedProbability * 100).toFixed(1) }}%</strong>
              </div>
            </div>
          </div>
          <div class="reasons-list">
            <span v-if="secondPick.commanderModifier > 0" class="reason-tag positive">
              ♟️ 棋手协同 (+{{ (secondPick.commanderModifier * 100).toFixed(0) }}%)
            </span>
            <span v-if="secondPick.versionModifier > 0" class="reason-tag positive">
              🔥 版本加成 (+{{ (secondPick.versionModifier * 100).toFixed(0) }}%)
            </span>
            <span v-if="secondPick.activeSuppressedBy?.length" class="reason-tag warning">
              ⚠️ 遇苦主：{{ secondPick.activeSuppressedBy.map(x => `#${x.seat}${x.nickname}(${x.scoreText})`).join('、') }}
            </span>
            <span v-else-if="secondPick.suppressedBy.length" class="reason-tag warning">
              ⚠️ 遇苦主：{{ secondPick.suppressedBy.join('、') }}
            </span>
          </div>
          <p class="summary-verdict">
            {{ secondPick.commander ? `棋手【${secondPick.commander}】配置平稳。` : '' }}
            若首选返奖比率过低，可考虑该选手作为对冲/次选策略。
          </p>
        </div>

        <!-- 3. 高危爆冷预警 (避坑) -->
        <div v-if="highRiskPlayers.length" class="recommend-box danger-box">
          <div class="box-tag danger-tag">⚠️ 高危爆冷预警 (谨慎支持)</div>
          <div v-for="rp in highRiskPlayers.slice(0, 2)" :key="rp.nickname" class="danger-player-item">
            <img :src="getPlayerAvatar(rp.nickname)" class="danger-avatar" alt="" />
            <div class="danger-info">
              <strong>{{ rp.nickname }} <small v-if="rp.commander">· 棋手: {{ rp.commander }}</small></strong>
              <small v-if="rp.activeSuppressedBy?.length" class="danger-alert-text">
                ⚠️ 遭遇苦主死克：{{ rp.activeSuppressedBy.map(x => `#${x.seat}${x.nickname}(${x.scoreText})`).join('、') }}
              </small>
              <small v-else-if="rp.banEvaluation?.level === 'CRITICAL'">
                核心阵容受「{{ bannedFaction }}」封锁，历史登顶率骤降
              </small>
              <small v-else-if="rp.suppressedBy.length">
                同场遭遇多位历史克星 ({{ rp.suppressedBy.join('、') }})
              </small>
            </div>
          </div>
          <p class="summary-verdict danger-text">
            以上选手主力阵容受限、棋手未形成协同或遭遇死敌克制，爆冷概率极高，建议在 2 分钟投比中规避支持！
          </p>
        </div>
      </div>

      <!-- 6人实力条形图对比 -->
      <div class="instant-prob-bars">
        <div class="bars-head">
          <span>6 席选手综合胜率梯度：</span>
          <small>融合历史真实胜率 + 所选棋手协同 + 两两克制矩阵 + Ban位冲击 + 最新版本修正</small>
        </div>
        <div class="bars-container">
          <div v-for="(p, pIdx) in rankedPlayers" :key="p.nickname" class="player-bar-row">
            <span class="bar-rank">#{{ pIdx + 1 }}</span>
            <img :src="getPlayerAvatar(p.nickname)" class="bar-avatar" alt="" />
            <div class="bar-player-col">
              <span class="bar-name">{{ p.nickname }}</span>
              <div class="bar-sub-info">
                <span v-if="p.inferredLineup" class="bar-lineup-badge">🎯 {{ p.inferredLineup.lineupName }}</span>
                <span v-if="p.commander" class="bar-cmd-badge">♟️ {{ p.commander }}</span>
              </div>
            </div>
            <div class="bar-track">
              <div
                class="bar-fill"
                :class="`rank-color-${pIdx + 1}`"
                :style="{ width: `${Math.min(100, Math.max(3, p.adjustedProbability * 100))}%` }"
              ></div>
            </div>
            <strong class="bar-percent">{{ (p.adjustedProbability * 100).toFixed(1) }}%</strong>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="instant-waiting-hint">
      <span>👉 请填入至少 2 位选手（建议填满 6 席）以实时生成同台博弈推演与投比决策建议。</span>
    </div>
  </div>

  <!-- 2. 传统截图审计与合规台账模式 (保留完整审计台账流程) -->
  <div v-show="activeTab === 'audit'" class="audit-mode-panel">
  <form class="shot-upload" @submit.prevent="read">
   <label>赛前名单截图<input type="file" accept="image/png,image/jpeg,image/webp" @change="selectFile"></label>
   <label>实际截图采集时间<input v-model="capturedAt" type="datetime-local" step="1" :readonly="!!draft" required></label>
   <label>复核人<input v-model="operator" required maxlength="160" placeholder="操作人标识"></label>
   <button class="primary" :disabled="busy||!file">{{ busy?'处理中…':'保存原图并识别' }}</button>
  </form>
  <form class="shot-restore" @submit.prevent="loadSaved"><label>已保存分析编号<input v-model="savedAnalysisId" maxlength="100" placeholder="填写分析编号，恢复当时计算快照"></label><button :disabled="busy||!savedAnalysisId.trim()">载入分析</button></form>
  <p class="muted">原图仅存本机后端与数据库，默认内部使用。当前OCR使用macOS本地Vision；不支持的服务器会明确提示。识别结果必须人工确认。</p>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="evidenceId" class="muted">已保存原件：{{ evidenceId }}；上传不等于材料／赛果核验。</p>
  <template v-if="draft">
   <p class="shot-warning" v-if="draft.ocr.phaseHint==='POSTMATCH_INDICATORS'">图片中识别到赛后标记。可核对文字和历史资料，但不能将其作为本场赛前预测输入。</p>
   <details><summary>查看OCR原文与候选（{{ draft.ocr.rows.length }}行）</summary><ul><li v-for="(r,i) in draft.ocr.rows" :key="i">{{ r.rawText }} → {{ r.candidates.map(c=>c.nickname).join('、')||'未找到候选' }}</li></ul></details>
   <form class="shot-review" @submit.prevent="analyze">
    <div class="shot-meta">
     <label>本场模式
       <select v-model="mode">
         <option value="WANXIANG">万象大赛</option>
         <option value="DIAMOND">钻石狂潮</option>
       </select>
     </label>
     <label>当前游戏版本 (默认最新)
       <select v-model="version" required class="version-select">
         <option v-for="v in GAME_VERSIONS" :key="v.version" :value="v.version">
           {{ v.version }} {{ v.isLatest ? ' (官方最新版本)' : '' }} - {{ v.title }}
         </option>
         <option value="UNKNOWN">其他 / 未登记版本</option>
       </select>
     </label>
    </div>
    <div class="shot-meta"><label>截图时支持状态<select v-model="supportStage"><option value="UNKNOWN">不确定</option><option value="OPEN">仍可支持</option><option value="CLOSED">已结束支持</option></select></label><label>当时已揭示的禁用阵营<input v-model="bannedFaction" maxlength="160" placeholder="未显示则留空，不从赛后材料补填"></label></div>
    <p class="muted">王牌对决包含万象大赛、钻石狂潮两类，历史记录不能混算。棋手指角色，不是参赛人。以下棋手／玩法仅填截图时已经知道的信息，未揭示则留空；不会自动根据擅长标签猜本场选择。</p>
    <fieldset><legend>六人确认（名单序号不是排名）</legend><div class="shot-seat" v-for="(p,i) in players" :key="i"><span>{{ i+1 }}</span><label>截图昵称<input v-model="p.nickname" required maxlength="160" @input="p.profileId='';result=null"></label><label>选择历史昵称档案<select v-model="p.profileId" @change="result=null"><option value="">未匹配／没有该选手历史</option><option v-for="profile in candidates(p.nickname)" :key="profile.id" :value="profile.id">{{ profile.nickname }}</option></select></label><div class="shot-seat-context"><label>已揭示棋手<input v-model="p.commander" maxlength="160" placeholder="如：小妲己；未知留空"></label><label>当时已知玩法<input v-model="p.visiblePlan" maxlength="160" placeholder="未知留空，非赛后成型阵容"></label></div></div></fieldset>
    <p v-if="hasDuplicates" class="shot-warning">存在重复昵称，请先核对OCR；不能用重复行补齐六人。</p>
    <label class="shot-confirm"><input type="checkbox" v-model="confirmed">我已逐席对照赛前原图，确认名单与所选来源昵称档案；这不代表UID已核实。</label>
    <label class="shot-confirm"><input type="checkbox" v-model="experimentalProbability">由后端程序计算实验概率（使用来源昵称历史，尚未校准，不自动分配钻石）</label>
    <button class="primary" :disabled="busy||!confirmed||hasDuplicates||players.some(p=>!p.nickname.trim())">{{ experimentalProbability?'程序计算实验概率':'生成历史分析' }}</button>
   </form>
  </template>
  <section v-if="result" class="shot-result" aria-live="polite">
   <h3>分析结果：{{ result.model?'程序计算 · 未校准实验概率':result.status==='DATA_AUDIT_ONLY'?'历史资料分析，预测尚未就绪':result.status }}</h3><p>{{ result.notice }}</p>
   <p class="shot-warning">虚拟钻石／积分建议：暂不分配，保留100%。当前没有经过校准的六人获胜概率。</p>
   <section v-if="result.model" class="shot-model"><h3>后端模型结果</h3><p>{{ result.model.modelVersion }} · {{ result.model.trainingMatches }} 场训练 · {{ result.model.calibrated?'已校准':'未校准' }}</p><p>{{ result.model.notice }}</p><ol><li v-for="p in result.model.players" :key="p.nickname"><strong>{{ p.nickname }}：{{ (p.probability*100).toFixed(2) }}%</strong><span v-if="p.coldStart"> · 无历史，使用先验</span></li></ol><p v-if="result.model.diagnostic.model">离线滚动诊断 {{ result.model.diagnostic.evaluatedMatches }} 场：模型对数损失 {{ result.model.diagnostic.model.logLoss.toFixed(3) }}；均分基线 {{ result.model.diagnostic.uniform!.logLoss.toFixed(3) }}（越低越好）。不是前瞻验证。</p><p class="shot-warning" v-if="result.model.diagnostic.conclusion==='NOT_BEATING_UNIFORM'">当前离线诊断未优于六人均分基线，尚无证据表明这些概率具有预测优势。</p><p>{{ result.model.diagnostic.notice }}</p><details><summary>复算依据</summary><p>数据指纹 {{ result.model.dataHash }}</p><p>只学习名单中的选手身份与冠军标签，不读取本场返奖率、赛后阵容或作者评价。每次结果随分析记录保存。</p></details></section>
   <p>数据截止：{{ new Date(result.featureCutoff).toLocaleString('zh-CN') }}；同日无精确时间的历史场次保守排除。</p>


  <!-- 六人同场克制与Ban位影响深度研判面板 -->
  <section v-if="matchupResult" class="shot-advanced-analysis">
    <div class="analysis-header-row">
      <div>
        <h3>六人同场博弈与版本更迭研判（版本导向 + 克制链 + Ban位冲击）</h3>
        <p class="muted">根据官方最新版本【{{ matchupResult.versionMeta.version }}】环境与 26 个比赛日历史真实同场交锋记录实时测算。</p>
      </div>
      <span class="ban-tag" v-if="bannedFaction">当前禁用：{{ bannedFaction }}</span>
    </div>

    <!-- 0. 官方最新游戏版本与阵容更迭影响研判 -->
    <div class="version-analysis-card">
      <div class="version-header-row">
        <div class="version-title-wrap">
          <span class="version-badge" :class="{ 'latest': matchupResult.versionMeta.isLatest }">
            {{ matchupResult.versionMeta.isLatest ? '🎯 官方最新版本' : '📜 历史回测版本' }} · {{ matchupResult.versionMeta.version }}
          </span>
          <span class="version-date">生效日期：{{ matchupResult.versionMeta.effectiveDate }}</span>
        </div>
        <p class="version-summary-note">{{ matchupResult.versionMeta.summary }}</p>
      </div>

      <div class="version-impact-box">
        <div class="impact-title">📌 本版本核心机制变动与阵容更迭导向：</div>
        <ul class="version-changes-list">
          <li v-for="(change, cIdx) in matchupResult.versionMeta.keyChanges" :key="cIdx">
            {{ change }}
          </li>
        </ul>
        <div class="version-lineup-note">
          <strong>💡 阵容生态影响：</strong>{{ matchupResult.versionMeta.lineupImpact }}
        </div>
      </div>

      <!-- 6 位选手在新版本下的阵容契合度分析 -->
      <div class="player-version-grid">
        <div v-for="p in matchupResult.players" :key="p.nickname" class="player-version-item" :class="p.versionAdaptation.fitLevel.toLowerCase()">
          <div class="item-head">
            <img :src="getPlayerAvatar(p.nickname)" class="player-avatar-mini" alt="" />
            <span class="player-name">{{ p.nickname }}</span>
            <span class="version-fit-badge" :class="p.versionAdaptation.fitLevel.toLowerCase()">
              {{ p.versionAdaptation.fitLabel }}
              <small v-if="p.versionModifier !== 0">({{ p.versionModifier > 0 ? '+' : '' }}{{ (p.versionModifier * 100).toFixed(0) }}%)</small>
            </span>
          </div>
          <p class="item-desc">{{ p.versionAdaptation.summary }}</p>
        </div>
      </div>
    </div>

    <!-- 1. 阵营禁用冲击剖析 -->
    <div class="ban-analysis-card" v-if="bannedFaction">
      <div class="ban-summary-banner">
        <span class="ban-icon">🛡️</span>
        <div class="ban-summary-text">
          <strong>禁选大局研判</strong>
          <p>{{ matchupResult.banSummary.summaryText }}</p>
        </div>
      </div>

      <div class="ban-players-grid">
        <div v-for="p in matchupResult.players" :key="p.nickname" class="ban-player-card" :class="p.banEvaluation?.level.toLowerCase()">
          <div class="card-top">
            <img :src="getPlayerAvatar(p.nickname)" class="player-avatar-small" alt="" />
            <div>
              <strong>{{ p.nickname }}</strong>
              <small v-if="p.masterName !== p.nickname">({{ p.masterName }})</small>
            </div>
            <span class="impact-level-pill" :class="p.banEvaluation?.level.toLowerCase()">
              {{ p.banEvaluation?.levelLabel || '无影响' }}
            </span>
          </div>
          <p class="ban-desc">{{ p.banEvaluation?.description }}</p>
          <div class="ban-advice-row">
            <span class="advice-label">对策：</span>
            <span>{{ p.banEvaluation?.advice }}</span>
          </div>
          <div v-if="p.banEvaluation?.historicalRecord.matches" class="ban-hist-stat">
            历史此Ban下：{{ p.banEvaluation.historicalRecord.wins }}/{{ p.banEvaluation.historicalRecord.matches }} 夺冠 (胜率 {{ p.banEvaluation.historicalRecord.winRate }}%)
          </div>
        </div>
      </div>
    </div>

    <!-- 2. 同场交锋与克制链 -->
    <div class="h2h-analysis-card">
      <h4>⚡ 六人历史同场交手与对位克制链</h4>
      <div v-if="matchupResult.crossMatchups.length" class="cross-matchups-list">
        <div v-for="(cm, idx) in matchupResult.crossMatchups" :key="idx" class="cross-matchup-item">
          <span class="edge-icon">⚔️</span>
          <div class="matchup-text">
            <strong>{{ cm.winner }}</strong>
            <span class="sub-suppress">同场压制</span>
            <strong>{{ cm.loser }}</strong>
            <span class="stat-pill">{{ cm.wins }}胜 {{ cm.losses }}负 · {{ cm.encounters }}战</span>
          </div>
        </div>
      </div>
      <p v-else class="empty-h2h-text">当前 6 位选手在库内暂无历史同场两两直接交锋胜负记录（势均力敌）。</p>

      <!-- 每位选手的克制与被克制标记 -->
      <div class="player-nemesis-grid">
        <div v-for="p in matchupResult.players" :key="p.nickname" class="nemesis-row">
          <img :src="getPlayerAvatar(p.nickname)" class="player-avatar-mini" alt="" />
          <strong class="nemesis-name">{{ p.nickname }}</strong>
          <div class="nemesis-tags">
            <span v-for="opp in p.suppressedBy" :key="opp" class="tag-suppressed" title="历史上曾被该选手同场多次压制">
              ⚠️ 遇苦主：{{ opp }}
            </span>
            <span v-for="vic in p.suppresses" :key="vic" class="tag-suppress" title="历史上同场多次压制该选手">
              ⚡ 克制：{{ vic }}
            </span>
            <span v-if="!p.suppressedBy.length && !p.suppresses.length" class="tag-neutral">
              同场相对均势
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 3. 综合博弈校正战力与胜率 -->
    <div class="adjusted-probability-box">
      <h4>🎯 综合博弈胜率推演（融合基础实力 + 克制加成 + Ban位修正 + 最新版本适配）</h4>
      <div class="prob-bars-list">
        <div v-for="p in matchupResult.players" :key="p.nickname" class="prob-row">
          <div class="row-info">
            <img :src="getPlayerAvatar(p.nickname)" class="player-avatar-mini" alt="" />
            <span class="name">{{ p.nickname }}</span>
            <div class="modifiers-pills">
              <span v-if="p.commanderModifier && p.commanderModifier !== 0" class="mod-pill" :class="{ positive: p.commanderModifier > 0, negative: p.commanderModifier < 0 }">
                棋手 {{ p.commanderModifier > 0 ? '+' : '' }}{{ (p.commanderModifier * 100).toFixed(0) }}%
              </span>
              <span v-if="p.h2hBonus !== 0" class="mod-pill" :class="{ positive: p.h2hBonus > 0, negative: p.h2hBonus < 0 }">
                克制 {{ p.h2hBonus > 0 ? '+' : '' }}{{ p.h2hBonus }}
              </span>
              <span v-if="p.banModifier !== 0" class="mod-pill" :class="{ positive: p.banModifier > 0, negative: p.banModifier < 0 }">
                Ban位 {{ p.banModifier > 0 ? '+' : '' }}{{ p.banModifier }}
              </span>
              <span v-if="p.versionModifier !== 0" class="mod-pill" :class="{ positive: p.versionModifier > 0, negative: p.versionModifier < 0 }">
                版本 {{ p.versionModifier > 0 ? '+' : '' }}{{ (p.versionModifier * 100).toFixed(0) }}%
              </span>
            </div>
            <strong class="prob-val">{{ (p.adjustedProbability * 100).toFixed(1) }}%</strong>
          </div>
          <div class="prob-track">
            <div class="prob-fill" :style="{ width: `${Math.min(100, Math.max(2, p.adjustedProbability * 100))}%` }"></div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section v-if="result.aceContext" class="shot-context-result"><h3>本场条件</h3><p>阵营禁用与已知玩法用于核对；当前实验概率尚未使用这些条件。</p><p>禁用：{{ result.aceContext.bannedFaction || '未提供' }}</p><ul><li v-for="p in result.aceContext.players" :key="p.seat">{{ p.nickname }} · 棋手 {{ p.commander||'未知' }} · 玩法 {{ p.visiblePlan||'未知' }}</li></ul><p v-for="g in result.aceContext.sharedPlans" :key="g.label">{{ g.label }}：席位 {{ g.seats.join('、') }} 选择标签相同，需复核实际英雄竞争；不据此直接加减胜率。</p><p v-for="w in result.aceContext.warnings.filter(w => !w.includes('RETURN'))" :key="w">{{ contextWarnings[w]||w }}</p><a v-for="source in result.aceContext.rules.sources" :key="source.url" :href="source.url" target="_blank" rel="noreferrer">{{ source.title }} </a></section>
  <ul class="shot-gaps"><li v-for="b in result.blockers" :key="b">{{ blockerNames[b]||b }}</li></ul>
  <div class="shot-profiles"><article v-for="(p,i) in result.players" :key="i"><h4>{{ p.nickname }}</h4><p>档案：{{ p.profileNickname||'未匹配' }} · 程序概率：{{ p.probability == null ? '未计算' : (p.probability*100).toFixed(2)+'%（实验）' }}</p><p>近7日来源样本 {{ p.recent7.wins }}/{{ p.recent7.observations }} 登顶；近30日 {{ p.recent30.wins }}/{{ p.recent30.observations }}</p><p class="muted">以上仅已采集样本，无模式/版本完整性保证，不能当作完整近期战绩。</p><ul><li v-for="b in p.buildRates" :key="b.label">{{ b.label }}：{{ b.wins }}/{{ b.observations }} 登顶（{{ (100*b.observedWinShare).toFixed(1) }}% 来源选择标签样本）；最终阵容胜率未知</li></ul><p v-if="!p.buildRates.length">暂无可关联的逐局玩法。</p><details v-if="p.claims.length"><summary>作者专长评价与原文</summary><ul><li v-for="c in p.claims" :key="c.id">{{ c.kind==='COMMANDER_AUTHOR_CLAIM'?'棋手':'玩法' }}：{{ c.text }} <a :href="c.sourceUrl" target="_blank" rel="noreferrer">来源</a></li></ul></details></article></div>
 </section>
  </div>
</section>
</template>
<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref,watch} from 'vue'
import {uploadEvidence} from '../api/index'
import {researchApi} from '../api/prediction'
import {
  evaluate6PlayerMatchup,
  CURRENT_LATEST_VERSION,
  GAME_VERSIONS,
  OFFICIAL_COMMANDERS,
  evaluateCommander,
  inferPlayerLineup,
  type SixPlayerMatchupResult
} from '../utils/player-matchup'
import {getPlayerAvatar} from '../utils/player-avatar'
import {getMasterPlayerName} from '../utils/player-grouping'

// 标签切换：实战极速推演 vs 传统截图审计
const activeTab = ref<'instant' | 'audit'>('instant')

// 极速模式下的快速批量输入与常用选项
const batchPasteText = ref('')
const batchFeedback = ref('')
const activeDropdownSeat = ref<number | null>(null)

const starPlayers = [
  '梦飞大大',
  '抖音EGM小谷芷',
  '白白白白白3',
  '丰川祥子',
  'QT新一',
  '抖音猪葛龟龟',
  '呆头鹅',
  '遗愿',
  '沐汐',
  '世薄情',
  '抖音小新游',
  '抖音妖柒'
]
const quickBans = ['', '逐鹿', '三分', '日落海', '河洛', '稷下', '大河']

// 选手历史招牌/常用棋手数据库映射（全面校准为官方 21 位万象棋正统棋手名）
const SIGNATURE_COMMANDERS: Record<string, string> = {
  '梦飞': '嬴律',
  '梦飞大大': '嬴律',
  '小谷芷': '嬴律',
  '抖音EGM小谷芷': '嬴律',
  '白白白白白3': '嬴律',
  '丰川祥子': '安琪拉',
  '新一': '嬴律',
  'QT新一': '嬴律',
  '猪葛龟': '庄小鱼',
  '猪葛龟龟': '庄小鱼',
  '抖音猪葛龟龟': '庄小鱼',
  '呆头鹅': '嬴律',
  '遗愿': '白歌',
  '世薄情': '小妲己',
  '沐汐': '乔汐',
  'EZ拉丁鱼': '乔汐',
  '小新游': '乔汐',
  '抖音小新游': '乔汐',
  '妖柒': '安琪拉',
  '抖音妖柒': '安琪拉',
  '晓枫': '嬴律',
  'RW侠.晓枫': '嬴律',
  '清辞': '安琪拉',
  '武汉 EG清辞': '安琪拉',
  'EG清辞': '安琪拉',
  '泪花': '玉环',
  '抖音EG泪花': '玉环',
  '兰陵笑笑笑': '庄小鱼',
  '事后诸葛亮': '白歌',
  '抖音搜索北念': '嬴律',
  '北念': '嬴律',
  '皮皮鲨': '玉环',
  '抖音EGM皮皮鲨': '玉环',
  '阿文倒转王': '乔汐',
  '星光柯基': '小妲己',
  '喵喵虾条': '马可',
  '萌岑': '昭君'
}

interface Candidate {id:string;nickname:string;similarity:number}
interface Draft {id:string;featureCutoff:string;ocr:{phaseHint:string;rows:{rawText:string;candidates:Candidate[]}[]}}
interface Sample {wins:number;observations:number}
interface AceContext {notice:string;bannedFaction:string|null;rules:{perPlayerSupportCap:number|null;sources:{title:string;url:string}[]};players:{seat:number;nickname:string;commander:string|null;visiblePlan:string|null;returnMultiplier:number|null;breakEvenProbability:number|null}[];sharedPlans:{label:string;seats:number[]}[];warnings:string[]}
interface WinnerModel {modelVersion:string;trainingMatches:number;calibrated:boolean;notice:string;dataHash:string;players:{nickname:string;probability:number;coldStart:boolean}[];diagnostic:{conclusion?:string;evaluatedMatches:number;model:null|{logLoss:number};uniform:null|{logLoss:number};notice:string}}
interface Result {model?:WinnerModel|null;aceContext?:AceContext;status:string;notice:string;featureCutoff:string;blockers:string[];players:{probability?:number|null;nickname:string;profileNickname:string|null;recent7:Sample;recent30:Sample;buildRates:{label:string;wins:number;observations:number;observedWinShare:number}[];claims:{id:string;kind:string;text:string;sourceUrl:string}[]}[]}
const capturedAt=ref('')
const file=ref<File|null>(null),operator=ref(''),evidenceId=ref(''),busy=ref(false),error=ref(''),draft=ref<Draft|null>(null),result=ref<Result|null>(null),confirmed=ref(false),mode=ref('WANXIANG'),version=ref(CURRENT_LATEST_VERSION)
const savedAnalysisId=ref('')
const catalogMatches=ref<any[]>([])
async function loadSaved(){busy.value=true;error.value='';result.value=null;draft.value=null;confirmed.value=false;try{result.value=await researchApi<Result>(`screenshot-analyses/${encodeURIComponent(savedAnalysisId.value.trim())}`)}catch(e){error.value=e instanceof Error?e.message:'读取失败'}finally{busy.value=false}}
const experimentalProbability=ref(true)
const supportStage=ref('UNKNOWN'),bannedFaction=ref('')
const contextWarnings:Record<string,string>={UNKNOWN_RULE_VERSION:'该版本尚未核对官方支持上限，不套用其他版本',SUPPORT_NOT_CONFIRMED_OPEN:'尚未确认仍可支持，不能执行支持方案',MISSING_RETURN_QUOTES:'部分返奖率缺失，无法比较全部六席报价',RETURN_BASIS_UNCONFIRMED:'尚未确认返奖是否含本金，暂不计算保本阈值'}
const profiles=ref<{id:string;nickname:string}[]>([]),players=ref(Array.from({length:6},()=>({nickname:'',profileId:'',commander:'',visiblePlan:''})))
const blockerNames:Record<string,string>={UNCALIBRATED_MODEL:'尚未完成时间回测和概率校准',UNCONFIRMED_HISTORICAL_IDENTITIES:'历史账号身份未确认，昵称不等于稳定UID',UNKNOWN_HISTORICAL_MODE_VERSION:'历史模式和游戏版本未核全',UNVERIFIED_SOURCE_RESULTS:'来源赛果尚未完成独立核验',UNMATCHED_PLAYER:'有选手未匹配历史档案',INCOMPLETE_SOURCE_COVERAGE:'历史来源尚未采集齐全',SCREENSHOT_HAS_POSTMATCH_INDICATORS:'截图存在赛后标记'}
const normalize=(s:string)=>s.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase()
const hasDuplicates=computed(()=>{const names=players.value.map(p=>p.nickname.normalize('NFKC').replace(/\s/g,'').toLowerCase()).filter(Boolean);return new Set(names).size!==names.length})
function candidates(name:string){const ids=new Set(draft.value?.ocr.rows.find(r=>r.rawText===name)?.candidates.map(c=>c.id)||[]);const q=normalize(name);return profiles.value.filter(p=>!q||normalize(p.nickname).includes(q)||q.includes(normalize(p.nickname))||ids.has(p.id))}
function selectFile(event:Event){file.value=(event.target as HTMLInputElement).files?.[0]||null;draft.value=null;result.value=null;evidenceId.value='';confirmed.value=false}
async function read(){if(!file.value)return;busy.value=true;error.value='';draft.value=null;result.value=null;confirmed.value=false
 try{const uploaded=await uploadEvidence(file.value,{capturedAt:new Date(capturedAt.value).toISOString(),providedBy:operator.value,kind:'CONTENT_ASSET',usageScope:'INTERNAL_ONLY',note:'赛前截图识别草稿；非赛果核验'});evidenceId.value=uploaded.evidenceId;draft.value=await researchApi<Draft>('screenshots',{evidenceId:uploaded.evidenceId});players.value=Array.from({length:6},(_,i)=>({nickname:draft.value?.ocr.rows[i]?.rawText||'',profileId:'',commander:SIGNATURE_COMMANDERS[draft.value?.ocr.rows[i]?.rawText||'']||'',visiblePlan:''}))}catch(e){error.value=e instanceof Error?e.message:'识别失败'}finally{busy.value=false}}
async function analyze(){if(!draft.value)return;busy.value=true;error.value='';result.value=null;try{result.value=await researchApi<Result>(`screenshots/${draft.value.id}/analyze`,{experimentalProbability:experimentalProbability.value,phase:'PREMATCH',identityConfirmed:confirmed.value,operator:operator.value,mode:mode.value,version:version.value,aceContext:{supportStage:supportStage.value,bannedFaction:bannedFaction.value},players:players.value.map(p=>({nickname:p.nickname,profileId:p.profileId||null,commander:p.commander,visiblePlan:p.visiblePlan}))})}catch(e){error.value=e instanceof Error?e.message:'分析失败'}finally{busy.value=false}}
watch([players,operator,confirmed,mode,version,capturedAt,experimentalProbability,supportStage,bannedFaction],()=>{result.value=null},{deep:true})

export interface KnownPlayerItem {
  nickname: string
  masterName: string
  wins: number
  matches: number
  topBuild: string
  signatureCommander: string
}

// 基于全量真实赛果构建的可检索选手知识库 (190 账号)
const knownPlayersList = computed<KnownPlayerItem[]>(() => {
  const map = new Map<string, { nickname: string; masterName: string; wins: number; matches: number; builds: Record<string, number> }>()

  // 1. 从 profiles 预初始化
  for (const p of profiles.value) {
    if (!p.nickname) continue
    const master = getMasterPlayerName(p.nickname)
    map.set(p.nickname, {
      nickname: p.nickname,
      masterName: master,
      wins: 0,
      matches: 0,
      builds: {}
    })
  }

  // 2. 遍历全量 matches 统计胜场与常用阵容
  for (const m of catalogMatches.value) {
    for (const s of (m.seats || [])) {
      if (!s.nickname || s.nickname.startsWith('席位')) continue
      let item = map.get(s.nickname)
      if (!item) {
        item = {
          nickname: s.nickname,
          masterName: getMasterPlayerName(s.nickname),
          wins: 0,
          matches: 0,
          builds: {}
        }
        map.set(s.nickname, item)
      }
      item.matches++
      if (s.winner) item.wins++
      if (s.build) {
        item.builds[s.build] = (item.builds[s.build] || 0) + 1
      }
    }
  }

  const result: KnownPlayerItem[] = []
  for (const item of map.values()) {
    const topBuild = Object.entries(item.builds).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
    const sigCmd = SIGNATURE_COMMANDERS[item.nickname] || SIGNATURE_COMMANDERS[item.masterName] || ''
    result.push({
      nickname: item.nickname,
      masterName: item.masterName,
      wins: item.wins,
      matches: item.matches,
      topBuild,
      signatureCommander: sigCmd
    })
  }

  return result.sort((a, b) => b.wins - a.wins || b.matches - a.matches)
})

// 模糊查找匹配选手（支持纯小名、去平台前缀、首字母或模糊包含）
function resolveFuzzyPlayer(token: string): KnownPlayerItem | null {
  const q = token.trim().toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
  if (!q) return null

  // 1. 精确匹配
  const exact = knownPlayersList.value.find(p => p.nickname.toLowerCase() === q)
  if (exact) return exact

  // 2. 去除前缀匹配
  const candidates = knownPlayersList.value.filter(p => {
    const nick = p.nickname.toLowerCase()
    const master = p.masterName.toLowerCase()
    const stripped = nick.replace(/^(抖音|快手|b站|斗鱼|虎牙|egm|eg|ez|qt|rw侠\.?)/i, '')
    return nick.includes(q) || master.includes(q) || stripped.includes(q) || q.includes(master) || q.includes(stripped)
  })

  return candidates[0] || null
}

// 席位输入框的下拉联想匹配列表
function getSeatSuggestions(query: string): KnownPlayerItem[] {
  const q = (query || '').trim().toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
  if (!q) {
    return knownPlayersList.value.slice(0, 6)
  }
  return knownPlayersList.value
    .filter(p => {
      const nick = p.nickname.toLowerCase()
      const master = p.masterName.toLowerCase()
      const stripped = nick.replace(/^(抖音|快手|b站|斗鱼|虎牙|egm|eg|ez|qt|rw侠\.?)/i, '')
      return nick.includes(q) || master.includes(q) || stripped.includes(q)
    })
    .slice(0, 8)
}

// 点击下拉候选直接填入
function selectCandidate(idx: number, cand: KnownPlayerItem) {
  players.value[idx].nickname = cand.nickname
  players.value[idx].profileId = ''
  if (!players.value[idx].commander && cand.signatureCommander) {
    players.value[idx].commander = cand.signatureCommander
  }
  activeDropdownSeat.value = null
}

// 获取选手历史擅长流派列表（从 232 场赛果聚合中提取）
function getPlayerBuilds(nickname: string): string[] {
  if (!nickname) return []
  const master = getMasterPlayerName(nickname)
  const p = knownPlayersList.value.find(x => x.nickname === nickname || x.masterName === master)
  return p?.topBuild ? [p.topBuild] : []
}

// 核心逻辑：根据选手个人擅长流派 + 本场Ban位 + 所选棋手，推断本场选手的出战阵容
function getSeatInferredLineup(nickname: string, commander: string | null) {
  if (!nickname) return null
  const builds = getPlayerBuilds(nickname)
  return inferPlayerLineup(builds, bannedFaction.value || null, commander)
}

// 选手+棋手协同度计算标签（基于选手推断阵容与棋手机制评估）
function getSeatSynergy(nickname: string, commander: string) {
  if (!nickname || !commander) return null
  const builds = getPlayerBuilds(nickname)
  const cmd = evaluateCommander(commander, builds, version.value || CURRENT_LATEST_VERSION, bannedFaction.value || null)
  if (!cmd) return null
  if (cmd.synergyLevel === 'PERFECT') {
    return { level: 'perfect', label: `🔥 协同暴涨 (+${(cmd.bonus * 100).toFixed(0)}%)`, text: cmd.summary }
  }
  if (cmd.synergyLevel === 'GOOD') {
    return { level: 'good', label: `✨ 契合良好 (+${(cmd.bonus * 100).toFixed(0)}%)`, text: cmd.summary }
  }
  return { level: 'neutral', label: `平稳增幅 (+${(cmd.bonus * 100).toFixed(0)}%)`, text: cmd.summary }
}

// 极速模式：一键批量填入名单（支持模糊纠偏与招牌棋手自动匹配）
function applyBatchPaste() {
  if (!batchPasteText.value.trim()) return
  const tokens = batchPasteText.value
    .split(/[\s,，、\n\t]+/)
    .map(s => s.trim())
    .filter(Boolean)

  const matchedSummaries: string[] = []

  for (let i = 0; i < 6; i++) {
    const token = tokens[i]
    if (!token) {
      removeSeat(i)
      continue
    }
    const matched = resolveFuzzyPlayer(token)
    if (matched) {
      players.value[i].nickname = matched.nickname
      players.value[i].profileId = ''
      if (!players.value[i].commander && matched.signatureCommander) {
        players.value[i].commander = matched.signatureCommander
      }
      matchedSummaries.push(`${token} → ${matched.nickname}`)
    } else {
      players.value[i].nickname = token
      players.value[i].profileId = ''
    }
  }

  if (matchedSummaries.length > 0) {
    batchFeedback.value = `✨ 已智能识别入座：${matchedSummaries.slice(0, 3).join('，')}${matchedSummaries.length > 3 ? '等' : ''}`
  } else {
    batchFeedback.value = `已分发名单至 6 席位。`
  }
}

// 极速模式：快捷点选明星选手
function addStarPlayer(name: string) {
  const existing = players.value.findIndex(p => p.nickname === name)
  if (existing !== -1) return
  const emptyIdx = players.value.findIndex(p => !p.nickname.trim())
  if (emptyIdx !== -1) {
    players.value[emptyIdx].nickname = name
    players.value[emptyIdx].profileId = ''
    if (!players.value[emptyIdx].commander && SIGNATURE_COMMANDERS[name]) {
      players.value[emptyIdx].commander = SIGNATURE_COMMANDERS[name]
    }
  }
}

// 极速模式：席位清空
function removeSeat(idx: number) {
  players.value[idx].nickname = ''
  players.value[idx].profileId = ''
  players.value[idx].commander = ''
  players.value[idx].visiblePlan = ''
}

// 极速模式：全部清空
function clearAllSeats() {
  for (let i = 0; i < 6; i++) {
    removeSeat(i)
  }
  batchPasteText.value = ''
  batchFeedback.value = ''
}

// 实时计算同场克制、禁选阵营与所选棋手影响 (双核：选手+棋手毫秒级响应)
const matchupResult=computed<SixPlayerMatchupResult|null>(()=>{
 const valid=players.value.filter(p=>p.nickname&&p.nickname.trim())
 if(valid.length<2)return null
 return evaluate6PlayerMatchup(
   valid.map(p=>({nickname:p.nickname,commander:p.commander||null})),
   bannedFaction.value,
   catalogMatches.value,
   version.value||CURRENT_LATEST_VERSION
 )
})

// 排序后的推演阵营
const rankedPlayers = computed(() => {
  if (!matchupResult.value?.players) return []
  return [...matchupResult.value.players].sort((a, b) => b.adjustedProbability - a.adjustedProbability)
})

// 投比首选建议 (Top 1)
const topPick = computed(() => rankedPlayers.value[0] || null)

// 稳健次选 (Top 2)
const secondPick = computed(() => rankedPlayers.value[1] || null)

// 高危避坑选手 (被Ban严重受制或被苦主克制)
const highRiskPlayers = computed(() => {
  if (!matchupResult.value?.players) return []
  return matchupResult.value.players.filter(p => p.banEvaluation?.level === 'CRITICAL' || p.suppressedBy.length >= 2)
})

// 全局粘贴监听 (在网页按 Ctrl+V / Cmd+V 截屏秒识别)
function handleGlobalPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith('image/')) {
      const pasted = items[i].getAsFile()
      if (pasted) {
        file.value = pasted
        capturedAt.value = new Date().toISOString().slice(0, 19)
        operator.value = operator.value || '实战速录'
        read()
        break
      }
    }
  }
}

// 全局点击监听（关闭联想下拉）
function handleDocumentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.seat-player-row')) {
    activeDropdownSeat.value = null
  }
}

onMounted(async()=>{
 window.addEventListener('paste', handleGlobalPaste)
 document.addEventListener('click', handleDocumentClick)
 try{
  const cat=await researchApi<{players:{id:string;nickname:string}[];matches:any[]}>('catalog')
  profiles.value=cat.players||[]
  catalogMatches.value=cat.matches||[]
 }catch(e){error.value=e instanceof Error?e.message:'档案加载失败'}
})

onUnmounted(() => {
 window.removeEventListener('paste', handleGlobalPaste)
 document.removeEventListener('click', handleDocumentClick)
})
</script>
<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.shot-workbench {
  @include glass-panel;
  padding: 28px;
  margin: 20px 0;
  overflow-wrap: anywhere;

  h2 {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 8px;
    color: $text-primary;
  }

  p {
    line-height: 1.7;
    margin: 8px 0;
    color: $text-secondary;
    font-size: 13.5px;
  }
}

// 头部与模式切换
.workbench-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 18px;
  border-bottom: 1px solid $border-subtle;
  flex-wrap: wrap;

  h2 {
    font-size: 22px;
    font-weight: 800;
    color: $text-primary;
    margin-bottom: 4px;
  }
}

.workbench-tabs {
  display: flex;
  background: $bg-subtle;
  padding: 4px;
  border-radius: $radius-md;
  gap: 4px;

  .tab-btn {
    border: none;
    background: transparent;
    padding: 8px 16px;
    font-size: 13.5px;
    font-weight: 600;
    color: $text-secondary;
    border-radius: $radius-sm;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1);

    &:hover {
      color: $text-primary;
    }

    &.active {
      background: $bg-surface;
      color: $color-primary;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
      font-weight: 700;
    }
  }
}

// 1. 极速模式面板样式
.instant-mode-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.instant-countdown-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  background: linear-gradient(135deg, $color-accent-light 0%, #fff 100%);
  border: 1px solid rgba($color-accent, 0.25);
  border-left: 4px solid $color-accent;
  padding: 14px 20px;
  border-radius: $radius-md;

  .countdown-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba($color-accent, 0.12);
    padding: 6px 12px;
    border-radius: $radius-sm;
    min-width: 120px;
    text-align: center;

    .pulse-icon {
      font-size: 18px;
    }

    strong {
      font-size: 13px;
      font-weight: 700;
      color: $color-accent-dark;
      margin-top: 2px;
    }
  }

  .banner-tips {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
    color: $text-primary;
    line-height: 1.5;

    .tip-shortcut {
      color: $text-secondary;
      font-size: 12px;

      code {
        background: rgba(0, 0, 0, 0.06);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: inherit;
        font-weight: 600;
      }
    }
  }
}

// 快速名单操作盘
.quick-roster-box {
  background: $bg-surface;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.batch-paste-row {
  display: flex;
  gap: 10px;
  align-items: center;

  input {
    flex: 1;
    height: 40px;
    padding: 0 14px;
    font-size: 13px;
    border: 1px solid $border-subtle;
    border-radius: $radius-sm;
    background: $bg-canvas;

    &:focus {
      outline: none;
      border-color: $color-primary;
      background: #fff;
    }
  }

  .batch-feedback-pill {
    font-size: 11.5px;
    font-weight: 600;
    color: $color-primary;
    background: $color-primary-light;
    padding: 6px 12px;
    border-radius: 16px;
    border: 1px solid rgba($color-primary, 0.25);
    white-space: nowrap;
    animation: fadeIn 0.2s ease-in;
  }

  .btn-tool {
    height: 40px;
    padding: 0 16px;
    font-size: 13px;
    font-weight: 600;
    border-radius: $radius-sm;
    border: 1px solid $border-subtle;
    background: $bg-subtle;
    color: $text-primary;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;

    &:hover {
      background: #e2e8e5;
    }

    &.btn-danger-soft {
      color: $color-danger;
      border-color: rgba($color-danger, 0.2);
      background: $color-danger-light;

      &:hover {
        background: #fde8e8;
      }
    }
  }
}

// 明星选手快捷点选栏
.star-players-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  background: $bg-canvas;
  border-radius: $radius-sm;

  .bar-title {
    font-size: 12px;
    font-weight: 700;
    color: $text-secondary;
    white-space: nowrap;
  }

  .star-pills-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .star-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 600;
    background: $bg-surface;
    border: 1px solid $border-subtle;
    border-radius: 20px;
    color: $text-primary;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      border-color: $color-primary;
      background: $color-primary-light;
      color: $color-primary;
    }

    &.in-roster {
      background: $color-primary-light;
      border-color: rgba($color-primary, 0.3);
      color: $color-primary;
      opacity: 0.8;
    }

    .star-avatar {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      object-fit: cover;
    }

    .check-mark {
      color: $color-success;
      font-weight: 800;
      font-size: 11px;
    }
  }
}

// 6席位网格卡片
.seats-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;

  .seat-card {
    background: $bg-canvas;
    border: 1px solid $border-subtle;
    border-radius: $radius-sm;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    position: relative;

    .seat-head {
      display: flex;
      justify-content: space-between;
      align-items: center;

      .seat-head-left {
        display: flex;
        align-items: center;
        gap: 4px;
        min-width: 0;
      }

      .seat-number {
        font-size: 11px;
        font-weight: 700;
        color: $text-secondary;
      }

      .master-pill {
        font-size: 10px;
        font-weight: 600;
        color: $color-primary;
        background: rgba($color-primary, 0.1);
        padding: 1px 4px;
        border-radius: 3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 70px;
      }

      .seat-clear-btn {
        border: none;
        background: transparent;
        color: $text-secondary;
        cursor: pointer;
        font-size: 11px;
        padding: 0 4px;
        line-height: 1;

        &:hover {
          color: $color-danger;
        }
      }
    }

    .seat-body {
      display: flex;
      flex-direction: column;
      gap: 6px;

      .seat-player-row {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
      }

      .seat-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        object-fit: cover;
        background: $border-subtle;
        flex-shrink: 0;
      }

      .seat-input-wrap {
        flex: 1;
        min-width: 0;
        position: relative;

        .seat-input {
          width: 100%;
          font-size: 12px;
          font-weight: 600;
          height: 28px;
          padding: 0 6px;
          border: 1px solid $border-subtle;
          background: #fff;
          border-radius: 4px;

          &:focus {
            outline: none;
            border-color: $color-primary;
            box-shadow: 0 0 0 2px rgba($color-primary, 0.12);
          }
        }

        .autocomplete-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          width: 220px;
          max-height: 250px;
          overflow-y: auto;
          background: #ffffff;
          border: 1px solid $border-subtle;
          border-radius: 6px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
          z-index: 100;
          padding: 4px;

          .dropdown-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 8px;
            border-radius: 4px;
            cursor: pointer;
            transition: background 0.12s ease;

            &:hover {
              background: $bg-subtle;
            }

            .cand-avatar {
              width: 24px;
              height: 24px;
              border-radius: 50%;
              object-fit: cover;
              flex-shrink: 0;
            }

            .cand-meta {
              display: flex;
              flex-direction: column;
              min-width: 0;
              flex: 1;

              .cand-name-row {
                display: flex;
                align-items: center;
                gap: 4px;

                .cand-name {
                  font-size: 12px;
                  font-weight: 700;
                  color: $text-primary;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                }

                .cand-master {
                  font-size: 10px;
                  color: $text-secondary;
                }
              }

              .cand-stats {
                font-size: 10.5px;
                color: $text-secondary;
                line-height: 1.3;

                .cand-cmd-tag {
                  color: $color-primary;
                  font-weight: 600;
                }
              }
            }
          }
        }
      }

      .seat-commander-row {
        display: flex;
        align-items: center;
        gap: 4px;
        width: 100%;

        .cmd-icon {
          font-size: 11px;
          flex-shrink: 0;
          opacity: 0.8;
        }

        .seat-commander-select {
          flex: 1;
          height: 24px;
          font-size: 11px;
          font-weight: 600;
          padding: 0 4px;
          border: 1px solid $border-subtle;
          border-radius: 4px;
          background: #fff;
          color: $text-primary;
          cursor: pointer;
          min-width: 0;

          &:focus {
            outline: none;
            border-color: $color-primary;
          }
        }
      }

      .seat-inferred-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
        background: #fff;
        padding: 4px 6px;
        border-radius: 4px;
        border: 1px solid rgba($border-subtle, 0.7);

        .inferred-lineup {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          min-width: 0;
          flex-wrap: wrap;

          .inferred-label {
            color: $text-secondary;
            font-size: 10px;
          }

          .inferred-name {
            color: $color-primary;
            font-weight: 700;
          }

          .ban-alert-tag {
            font-size: 9.5px;
            color: $color-danger;
            background: rgba($color-danger, 0.1);
            padding: 1px 4px;
            border-radius: 3px;
            font-weight: 600;
          }
        }
      }

      .seat-synergy-tag {
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 3px;
        text-align: center;
        white-space: nowrap;

        &.perfect {
          background: #fef3c7;
          color: #b45309;
          border: 1px solid #fde68a;
        }

        &.good {
          background: $color-primary-light;
          color: $color-primary;
          border: 1px solid rgba($color-primary, 0.2);
        }

        &.neutral {
          background: $bg-subtle;
          color: $text-secondary;
        }
      }
    }
  }
}

// 快速 Ban 位与版本选择
.quick-conditions-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: $bg-surface;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  padding: 14px 20px;
  flex-wrap: wrap;
  gap: 14px;

  .condition-label {
    font-size: 12.5px;
    font-weight: 700;
    color: $text-secondary;
  }

  .quick-ban-selector {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;

    .ban-pills-group {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .ban-pill-btn {
      border: 1px solid $border-subtle;
      background: $bg-canvas;
      padding: 6px 12px;
      font-size: 12.5px;
      font-weight: 600;
      border-radius: 20px;
      color: $text-primary;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        border-color: $color-accent;
        color: $color-accent-dark;
      }

      &.active {
        background: $color-accent;
        border-color: $color-accent;
        color: #fff;
        box-shadow: 0 2px 6px rgba($color-accent, 0.25);
      }
    }
  }

  .quick-version-selector {
    display: flex;
    align-items: center;
    gap: 8px;

    .version-select-mini {
      height: 32px;
      font-size: 12.5px;
      font-weight: 600;
      border-radius: $radius-sm;
      padding: 0 10px;
      border: 1px solid $border-subtle;
      background: $bg-canvas;
      color: $color-primary;
    }
  }
}

// 极速投比决策卡片
.decision-hub-card {
  background: #fff;
  border: 1px solid rgba($color-primary, 0.15);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.04);
  border-radius: $radius-md;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;

  .decision-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid $border-subtle;
    padding-bottom: 14px;

    .dh-title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;

      .dh-badge {
        background: $color-primary;
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 4px;
      }

      h3 {
        font-size: 17px;
        font-weight: 700;
        color: $text-primary;
      }
    }

    .calc-tag {
      font-size: 12px;
      color: $color-success;
      font-weight: 600;
      background: $color-success-light;
      padding: 4px 10px;
      border-radius: 20px;
      border: 1px solid $color-success-border;
    }
  }

  .decision-core-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }

  .recommend-box {
    border-radius: $radius-md;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border: 1px solid $border-subtle;

    .box-tag {
      font-size: 12px;
      font-weight: 700;
      display: inline-block;
      width: fit-content;
      padding: 3px 8px;
      border-radius: 4px;
    }

    &.top-1 {
      background: linear-gradient(135deg, #fefbf4 0%, #ffffff 100%);
      border-color: rgba($color-accent, 0.35);
      border-top: 4px solid $color-accent;

      .box-tag {
        background: $color-accent;
        color: #fff;
      }
    }

    &.top-2 {
      background: linear-gradient(135deg, #f4f8f6 0%, #ffffff 100%);
      border-color: rgba($color-primary, 0.25);
      border-top: 4px solid $color-primary;

      .box-tag {
        background: $color-primary;
        color: #fff;
      }
    }

    &.danger-box {
      background: linear-gradient(135deg, #fef4f4 0%, #ffffff 100%);
      border-color: rgba($color-danger, 0.25);
      border-top: 4px solid $color-danger;

      .danger-tag {
        background: $color-danger;
        color: #fff;
      }
    }

    .player-feature-row {
      display: flex;
      align-items: center;
      gap: 12px;

      .feature-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid #fff;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .feature-info {
        h4 {
          font-size: 16px;
          font-weight: 700;
          color: $text-primary;
          margin-bottom: 4px;

          small {
            font-size: 12px;
            color: $text-secondary;
            font-weight: normal;
          }
        }

        .lineup-badge-line {
          font-size: 12px;
          color: $text-primary;
          display: flex;
          align-items: center;
          gap: 4px;
          margin-bottom: 3px;

          strong {
            color: $color-primary;
            font-weight: 700;
          }

          .lineup-origin {
            font-size: 10px;
            color: $text-secondary;
          }
        }

        .commander-badge-line {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11.5px;
          color: $text-secondary;
          margin-bottom: 4px;

          strong {
            color: $color-primary;
            font-weight: 700;
          }

          .cmd-pill {
            font-size: 10px;
            font-weight: 700;
            padding: 1px 5px;
            border-radius: 3px;

            &.t0 {
              background: #fef3c7;
              color: #b45309;
              border: 1px solid #fde68a;
            }

            &.t1 {
              background: $color-primary-light;
              color: $color-primary;
              border: 1px solid rgba($color-primary, 0.25);
            }

            &.t2 {
              background: $bg-subtle;
              color: $text-secondary;
            }
          }
        }

        .prob-highlight {
          font-size: 12.5px;
          color: $text-secondary;

          strong {
            font-size: 18px;
            font-weight: 800;
            color: $color-accent;
            margin-left: 4px;
          }
        }
      }
    }

    .reasons-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;

      .reason-tag {
        font-size: 11px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 4px;

        &.positive {
          background: $color-success-light;
          color: $color-success;
          border: 1px solid $color-success-border;
        }

        &.warning {
          background: $color-warning-light;
          color: $color-warning;
          border: 1px solid $color-warning-border;
        }
      }
    }

    .summary-verdict {
      font-size: 12px;
      line-height: 1.6;
      color: $text-secondary;
      margin: 0;

      &.danger-text {
        color: $color-danger;
      }
    }

    .danger-player-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 0;
      border-bottom: 1px dashed rgba($color-danger, 0.15);

      .danger-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        object-fit: cover;
      }

      .danger-info {
        display: flex;
        flex-direction: column;

        strong {
          font-size: 13px;
          color: $text-primary;
        }

        small {
          font-size: 11px;
          color: $color-danger;
        }
      }
    }
  }

  // 综合战力横条
  .instant-prob-bars {
    background: $bg-canvas;
    padding: 16px 20px;
    border-radius: $radius-sm;

    .bars-head {
      display: flex;
      justify-content: space-between;
      margin-bottom: 12px;

      span {
        font-size: 13px;
        font-weight: 700;
        color: $text-primary;
      }

      small {
        font-size: 11.5px;
        color: $text-secondary;
      }
    }

    .bars-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .player-bar-row {
      display: flex;
      align-items: center;
      gap: 12px;

      .bar-rank {
        font-size: 12px;
        font-weight: 700;
        color: $text-secondary;
        min-width: 24px;
      }

      .bar-avatar {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        object-fit: cover;
      }

      .bar-player-col {
        display: flex;
        flex-direction: column;
        min-width: 100px;
        max-width: 140px;

        .bar-name {
          font-size: 13px;
          font-weight: 600;
          color: $text-primary;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .bar-sub-info {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;

          .bar-lineup-badge {
            color: $text-secondary;
            white-space: nowrap;
          }

          .bar-cmd-badge {
            color: $color-primary;
            font-weight: 600;
            white-space: nowrap;
          }
        }
      }

      .bar-track {
        flex: 1;
        height: 10px;
        background: #e2e8e5;
        border-radius: 5px;
        overflow: hidden;

        .bar-fill {
          height: 100%;
          border-radius: 5px;
          transition: width 0.3s cubic-bezier(0.22, 1, 0.36, 1);
          background: $color-primary;

          &.rank-color-1 {
            background: linear-gradient(90deg, #d97706, #f59e0b);
          }

          &.rank-color-2 {
            background: linear-gradient(90deg, #1e463a, #2f6b58);
          }
        }
      }

      .bar-percent {
        font-size: 13px;
        font-weight: 700;
        color: $text-primary;
        min-width: 50px;
        text-align: right;
      }
    }
  }
}

.instant-waiting-hint {
  padding: 24px;
  text-align: center;
  background: $bg-canvas;
  border: 1px dashed $border-subtle;
  border-radius: $radius-md;
  font-size: 13.5px;
  color: $text-secondary;
}

.shot-upload,
.shot-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 20px 0;
}

.shot-workbench label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: $text-secondary;
  min-width: 0;
}

.shot-workbench input,
.shot-workbench select {
  @include input-base;
}

.shot-workbench input[type="file"] {
  padding: 8px;
  background-color: $bg-subtle;
  border-style: dashed;
  cursor: pointer;
}

.shot-workbench button {
  @include button-secondary;

  &.primary {
    @include button-primary;
  }
}

.shot-restore {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin: 16px 0 20px;
  padding: 16px 20px;
  background-color: $bg-subtle;
  border-radius: $radius-md;

  label {
    flex: 1;
  }
}

.shot-workbench fieldset {
  border: 1px solid $border-subtle;
  background: $bg-canvas;
  border-radius: $radius-md;
  padding: 18px 20px;
  margin: 18px 0;

  legend {
    font-weight: 700;
    font-size: 13px;
    color: $text-primary;
    padding: 0 8px;
  }
}

.shot-seat {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid $border-subtle;

  &:last-child {
    border-bottom: none;
  }

  span {
    font-weight: 700;
    color: $color-primary;
    text-align: center;
    font-size: 14px;
  }
}

.shot-seat-context {
  grid-column: 2 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.shot-confirm {
  flex-direction: row !important;
  align-items: flex-start !important;
  gap: 10px !important;
  line-height: 1.6;
  font-weight: 500 !important;
  color: $text-primary !important;
  margin: 14px 0;
  cursor: pointer;

  input {
    width: 16px;
    height: 16px;
    margin-top: 3px;
    flex-shrink: 0;
    cursor: pointer;
  }
}

.shot-warning {
  background: $color-warning-light;
  border: 1px solid $color-warning-border;
  border-radius: $radius-md;
  padding: 14px 18px;
  color: $color-warning;
  font-size: 13px;
  font-weight: 500;
  margin: 14px 0;
}

.shot-workbench [role="alert"] {
  color: $color-danger;
  background: $color-danger-light;
  border: 1px solid $color-danger-border;
  border-radius: $radius-md;
  padding: 14px 18px;
  font-size: 13px;
  margin: 14px 0;
}

.muted {
  font-size: 12px;
  color: $text-muted;
}

.shot-result {
  margin-top: 28px;
  padding-top: 24px;
  border-top: 2px dashed $border-subtle;

  h3 {
    font-size: 17px;
    font-weight: 700;
    color: $text-primary;
  }
}

.shot-model {
  background: $color-primary-light;
  border: 1px solid rgba(30, 70, 58, 0.2);
  border-radius: $radius-lg;
  padding: 20px 24px;
  margin: 18px 0;

  h3 {
    color: $color-primary-dark;
  }

  ol {
    padding-left: 20px;
    margin: 12px 0;

    li {
      padding: 6px 0;
      font-size: 13.5px;
    }
  }

  details {
    margin-top: 12px;
    font-size: 12.5px;
    color: $text-secondary;
  }
}

.shot-advanced-analysis {
  margin: 24px 0;
  padding: 24px;
  background: $bg-surface;
  border-radius: $radius-lg;
  border: 1px solid $border-subtle;
  box-shadow: $shadow-sm;

  .analysis-header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
    padding-bottom: 14px;
    border-bottom: 1px solid $border-subtle;

    h3 {
      font-size: 18px;
      font-weight: 700;
      color: $text-primary;
      margin: 0 0 6px 0;
    }
  }

  .ban-tag {
    display: inline-flex;
    align-items: center;
    background: rgba($color-danger, 0.12);
    color: $color-danger;
    border: 1px solid rgba($color-danger, 0.3);
    padding: 6px 14px;
    border-radius: 9999px;
    font-size: 13px;
    font-weight: 700;
  }
}

.version-select {
  font-weight: 600;
  color: $color-primary;
}

.version-analysis-card {
  margin-bottom: 24px;
  background: $bg-canvas;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  padding: 16px 20px;

  .version-header-row {
    margin-bottom: 14px;
    padding-bottom: 12px;
    border-bottom: 1px solid $border-subtle;

    .version-title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }

    .version-badge {
      display: inline-flex;
      align-items: center;
      font-size: 12px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 9999px;
      background: $color-primary-light;
      color: $color-primary;

      &.latest {
        background: rgba($color-success, 0.15);
        color: $color-success;
        border: 1px solid rgba($color-success, 0.3);
      }
    }

    .version-date {
      font-size: 12px;
      color: $text-muted;
    }

    .version-summary-note {
      font-size: 13px;
      color: $text-secondary;
      margin: 4px 0 0;
      line-height: 1.5;
    }
  }

  .version-impact-box {
    background: $bg-subtle;
    border-radius: $radius-sm;
    padding: 12px 14px;
    margin-bottom: 14px;

    .impact-title {
      font-size: 12.5px;
      font-weight: 700;
      color: $text-primary;
      margin-bottom: 8px;
    }

    .version-changes-list {
      margin: 0;
      padding-left: 18px;
      font-size: 12.5px;
      color: $text-secondary;
      line-height: 1.6;

      li {
        margin-bottom: 3px;
      }
    }

    .version-lineup-note {
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px dashed $border-subtle;
      font-size: 12.5px;
      color: $text-primary;
      line-height: 1.5;

      strong {
        color: $color-accent;
      }
    }
  }

  .player-version-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .player-version-item {
    background: $bg-subtle;
    border-radius: $radius-sm;
    padding: 10px 12px;
    border: 1px solid transparent;

    &.buffed {
      border-color: rgba($color-success, 0.3);
      background: rgba($color-success, 0.04);
    }

    .item-head {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 5px;

      .player-name {
        font-size: 13px;
        font-weight: 700;
        color: $text-primary;
      }

      .version-fit-badge {
        margin-left: auto;
        font-size: 11px;
        font-weight: 600;
        padding: 1px 7px;
        border-radius: 4px;
        background: $border-subtle;
        color: $text-secondary;

        &.buffed {
          background: rgba($color-success, 0.15);
          color: $color-success;
        }

        &.outdated {
          background: rgba($color-danger, 0.15);
          color: $color-danger;
        }
      }
    }

    .item-desc {
      margin: 0;
      font-size: 11.5px;
      color: $text-secondary;
      line-height: 1.45;
    }
  }
}

.ban-analysis-card {
  margin-bottom: 24px;

  .ban-summary-banner {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    background: rgba($color-warning, 0.1);
    border: 1px solid rgba($color-warning, 0.25);
    border-radius: $radius-md;
    padding: 12px 16px;
    margin-bottom: 16px;

    .ban-icon {
      font-size: 20px;
    }

    .ban-summary-text {
      strong {
        color: $text-primary;
        font-size: 14px;
      }
      p {
        margin: 4px 0 0 0;
        font-size: 13px;
        color: $text-primary;
      }
    }
  }

  .ban-players-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }

  .ban-player-card {
    background: $bg-subtle;
    border-radius: $radius-md;
    padding: 14px;
    border-left: 4px solid $border-subtle;

    &.critical {
      border-left-color: $color-danger;
      background: rgba($color-danger, 0.04);
    }
    &.moderate {
      border-left-color: $color-warning;
      background: rgba($color-warning, 0.04);
    }
    &.benefited {
      border-left-color: $color-success;
      background: rgba($color-success, 0.04);
    }
    &.immune {
      border-left-color: $color-primary;
    }

    .card-top {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;

      strong {
        font-size: 14px;
        color: $text-primary;
      }
      small {
        color: $text-secondary;
        font-size: 11px;
      }
    }

    .player-avatar-small {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 1px solid $border-subtle;
    }

    .impact-level-pill {
      margin-left: auto;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 9999px;
      font-weight: 600;

      &.critical {
        background: rgba($color-danger, 0.15);
        color: $color-danger;
      }
      &.moderate {
        background: rgba($color-warning, 0.15);
        color: $color-warning;
      }
      &.benefited {
        background: rgba($color-success, 0.15);
        color: $color-success;
      }
      &.immune {
        background: $border-subtle;
        color: $text-secondary;
      }
    }

    .ban-desc {
      font-size: 12.5px;
      line-height: 1.5;
      color: $text-primary;
      margin: 6px 0;
    }

    .ban-advice-row {
      font-size: 12px;
      color: $text-secondary;
      line-height: 1.5;
      margin-top: 6px;

      .advice-label {
        font-weight: 700;
        color: $color-primary;
      }
    }

    .ban-hist-stat {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px dashed $border-subtle;
      font-size: 11.5px;
      color: $text-secondary;
    }
  }
}

.h2h-analysis-card {
  margin-bottom: 24px;
  background: $bg-canvas;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  padding: 16px 20px;

  h4 {
    margin: 0 0 14px 0;
    font-size: 15px;
    font-weight: 700;
    color: $text-primary;
  }

  .cross-matchups-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 16px;
  }

  .cross-matchup-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: $bg-subtle;
    border-radius: $radius-sm;
    font-size: 13px;

    .edge-icon {
      font-size: 16px;
    }

    .matchup-text {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;

      .sub-suppress {
        color: $color-danger;
        font-size: 12px;
        font-weight: 600;
      }

      .stat-pill {
        font-size: 11px;
        background: $border-subtle;
        color: $text-secondary;
        padding: 2px 6px;
        border-radius: 4px;
      }
    }
  }

  .empty-h2h-text {
    font-size: 13px;
    color: $text-secondary;
    padding: 12px 0;
  }

  .player-nemesis-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-top: 12px;
  }

  .nemesis-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: $bg-subtle;
    border-radius: $radius-sm;

    .player-avatar-mini {
      width: 24px;
      height: 24px;
      border-radius: 50%;
    }

    .nemesis-name {
      font-size: 13px;
      color: $text-primary;
      min-width: 60px;
    }

    .nemesis-tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .tag-suppressed {
      font-size: 11.5px;
      color: $color-danger;
      background: rgba($color-danger, 0.1);
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }

    .tag-suppress {
      font-size: 11.5px;
      color: $color-success;
      background: rgba($color-success, 0.1);
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
    }

    .tag-neutral {
      font-size: 11.5px;
      color: $text-secondary;
    }
  }
}

.adjusted-probability-box {
  background: $bg-canvas;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  padding: 16px 20px;

  h4 {
    margin: 0 0 14px 0;
    font-size: 15px;
    font-weight: 700;
    color: $text-primary;
  }

  .prob-bars-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .prob-row {
    .row-info {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;

      .name {
        font-size: 13.5px;
        font-weight: 600;
        color: $text-primary;
        min-width: 80px;
      }

      .modifiers-pills {
        display: flex;
        gap: 6px;

        .mod-pill {
          font-size: 10.5px;
          padding: 1px 6px;
          border-radius: 4px;

          &.positive {
            background: rgba($color-success, 0.15);
            color: $color-success;
          }
          &.negative {
            background: rgba($color-danger, 0.15);
            color: $color-danger;
          }
        }
      }

      .prob-val {
        margin-left: auto;
        font-size: 14px;
        font-weight: 700;
        color: $color-primary;
      }
    }

    .prob-track {
      height: 8px;
      background: $border-subtle;
      border-radius: 9999px;
      overflow: hidden;

      .prob-fill {
        height: 100%;
        background: linear-gradient(90deg, $color-primary, $color-primary-hover);
        border-radius: 9999px;
        transition: width 0.3s ease;
      }
    }
  }
}

.shot-context-result {
  border-left: 3px solid $color-primary;
  border-radius: 0 $radius-md $radius-md 0;
  padding: 16px 20px;
  background: $bg-subtle;
  margin: 16px 0;

  ul {
    padding-left: 20px;
    margin: 8px 0;
  }

  a {
    display: inline-block;
    color: $color-primary;
    text-decoration: underline;
    font-size: 12px;
    margin: 4px 8px 4px 0;
  }
}

.shot-profiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 20px 0;

  article {
    @include glass-panel;
    padding: 18px 20px;

    h4 {
      font-size: 16px;
      font-weight: 700;
      color: $text-primary;
      margin-bottom: 6px;
    }

    ul {
      padding-left: 18px;
      margin: 8px 0;
      font-size: 13px;
      line-height: 1.7;
    }
  }
}

.shot-gaps {
  color: $color-warning;
  padding-left: 20px;
  line-height: 1.8;
  font-size: 13px;
}

@media (max-width: 768px) {
  .shot-workbench {
    padding: 18px;
  }

  .seats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .decision-hub-card .decision-core-grid {
    grid-template-columns: 1fr;
  }

  .workbench-header-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .workbench-tabs {
    width: 100%;

    .tab-btn {
      flex: 1;
      text-align: center;
    }
  }

  .quick-conditions-row {
    flex-direction: column;
    align-items: stretch;
  }

  .ban-analysis-card .ban-players-grid,
  .version-analysis-card .player-version-grid,
  .h2h-analysis-card .cross-matchups-list,
  .h2h-analysis-card .player-nemesis-grid {
    grid-template-columns: 1fr;
  }

  .shot-upload,
  .shot-meta,
  .shot-profiles {
    grid-template-columns: 1fr;
  }

  .shot-seat {
    grid-template-columns: 24px minmax(0, 1fr);

    > label:last-of-type {
      grid-column: 2;
    }
  }

  .shot-seat-context {
    grid-column: 2;
    grid-template-columns: 1fr;
  }

  .shot-restore {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
