<template>
  <div class="research-page">
    <header class="research-heading">
      <div>
        <p class="eyebrow">王者万象棋 / 王牌对决</p>
        <h1>{{ titles[section] || '王牌对决研究工作台' }}</h1>
        <p>逐场整理真实赛果，以可核对的数据研究选手表现。</p>
      </div>
      <span class="research-label">内部研究 · 真实对局样本</span>
    </header>

    <section v-if="!ready" class="research-auth">
      <h2>连接你的研究数据</h2>
      <p>选手记录和原件默认仅管理端可见。填写当前后端 ADMIN_TOKEN 后开始；普通教学资料仍可从资料入口访问。</p>
      <form @submit.prevent="connect">
        <input v-model="token" type="password" autocomplete="off" aria-label="管理凭证" placeholder="管理凭证 ADMIN_TOKEN" required>
        <button class="primary">连接工作台</button>
      </form>
      <p class="muted">凭证保存在当前浏览器，端口或浏览器变化后需重新配置。</p>
    </section>

    <template v-else>
      <div class="research-toolbar">
        <span>{{ loaded ? `王牌对决对局 ${catalog?.counts?.totalMatches || (catalog?.matches?.length || 235)} 场收录 · ${fullCatalogPlayers.length || 190} 位对决账号 (${aggregatedPlayers.length || 124} 位归并选手) · 完整排名 ${matches.length} 场登记` : '正在读取数据库…' }}</span>
        <div>
          <button @click="load">刷新</button>
          <button v-if="hasToken" @click="disconnect">清除凭证</button>
        </div>
      </div>

      <p v-if="error" role="alert" class="research-error">{{ error }} <button @click="load">重试</button></p>

      <template v-if="loaded">
        <!-- 1. 总览大盘 (overview) -->
        <template v-if="section==='overview'">
          <div class="research-metrics">
            <div class="metric-highlight">
              <strong>{{ catalog?.counts?.totalMatches || (catalog?.matches?.length || 235) }}</strong>
              <span>王牌对决战绩场次</span>
              <small>{{ catalog?.counts?.matches || 73 }} 场转写 + 162 场胜者公报</small>
            </div>
            <div>
              <strong>{{ catalog?.counts?.totalDays || 30 }}</strong>
              <span>全量覆盖比赛日</span>
              <small>2026-10-11 ~ 11-09 连续追踪</small>
            </div>
            <div>
              <strong>{{ aggregatedPlayers.length || 124 }}</strong>
              <span>归并参赛选手档案</span>
              <small>已归类 {{ fullCatalogPlayers.length || 190 }} 个对决账号</small>
            </div>
            <div>
              <strong>{{ catalog?.counts?.sources || 48 }}</strong>
              <span>作者战报原帖出处</span>
              <small>全量胜者图谱与流派声明</small>
            </div>
          </div>

          <!-- 官方最新版本动态与赛前推演导向 -->
          <div class="version-status-banner">
            <div class="banner-badge">
              <span class="badge-pill">官方最新版本</span>
              <strong>{{ CURRENT_LATEST_VERSION }}</strong>
            </div>
            <div class="banner-content">
              <h4>11月5日官方不停机更新已生效 · 赛前推演全面适配最新版本</h4>
              <p>棋手「嬴律」并购红利每回合额外复制场上英雄（单核追三上限暴涨），「安琪拉」打扫战场飞行器法攻提至 125%/攻速 30%（雷霆机甲爆发增强），「乔汐」温柔呼唤升至 3~5 阶转瞬牌，新棋手「武凤」偷秘技上线。当前王牌对决所有赛前预测均默认锚定 <strong>{{ CURRENT_LATEST_VERSION }}</strong> 最新版本进行博弈研判与阵容加成修正。</p>
            </div>
            <router-link to="/research/predict" class="banner-action-btn">进入赛前推演 →</router-link>
          </div>

          <!-- 王牌对决登顶排行榜 TOP 8 -->
          <section v-if="topWinners.length" class="leaderboard-section">
            <div class="section-title-row">
              <div>
                <h2>王牌对决登顶榜（夺冠最高选手 TOP 8）</h2>
                <p>基于 29 日全量作者战报与实战对局的冠军统计，投对决看选手实力</p>
              </div>
              <router-link to="/research/players" class="more-link">查看完整选手登顶榜单 ({{ aggregatedPlayers.length || 124 }} 位) →</router-link>
            </div>
            <div class="top-winners-grid">
              <div v-for="(p, idx) in topWinners" :key="p.id" class="winner-card" :class="`rank-${idx + 1}`">
                <div class="winner-rank-badge">#{{ idx + 1 }}</div>
                <img :src="getPlayerAvatar(p.nickname)" class="winner-card-avatar" :alt="p.nickname" />
                <div class="winner-card-body">
                  <div class="winner-name-row">
                    <h3>{{ p.nickname }}</h3>
                    <span v-if="p.linkedAccounts && p.linkedAccounts.length > 1" class="multi-tag-badge">{{ p.linkedAccounts.length }}号合并</span>
                  </div>
                  <div class="winner-stats-line">
                    <span class="wins-badge">🏆 {{ p.observedWins }} 冠</span>
                    <span class="matches-count">{{ p.observedMatches }} 战 · 登顶率 {{ percent(p.observedWins / p.observedMatches) }}</span>
                  </div>
                  <p class="winner-build-tag">常用：{{ p.commonBuilds.join('、') || (p.builds[0]?.label || '多流派') }}</p>
                </div>
              </div>
            </div>
          </section>

          <!-- 最近战况速览 -->
          <section v-if="recentCatalogMatches.length" class="recent-matches-section">
            <div class="section-title-row">
              <div>
                <h2>最新王牌对决战况速览</h2>
                <p>已对照 60 张 WebP 原图核验六席位阵容与最终登顶归属</p>
              </div>
              <router-link to="/research/matches" class="more-link">浏览全量 232 场赛果 →</router-link>
            </div>
            <div class="recent-matches-grid">
              <div v-for="m in recentCatalogMatches" :key="m.id" class="recent-match-card">
                <div class="card-head">
                  <span class="date-badge">{{ m.day }} 第 {{ m.ordinal }} 场</span>
                  <span v-if="m.ban" class="ban-badge">Ban: {{ m.ban }}</span>
                </div>
                <div class="winner-highlight-row">
                  <img :src="getPlayerAvatar(m.winnerNickname)" class="winner-mini-avatar" alt="" />
                  <div class="winner-text">
                    <strong>{{ m.winnerNickname }} 👑 夺冠</strong>
                    <small>流派：{{ m.winnerBuild }}</small>
                  </div>
                </div>
                <div class="seats-preview-pills">
                  <template v-if="m.matchType === 'winner_snapshot'">
                    <span class="seat-pill isWinner">{{ m.winnerNickname }} ({{ m.winnerBuild }})</span>
                    <span class="seat-pill snapshot-hint">其余 5 席公报未披露（待录入）</span>
                  </template>
                  <template v-else>
                    <span v-for="s in m.seats" :key="s.slot" class="seat-pill" :class="{ isWinner: s.winner }">
                      {{ s.nickname }} ({{ s.commander ? s.commander + ' · ' : '' }}{{ s.build }})
                    </span>
                  </template>
                </div>
              </div>
            </div>
          </section>

          <!-- 赛果口径与核验规则说明 -->
          <section class="research-split">
            <div>
              <h2>先有赛果，再谈预测</h2>
              <p>完整排名赛果 {{ matches.length }} 场登记 · {{ stats.eligibleMatches }} 场有效。王牌对决公开战报已完成 232 场真实对局收录，覆盖 29 个比赛日与 {{ fullCatalogPlayers.length || 190 }} 位实战选手。所有选手 100% 绑定专属头像，作为赛前推演的实战依据。</p>
              <router-link class="research-link" to="/research/matches">查看场次与赛果明细 →</router-link>
            </div>
            <ol>
              <li>逐场比对作者公布的实战对局与登顶结果</li>
              <li>100% 校对并绑定选手唯一专属游戏头像</li>
              <li>统计选手出场率、夺冠次数、登顶胜率与常用流派</li>
              <li>赛前研究工作台支持截屏 OCR 识别与实时选手战力推演</li>
            </ol>
          </section>

          <section class="research-note">
            <h2>来源核验进度</h2>
            <p>已收录 10月11日~11月9日共 30 个比赛日、235 场王牌对决真实对局，原图与作者公报哈希一致。收录 {{ fullCatalogPlayers.length || 190 }} 个真实参赛账号并 100% 绑定专属游戏头像，可直接用于赛前支持分析。</p>
          </section>
        </template>

        <!-- 2. 场次赛果 (matches) -->
        <template v-else-if="section==='matches'">
          <div class="view-header-bar">
            <div>
              <h2>王牌对决实战对局</h2>
              <p class="muted">全量收录 30 个比赛日、235 场真实对局。支持按日期与流派快速筛选，支持自由修改与录入纠偏。</p>
            </div>
            <div class="matches-top-actions">
              <button type="button" class="btn-create-match" @click="openCreateModal">
                ➕ 录入新战绩
              </button>
            </div>
          </div>

          <!-- 本地修正状态横幅提示（如果有修改或新增） -->
          <div v-if="modifiedStats.totalChanged > 0" class="patch-status-banner">
            <div class="patch-info">
              <span class="patch-badge">🔧 本地战绩校准生效中</span>
              <span class="patch-desc">
                已修正 <strong>{{ modifiedStats.modifiedCount }}</strong> 场官方对局，
                手工录入 <strong>{{ modifiedStats.customCount }}</strong> 场新对局<template v-if="modifiedStats.deletedCount">，移除 {{ modifiedStats.deletedCount }} 场</template>。
                胜率、登顶榜与克制推演已自动联动重算。
              </span>
            </div>
            <div class="patch-actions">
              <button type="button" class="btn-export-patch" @click="handleExportPatches">
                💾 导出补丁 JSON
              </button>
              <button type="button" class="btn-reset-all" @click="handleResetAllMatches">
                ↺ 恢复官方原始数据
              </button>
            </div>
          </div>

          <div class="research-filters">
            <select v-model="selectedDay" aria-label="日期筛选">
              <option value="">全部比赛日期 ({{ availableDays.length }} 天 · {{ filteredCatalogMatches.length }} 场对局)</option>
              <option v-for="d in availableDays" :key="d" :value="d">
                {{ d }} ({{ countByDay[d] || 0 }} 场)
              </option>
            </select>
            <input v-model="query" placeholder="搜索选手、流派阵容或 Ban 位" aria-label="筛选场次">
          </div>

          <p v-if="!filteredCatalogMatches.length" class="research-empty">没有找到符合条件的王牌对决场次。</p>

          <div class="matches-list">
            <article
              v-for="m in filteredCatalogMatches"
              :key="m.id"
              class="research-match"
              :class="{ 'is-modified': m.isModified, 'is-custom': m.isCustom }"
            >
              <header>
                <div class="match-title-row">
                  <h2>王牌对决 · {{ m.day }} 第 {{ m.ordinal }} 场</h2>
                  <span class="match-version-pill" :class="{ 'latest': getVersionByDate(m.day).isLatest }">
                    {{ getVersionByDate(m.day).version }}{{ getVersionByDate(m.day).isLatest ? ' (最新)' : '' }}
                  </span>
                  <span v-if="m.ban" class="ban-tag">Ban：{{ m.ban }}</span>
                  <span v-if="m.isModified" class="modified-tag" title="该对局已在本地进行校准更正">🔧 已校准</span>
                  <span v-else-if="m.isCustom" class="custom-tag" title="该对局为手动录入的新对局">⭐ 新录入</span>
                </div>
                <div class="match-header-actions">
                  <span class="verified-tag">{{ m.matchType === 'winner_snapshot' ? '胜者公报 · 一图流已核验' : '已核验 · 6席位转写' }}</span>
                  <button type="button" class="btn-edit-match" title="修改本场选手、流派或胜者信息" @click="openEditModal(m)">
                    ✏️ 修改对局
                  </button>
                  <button
                    v-if="m.isModified"
                    type="button"
                    class="btn-revert-match"
                    title="撤销本次修改，恢复官方原始数据"
                    @click="handleResetSingleMatch(m.id)"
                  >
                    ↺ 恢复原件
                  </button>
                  <button
                    v-else-if="m.isCustom"
                    type="button"
                    class="btn-delete-match"
                    title="删除该条自行录入的战绩"
                    @click="handleDeleteSingleMatch(m.id)"
                  >
                    🗑️ 删除
                  </button>
                </div>
              </header>

              <div class="research-table">
                <table>
                  <thead>
                    <tr>
                      <th>席位</th>
                      <th>选手</th>
                      <th>出战棋手</th>
                      <th>所选流派阵容</th>
                      <th>对局结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="s in m.seats" :key="s.slot" :class="{ 'row-winner': s.winner }">
                      <td>第 {{ s.slot }} 席</td>
                      <td class="player-cell">
                        <template v-if="s.nickname && !s.nickname.startsWith('席位') && s.nickname !== '待转写'">
                          <img :src="getPlayerAvatar(s.nickname)" class="player-inline-avatar" alt="" />
                          <div class="player-inline-meta">
                            <div class="player-name-row">
                              <span class="player-name">{{ s.nickname }}</span>
                              <span
                                v-if="getMasterPlayerName(s.nickname) !== s.nickname"
                                class="master-alias-pill"
                                :title="`该账号实际隶属选手：${getMasterPlayerName(s.nickname)}`"
                              >
                                {{ getMasterPlayerName(s.nickname) }}
                              </span>
                            </div>
                          </div>
                        </template>
                        <span v-else class="text-muted placeholder-cell">未转写（仅胜者一图流公报）</span>
                      </td>
                      <td class="commander-cell">
                        <span v-if="s.commander" class="commander-badge">♟️ {{ s.commander }}</span>
                        <span v-else class="text-muted">-</span>
                      </td>
                      <td>
                        <span v-if="s.build && s.build !== '对位参战'">{{ s.build }}</span>
                        <span v-else class="text-muted">-</span>
                      </td>
                      <td>
                        <strong v-if="s.winner" class="winner-crown">👑 登顶胜者（{{ m.winnerBuild }}）</strong>
                        <span v-else-if="m.matchType === 'winner_snapshot' || s.nickname.startsWith('席位')" class="text-muted">公报未披露</span>
                        <span v-else class="result-not-winner">未登顶</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="match-footer-info">
                <p class="muted">
                  <span v-if="m.materialSha256">原件哈希：<code>{{ m.materialSha256.slice(0, 16) + '...' }}</code></span>
                  <span v-else>出处：软柿《胜者一图流》日图公报 · @胜者老师登顶确认</span>
                </p>
                <a v-if="m.sourceUrl" :href="m.sourceUrl" target="_blank" rel="noreferrer" class="source-link">查看作者原帖 ↗</a>
              </div>
            </article>
          </div>
        </template>

        <!-- 3. 选手统计 (players) -->
        <template v-else-if="section==='players'">
          <div class="view-header-bar">
            <div>
              <h2>王牌对决选手登顶排行榜</h2>
              <p class="muted">
                {{ groupByPlayer ? `已智能归纳选手的多个游戏账号/战队马甲（共 ${aggregatedPlayers.length} 位真实选手，登顶夺冠胜场 100% 闭环）` : `按全部 ${fullCatalogPlayers.length} 个原始游戏对决账号独立呈现` }}
              </p>
            </div>

            <div class="group-mode-toggle">
              <button
                type="button"
                class="group-toggle-btn"
                :class="{ active: groupByPlayer }"
                @click="groupByPlayer = true"
              >
                👤 按选手合并账号 ({{ aggregatedPlayers.length }} 人)
              </button>
              <button
                type="button"
                class="group-toggle-btn"
                :class="{ active: !groupByPlayer }"
                @click="groupByPlayer = false"
              >
                🎮 按单账号细分 ({{ fullCatalogPlayers.length }} 账号)
              </button>
            </div>
          </div>

          <div class="research-filters player-filter-bar">
            <input v-model="playerSearch" placeholder="搜索选手昵称或流派阵容" aria-label="搜索选手">
            <div class="sort-pills">
              <span class="sort-label">排序方式：</span>
              <button
                type="button"
                class="sort-pill"
                :class="{ active: sortKey === 'wins' }"
                @click="setSort('wins')"
              >
                👑 登顶夺冠 {{ sortKey === 'wins' ? (sortOrder === 'desc' ? '↓' : '↑') : '' }}
              </button>
              <button
                type="button"
                class="sort-pill"
                :class="{ active: sortKey === 'winRate' }"
                @click="setSort('winRate')"
              >
                📈 登顶胜率 {{ sortKey === 'winRate' ? (sortOrder === 'desc' ? '↓' : '↑') : '' }}
              </button>
              <button
                type="button"
                class="sort-pill"
                :class="{ active: sortKey === 'matches' }"
                @click="setSort('matches')"
              >
                ⚔️ 观察场次 {{ sortKey === 'matches' ? (sortOrder === 'desc' ? '↓' : '↑') : '' }}
              </button>
              <button
                type="button"
                class="sort-pill"
                :class="{ active: sortKey === 'nickname' }"
                @click="setSort('nickname')"
              >
                🔤 选手昵称 {{ sortKey === 'nickname' ? (sortOrder === 'desc' ? '↓' : '↑') : '' }}
              </button>
            </div>
          </div>

          <div class="research-table">
            <table>
              <thead>
                <tr>
                  <th class="th-sortable" title="点击恢复默认胜场排行" @click="setSort('wins')">
                    <span class="th-content">
                      榜单排名
                      <span class="sort-indicator" :class="{ active: sortKey === 'wins' }">
                        {{ sortKey === 'wins' ? (sortOrder === 'desc' ? '▼' : '▲') : '⇅' }}
                      </span>
                    </span>
                  </th>
                  <th class="th-sortable" title="点击按选手昵称排序" @click="setSort('nickname')">
                    <span class="th-content">
                      选手 / 战队
                      <span class="sort-indicator" :class="{ active: sortKey === 'nickname' }">
                        {{ sortKey === 'nickname' ? (sortOrder === 'desc' ? '▼' : '▲') : '⇅' }}
                      </span>
                    </span>
                  </th>
                  <th class="th-sortable" title="点击按出场观察场次排序" @click="setSort('matches')">
                    <span class="th-content">
                      观察场次
                      <span class="sort-indicator" :class="{ active: sortKey === 'matches' }">
                        {{ sortKey === 'matches' ? (sortOrder === 'desc' ? '▼' : '▲') : '⇅' }}
                      </span>
                    </span>
                  </th>
                  <th class="th-sortable" title="点击按登顶夺冠次数排序" @click="setSort('wins')">
                    <span class="th-content">
                      登顶夺冠
                      <span class="sort-indicator" :class="{ active: sortKey === 'wins' }">
                        {{ sortKey === 'wins' ? (sortOrder === 'desc' ? '▼' : '▲') : '⇅' }}
                      </span>
                    </span>
                  </th>
                  <th class="th-sortable" title="点击按登顶胜率排序" @click="setSort('winRate')">
                    <span class="th-content">
                      登顶胜率
                      <span class="sort-indicator" :class="{ active: sortKey === 'winRate' }">
                        {{ sortKey === 'winRate' ? (sortOrder === 'desc' ? '▼' : '▲') : '⇅' }}
                      </span>
                    </span>
                  </th>
                  <th>常用阵容标签</th>
                  <th>同场交手克制</th>
                  <th>禁选影响度</th>
                  <th class="action-col">博弈详情</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="(p, idx) in filteredCatalogPlayers" :key="p.id">
                  <tr class="player-data-row" :class="{ 'row-expanded': expandedPlayerId === p.id }" @click="toggleExpandPlayer(p.id)">
                    <td class="rank-cell">
                      <span class="rank-badge" :class="`rank-${idx + 1}`">#{{ idx + 1 }}</span>
                    </td>
                    <td class="player-cell">
                      <img :src="getPlayerAvatar(p.nickname)" class="player-inline-avatar" alt="" />
                      <div class="player-inline-meta">
                        <div class="player-name-row">
                          <span class="player-name">{{ p.nickname }}</span>
                          <small v-if="p.observedWins > 0" class="win-tag">曾获 {{ p.observedWins }} 冠</small>
                        </div>
                        <div v-if="p.linkedAccounts && p.linkedAccounts.length > 1" class="accounts-chip-list">
                          <span class="accounts-count-pill">{{ p.linkedAccounts.length }} 个账号合并：</span>
                          <span class="accounts-names" :title="p.linkedAccounts.join('、')">{{ p.linkedAccounts.join('、') }}</span>
                        </div>
                        <div v-else-if="!groupByPlayer && getMasterPlayerName(p.nickname) !== p.nickname" class="belongs-to-text">
                          隶属于：<strong>{{ getMasterPlayerName(p.nickname) }}</strong>
                        </div>
                      </div>
                    </td>
                    <td><strong>{{ p.observedMatches }}</strong> 场</td>
                    <td><strong class="winner-crown">{{ p.observedWins }}</strong> 次</td>
                    <td><span class="rate-badge">{{ p.observedMatches ? percent(p.observedWins / p.observedMatches) : '0.0%' }}</span></td>
                    <td>{{ p.commonBuilds.length ? p.commonBuilds.join('、') : (p.builds.slice(0, 2).map((b: any) => b.label).join('、') || '暂无') }}</td>
                    
                    <!-- 同场克制关系摘要 -->
                    <td class="matchup-summary-cell">
                      <div class="matchup-pills">
                        <span v-if="getPlayerMatchup(p.nickname)?.victims?.[0]" class="pill-suppress" :title="`同场压制：${getPlayerMatchup(p.nickname)!.victims[0].opponentMaster} (${getPlayerMatchup(p.nickname)!.victims[0].wins}胜 ${getPlayerMatchup(p.nickname)!.victims[0].losses}负)`">
                          ⚡ 克制 {{ getPlayerMatchup(p.nickname)!.victims[0].opponentMaster }}
                        </span>
                        <span v-if="getPlayerMatchup(p.nickname)?.nemeses?.[0]" class="pill-nemesis" :title="`同场苦主：${getPlayerMatchup(p.nickname)!.nemeses[0].opponentMaster} (${getPlayerMatchup(p.nickname)!.nemeses[0].losses}负 ${getPlayerMatchup(p.nickname)!.nemeses[0].wins}胜)`">
                          ⚠️ 苦主 {{ getPlayerMatchup(p.nickname)!.nemeses[0].opponentMaster }}
                        </span>
                        <span v-if="!getPlayerMatchup(p.nickname)?.victims?.[0] && !getPlayerMatchup(p.nickname)?.nemeses?.[0]" class="pill-neutral">
                          互有胜负
                        </span>
                      </div>
                    </td>

                    <!-- 禁选敏感度摘要 -->
                    <td class="ban-summary-cell">
                      <span v-if="getPlayerMatchup(p.nickname)?.factions?.[0]?.share && getPlayerMatchup(p.nickname)!.factions[0].share >= 0.5" class="ban-vulnerable-pill">
                        惧禁「{{ getPlayerMatchup(p.nickname)!.factions[0].faction }}」
                      </span>
                      <span v-else-if="getPlayerMatchup(p.nickname)?.factions?.length && getPlayerMatchup(p.nickname)!.factions.length >= 3" class="ban-versatile-pill">
                        抗禁全能池
                      </span>
                      <span v-else class="ban-normal-pill">
                        常规抗性
                      </span>
                    </td>

                    <td class="action-cell">
                      <button class="expand-btn" :title="expandedPlayerId === p.id ? '收起克制与Ban位' : '展开克制与Ban位'">
                        {{ expandedPlayerId === p.id ? '▲ 收起' : '▼ 展开' }}
                      </button>
                    </td>
                  </tr>

                  <!-- 展开抽屉行：选手交锋克制图谱与Ban位适应力矩阵 -->
                  <tr v-if="expandedPlayerId === p.id" :key="`exp-${p.id}`" class="player-expand-detail-row">
                    <td colspan="9">
                      <div class="expand-panel-content">
                        <!-- 1. 同场交锋详细谱 -->
                        <div class="expand-h2h-col">
                          <h4>⚔️ 【{{ p.nickname }}】同场交手克制全景 (Head-to-Head)</h4>
                          <p class="muted">统计该选手在同一场比赛（同局 6 席）中与各对手的胜负压制记录：</p>
                          
                          <div v-if="getPlayerMatchup(p.nickname)?.h2h.length" class="h2h-table-wrap">
                            <div v-for="opp in getPlayerMatchup(p.nickname)!.h2h.slice(0, 6)" :key="opp.opponent" class="h2h-card">
                              <img :src="getPlayerAvatar(opp.opponentMaster)" class="h2h-avatar" alt="" />
                              <div class="h2h-info">
                                <strong>{{ opp.opponentMaster }}</strong>
                                <small>同场 {{ opp.encounters }} 战</small>
                              </div>
                              <div class="h2h-score" :class="{ win: opp.wins > opp.losses, loss: opp.losses > opp.wins }">
                                {{ opp.wins }} 胜 - {{ opp.losses }} 负
                                <span class="h2h-badge">{{ opp.summary }}</span>
                              </div>
                            </div>
                          </div>
                          <p v-else class="muted">该选手在已转写对局中暂无深度多局同场碰撞样本。</p>
                        </div>

                        <!-- 2. Ban位与阵营依赖剖析 -->
                        <div class="expand-ban-col">
                          <h4>🛡️ 核心阵营依赖与 Ban 位适应力</h4>
                          <p class="muted">根据该选手全部对局与胜场的阵营构筑，分析受禁选封锁影响：</p>

                          <div class="faction-bars">
                            <div v-for="f in (getPlayerMatchup(p.nickname)?.factions || []).slice(0, 4)" :key="f.faction" class="faction-bar-item">
                              <div class="bar-head">
                                <span>{{ f.faction }}阵营</span>
                                <small>{{ f.matches }} 战 {{ f.wins }} 冠 (占 {{ (f.share * 100).toFixed(0) }}%)</small>
                              </div>
                              <div class="bar-track">
                                <div class="bar-fill" :style="{ width: `${Math.min(100, Math.max(5, f.share * 100))}%` }"></div>
                              </div>
                            </div>
                          </div>

                          <div class="ban-verdict-box">
                            <strong>战术建议：</strong>
                            <p v-if="getPlayerMatchup(p.nickname)?.factions?.[0]?.share && getPlayerMatchup(p.nickname)!.factions[0].share >= 0.5">
                              该选手对「{{ getPlayerMatchup(p.nickname)!.factions[0].faction }}」阵营依赖高达 {{ (getPlayerMatchup(p.nickname)!.factions[0].share * 100).toFixed(0) }}%。当场上禁用该阵营时，战力严重受阻，需警惕其爆冷可能。
                            </p>
                            <p v-else>
                              该选手多阵营构筑均衡，对单一阵营禁用具有极强抗性，赛前选阵容错率高。
                            </p>
                          </div>

                          <!-- 最新游戏版本阵容适配度提示 -->
                          <div class="version-fit-box" v-if="getPlayerMatchup(p.nickname)?.versionAdaptation">
                            <div class="fit-header">
                              <span class="fit-title">🎮 最新版本 ({{ CURRENT_LATEST_VERSION }}) 适配度：</span>
                              <span class="fit-tag" :class="getPlayerMatchup(p.nickname)!.versionAdaptation!.fitLevel.toLowerCase()">
                                {{ getPlayerMatchup(p.nickname)!.versionAdaptation!.fitLabel }}
                                <small v-if="getPlayerMatchup(p.nickname)!.versionAdaptation!.bonus !== 0">
                                  ({{ getPlayerMatchup(p.nickname)!.versionAdaptation!.bonus > 0 ? '+' : '' }}{{ (getPlayerMatchup(p.nickname)!.versionAdaptation!.bonus * 100).toFixed(0) }}%)
                                </small>
                              </span>
                            </div>
                            <p class="fit-desc">{{ getPlayerMatchup(p.nickname)!.versionAdaptation!.summary }}</p>
                          </div>
                        </div>

                        <!-- 3. 棋手与常用阵容实战统计 -->
                        <div class="expand-cmd-col">
                          <h4>♟️ 【{{ p.nickname }}】棋手使用与常用阵容实战统计</h4>
                          <p class="muted">根据全量实战赛果，统计该选手选用各棋手的对决次数与常用流派：</p>

                          <div v-if="getPlayerMatchup(p.nickname)?.commanderProfiles?.length" class="cmd-profiles-list">
                            <div v-for="c in getPlayerMatchup(p.nickname)!.commanderProfiles.slice(0, 5)" :key="c.commander" class="cmd-profile-card">
                              <div class="cmd-card-head">
                                <span class="cmd-name">♟️ {{ c.commander }}</span>
                                <span class="cmd-tier" :class="`tier-${c.tier.toLowerCase()}`">{{ c.tier }}</span>
                                <span v-if="c.isSignature" class="cmd-sig-tag">招牌本命</span>
                                <span v-if="c.matches > 0" class="cmd-win-rate">{{ (c.winRate * 100).toFixed(0) }}% 胜率</span>
                                <span v-else class="cmd-win-rate text-muted">权威底蕴</span>
                              </div>
                              <div class="cmd-card-body">
                                <div class="cmd-stat-line">
                                  <span v-if="c.matches > 0">实战 <strong>{{ c.matches }}</strong> 战 <strong>{{ c.wins }}</strong> 冠</span>
                                  <span v-else class="text-muted">权威招牌 (实战待收录)</span>
                                  <span class="cmd-fav">偏好：<strong>{{ c.favoriteBuild }}</strong></span>
                                </div>
                                <div v-if="c.topBuilds?.length > 1" class="cmd-sub-builds">
                                  <span v-for="b in c.topBuilds.slice(0, 3)" :key="b.buildName" class="sub-build-chip">
                                    {{ b.buildName }} ({{ b.matches }}战{{ b.wins }}冠)
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <p v-else class="muted">该选手在已转写对局中暂无深度棋手细分记录。</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </template>

        <!-- 4. 选手玩法档案 (roster) -->
        <PlayerCatalog v-else-if="section==='roster'" />

        <!-- 5. 赛前研究 (predict) -->
        <template v-else-if="section==='predict'">
          <ScreenshotWorkbench />
        </template>
      </template>

      <p v-if="feedback" role="status" class="research-success">{{ feedback }}</p>

      <!-- 王牌对决战绩修改与录入弹窗 -->
      <MatchEditModal
        v-model="isEditModalOpen"
        :match="editingMatch"
        :candidate-players="candidatePlayers"
        @save="handleMatchSaved"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import ScreenshotWorkbench from '../components/ScreenshotWorkbench.vue'
