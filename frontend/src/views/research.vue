<template>
  <div class="research-page">
    <header class="research-heading">
      <div>
        <p class="eyebrow">王者万象棋 / 王牌对决</p>
        <h1>{{ titles[section] }}</h1>
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
        <span>{{ loaded ? `王牌对决对局 ${catalog?.counts?.matches || 0} 场收录 · ${catalog?.counts?.plays || 0} 席位 · 完整排名 ${matches.length} 场登记` : '正在读取数据库…' }}</span>
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
              <strong>{{ catalog?.counts?.matches || 62 }}</strong>
              <span>已核验王牌对决场次</span>
              <small>六席位阵容 + 冠军 WebP 对照</small>
            </div>
            <div>
              <strong>{{ catalog?.counts?.players || 148 }}</strong>
              <span>参赛对决选手档案</span>
              <small>100% 专属选手头像已绑定</small>
            </div>
            <div>
              <strong>{{ catalog?.counts?.plays || 372 }}</strong>
              <span>实战席位与流派样本</span>
              <small>每席位流派与胜负已标注</small>
            </div>
            <div>
              <strong>{{ catalog?.counts?.sources || 45 }}</strong>
              <span>作者战报原帖 / 25日覆盖</span>
              <small>全量胜者图谱与流派声明</small>
            </div>
          </div>

          <!-- 王牌对决登顶排行榜 TOP 8 -->
          <section v-if="topWinners.length" class="leaderboard-section">
            <div class="section-title-row">
              <div>
                <h2>王牌对决登顶榜（夺冠最高选手 TOP 8）</h2>
                <p>基于 25 日全量作者战报与实战对局的冠军统计，投对决看选手实力</p>
              </div>
              <router-link to="/research/players" class="more-link">查看完整 148 位选手榜单 →</router-link>
            </div>
            <div class="top-winners-grid">
              <div v-for="(p, idx) in topWinners" :key="p.id" class="winner-card" :class="`rank-${idx + 1}`">
                <div class="winner-rank-badge">#{{ idx + 1 }}</div>
                <img :src="getPlayerAvatar(p.nickname)" class="winner-card-avatar" :alt="p.nickname" />
                <div class="winner-card-body">
                  <h3>{{ p.nickname }}</h3>
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
              <router-link to="/research/matches" class="more-link">浏览全量 62 场赛果 →</router-link>
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
                  <span v-for="s in m.seats" :key="s.slot" class="seat-pill" :class="{ isWinner: s.winner }">
                    {{ s.nickname }} ({{ s.build }})
                  </span>
                </div>
              </div>
            </div>
          </section>

          <!-- 赛果口径与核验规则说明 -->
          <section class="research-split">
            <div>
              <h2>先有赛果，再谈预测</h2>
              <p>完整排名赛果 {{ matches.length }} 场登记 · {{ stats.eligibleMatches }} 场有效。王牌对决公开战报已完成 62 场 6 席位 + 冠军转写；若后续官方提供 1~6 名排位回放数据，将继续在本工作台进行逐场核验。</p>
              <router-link class="research-link" to="/research/import">录入最新赛果 →</router-link>
            </div>
            <ol>
              <li>上传并核验原件素材</li>
              <li>录入六名选手与终局名次</li>
              <li>复核通过后计入选手统计</li>
              <li>按模式版本核对后进行时间回测</li>
            </ol>
          </section>

          <section class="research-note">
            <h2>来源核验进度</h2>
            <p>已完成软柿【万象棋】（76823812617）10月23日~10月29日、11月6日共 62 场王牌对决完整六席原图转写录入，原图校验哈希一致。另补齐 10月11日~11月5日共 45 篇原帖与胜者图谱，共计收录 201 位真实选手并 100% 绑定专属头像。</p>
          </section>
        </template>

        <!-- 2. 来源资料 (sources) -->
        <ObservationInbox v-else-if="section==='sources'" />

        <!-- 3. 选手玩法档案 (roster) -->
        <PlayerCatalog v-else-if="section==='roster'" />

        <!-- 4. 场次赛果 (matches) -->
        <template v-else-if="section==='matches'">
          <div class="source-toggle-bar">
            <button :class="{ active: matchSourceType === 'transcribed' }" @click="matchSourceType = 'transcribed'">
              王牌对决真实对局 ({{ catalog?.counts?.matches || 62 }} 场已转写核验)
            </button>
            <button :class="{ active: matchSourceType === 'official' }" @click="matchSourceType = 'official'">
              完整1~6名排名登记 ({{ matches.length }} 场)
            </button>
          </div>

          <!-- 王牌对决已转写对局列表 -->
          <template v-if="matchSourceType === 'transcribed'">
            <div class="research-filters">
              <select v-model="selectedDay" aria-label="日期筛选">
                <option value="">全部比赛日期 ({{ availableDays.length }} 天)</option>
                <option v-for="d in availableDays" :key="d" :value="d">{{ d }}</option>
              </select>
              <input v-model="query" placeholder="搜索选手、流派阵容或 Ban 位" aria-label="筛选场次">
            </div>

            <p v-if="!filteredCatalogMatches.length" class="research-empty">没有找到符合条件的王牌对决场次。</p>

            <div class="matches-list">
              <article v-for="m in filteredCatalogMatches" :key="m.id" class="research-match">
                <header>
                  <div class="match-title-row">
                    <h2>王牌对决 · {{ m.day }} 第 {{ m.ordinal }} 场</h2>
                    <span v-if="m.ban" class="ban-tag">Ban：{{ m.ban }}</span>
                  </div>
                  <span class="verified-tag">已核验 · 6席位转写</span>
                </header>

                <div class="research-table">
                  <table>
                    <thead>
                      <tr>
                        <th>席位</th>
                        <th>选手</th>
                        <th>所选流派阵容</th>
                        <th>对局结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="s in m.seats" :key="s.slot" :class="{ 'row-winner': s.winner }">
                        <td>第 {{ s.slot }} 席</td>
                        <td class="player-cell">
                          <img :src="getPlayerAvatar(s.nickname)" class="player-inline-avatar" alt="" />
                          <span class="player-name">{{ s.nickname }}</span>
                        </td>
                        <td>{{ s.build }}</td>
                        <td>
                          <strong v-if="s.winner" class="winner-crown">👑 登顶胜者（{{ m.winnerBuild }}）</strong>
                          <span v-else class="text-muted">对位参战</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div class="match-footer-info">
                  <p class="muted">原件哈希：<code>{{ m.materialSha256 ? m.materialSha256.slice(0, 16) + '...' : '已关联原图' }}</code></p>
                  <a v-if="m.sourceUrl" :href="m.sourceUrl" target="_blank" rel="noreferrer" class="source-link">查看作者原帖 ↗</a>
                </div>
              </article>
            </div>
          </template>

          <!-- 官方完整1~6名登记（保留原逻辑） -->
          <template v-else>
            <div class="research-filters">
              <select v-model="mode" aria-label="模式">
                <option value="">全部模式</option>
                <option value="WANXIANG">万象大赛</option>
                <option value="DIAMOND">钻石狂潮</option>
              </select>
              <input v-model="query" placeholder="按选手、来源或版本搜索" aria-label="筛选场次">
            </div>

            <p v-if="!filteredMatches.length" class="research-empty">暂无官方完整1~6名终局名次赛果。收到带名次回放后，从「数据录入」建立完整赛果。</p>
            <article v-for="m in filteredMatches" :key="m.id" class="research-match">
              <header>
                <h2>{{ modeName(m.mode) }} · {{ formatTime(m.playedAt) }}</h2>
                <span>{{ m.status==='VERIFIED'?'已核验':m.status==='PENDING'?'待核验':'已隔离' }}</span>
              </header>
              <p class="muted">{{ m.version }} · {{ m.platform }} / {{ m.region }} · {{ m.sourceKey }}</p>
              <div class="research-table">
                <table>
                  <thead><tr><th>名次</th><th>选手</th><th>UID</th></tr></thead>
                  <tbody>
                    <tr v-for="s in m.seats" :key="s.rank">
                      <td>{{ s.rank }}</td>
                      <td class="player-cell"><img :src="getPlayerAvatar(s.nickname)" class="player-inline-avatar" alt="" /><span>{{ s.nickname }}</span></td>
                      <td>{{ s.uid || '未确认，不跨场合并' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="muted">原件 {{ m.evidenceId }} · {{ m.evidenceLocator }}</p>
              <form v-if="m.status!=='QUARANTINED'" class="verify-row" @submit.prevent="verify(m.id)">
                <input v-model="operator" placeholder="核验人" aria-label="核验人" required>
                <button v-if="m.status==='PENDING'" :disabled="busy">已对照原件，确认六席正确</button>
                <button type="button" :disabled="busy" @click="quarantine(m.id)">隔离错误场次</button>
              </form>
            </article>
          </template>
        </template>

        <!-- 5. 选手统计 (players) -->
        <template v-else-if="section==='players'">
          <div class="source-toggle-bar">
            <button :class="{ active: playerTabType === 'catalog' }" @click="playerTabType = 'catalog'">
              王牌对决选手登顶榜 ({{ catalog?.counts?.players || 148 }} 位)
            </button>
            <button :class="{ active: playerTabType === 'official' }" @click="playerTabType = 'official'">
              官方完整排名汇总 ({{ stats.players.length }} 位)
            </button>
          </div>

          <template v-if="playerTabType === 'catalog'">
            <p class="research-note">基于已转写的 62 场真实对局与 45 篇作者原帖统计。包含每位选手的出场观察次数、登顶夺冠次数、登顶胜率与常用流派。</p>
            <div class="research-filters">
              <input v-model="playerSearch" placeholder="搜索选手昵称或流派阵容" aria-label="搜索选手">
            </div>

            <div class="research-table">
              <table>
                <thead>
                  <tr>
                    <th>榜单排名</th>
                    <th>选手 / 战队</th>
                    <th>观察场次</th>
                    <th>登顶夺冠</th>
                    <th>登顶胜率</th>
                    <th>常用阵容标签</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(p, idx) in filteredCatalogPlayers" :key="p.id">
                    <td>#{{ idx + 1 }}</td>
                    <td class="player-cell">
                      <img :src="getPlayerAvatar(p.nickname)" class="player-inline-avatar" alt="" />
                      <div class="player-inline-meta">
                        <span class="player-name">{{ p.nickname }}</span>
                        <small v-if="p.observedWins > 0" class="win-tag">曾获 {{ p.observedWins }} 冠</small>
                      </div>
                    </td>
                    <td><strong>{{ p.observedMatches }}</strong> 场</td>
                    <td><strong class="winner-crown">{{ p.observedWins }}</strong> 次</td>
                    <td>{{ p.observedMatches ? percent(p.observedWins / p.observedMatches) : '0.0%' }}</td>
                    <td>{{ p.commonBuilds.length ? p.commonBuilds.join('、') : (p.builds.slice(0, 2).map(b => b.label).join('、') || '暂无') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

          <template v-else>
            <p class="research-note">模式、版本、平台、区服与UID分开统计；只展示仍有有效原件的已核验记录。同名不自动合并。</p>
            <p v-if="!stats.players.length" class="research-empty">暂无可统计选手。待完整赛果核验、稳定UID确认后自动汇总。</p>
            <div v-else class="research-table">
              <table>
                <thead><tr><th>选手 / UID</th><th>模式 / 版本</th><th>平台 / 区服</th><th>场数</th><th>登顶</th><th>前三</th><th>平均名次</th></tr></thead>
                <tbody>
                  <tr v-for="p in stats.players" :key="p.key+p.mode+p.version">
                    <td class="player-cell">
                      <img :src="getPlayerAvatar(p.nickname)" class="player-inline-avatar" alt="" />
                      <div class="player-inline-meta"><span>{{ p.nickname }}</span><small>{{ p.uid || '未确认UID' }}</small></div>
                    </td>
                    <td>{{ modeName(p.mode) }}<small>{{ p.version }}</small></td>
                    <td>{{ p.platform }} / {{ p.region }}</td>
                    <td>{{ p.matches }}</td>
                    <td>{{ p.wins }}（{{ percent(p.winRate) }}）</td>
                    <td>{{ p.top3 }}（{{ percent(p.top3Rate) }}）</td>
                    <td>{{ p.avgRank.toFixed(2) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </template>

        <!-- 6. 赛前研究 (predict) -->
        <template v-else-if="section==='predict'">
          <ScreenshotWorkbench />
        </template>

        <!-- 7. 数据录入 (import) -->
        <template v-else-if="section==='import'">
          <section class="research-note">
            <h2>录入前准备</h2>
            <p>先到 <router-link to="/admin/sources">原件管理</router-link> 上传截图并核验，复制证据编号。截图没有UID时可留空，不凭昵称跨场归并。原件与场次是两次独立核验，上传不等于统计生效。</p>
          </section>
          <form class="research-form" @submit.prevent="importMatch">
            <label>来源唯一场次键<input v-model="form.sourceKey" required placeholder="来源:平台:区服:日期时段"></label>
            <label>模式<select v-model="form.mode"><option value="WANXIANG">万象大赛</option><option value="DIAMOND">钻石狂潮</option></select></label>
            <label>比赛时间（含时区）<input v-model="form.playedAt" required placeholder="ISO8601，例如末尾 +08:00"></label>
            <label>游戏版本<input v-model="form.version" required></label>
            <label>平台<input v-model="form.platform" required placeholder="按原件填写"></label>
            <label>区服<input v-model="form.region" required></label>
            <label>证据编号<input v-model="form.evidenceId" required></label>
            <label>原件定位<input v-model="form.evidenceLocator" required placeholder="图片页码或录屏时间位置"></label>
            <fieldset class="six-seats">
              <legend>完整六席，按最终排名录入</legend>
              <div v-for="s in form.seats" :key="s.rank">
                <span>{{ s.rank }}</span>
                <input v-model="s.nickname" required :aria-label="`第${s.rank}名昵称`" placeholder="原始昵称">
                <input v-model="s.uid" :aria-label="`第${s.rank}名UID`" placeholder="UID，可留空">
              </div>
            </fieldset>
            <button class="primary" :disabled="busy">保存为待核验</button>
          </form>
          <details class="research-note">
            <summary>批量整理前的单场JSON入口</summary>
            <p>每次仅接收一个完整场次，256KB上限。录入成功后进入待核验，重复键内容相同幂等、不同拒绝覆盖。</p>
            <textarea v-model="jsonInput" rows="10" aria-label="场次JSON" placeholder="粘贴与上方字段同结构的场次对象"></textarea>
            <button :disabled="busy" @click="importJson">校验并保存JSON</button>
          </details>
        </template>
      </template>

      <p v-if="feedback" role="status" class="research-success">{{ feedback }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import ScreenshotWorkbench from '../components/ScreenshotWorkbench.vue'
import PlayerCatalog from '../components/PlayerCatalog.vue'
import ObservationInbox from '../components/ObservationInbox.vue'
import { computed, watch, ref } from 'vue'
import { useRoute } from 'vue-router'
import { researchApi, localResearch, getAdminToken, setAdminToken, type ResearchMatch, type Stats } from '../api/prediction'
import { getPlayerAvatar } from '../utils/player-avatar'

interface CatalogMatchSeat {
  slot: number
  playerId: string
  nickname: string
  build: string
  winner: boolean
}

interface CatalogMatch {
  id: string
  day: string
  ordinal: number
  sourceUrl: string
  materialSha256: string
  ban: string | null
  winnerBuild: string
  winnerSlot: number | null
  winnerNickname: string | null
  seats: CatalogMatchSeat[]
}

interface CatalogProfile {
  id: string
  nickname: string
  author: string
  observedMatches: number
  observedWins: number
  builds: { label: string; observations: number; winsForSourceLabel: number }[]
  commonBuilds: string[]
  claims: any[]
  history: any[]
}

interface CatalogData {
  usageScope: string
  status: string
  counts: { players: number; matches: number; plays: number; claims: number; sources: number }
  matches?: CatalogMatch[]
  players: CatalogProfile[]
  sources: { url: string; title: string; status: string; matches: number; note: string | null }[]
  notice: string
}

const route = useRoute()
const section = computed(() => String(route.meta.researchSection || 'overview'))
const titles: Record<string, string> = {
  overview: '王牌对决研究工作台',
  matches: '场次与赛果',
  players: '选手统计',
  predict: '赛前研究',
  import: '数据录入',
  sources: '来源资料',
  roster: '选手玩法档案'
}

const hasToken = ref(Boolean(getAdminToken()))
const ready = computed(() => hasToken.value || (localResearch && ['overview', 'roster', 'sources', 'matches', 'players'].includes(section.value)))
const token = ref(''), error = ref(''), feedback = ref(''), busy = ref(false), loaded = ref(false)
const matches = ref<ResearchMatch[]>([])
const stats = ref<Stats>({ eligibleMatches: 0, unlinkedSeats: 0, players: [] })
const catalog = ref<CatalogData | null>(null)

// 页面交互状态
const mode = ref('')
const query = ref('')
const operator = ref('')
const jsonInput = ref('')
const matchSourceType = ref<'transcribed' | 'official'>('transcribed')
const playerTabType = ref<'catalog' | 'official'>('catalog')
const selectedDay = ref('')
const playerSearch = ref('')

const form = ref({
  sourceKey: '',
  mode: 'WANXIANG',
  playedAt: '',
  platform: '',
  region: '',
  version: '',
  evidenceId: '',
  evidenceLocator: '',
  seats: Array.from({ length: 6 }, (_, i) => ({ rank: i + 1, nickname: '', uid: '' }))
})

// 总览计算属性：胜场 TOP 8
const topWinners = computed(() => {
  if (!catalog.value?.players) return []
  return catalog.value.players
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
      ...m.seats.map(s => `${s.nickname} ${s.build}`)
    ].join(' ').toLowerCase()
    return text.includes(q)
  })
})

const filteredMatches = computed(() =>
  matches.value.filter(m => (!mode.value || m.mode === mode.value) && JSON.stringify(m).toLowerCase().includes(query.value.toLowerCase()))
)

// 选手统计页计算属性
const filteredCatalogPlayers = computed(() => {
  const list = catalog.value?.players || []
  const q = playerSearch.value.trim().toLowerCase()
  return list
    .filter(p => {
      if (!q) return true
      const text = [
        p.nickname,
        ...p.builds.map(b => b.label),
        ...p.commonBuilds
      ].join(' ').toLowerCase()
      return text.includes(q)
    })
    .slice()
    .sort((a, b) => b.observedWins - a.observedWins || b.observedMatches - a.observedMatches)
})

const modeName = (s: string) => s === 'WANXIANG' ? '万象大赛' : '钻石狂潮'
const percent = (n: number) => (n * 100).toFixed(1) + '%'
const formatTime = (s: string) => new Date(s).toLocaleString('zh-CN')

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
    catalog.value = (cat && typeof cat === 'object' && !Array.isArray(cat)) ? cat : null
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

async function action(fn: () => Promise<void>) {
  busy.value = true
  feedback.value = ''
  error.value = ''
  try {
    await fn()
  } catch (e) {
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    busy.value = false
  }
}

async function save(raw: unknown) {
  const r = await researchApi<{ deduplicated: boolean }>('matches', raw)
  await load()
  feedback.value = r.deduplicated ? '相同场次已存在，没有重复导入。' : '已保存待核验场次，请对照原件后在场次页确认。'
}

const importMatch = () => action(() => save(form.value))
const importJson = () => action(async () => { await save(JSON.parse(jsonInput.value)) })
const verify = (id: string) => action(async () => {
  await researchApi(`matches/${encodeURIComponent(id)}/verify`, { operator: operator.value })
  await load()
  feedback.value = '场次已核验，统计已刷新。'
})
const quarantine = (id: string) => action(async () => {
  await researchApi(`matches/${encodeURIComponent(id)}/quarantine`, { operator: operator.value })
  await load()
  feedback.value = '场次已隔离，不再参与当前统计。历史研究运行仍保留原快照。'
})

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

    h3 {
      font-size: 15px;
      font-weight: 700;
      margin: 0 0 6px;
      color: $text-primary;
      overflow: hidden;
      text-overflow: ellipsis;
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
    }
  }
}

/* 切换条 */
.source-toggle-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;

  button {
    padding: 8px 16px;
    font-size: 13.5px;
    font-weight: 600;
    border-radius: $radius-full;
    border: 1px solid $border-subtle;
    background: $bg-surface;
    color: $text-secondary;
    cursor: pointer;
    transition: all 0.2s ease;

    &.active {
      background: $color-primary;
      color: #fff;
      border-color: $color-primary;
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

.research-filters,
.verify-row {
  display: flex;
  gap: 12px;
  margin: 18px 0;
}

.research-form {
  @include glass-panel;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  padding: 28px;
  margin: 20px 0;

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12.5px;
    font-weight: 600;
    color: $text-secondary;
  }
}

.research-page input,
.research-page select,
.research-page textarea {
  @include input-base;
}

.six-seats {
  grid-column: 1 / -1;
  border: 1px solid $border-subtle;
  background: $bg-canvas;
  border-radius: $radius-md;
  padding: 16px 20px;
  margin: 10px 0;

  legend {
    font-weight: 700;
    font-size: 13px;
    color: $text-primary;
    padding: 0 6px;
  }

  div {
    display: grid;
    grid-template-columns: 28px 1fr 1fr;
    align-items: center;
    gap: 12px;
    margin: 10px 0;

    span {
      font-weight: 700;
      color: $color-primary;
      text-align: center;
    }
  }
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
    }
  }
}

.research-match {
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;

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

  .research-form {
    grid-template-columns: 1fr;
    padding: 18px;
  }

  .research-auth form,
  .verify-row,
  .research-filters {
    flex-direction: column;
  }

  .research-toolbar {
    flex-wrap: wrap;
  }

  .six-seats div {
    grid-template-columns: 20px 1fr;

    input:last-child {
      grid-column: 2;
    }
  }
}
</style>