import PlayerCatalog from '../components/PlayerCatalog.vue'
import MatchEditModal from '../components/MatchEditModal.vue'
import { computed, watch, ref } from 'vue'
import { useRoute } from 'vue-router'
import { researchApi, localResearch, getAdminToken, setAdminToken, type ResearchMatch, type Stats } from '../api/prediction'
import { getPlayerAvatar } from '../utils/player-avatar'
import {
  getMasterPlayerName,
  aggregateCatalogPlayers,
  type AggregatedPlayerProfile
} from '../utils/player-grouping'
import {
  buildPlayerMatchupProfiles,
  type PlayerMatchupProfile,
  getVersionByDate,
  CURRENT_LATEST_VERSION
} from '../utils/player-matchup'
import {
  type StoredMatch,
  applyMatchPatches,
  resetStoredMatch,
  deleteStoredMatch,
  resetAllStoredMatches,
  getModifiedStats,
  exportPatchesJson
} from '../utils/match-storage'

interface CatalogMatchSeat {
  slot: number
  playerId?: string
  nickname: string
  commander?: string
  avatar?: string
  build: string
  winner: boolean
}

interface CatalogMatch {
  id: string
  day: string
  ordinal: number
  sourceUrl?: string
  materialSha256?: string
  ban: string | null
  winnerBuild: string
  winnerSlot: number | null
  winnerNickname: string | null
  matchType?: 'full_transcribed' | 'winner_snapshot'
  seats: CatalogMatchSeat[]
  isCustom?: boolean
  isModified?: boolean
  modifiedAt?: string
}

interface CatalogProfile {
  id: string
  nickname: string
  author: string
  observedMatches: number
  observedWins: number
  builds: { label: string; observations: number; winsForSourceLabel: number }[]
  commonBuilds: string[]
  commanders?: { name: string; observations: number; wins: number }[]
  claims: any[]
  history: any[]
  linkedAccounts?: string[]
}

interface CatalogData {
  usageScope: string
  status: string
  counts: { players: number; matches: number; plays: number; claims: number; sources: number; totalMatches?: number; totalDays?: number; totalPlayers?: number }
  matches?: CatalogMatch[]
  players: CatalogProfile[]
  allPlayers?: CatalogProfile[]
  sources: { url: string; title: string; status: string; matches: number; note: string | null }[]
  notice: string
}

const route = useRoute()
const section = computed(() => String(route.meta.researchSection || 'overview'))
const titles: Record<string, string> = {
  overview: '王牌对决研究工作台',
  matches: '场次与赛果',
  players: '选手统计',
  roster: '选手玩法档案',
  predict: '赛前研究'
}

const hasToken = ref(Boolean(getAdminToken()))
const ready = computed(() => hasToken.value || (localResearch && ['overview', 'roster', 'matches', 'players', 'predict'].includes(section.value)))
const token = ref(''), error = ref(''), feedback = ref(''), loaded = ref(false)
const matches = ref<ResearchMatch[]>([])
const stats = ref<Stats>({ eligibleMatches: 0, unlinkedSeats: 0, players: [] })
const catalog = ref<CatalogData | null>(null)

// 页面交互状态
const query = ref('')
const selectedDay = ref('')
const playerSearch = ref('')

// 选手排序与归类状态
type SortKey = 'wins' | 'winRate' | 'matches' | 'nickname'
type SortOrder = 'asc' | 'desc'

const sortKey = ref<SortKey>('wins')
const sortOrder = ref<SortOrder>('desc')
const groupByPlayer = ref(true) // 默认开启：智能归纳同选手的多个账号
const expandedPlayerId = ref<string | null>(null)

function toggleExpandPlayer(id: string) {
  expandedPlayerId.value = expandedPlayerId.value === id ? null : id
}

// 缓存构建的全量选手同场交锋与Ban位依赖图谱
const matchupProfilesMap = computed(() => {
  const matches = catalog.value?.matches || []
  return buildPlayerMatchupProfiles(matches, groupByPlayer.value)
})

function getPlayerMatchup(nickname: string): PlayerMatchupProfile | undefined {
  const key = groupByPlayer.value ? getMasterPlayerName(nickname) : nickname
  return matchupProfilesMap.value.get(key) || matchupProfilesMap.value.get(nickname)
}

function setSort(key: SortKey) {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortKey.value = key
    sortOrder.value = key === 'nickname' ? 'asc' : 'desc'
  }
}

// 全量真实选手档案（基于全部 232 场对局真实胜者公报与转写记录，100% 统计所有夺冠）
const fullCatalogPlayers = computed<CatalogProfile[]>(() => {
  if (catalog.value?.allPlayers?.length) {
    return catalog.value.allPlayers
  }
  const matchesList = catalog.value?.matches || []
  if (!matchesList.length) {
    return catalog.value?.players || []
  }

  const profileMap = new Map<string, {
    id: string
    nickname: string
    author: string
    history: any[]
    buildsMap: Map<string, { label: string; observations: number; winsForSourceLabel: number; winsOnSelectedBuild: number }>
    commandersMap: Map<string, { name: string; observations: number; wins: number }>
    claims: any[]
  }>()

  // 1. 预填数据库已有档案与 claims 声明
  for (const p of (catalog.value?.players || [])) {
    profileMap.set(p.nickname, {
      id: p.id,
      nickname: p.nickname,
      author: p.author || '软柿',
      history: [],
      buildsMap: new Map(),
      commandersMap: new Map(),
      claims: p.claims || []
    })
  }

  // 2. 遍历全量 matches（含 62 场六席转写与 106 场胜者公报），保证夺冠战绩 100% 闭环统计
  for (const m of matchesList) {
    for (const s of (m.seats || [])) {
      if (!s.nickname || s.nickname.startsWith('席位')) continue
      let p = profileMap.get(s.nickname)
      if (!p) {
        p = {
          id: s.playerId || `snap:${s.nickname}`,
          nickname: s.nickname,
          author: '软柿',
          history: [],
          buildsMap: new Map(),
          commandersMap: new Map(),
          claims: []
        }
        profileMap.set(s.nickname, p)
      }

      const isWinner = Boolean(s.winner) || (m.winnerSlot !== undefined && m.winnerSlot !== null && s.slot === m.winnerSlot)
      p.history.push({
        matchId: m.id,
        day: m.day,
        ordinal: m.ordinal,
        slot: s.slot,
        commander: s.commander,
        build: s.build,
        rank: isWinner ? 1 : null,
        winnerBuild: isWinner ? m.winnerBuild : null,
        sourceUrl: m.sourceUrl,
        materialSha256: m.materialSha256
      })

      let b = p.buildsMap.get(s.build)
      if (!b) {
        b = { label: s.build, observations: 0, winsOnSelectedBuild: 0, winsForSourceLabel: 0 }
        p.buildsMap.set(s.build, b)
      }
      b.observations++
      if (isWinner) {
        b.winsForSourceLabel++
        if (s.build === m.winnerBuild) {
          b.winsOnSelectedBuild++
        }
      }

      if (s.commander && typeof s.commander === 'string' && s.commander.trim()) {
        const cmdName = s.commander.trim()
        let cStat = p.commandersMap.get(cmdName)
        if (!cStat) {
          cStat = { name: cmdName, observations: 0, wins: 0 }
          p.commandersMap.set(cmdName, cStat)
        }
        cStat.observations++
        if (isWinner) {
          cStat.wins++
        }
      }
    }
  }

  const result: CatalogProfile[] = []
  for (const p of profileMap.values()) {
    if (p.history.length === 0) continue
    const builds = [...p.buildsMap.values()].map(b => ({
      ...b,
      observedWinShare: b.observations ? b.winsForSourceLabel / b.observations : 0
    })).sort((a, b) => b.observations - a.observations)

    const commanders = [...p.commandersMap.values()].sort((a, b) => b.observations - a.observations || b.wins - a.wins)

    const observedWins = p.history.filter(h => h.rank === 1).length
    const commonBuilds = p.history.length >= 3
      ? builds.filter(b => b.observations >= 2 && b.observations / p.history.length >= 0.5).map(b => b.label)
      : (builds.slice(0, 2).map(b => b.label))

    result.push({
      id: p.id,
      nickname: p.nickname,
      author: p.author,
      observedMatches: p.history.length,
      observedWins,
      builds,
      commonBuilds,
      commanders,
      claims: p.claims,
      history: p.history
    })
  }

  return result
})

// 归并后的真实选手档案列表（多账号归集）
const aggregatedPlayers = computed<AggregatedPlayerProfile[]>(() => {
  return aggregateCatalogPlayers(fullCatalogPlayers.value)
})

// 选手统计页激活数据源（按合并后选手或按原始独立账号）
const activePlayersList = computed<any[]>(() => {
  if (groupByPlayer.value) {
    return aggregatedPlayers.value
  }
  return fullCatalogPlayers.value.map(p => ({
    ...p,
    masterName: getMasterPlayerName(p.nickname),
    linkedAccounts: [p.nickname],
    note: undefined
  }))
})

// 总览计算属性：胜场 TOP 8（基于归纳后的真实选手实力）
const topWinners = computed(() => {
  const source = aggregatedPlayers.value.length ? aggregatedPlayers.value : fullCatalogPlayers.value
  return source
    .filter(p => p.observedWins > 0)
    .slice()
    .sort((a, b) => b.observedWins - a.observedWins || b.observedMatches - a.observedMatches)
    .slice(0, 8)
})

// 总览计算属性：最新核验场次
const recentCatalogMatches = computed(() => {
  return (catalog.value?.matches || []).slice(0, 4)
})

// 场次页计算属性
const availableDays = computed(() => {
  const days = new Set<string>()
  for (const m of (catalog.value?.matches || [])) {
    if (m.day) days.add(m.day)
  }
  return [...days].sort().reverse()
})

const countByDay = computed(() => {
  const map: Record<string, number> = {}
  for (const m of (catalog.value?.matches || [])) {
    map[m.day] = (map[m.day] || 0) + 1
  }
  return map
})

const filteredCatalogMatches = computed(() => {
  const list = catalog.value?.matches || []
  const q = query.value.trim().toLowerCase()
  return list.filter(m => {
    if (selectedDay.value && m.day !== selectedDay.value) return false
    if (!q) return true
    const text = [
      m.day,
      `第${m.ordinal}场`,
      m.ban || '',
      m.winnerBuild,
      m.winnerNickname || '',
      ...m.seats.map(s => `${s.nickname} ${s.commander || ''} ${s.build}`)
    ].join(' ').toLowerCase()
    return text.includes(q)
  })
})

// 选手统计页计算属性（多维可排序、多账号可过滤）
const filteredCatalogPlayers = computed(() => {
  const list = activePlayersList.value
  const q = playerSearch.value.trim().toLowerCase()
  const filtered = list.filter(p => {
    if (!q) return true
    const text = [
      p.nickname,
      p.masterName || '',
      ...(p.linkedAccounts || []),
      ...p.builds.map((b: any) => b.label),
      ...p.commonBuilds
    ].join(' ').toLowerCase()
    return text.includes(q)
  })

  return filtered.slice().sort((a, b) => {
    const factor = sortOrder.value === 'desc' ? 1 : -1
    const aRate = a.observedMatches ? a.observedWins / a.observedMatches : 0
    const bRate = b.observedMatches ? b.observedWins / b.observedMatches : 0

    if (sortKey.value === 'wins') {
      if (b.observedWins !== a.observedWins) {
        return factor * (b.observedWins - a.observedWins)
      }
      if (bRate !== aRate) {
        return factor * (bRate - aRate)
      }
      return factor * (b.observedMatches - a.observedMatches)
    }

    if (sortKey.value === 'winRate') {
      if (bRate !== aRate) {
        return factor * (bRate - aRate)
      }
      if (b.observedWins !== a.observedWins) {
        return factor * (b.observedWins - a.observedWins)
      }
      return factor * (b.observedMatches - a.observedMatches)
    }

    if (sortKey.value === 'matches') {
      if (b.observedMatches !== a.observedMatches) {
        return factor * (b.observedMatches - a.observedMatches)
      }
      if (b.observedWins !== a.observedWins) {
        return factor * (b.observedWins - a.observedWins)
      }
      return factor * (bRate - aRate)
    }

    if (sortKey.value === 'nickname') {
      const cmp = a.nickname.localeCompare(b.nickname, 'zh-CN')
      return sortOrder.value === 'asc' ? cmp : -cmp
    }

    return 0
  })
})

const percent = (n: number) => (n * 100).toFixed(1) + '%'

// 本地战绩补丁与修改管理状态
const rawCatalogMatches = ref<CatalogMatch[]>([])
const modifiedStats = ref(getModifiedStats())
const isEditModalOpen = ref(false)
const editingMatch = ref<CatalogMatch | null>(null)

// 候选选手联想列表
const candidatePlayers = computed(() => {
  const list = fullCatalogPlayers.value.map(p => p.nickname)
  return Array.from(new Set(list)).slice(0, 60)
})

function refreshCatalogMatches() {
  if (!catalog.value) return
  const patched = applyMatchPatches(rawCatalogMatches.value as unknown as StoredMatch[]) as unknown as CatalogMatch[]
  catalog.value = {
    ...catalog.value,
    matches: patched
  }
  modifiedStats.value = getModifiedStats()
}

function openCreateModal() {
  editingMatch.value = null
  isEditModalOpen.value = true
}

function openEditModal(m: CatalogMatch) {
  editingMatch.value = { ...m }
  isEditModalOpen.value = true
}

function handleMatchSaved(saved: StoredMatch) {
  refreshCatalogMatches()
  feedback.value = `战绩「${saved.day} 第 ${saved.ordinal} 场」已成功保存！选手统计与赛前推演已实时联动重算。`
  setTimeout(() => {
    feedback.value = ''
  }, 4000)
}

function handleResetSingleMatch(matchId: string) {
  resetStoredMatch(matchId)
  refreshCatalogMatches()
  feedback.value = '已恢复官方原始对局记录！'
  setTimeout(() => {
    feedback.value = ''
  }, 3000)
}

function handleDeleteSingleMatch(matchId: string) {
  if (!confirm('确定要删除这场实战战绩记录吗？')) return
  deleteStoredMatch(matchId)
  refreshCatalogMatches()
  feedback.value = '已删除该场战绩记录！'
  setTimeout(() => {
    feedback.value = ''
  }, 3000)
}

function handleResetAllMatches() {
  if (!confirm('确定要清空所有本地修改与录入，恢复官方默认数据吗？')) return
  resetAllStoredMatches()
  refreshCatalogMatches()
  feedback.value = '已重置所有战绩，恢复官方原始数据！'
  setTimeout(() => {
    feedback.value = ''
  }, 3000)
}

function handleExportPatches() {
  const json = exportPatchesJson()
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `万象棋王牌对决战绩修正补丁_${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

async function load() {
  error.value = ''
  try {
    const [m, s, cat] = await Promise.all([
      researchApi<ResearchMatch[]>('matches'),
      researchApi<Stats>('stats'),
      researchApi<CatalogData>('catalog').catch(() => null)
    ])
    matches.value = Array.isArray(m) ? m : []
    stats.value = s || { eligibleMatches: 0, unlinkedSeats: 0, players: [] }
    if (cat && typeof cat === 'object' && !Array.isArray(cat)) {
      rawCatalogMatches.value = (cat.matches || []) as CatalogMatch[]
      catalog.value = {
        ...cat,
        matches: applyMatchPatches((cat.matches || []) as unknown as StoredMatch[]) as unknown as CatalogMatch[]
      }
      modifiedStats.value = getModifiedStats()
    } else {
      catalog.value = null
    }
    loaded.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败'
    loaded.value = false
  }
}

async function connect() {
  setAdminToken(token.value.trim())
  token.value = ''
  hasToken.value = true
  await load()
}

function disconnect() {
  setAdminToken(null)
  hasToken.value = false
  loaded.value = false
  matches.value = []
  stats.value = { eligibleMatches: 0, unlinkedSeats: 0, players: [] }
  catalog.value = null
  error.value = ''
  feedback.value = ''
}

watch(section, () => {
  if (ready.value && !loaded.value) load()
}, { immediate: true })
</script>

<style lang="scss" scoped>
@use '../styles/variables.scss' as *;
@use '../styles/mixins.scss' as *;

.research-page {
  max-width: 1200px;
  margin: 0 auto;
  color: $text-primary;
}

.research-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
  border-bottom: 1px solid $border-subtle;
  padding-bottom: 20px;
  margin-bottom: 24px;

  h1 {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.3;
    margin: 6px 0 8px;
    color: $text-primary;
    letter-spacing: -0.3px;
  }

  p {
    color: $text-secondary;
    font-size: 13.5px;
    margin: 0;
  }
}

.eyebrow {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: $color-primary;
}

.research-label {
  font-size: 12px;
  font-weight: 600;
  color: $color-warning;
  background-color: $color-warning-light;
  border: 1px solid $color-warning-border;
  padding: 4px 10px;
  border-radius: $radius-full;
  white-space: nowrap;
}

.research-auth,
.research-note,
.research-match,
.leaderboard-section,
.recent-matches-section {
  @include glass-panel;
  padding: 24px;
  margin: 18px 0;

  h2 {
    font-size: 17px;
    font-weight: 700;
    margin-bottom: 8px;
    color: $text-primary;
  }

  p {
    line-height: 1.8;
    color: $text-secondary;
  }
}

.view-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;

  h2 {
    font-size: 20px;
    font-weight: 700;
    color: $text-primary;
    margin-bottom: 4px;
  }

  p {
    margin: 0;
  }
}

.group-mode-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: $bg-subtle;
  padding: 4px;
  border-radius: $radius-full;
  border: 1px solid $border-subtle;

  .group-toggle-btn {
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 500;
    border-radius: $radius-full;
    border: none;
    background: transparent;
    color: $text-secondary;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      color: $text-primary;
    }

    &.active {
      background: $bg-surface;
      color: $color-primary;
      font-weight: 600;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    }
  }
}

.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;

  .more-link {
    font-size: 13px;
    font-weight: 600;
    color: $color-primary;
    text-decoration: none;
    white-space: nowrap;

    &:hover {
      text-decoration: underline;
    }
  }
}

.research-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  color: $text-muted;
  font-size: 13px;
  margin-bottom: 18px;

  button {
    margin-left: 8px;
  }
}

button,
.research-link {
  @include button-secondary;

  &.primary {
    @include button-primary;
  }
}

.research-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin: 20px 0 28px;

  div {
    @include glass-panel;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;

    &.metric-highlight {
      border-color: rgba($color-primary, 0.35);
      background: linear-gradient(135deg, rgba($color-primary, 0.08) 0%, rgba($color-primary, 0.02) 100%);
    }
  }

  strong {
    font-size: 32px;
    font-weight: 700;
    color: $color-primary;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  span {
    color: $text-primary;
    font-size: 13.5px;
    font-weight: 600;
  }

  small {
    color: $text-muted;
    font-size: 11.5px;
  }
}

/* 胜者排行榜卡片网格 */
.top-winners-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;

  @media (max-width: 960px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
}

.winner-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: $bg-surface;
  border: 1px solid $border-subtle;
  border-radius: $radius-lg;
  transition: all 0.2s ease;

  &:hover {
    border-color: $border-hover;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  &.rank-1 {
    border-color: rgba(#F59E0B, 0.4);
    background: linear-gradient(135deg, rgba(#F59E0B, 0.08) 0%, rgba(#F59E0B, 0.01) 100%);
    .winner-rank-badge { background: #F59E0B; color: #fff; }
  }
  &.rank-2 {
    border-color: rgba(#94A3B8, 0.4);
    .winner-rank-badge { background: #94A3B8; color: #fff; }
  }
  &.rank-3 {
    border-color: rgba(#D97706, 0.35);
    .winner-rank-badge { background: #D97706; color: #fff; }
  }

  .winner-rank-badge {
    position: absolute;
    top: 10px;
    right: 12px;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: $radius-full;
    background: $bg-subtle;
    color: $text-secondary;
  }

  .winner-card-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }

  .winner-card-body {
    flex: 1;
    min-width: 0;

    .winner-name-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;

      h3 {
        font-size: 15px;
        font-weight: 700;
        margin: 0;
        color: $text-primary;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .multi-tag-badge {
      font-size: 10.5px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: $radius-sm;
      background: rgba(#6366F1, 0.1);
      color: #4F46E5;
      border: 1px solid rgba(#6366F1, 0.2);
      white-space: nowrap;
    }
  }

  .winner-stats-line {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    margin-bottom: 4px;

    .wins-badge {
      font-weight: 700;
      color: #D97706;
      background: rgba(#F59E0B, 0.15);
      padding: 1px 6px;
      border-radius: $radius-sm;
    }

    .matches-count {
      color: $text-muted;
    }
  }

  .winner-build-tag {
    font-size: 11.5px;
    color: $text-secondary;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* 最新战况网格 */
.recent-matches-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
}

.recent-match-card {
  padding: 16px;
  background: $bg-surface;
  border: 1px solid $border-subtle;
  border-radius: $radius-lg;

  .card-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;

    .date-badge {
      font-size: 12px;
      font-weight: 600;
      color: $text-secondary;
    }

    .ban-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: $radius-full;
      background: rgba($color-danger, 0.1);
      color: $color-danger;
      border: 1px solid rgba($color-danger, 0.2);
    }
  }

  .winner-highlight-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: rgba($color-primary, 0.05);
    border-radius: $radius-md;
    border-left: 3px solid $color-primary;
    margin-bottom: 12px;

    .winner-mini-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
    }

    .winner-text {
      display: flex;
      flex-direction: column;

      strong {
        font-size: 13.5px;
        color: $text-primary;
      }
      small {
        font-size: 11.5px;
        color: $text-muted;
      }
    }
  }

  .seats-preview-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    .seat-pill {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: $radius-sm;
      background: $bg-subtle;
      color: $text-secondary;

      &.isWinner {
        background: rgba(#F59E0B, 0.15);
        color: #B45309;
        font-weight: 600;
      }

      &.snapshot-hint {
        opacity: 0.7;
        font-style: italic;
        background: rgba($border-subtle, 0.4);
      }
    }
  }
}

.match-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ban-tag {
  font-size: 11.5px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: $radius-full;
  background: rgba($color-danger, 0.1);
  color: $color-danger;
  border: 1px solid rgba($color-danger, 0.2);
}

.verified-tag {
  font-size: 11.5px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: $radius-full;
  background: $color-primary-light;
  color: $color-primary;
}

.winner-crown {
  color: #D97706;
  font-weight: 700;
}

.win-tag {
  font-size: 11px;
  color: #D97706;
  font-weight: 600;
}

.row-winner {
  background-color: rgba(#F59E0B, 0.05);
}

.match-footer-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed $border-subtle;

  code {
    font-family: $font-mono;
    font-size: 11.5px;
    background: $bg-subtle;
    padding: 2px 6px;
    border-radius: $radius-sm;
  }

  .source-link {
    font-size: 12px;
    color: $color-primary;
    text-decoration: none;
    font-weight: 500;

    &:hover {
      text-decoration: underline;
    }
  }
}

.research-split {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 32px;
  padding: 24px 0;

  h2 {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 12px;
  }

  p {
    line-height: 1.8;
    color: $text-secondary;
  }

  ol {
    padding-left: 20px;
    line-height: 2.4;
    color: $text-secondary;

    li {
      font-size: 13.5px;
    }
  }
}

.research-link {
  margin-top: 20px;
  align-self: flex-start;
}

.research-empty {
  padding: 48px 24px;
  background: $bg-surface;
  border: 1px dashed $border-hover;
  border-radius: $radius-lg;
  text-align: center;
  color: $text-muted;
  margin: 18px 0;
  font-size: 14px;
}

.research-filters {
  display: flex;
  gap: 12px;
  margin: 18px 0;
}

.player-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;

  input {
    flex: 1;
    min-width: 240px;
  }
}

.sort-pills {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  .sort-label {
    font-size: 12px;
    font-weight: 600;
    color: $text-secondary;
    white-space: nowrap;
  }

  .sort-pill {
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    border-radius: $radius-full;
    border: 1px solid $border-subtle;
    background: $bg-surface;
    color: $text-secondary;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;

    &:hover {
      border-color: $border-hover;
      color: $color-primary;
      background-color: $bg-subtle;
    }

    &.active {
      background-color: $color-primary-light;
      border-color: rgba($color-primary, 0.4);
      color: $color-primary;
      font-weight: 600;
    }
  }
}

.th-sortable {
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s ease, color 0.15s ease;

  &:hover {
    background-color: rgba(30, 70, 58, 0.08);
    color: $color-primary;

    .sort-indicator {
      color: $color-primary;
      opacity: 0.9;
    }
  }

  .th-content {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .sort-indicator {
    display: inline-block;
    font-size: 11px;
    color: $text-muted;
    opacity: 0.5;
    transition: all 0.15s ease;

    &.active {
      color: $color-primary;
      opacity: 1;
      font-weight: 700;
    }
  }
}

.rank-cell {
  width: 72px;

  .rank-badge {
    display: inline-block;
    font-size: 11.5px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: $radius-sm;
    background: $bg-subtle;
    color: $text-secondary;

    &.rank-1 {
      background: #FEF3C7;
      color: #B45309;
      border: 1px solid rgba(#F59E0B, 0.3);
    }
    &.rank-2 {
      background: #F1F5F9;
      color: #475569;
      border: 1px solid rgba(#94A3B8, 0.3);
    }
    &.rank-3 {
      background: #FFEDD5;
      color: #C2410C;
      border: 1px solid rgba(#F97316, 0.3);
    }
  }
}

.rate-badge {
  font-weight: 600;
  color: $text-primary;
  font-variant-numeric: tabular-nums;
}

.research-page input,
.research-page select,
.research-page textarea {
  @include input-base;
}

.research-table {
  overflow-x: auto;
  margin: 16px 0;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  background: $bg-surface;

  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 13.5px;
  }

  th, td {
    padding: 12px 16px;
    border-bottom: 1px solid $border-subtle;
    white-space: nowrap;
  }

  th {
    background-color: $bg-subtle;
    color: $text-secondary;
    font-size: 12px;
    font-weight: 600;
  }

  tr:hover td {
    background-color: $bg-muted;
  }

  small {
    display: block;
    color: $text-muted;
    font-size: 11px;
    font-family: $font-mono;
    margin-top: 2px;
  }

  .player-cell {
    display: flex;
    align-items: center;
    gap: 10px;

    .player-inline-avatar {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      flex-shrink: 0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
      background-color: $bg-subtle;
    }

    .player-name {
      font-weight: 600;
      color: $text-primary;
    }

    .player-inline-meta {
      display: flex;
      flex-direction: column;

      .player-name-row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      .master-alias-pill {
        font-size: 11px;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: $radius-sm;
        background: rgba($color-primary, 0.08);
        color: $color-primary;
        border: 1px solid rgba($color-primary, 0.15);
      }

      .accounts-chip-list {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 3px;
        font-size: 11px;
        line-height: 1.3;

        .accounts-count-pill {
          color: $color-primary;
          font-weight: 600;
          white-space: nowrap;
        }

        .accounts-names {
          color: $text-muted;
          max-width: 320px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }

      .belongs-to-text {
        font-size: 11px;
        color: $text-muted;
        margin-top: 2px;

        strong {
          color: $color-primary;
          font-weight: 600;
        }
      }
    }
  }

  .player-data-row {
    cursor: pointer;
    transition: background-color 0.15s ease;

    &.row-expanded {
      background-color: rgba($color-primary, 0.04);
      td {
        border-bottom-color: transparent;
      }
    }
  }

  .matchup-summary-cell {
    .matchup-pills {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .pill-suppress {
      display: inline-flex;
      font-size: 11px;
      font-weight: 600;
      color: $color-success;
      background: rgba($color-success, 0.1);
      padding: 1px 6px;
      border-radius: $radius-sm;
      white-space: nowrap;
    }

    .pill-nemesis {
      display: inline-flex;
      font-size: 11px;
      font-weight: 600;
      color: $color-danger;
      background: rgba($color-danger, 0.1);
      padding: 1px 6px;
      border-radius: $radius-sm;
      white-space: nowrap;
    }

    .pill-neutral {
      font-size: 11px;
      color: $text-muted;
    }
  }

  .ban-summary-cell {
    .ban-vulnerable-pill {
      font-size: 11px;
      font-weight: 600;
      color: $color-danger;
      background: rgba($color-danger, 0.12);
      padding: 2px 7px;
      border-radius: 9999px;
      border: 1px solid rgba($color-danger, 0.25);
      white-space: nowrap;
    }

    .ban-versatile-pill {
      font-size: 11px;
      font-weight: 600;
      color: $color-primary;
      background: rgba($color-primary, 0.1);
      padding: 2px 7px;
      border-radius: 9999px;
      border: 1px solid rgba($color-primary, 0.25);
      white-space: nowrap;
    }

    .ban-normal-pill {
      font-size: 11px;
      color: $text-secondary;
    }
  }

  .expand-btn {
    @include button-secondary;
    padding: 3px 8px;
    font-size: 11px;
    border-radius: $radius-sm;
    white-space: nowrap;
  }

  .commander-cell {
    white-space: nowrap;
  }

  .commander-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: $radius-full;
    background: rgba($color-primary, 0.08);
    color: $color-primary;
    border: 1px solid rgba($color-primary, 0.15);
  }

  .result-not-winner {
    font-size: 12.5px;
    color: $text-secondary;
    font-weight: 500;
  }

  .placeholder-cell {
    font-size: 12px;
    font-style: italic;
    color: $text-muted;
  }

  .player-expand-detail-row {
    background-color: rgba($color-primary, 0.02);

    td {
      padding: 0 16px 18px;
      border-bottom: 2px solid rgba($color-primary, 0.2);
    }

    .expand-panel-content {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      padding: 16px;
      background: $bg-canvas;
      border: 1px solid $border-subtle;
      border-radius: $radius-md;
      margin-top: 4px;

      h4 {
        font-size: 14px;
        font-weight: 700;
        color: $text-primary;
        margin: 0 0 4px 0;
      }
    }

    .expand-h2h-col {
      .h2h-table-wrap {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        margin-top: 10px;
      }

      .h2h-card {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: $bg-subtle;
        border-radius: $radius-sm;

        .h2h-avatar {
          width: 24px;
          height: 24px;
          border-radius: 50%;
        }

        .h2h-info {
          display: flex;
          flex-direction: column;

          strong {
            font-size: 12px;
            color: $text-primary;
          }
          small {
            font-size: 10.5px;
            color: $text-muted;
          }
        }

        .h2h-score {
          margin-left: auto;
          font-size: 11.5px;
          font-weight: 700;
          text-align: right;

          &.win {
            color: $color-success;
          }
          &.loss {
            color: $color-danger;
          }

          .h2h-badge {
            display: block;
            font-size: 9.5px;
            font-weight: normal;
            color: $text-muted;
          }
        }
      }
    }

    .expand-ban-col {
      .faction-bars {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 10px 0;
      }

      .faction-bar-item {
        .bar-head {
          display: flex;
          justify-content: space-between;
          font-size: 11.5px;
          color: $text-primary;
          margin-bottom: 3px;

          small {
            color: $text-muted;
          }
        }

        .bar-track {
          height: 6px;
          background: $border-subtle;
          border-radius: 9999px;
          overflow: hidden;

          .bar-fill {
            height: 100%;
            background: $color-primary;
            border-radius: 9999px;
          }
        }
      }

      .ban-verdict-box {
        margin-top: 10px;
        padding: 10px 12px;
        background: $bg-subtle;
        border-radius: $radius-sm;
        font-size: 12px;
        line-height: 1.5;

        strong {
          color: $color-primary;
        }

        p {
          margin: 4px 0 0;
          color: $text-secondary;
        }
      }

      .version-fit-box {
        margin-top: 10px;
        padding: 10px 12px;
        background: rgba($color-primary, 0.04);
        border: 1px solid rgba($color-primary, 0.15);
        border-radius: $radius-sm;

        .fit-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;

          .fit-title {
            font-size: 11.5px;
            font-weight: 700;
            color: $text-primary;
          }

          .fit-tag {
            font-size: 11px;
            font-weight: 600;
            padding: 1px 6px;
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

        .fit-desc {
          margin: 0;
          font-size: 11.5px;
          color: $text-secondary;
          line-height: 1.45;
        }
      }
    }

    .expand-cmd-col {
      .cmd-profiles-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 10px;
      }

      .cmd-profile-card {
        background: #fff;
        border: 1px solid $border-subtle;
        border-radius: $radius-sm;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;

        .cmd-card-head {
          display: flex;
          align-items: center;
          gap: 6px;

          .cmd-name {
            font-size: 12.5px;
            font-weight: 700;
            color: $text-primary;
          }

          .cmd-tier {
            font-size: 10px;
            font-weight: 700;
            padding: 1px 4px;
            border-radius: 3px;

            &.tier-t0 {
              background: #fef2f2;
              color: #dc2626;
              border: 1px solid #fecaca;
            }
            &.tier-t1 {
              background: #eff6ff;
              color: #2563eb;
              border: 1px solid #bfdbfe;
            }
            &.tier-t2 {
              background: #f8fafc;
              color: #64748b;
              border: 1px solid #e2e8f0;
            }
          }

          .cmd-sig-tag {
            font-size: 9.5px;
            color: #b45309;
            background: #fef3c7;
            padding: 1px 4px;
            border-radius: 3px;
            font-weight: 600;
          }

          .cmd-win-rate {
            margin-left: auto;
            font-size: 11px;
            font-weight: 700;
            color: $color-primary;
          }
        }

        .cmd-card-body {
          display: flex;
          flex-direction: column;
          gap: 3px;
          font-size: 11px;

          .cmd-stat-line {
            display: flex;
            align-items: center;
            justify-content: space-between;
            color: $text-secondary;

            .cmd-fav {
              color: #1e293b;
              strong {
                color: $color-primary-dark;
              }
            }
          }

          .cmd-sub-builds {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-wrap: wrap;
            margin-top: 2px;

            .sub-build-chip {
              font-size: 9.5px;
              background: #f1f5f9;
              color: #475569;
              padding: 1px 4px;
              border-radius: 3px;
            }
          }
        }
      }
    }
  }
}

.version-status-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 16px 0 24px;
  padding: 14px 20px;
  background: linear-gradient(135deg, rgba($color-primary, 0.06), rgba($color-success, 0.06));
  border: 1px solid rgba($color-primary, 0.2);
  border-radius: $radius-md;

  .banner-badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 90px;
    padding: 8px 10px;
    background: $bg-surface;
    border-radius: $radius-sm;
    box-shadow: $shadow-sm;

    .badge-pill {
      font-size: 10px;
      font-weight: 700;
      color: $color-success;
      letter-spacing: 0.5px;
    }

    strong {
      font-size: 17px;
      font-weight: 800;
      color: $color-primary;
    }
  }

  .banner-content {
    flex: 1;

    h4 {
      margin: 0 0 4px;
      font-size: 14px;
      font-weight: 700;
      color: $text-primary;
    }

    p {
      margin: 0;
      font-size: 12.5px;
      color: $text-secondary;
      line-height: 1.5;

      strong {
        color: $color-primary;
      }
    }
  }

  .banner-action-btn {
    @include button-primary;
    padding: 6px 14px;
    font-size: 12px;
    white-space: nowrap;
    text-decoration: none;
  }
}

.match-version-pill {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 4px;
  background: $border-subtle;
  color: $text-secondary;

  &.latest {
    background: rgba($color-success, 0.12);
    color: $color-success;
    border: 1px solid rgba($color-success, 0.3);
  }
}

.matches-top-actions {
  display: flex;
  align-items: center;
  gap: 10px;

  .btn-create-match {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
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

.patch-status-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 18px;
  margin-bottom: 16px;
  background-color: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: $radius-md;
  box-shadow: 0 1px 3px rgba(21, 128, 61, 0.08);

  .patch-info {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 13px;
    color: #14532d;

    strong {
      color: $color-primary;
    }
  }

  .patch-badge {
    padding: 3px 8px;
    font-size: 11.5px;
    font-weight: 700;
    background-color: #dcfce7;
    color: #166534;
    border-radius: $radius-full;
  }

  .patch-actions {
    display: flex;
    align-items: center;
    gap: 8px;

    .btn-export-patch,
    .btn-reset-all {
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 600;
      border-radius: $radius-sm;
      cursor: pointer;
      transition: $transition-fast;
    }

    .btn-export-patch {
      border: 1px solid #86efac;
      background-color: #ffffff;
      color: #166534;

      &:hover {
        background-color: #dcfce7;
      }
    }

    .btn-reset-all {
      border: 1px solid #fecaca;
      background-color: #fef2f2;
      color: #b91c1c;

      &:hover {
        background-color: #fee2e2;
      }
    }
  }
}

.research-match {
  transition: $transition-fast;

  &.is-modified {
    border-color: #86efac;
    background: linear-gradient(180deg, #ffffff 0%, #f7fdf9 100%);
  }

  &.is-custom {
    border-color: #fde68a;
    background: linear-gradient(180deg, #ffffff 0%, #fffdf5 100%);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 8px;

    .match-title-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }

    .modified-tag {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: $radius-full;
      background-color: #dcfce7;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }

    .custom-tag {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: $radius-full;
      background-color: #fef3c7;
      color: #b45309;
      border: 1px solid #fde68a;
    }

    .match-header-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }

    .btn-edit-match,
    .btn-revert-match,
    .btn-delete-match {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 600;
      border-radius: $radius-sm;
      cursor: pointer;
      transition: $transition-fast;
    }

    .btn-edit-match {
      border: 1px solid $border-color;
      background-color: #ffffff;
      color: $color-primary;

      &:hover {
        border-color: $color-primary;
        background-color: $color-primary-light;
      }
    }

    .btn-revert-match {
      border: 1px solid $border-color;
      background-color: #ffffff;
      color: $text-secondary;

      &:hover {
        background-color: $bg-subtle;
        color: $text-primary;
      }
    }

    .btn-delete-match {
      border: 1px solid #fecaca;
      background-color: #ffffff;
      color: $color-danger;

      &:hover {
        background-color: #fef2f2;
      }
    }

    span {
      font-size: 11.5px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: $radius-full;
      background: $color-primary-light;
      color: $color-primary;
    }
  }

  h2 {
    font-size: 16px;
    margin: 0;
  }
}

.muted {
  color: $text-muted;
  font-size: 12.5px;
}

.research-error {
  background: $color-danger-light;
  color: $color-danger;
  border: 1px solid $color-danger-border;
  border-radius: $radius-md;
  padding: 14px 18px;
  margin: 16px 0;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.research-success {
  padding: 14px 18px;
  color: $color-success;
  background: $color-success-light;
  border: 1px solid $color-success-border;
  border-radius: $radius-md;
  font-size: 13px;
}

.research-note {
  a {
    color: $color-primary;
    text-decoration: underline;
    font-weight: 500;
  }

  summary {
    cursor: pointer;
    font-weight: 600;
    color: $text-primary;
  }
}

@media (max-width: 768px) {
  .player-expand-detail-row .expand-panel-content {
    grid-template-columns: 1fr;
  }

  .expand-h2h-col .h2h-table-wrap {
    grid-template-columns: 1fr;
  }

  .research-heading {
    align-items: flex-start;
    flex-direction: column;

    h1 {
      font-size: 22px;
    }
  }

  .research-metrics {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .research-split {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .research-auth form,
  .research-filters {
    flex-direction: column;
  }

  .research-toolbar {
    flex-wrap: wrap;
  }
}
</style>
