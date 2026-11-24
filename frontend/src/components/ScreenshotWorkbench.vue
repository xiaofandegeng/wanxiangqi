<template>
<section class="shot-workbench">
  <header class="workbench-header-bar">
    <h2>王牌对决 · 本场分析</h2>
    <nav class="workbench-tabs" aria-label="分析方式">
      <button type="button" :aria-pressed="activeTab === 'instant'" @click="activeTab = 'instant'">极速推演</button>
      <button type="button" :aria-pressed="activeTab === 'audit'" @click="activeTab = 'audit'">截图审计与存档</button>
    </nav>
  </header>

  <section v-show="activeTab === 'instant'" class="instant-mode-panel">
    <div class="forecast-batch">
      <label>批量选手<input v-model="batchPasteText" placeholder="按换行、逗号或空格分隔六位选手昵称" @keydown.enter.prevent="applyBatchPaste"></label>
      <button type="button" @click="applyBatchPaste">填入六席</button>
      <button type="button" @click="clearRoster">清空名单</button>
    </div>
    <div class="forecast-fields">
      <label>本场禁用阵营<input v-model="bannedFaction" list="forecast-bans" maxlength="160" placeholder="请选择或填写"></label>
    </div>
    <datalist id="forecast-bans">
      <option value="无禁用" />
      <option v-for="ban in catalogOptions.bans" :key="ban" :value="ban" />
    </datalist>
    <datalist id="forecast-commanders"><option v-for="commander in catalogOptions.commanders" :key="commander" :value="commander" /></datalist>
    <datalist id="forecast-players"><option v-for="name in selectablePlayerNames" :key="name" :value="name" /></datalist>
    <datalist id="raw-player-names"><option v-for="name in rawPlayerNames" :key="name" :value="name" /></datalist>

    <div class="forecast-roster">
      <fieldset v-for="(player, i) in players" :key="i" class="forecast-seat">
        <legend>第 {{ i + 1 }} 席</legend>
        <label>选手昵称<input v-model="player.profileId" list="forecast-players" maxlength="160" placeholder="请选择或输入选手昵称"></label>
        <label>本场棋手<input v-model="player.commander" list="forecast-commanders" maxlength="160" placeholder="请选择或输入棋手"></label>
      </fieldset>
    </div>
    <p v-if="hasDuplicateIds" role="alert">同一选手只能填入一个席位。</p>
    <button type="button" class="forecast-submit" :disabled="forecastBusy || !canForecast" @click="runForecast">
      {{ forecastBusy ? '正在读取数据库并计算…' : '计算赛前预测' }}
    </button>
    <p v-if="forecastError" role="alert">{{ forecastError }}</p>

    <details class="identity-merge-panel">
      <summary class="rank-feedback-summary">
        <span class="summary-title">选手唯一身份与改名归并</span>
        <span class="summary-sub">系统唯一码 + 限定编号称号认证 + 同场互斥防误合</span>
      </summary>
      <div class="identity-merge-body">
        <div class="merge-top-bar">
          <p class="merge-desc">
            每位主选手拥有永久唯一码（<code>WXQP-*</code>）。支持一键导入已核实改名库，或将新改名昵称归并至老选手（自动拦截同场对战的车队不同人，如「抖音梦飞」与「抖音梦飞冻冻」）。
          </p>
          <button
            type="button"
            class="btn-sync-identities"
            :disabled="mergeBusy"
            @click="runSyncVerifiedIdentities"
          >
            {{ mergeBusy ? '正在同步归并…' : '⚡ 一键归并已核实改名库' }}
          </button>
        </div>

        <div class="quick-merge-form" @keydown.enter.prevent="submitQuickAliasMerge">
          <label>待归并改名昵称
            <input v-model.trim="quickMerge.aliasPlayer" list="raw-player-names" maxlength="160" placeholder="例如：抖音清辞4连6">
          </label>
          <label>归并至主选手昵称
            <input v-model.trim="quickMerge.canonicalPlayer" list="forecast-players" maxlength="160" placeholder="例如：抖音EG清辞">
          </label>
          <label>唯一凭证类型（选填）
            <select v-model="quickMerge.credentialType">
              <option value="">仅归并改名（使用系统唯一码）</option>
              <option value="FOUNDER_BADGE">开服奠基人编号</option>
              <option value="PIONEER_BADGE">荣耀先驱者编号</option>
              <option value="ANGEL_BADGE">天使投资人编号</option>
              <option value="COFOUNDER_BADGE">联合创始人编号</option>
              <option value="GAME_UID">游戏数字 UID</option>
            </select>
          </label>
          <label>凭证编号（选填）
            <input
              v-model.trim="quickMerge.credentialValue"
              :disabled="!quickMerge.credentialType"
              maxlength="80"
              :placeholder="quickMerge.credentialType ? '例如：0014 或 0289' : '选填凭证类型后填写'"
            >
          </label>
          <button
            type="button"
            class="btn-quick-merge"
            :disabled="mergeBusy || !quickMerge.aliasPlayer || !quickMerge.canonicalPlayer"
            @click="submitQuickAliasMerge"
          >
            归并为同一选手
          </button>
        </div>
        <p v-if="mergeStatus" role="status" class="merge-feedback" :class="{ 'is-error': mergeIsError }">{{ mergeStatus }}</p>
      </div>
    </details>

    <details class="rank-feedback" @toggle="onRankFeedbackToggle">
      <summary class="rank-feedback-summary">
        <span class="summary-title">选手红黑榜</span>
        <span class="summary-sub">赛前预期 vs 实际名次偏差追踪</span>
      </summary>

      <div class="rank-feedback-body">
        <div class="rank-feedback-toolbar">
          <div class="rank-feedback-controls">
            <label>统计窗口
              <select v-model="rankWindow">
                <option value="recent3">最近 3 天</option>
                <option value="recent7">最近 7 天</option>
              </select>
            </label>
            <button
              type="button"
              class="btn-rank-generate"
              :class="{ 'is-generated': isRankFeedbackGenerated }"
              :disabled="rankFeedbackBusy || !rankFeedback || isRankFeedbackGenerated"
              @click="loadRankFeedback(true)"
            >
              {{ isRankFeedbackGenerated ? '✓ 红黑榜已生成' : '生成红黑榜' }}
            </button>
          </div>

          <div v-if="activeRankWindow" class="rank-meta-strip">
            <span class="meta-chip">赛前快照 {{ activeRankWindow.live }} 场 · 历史补算 {{ activeRankWindow.replayed }} 场</span>
            <span class="meta-chip is-weight">本场预测修正 · 最近 3 天 70% · 最近 7 天 30%</span>
          </div>
        </div>

        <p v-if="rankFeedbackBusy" role="status" class="rank-status-msg">正在读取已核对赛果…</p>
        <p v-else-if="rankFeedbackError" role="status" class="rank-error-msg">{{ rankFeedbackError }}</p>
        <template v-else-if="activeRankWindow">
          <p v-if="rankFeedbackGeneration" role="status" class="rank-gen-banner">{{ rankFeedbackGeneration }}</p>
          <p v-if="!activeRankWindow.live && !activeRankWindow.replayed" class="rank-empty-notice">
            暂无可匹配的预测与完整名次，可点击上方「生成红黑榜」执行首次补算。
          </p>

          <div v-else class="rank-dual-grid">
            <section
              v-for="group in [
                { key: 'red', label: '红榜', subtitle: '超预期发挥（实际名次优于预测）', rows: activeRankWindow.red },
                { key: 'black', label: '黑榜', subtitle: '低于预期（实际名次低于预测）', rows: activeRankWindow.black }
              ]"
              :key="group.key"
              class="rank-column"
              :class="`is-${group.key}`"
            >
              <header class="rank-col-header">
                <div class="col-title-wrap">
                  <span class="col-dot" aria-hidden="true"></span>
                  <h4>{{ group.label }}</h4>
                  <small>{{ group.subtitle }}</small>
                </div>
                <span class="col-count-pill">{{ group.rows.length }} 人</span>
              </header>

              <div v-if="group.rows.length" class="rank-col-table-wrap">
                <table class="rank-col-table">
                  <thead>
                    <tr>
                      <th>选手与来源</th>
                      <th class="num-col">样本</th>
                      <th class="num-col">平均偏差</th>
                      <th class="num-col">加权偏差</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, idx) in group.rows" :key="row.profileId">
                      <th scope="row" class="player-info-cell">
                        <div class="player-main-line">
                          <span class="rank-order-num">{{ idx + 1 }}</span>
                          <img :src="getPlayerAvatar(row.nickname)" :alt="row.nickname" class="rank-avatar" />
                          <span class="rank-player-name">{{ row.nickname }}</span>
                          <span v-if="primaryBadgeLabel(row)" class="uid-chip is-badge">{{ primaryBadgeLabel(row) }}</span>
                          <span v-else-if="row.personUid" class="uid-chip">{{ row.personUid }}</span>
                        </div>
                        <details v-if="row.accounts?.length" class="rank-source-details">
                          <summary>{{ accountSummary(row.accounts) }}</summary>
                          <ul class="rank-account-list">
                            <li v-for="entry in row.accounts" :key="entry.key">
                              <span v-if="entry.account">{{ formatAccountLine(entry.account) }} · </span>
                              <span>{{ rankWindow === 'recent3' ? entry.samples3 : entry.samples7 }} 场</span>
                              <div v-for="profile in entry.profiles" :key="profile.profileId">
                                {{ profile.nickname }}<span v-if="profile.sourceAuthor">（{{ profile.sourceAuthor }}）</span>
                                · {{ rankWindow === 'recent3' ? profile.samples3 : profile.samples7 }} 场
                              </div>
                            </li>
                          </ul>
                        </details>
                        <span v-else class="rank-no-source">暂无来源明细</span>
                      </th>
                      <td class="num-col">{{ rankWindow === 'recent3' ? row.samples3 : row.samples7 }} 场</td>
                      <td class="num-col">{{ signed(rankWindow === 'recent3' ? row.average3 ?? 0 : row.average7) }} 名</td>
                      <td class="num-col">
                        <span class="gap-pill" :class="`is-${group.key}`">{{ signed(row.weightedGap) }} 名</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-else class="rank-col-empty">当前窗口暂无{{ group.label }}选手</div>
            </section>
          </div>
        </template>
      </div>
    </details>

    <section v-if="forecast" class="shot-model forecast-result" aria-live="polite">
      <h3>{{ forecast.status === 'INSUFFICIENT_DATABASE_HISTORY' ? '样本不足 · 阵容推测' : '本场预测' }}</h3>
      <p>{{ forecast.notice }}</p>
      <p>{{ forecast.trainingMatches }} 场入库训练记录 · {{ forecast.modelVersion }} · 截止 {{ formatCutoff(forecast.cutoff) }}</p>
      <div class="forecast-table">
        <table>
          <thead><tr><th>席位</th><th>选手</th><th>本场棋手</th><th>入库战绩</th><th>同棋手阵容战绩</th><th>阵容倾向</th><th>天赋推测</th><th>夺冠概率</th><th v-if="forecast.rankFeedback?.settledMatches">近期偏差</th></tr></thead>
          <tbody>
            <tr v-for="(player, i) in forecast.players" :key="i">
              <td>{{ i + 1 }}</td>
              <th scope="row">{{ player.nickname }}</th>
              <td>{{ players[i]?.commander || '未确认' }}</td>
              <td>{{ player.historicalMatches }} 战 {{ player.historicalWins }} 冠</td>
              <td>{{ players[i]?.commander ? `${forecast.buildProjections?.[i]?.commanderSamples ?? 0} 战 ${forecast.buildProjections?.[i]?.commanderWins ?? 0} 冠` : '未选棋手' }}</td>
              <td>{{ lineupLabel(forecast.buildProjections?.[i]) }}</td>
              <td>{{ talentLabel(forecast.talentProjections?.players[i]) }}</td>
              <td>{{ probabilityLabel(player.probability) }}</td>
              <td v-if="forecast.rankFeedback?.settledMatches">{{ rankAdjustmentLabel(forecast.rankFeedback.players[i], player.probability) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <details v-if="forecast.talentProjections?.version">
        <summary>天赋推测依据 · 历史版本 {{ forecast.talentProjections.version }}</summary>
        <p>天赋候选来自个人同棋手、同阵容的历史记录。多种天赋可以同场出现，样本缺失时保留未知。</p>
        <ul>
          <li v-for="(projection, i) in forecast.talentProjections.players" :key="i">
            {{ forecast.players[i]?.nickname }} · {{ projection.talentSamples }}/{{ projection.buildSamples }} 条历史记录可见天赋
            <span v-for="(candidate, j) in projection.candidates.slice(0, 3)" :key="j">
              · {{ candidate.build }} × {{ candidate.talent }} {{ candidate.observations }}/{{ candidate.buildSamples }} 次
            </span>
          </li>
        </ul>
      </details>
    </section>
  </section>

  <!-- 2. 传统截图审计与合规台账模式 (保留完整审计台账流程) -->
  <div v-show="activeTab === 'audit'" class="audit-mode-panel">
  <form class="shot-upload" @submit.prevent="read">
   <label>对局资料截图<input type="file" accept="image/png,image/jpeg,image/webp" @change="selectFile"><small v-if="file">{{ file.name }}</small></label>
   <label>实际截图采集时间<input v-model="capturedAt" type="datetime-local" step="1" :readonly="!!draft" required></label>
   <label>复核人<input v-model="operator" required maxlength="160" placeholder="操作人标识"></label>
   <button class="primary" :disabled="busy||!file">{{ busy?'处理中…':'保存原图并识别' }}</button>
  </form>
  <form class="shot-restore" @submit.prevent="loadSaved"><label>已保存核对编号<input v-model="savedAnalysisId" maxlength="100" placeholder="填写编号，恢复当时的核对资料"></label><button :disabled="busy||!savedAnalysisId.trim()">载入资料</button></form>
  <details class="account-identity">
   <summary>核对选手账号 UID</summary>
   <form class="shot-restore" @submit.prevent="saveAccountIdentity">
    <label>来源档案 ID<input v-model.trim="identity.profileId" list="forecast-players" required maxlength="160"></label>
    <label>游戏 UID<input v-model.trim="identity.uid" required maxlength="160"></label>
    <label>平台<input v-model.trim="identity.platform" required maxlength="160"></label>
    <label>区服<input v-model.trim="identity.region" required maxlength="160"></label>
    <label>已核验证据编号<input v-model.trim="identity.evidenceId" required maxlength="160"></label>
    <label>所属选手档案 ID（选填）<input v-model.trim="identity.personProfileId" list="forecast-players" maxlength="160"></label>
    <label>核对说明<input v-model.trim="identity.reviewNote" required maxlength="500"></label>
    <label class="shot-confirm"><input type="checkbox" v-model="identity.identityConfirmed">已核对游戏 UID 与账号归属</label>
    <button type="button" :disabled="identityBusy || !identity.platform || !identity.region || !identity.uid" @click="findAccountIdentity">查询 UID</button>
    <button type="submit" :disabled="identityBusy || !identity.identityConfirmed">登记账号</button>
   </form>
   <p v-if="identityStatus" role="status">{{ identityStatus }}</p>
  </details>
  <p class="muted">原图仅存本机后端与数据库，默认内部使用。当前OCR使用macOS本地Vision；不支持的服务器会明确提示。识别结果必须人工确认。</p>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="evidenceId" class="muted">已保存原件：{{ evidenceId }}；核对后的逐局数据可用于后续赛前预测。</p>
  <template v-if="draft">
   <p class="shot-warning" v-if="draft.ocr.phaseHint==='POSTMATCH_INDICATORS'">图片中识别到赛后标记，仅用于核对文字和历史资料。</p>
   <details><summary>查看OCR原文与候选（{{ draft.ocr.rows.length }}行）</summary><ul><li v-for="(r,i) in draft.ocr.rows" :key="i">{{ r.rawText }} → {{ r.candidates.map(c=>c.nickname).join('、')||'未找到候选' }}</li></ul></details>
   <form class="shot-review" @submit.prevent="analyze">
    <fieldset>
     <legend>核对六席资料</legend>
     <div class="shot-seat" v-for="(player, i) in auditPlayers" :key="i">
      <span>{{ i + 1 }}</span>
      <label>截图昵称<input v-model="player.nickname" required maxlength="160" @input="player.profileId = ''"></label>
      <label>选择历史档案<select v-model="player.profileId">
        <option value="">未匹配</option>
        <option v-for="profile in candidates(player.nickname)" :key="profile.id" :value="profile.id">{{ profile.nickname }}</option>
      </select></label>
     </div>
    </fieldset>
    <label class="shot-confirm"><input type="checkbox" v-model="confirmed">我已核对截图与六席名单。</label>
    <button class="primary" :disabled="busy || !confirmed || auditPlayers.some(p => !p.nickname.trim())">保存资料核对</button>
   </form>
  </template>
  <section v-if="result" class="shot-result" aria-live="polite">
   <h3>资料核对</h3><p>{{ result.notice }}</p>
   <p>数据截止 {{ formatCutoff(result.featureCutoff) }}</p>
  <ul class="shot-gaps"><li v-for="b in result.blockers" :key="b">{{ blockerNames[b]||b }}</li></ul>
  <div class="shot-profiles"><article v-for="(p,i) in result.players" :key="i"><h4>{{ p.nickname }}</h4><p>档案：{{ p.profileNickname||'未匹配' }}</p><p v-if="p.recent7.observations">近 7 日已收录 {{ p.recent7.observations }} 场，夺冠 {{ p.recent7.wins }} 场。</p>
   <p v-else>{{ p.profileNickname ? '该账号近 7 日暂无已收录场次。' : '该昵称尚未关联选手档案。' }}</p>
   <p>近 30 日已收录 {{ p.recent30.observations }} 场，夺冠 {{ p.recent30.wins }} 场。</p>
   <details v-if="p.recent7Matches?.length">
    <summary>近 7 日逐场战绩（{{ p.recent7Matches.length }}）</summary>
    <ul>
     <li v-for="(match, index) in p.recent7Matches" :key="match.matchId ?? index">
      {{ match.day }}<span v-if="match.ordinal"> 第 {{ match.ordinal }} 场</span> · {{ match.winner ? '夺冠' : '参赛，未夺冠' }}
      · {{ match.build && match.build !== 'UNKNOWN' ? match.build : '玩法待核对' }}
      · {{ match.commander ?? '棋手待核对' }}
      <a v-if="match.sourceUrl" :href="match.sourceUrl" target="_blank" rel="noreferrer">赛果来源</a>
     </li>
    </ul>
   </details>
   <ul><li v-for="b in p.buildRates" :key="b.label">{{ b.label }}：{{ b.wins }}/{{ b.observations }} 登顶（{{ (100*b.observedWinShare).toFixed(1) }}% 来源选择标签样本）；最终阵容胜率未知</li></ul><p v-if="!p.buildRates.length">暂无可关联的逐局玩法。</p><details v-if="p.claims.length"><summary>玩法参考与原文</summary><p>用于了解选手可能擅长的阵容。夺冠概率只使用王牌对决逐局记录。</p><ul><li v-for="c in p.claims" :key="c.id">{{ c.kind==='COMMANDER_AUTHOR_CLAIM'?'棋手':'玩法' }}：{{ c.text }} <a :href="c.sourceUrl" target="_blank" rel="noreferrer">来源</a></li></ul></details></article></div>
 </section>
  </div>
</section>
</template>
<script setup lang="ts">
import {computed,onMounted,onUnmounted,reactive,ref,watch} from 'vue'
import {uploadEvidence} from '../api/index'
import {researchApi} from '../api/prediction'
import {getPlayerAvatar} from '../utils/player-avatar'

const activeTab = ref<'instant' | 'audit'>('instant')
const batchPasteText = ref('')
type CatalogProfile = {
  id: string
  personUid?: string
  nickname: string
  badgeLabel?: string | null
  linkedNicknames?: string[]
}
type RawPlayerRow = {id: string; nickname: string; canonicalId: string; personUid?: string}
type CatalogSeat = {reviewedCommander?: string | null}
type BuildProjection = {personalSamples: number; commanderSamples: number; commanderWins?: number; unknownShare: number; candidates: {build: string; share: number}[]}

interface Candidate {id:string;nickname:string;similarity:number}
interface Draft {id:string;featureCutoff:string;ocr:{phaseHint:string;rows:{rawText:string;candidates:Candidate[]}[]}}
interface Sample {wins:number;observations:number}
interface TalentProjection {
  buildSamples: number
  talentSamples: number
  candidates: {build: string; talent: string; observations: number; buildSamples: number}[]
}
interface RankFeedbackEntry {
  profileId: string
  personUid?: string
  nickname: string
  samples3: number
  samples7: number
  average3: number | null
  average7: number
  weightedGap: number
  accounts?: RankFeedbackAccount[]
  probabilityBefore?: number | null
}
interface RankFeedbackAccount {
  key: string
  account: {platform: string; region: string; uid: string; credentialType?: string} | null
  samples3: number
  samples7: number
  profiles: {profileId: string; nickname: string; sourceAuthor: string | null; samples3: number; samples7: number}[]
}
interface RankFeedbackWindow {
  live: number
  replayed: number
  red: RankFeedbackEntry[]
  black: RankFeedbackEntry[]
}
interface RankFeedbackBoard {
  generated?: boolean
  settledMatches?: number
  windows: Record<'recent3' | 'recent7', RankFeedbackWindow>
}
interface WinnerModel {
  status: string
  cutoff: string
  buildProjections: BuildProjection[]
  talentProjections?: {version: string | null; players: TalentProjection[]}
  rankFeedback?: {settledMatches: number; players: (RankFeedbackEntry | null)[]}
  modelVersion: string
  trainingMatches: number
  notice: string
  players: {nickname: string; probability: number | null; historicalMatches: number; historicalWins: number}[]
}
interface Result {status:string;notice:string;featureCutoff:string;blockers:string[];players:{nickname:string;profileNickname:string|null;recent7:Sample;recent7Matches?:{matchId:string|null;day:string;ordinal:number|null;build:string|null;commander:string|null;winner:boolean;sourceUrl:string|null}[];recent30:Sample;buildRates:{label:string;wins:number;observations:number;observedWinShare:number}[];claims:{id:string;kind:string;text:string;sourceUrl:string}[]}[]}
const capturedAt=ref('')
const file=ref<File|null>(null),operator=ref(''),evidenceId=ref(''),busy=ref(false),error=ref(''),draft=ref<Draft|null>(null),result=ref<Result|null>(null),confirmed=ref(false)
const savedAnalysisId=ref('')
const identity = reactive({
  profileId:'',uid:'',platform:'',region:'',evidenceId:'',personProfileId:'',reviewNote:'',identityConfirmed:false,
})
const identityBusy = ref(false)
const identityStatus = ref('')
const emptySeat = () => ({profileId: '', commander: ''})
const emptyAuditSeat = () => ({profileId: '', nickname: ''})
const bannedFaction = ref('')
const profiles = ref<CatalogProfile[]>([])
const rawPlayers = ref<RawPlayerRow[]>([])
const players = ref(Array.from({length: 6}, emptySeat))
const auditPlayers = ref(Array.from({length: 6}, emptyAuditSeat))
const profileNames = computed(() => new Map(profiles.value.map(profile => [profile.id, profile.nickname])))
const selectablePlayerNames = computed(() => {
  const names = new Set<string>()
  for (const p of profiles.value) {
    names.add(p.nickname)
    for (const alias of p.linkedNicknames ?? []) names.add(alias)
  }
  return [...names]
})
const rawPlayerNames = computed(() => {
  const names = new Set<string>(rawPlayers.value.map(r => r.nickname))
  for (const n of selectablePlayerNames.value) names.add(n)
  return [...names].sort((a, b) => a.localeCompare(b, 'zh-CN'))
})
const nickToId = computed(() => {
  const map = new Map<string, string>()
  for (const profile of profiles.value) {
    map.set(profile.nickname, profile.id)
    if (profile.personUid) map.set(profile.personUid.toUpperCase(), profile.id)
    for (const alias of profile.linkedNicknames ?? []) {
      if (!map.has(alias)) map.set(alias, profile.id)
    }
  }
  for (const raw of rawPlayers.value) {
    if (!map.has(raw.nickname)) map.set(raw.nickname, raw.canonicalId)
  }
  return map
})
const hasDuplicateIds = computed(() => {
  const ids = players.value.map(player => {
    const val = player.profileId.trim()
    return nickToId.value.get(val) ?? val
  }).filter(Boolean)
  return new Set(ids).size !== ids.length
})
const canForecast = computed(() => Boolean(bannedFaction.value.trim()) && !hasDuplicateIds.value &&
  players.value.every(player => player.profileId.trim() && player.commander.trim()))

async function loadSaved() {
  busy.value = true
  error.value = ''
  result.value = null
  draft.value = null
  confirmed.value = false
  try {
    result.value = await researchApi<Result>(`screenshot-analyses/${encodeURIComponent(savedAnalysisId.value.trim())}`)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '读取失败'
  } finally {
    busy.value = false
  }
}
const blockerNames:Record<string,string>={UNCALIBRATED_MODEL:'尚未完成时间回测和概率校准',UNCONFIRMED_HISTORICAL_IDENTITIES:'历史账号身份未确认，昵称不等于稳定UID',UNKNOWN_HISTORICAL_MODE_VERSION:'历史模式和游戏版本未核全',UNVERIFIED_SOURCE_RESULTS:'来源赛果尚未完成独立核验',UNMATCHED_PLAYER:'有选手未匹配历史档案',INCOMPLETE_SOURCE_COVERAGE:'历史来源尚未采集齐全',SCREENSHOT_HAS_POSTMATCH_INDICATORS:'截图存在赛后标记'}
const normalize=(s:string)=>s.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase()
function candidates(name: string) {
  const ids = new Set(draft.value?.ocr.rows.find(row => row.rawText === name)?.candidates.map(candidate => candidate.id) ?? [])
  const query = normalize(name)
  return profiles.value.filter(profile => !query || normalize(profile.nickname).includes(query) ||
    query.includes(normalize(profile.nickname)) || ids.has(profile.id))
}

function selectFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null
  draft.value = null
  result.value = null
  evidenceId.value = ''
  confirmed.value = false
}

async function read() {
  if (!file.value) return
  busy.value = true
  error.value = ''
  draft.value = null
  result.value = null
  confirmed.value = false
  try {
    const uploaded = await uploadEvidence(file.value, {capturedAt: new Date(capturedAt.value).toISOString(),
      providedBy: operator.value, kind: 'CONTENT_ASSET', usageScope: 'INTERNAL_ONLY', note: '对局资料核对原件'})
    evidenceId.value = uploaded.evidenceId
    draft.value = await researchApi<Draft>('screenshots', {evidenceId: uploaded.evidenceId})
    auditPlayers.value = Array.from({length: 6}, (_, index) => ({
      ...emptyAuditSeat(), nickname: draft.value?.ocr.rows[index]?.rawText ?? ''
    }))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '识别失败'
  } finally {
    busy.value = false
  }
}

async function analyze() {
  if (!draft.value || !confirmed.value) return
  busy.value = true
  error.value = ''
  result.value = null
  try {
    result.value = await researchApi<Result>(`screenshots/${draft.value.id}/analyze`, {
      identityConfirmed: true, operator: operator.value,
      players: auditPlayers.value.map(player => ({nickname: player.nickname, profileId: player.profileId || null}))
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '资料核对失败'
  } finally {
    busy.value = false
  }
}
const catalogOptions = ref<{bans: string[]; commanders: string[]}>({bans: [], commanders: []})
const forecast = ref<WinnerModel | null>(null)
const forecastBusy = ref(false)
const forecastError = ref('')
const rankFeedback = ref<RankFeedbackBoard | null>(null)
const rankWindow = ref<'recent3' | 'recent7'>('recent7')
const activeRankWindow = computed(() => rankFeedback.value?.windows[rankWindow.value])
const rankFeedbackBusy = ref(false)
const rankFeedbackError = ref('')
const rankFeedbackGeneration = ref('')
const rankFeedbackGeneratedOnce = ref(false)
const isRankFeedbackGenerated = computed(() => {
  if (rankFeedbackGeneratedOnce.value) return true
  const board = rankFeedback.value
  if (!board) return false
  if (board.generated) return true
  const w7 = board.windows.recent7
  const w3 = board.windows.recent3
  return (w7?.replayed ?? 0) > 0 || (w3?.replayed ?? 0) > 0
})
let forecastRequest = 0

function signed(value: number) {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`
}

function formatAccountLine(account: NonNullable<RankFeedbackAccount['account']>) {
  if (account.credentialType && account.credentialType !== 'GAME_UID') {
    return `${account.region} #${account.uid}`
  }
  return `${account.platform} / ${account.region} · UID ${account.uid}`
}

function primaryBadgeLabel(row: RankFeedbackEntry) {
  const hit = row.accounts?.find(entry => entry.account)
  if (!hit?.account) return null
  if (hit.account.credentialType && hit.account.credentialType !== 'GAME_UID') {
    return `${hit.account.region} #${hit.account.uid}`
  }
  return `UID ${hit.account.uid}`
}

function accountSummary(accounts: RankFeedbackAccount[]) {
  const verified = accounts.filter(row => row.account)
  const profilesCount = accounts.reduce((sum, row) => sum + row.profiles.length, 0)
  if (verified.length) {
    const first = verified[0].account!
    if (first.credentialType && first.credentialType !== 'GAME_UID') {
      return `已核验 ${first.region} #${first.uid} · ${profilesCount} 份档案`
    }
    return `${verified.length} 个已核验账号 · ${profilesCount} 份档案`
  }
  return profilesCount > 1
    ? `已归集 ${profilesCount} 个曾用名档案`
    : '1 份来源档案 · 展开查看明细'
}

const quickMerge = reactive({
  aliasPlayer: '',
  canonicalPlayer: '',
  credentialType: '',
  credentialValue: '',
})
const mergeBusy = ref(false)
const mergeStatus = ref('')
const mergeIsError = ref(false)

async function refreshCatalogData() {
  const catalog = await researchApi<{
    players: CatalogProfile[]
    rawPlayers?: RawPlayerRow[]
    matches?: {ban?: string | null; seats: CatalogSeat[]}[]
  }>('catalog')
  profiles.value = catalog.players ?? []
  rawPlayers.value = catalog.rawPlayers ?? []
  const matches = catalog.matches ?? []
  const seats = matches.flatMap(match => match.seats)
  const labels = (values: (string | null | undefined)[]) =>
    [...new Set(values.filter((value): value is string => Boolean(value && value !== 'UNKNOWN')))].sort()
  catalogOptions.value = {
    bans: labels(matches.map(match => match.ban)),
    commanders: labels(seats.map(seat => seat.reviewedCommander))
  }
}

async function runSyncVerifiedIdentities() {
  if (mergeBusy.value) return
  mergeBusy.value = true
  mergeStatus.value = ''
  mergeIsError.value = false
  try {
    const res = await researchApi<{
      linkedGroups: number
      linkedAliases: number
      registeredBadges: number
      skippedConflicts: {group: string; alias: string; day: string}[]
    }>('player-links/sync-verified', {})
    await refreshCatalogData()
    if (rankFeedback.value) await loadRankFeedback(false)
    const parts = [
      `同步完成：归并 ${res.linkedGroups} 组选手（新增关联 ${res.linkedAliases} 个改名档案）`,
      res.registeredBadges ? `登记唯一称号凭证 ${res.registeredBadges} 条` : '',
      res.skippedConflicts.length ? `自动拦截同场冲突 ${res.skippedConflicts.length} 条` : '',
    ].filter(Boolean)
    mergeStatus.value = parts.join(' · ')
  } catch (cause) {
    mergeIsError.value = true
    mergeStatus.value = cause instanceof Error ? cause.message : '同步改名库失败'
  } finally {
    mergeBusy.value = false
  }
}

async function submitQuickAliasMerge() {
  if (mergeBusy.value || !quickMerge.aliasPlayer || !quickMerge.canonicalPlayer) return
  mergeBusy.value = true
  mergeStatus.value = ''
  mergeIsError.value = false
  try {
    const res = await researchApi<{
      linked: boolean
      alreadyLinked: boolean
      aliasNickname: string
      canonicalNickname: string
      personUid: string
      badge: string | null
    }>('player-links', {
      aliasPlayer: quickMerge.aliasPlayer,
      canonicalPlayer: quickMerge.canonicalPlayer,
      ...(quickMerge.credentialType && quickMerge.credentialValue
        ? { credentialType: quickMerge.credentialType, credentialValue: quickMerge.credentialValue }
        : {})
    })
    await refreshCatalogData()
    if (rankFeedback.value) await loadRankFeedback(false)
    mergeStatus.value = res.alreadyLinked && !res.badge
      ? `「${res.aliasNickname}」已在主选手「${res.canonicalNickname}」（${res.personUid}）名下。`
      : `已将「${res.aliasNickname}」归并至「${res.canonicalNickname}」· 唯一码 ${res.personUid}${res.badge ? ` · 凭证 ${res.badge}` : ''}`
    quickMerge.aliasPlayer = ''
    quickMerge.credentialValue = ''
  } catch (cause) {
    mergeIsError.value = true
    mergeStatus.value = cause instanceof Error ? cause.message : '归并失败'
  } finally {
    mergeBusy.value = false
  }
}

async function saveAccountIdentity() {
  if (identityBusy.value || !identity.identityConfirmed) return
  identityBusy.value = true
  identityStatus.value = ''
  try {
    const saved = await researchApi<{personProfileId: string}>('account-identities',{...identity})
    identityStatus.value = `已登记，所属选手档案 ${profileNames.value.get(saved.personProfileId) ?? saved.personProfileId}。`
    identity.identityConfirmed = false
    if (rankFeedback.value) await loadRankFeedback(false)
  } catch (cause) {
    identityStatus.value = cause instanceof Error ? cause.message : '账号登记失败'
  } finally {
    identityBusy.value = false
  }
}

async function findAccountIdentity() {
  if (identityBusy.value) return
  identityBusy.value = true
  identityStatus.value = ''
  try {
    const {platform,region,uid} = identity
    const result = await researchApi<{profiles: {personNickname: string; personProfileId: string; nickname: string}[]}>(
      'account-identities/lookup',{platform,region,uid})
    const people = new Set(result.profiles.map(profile => profile.personProfileId))
    const owner = result.profiles[0]
    identityStatus.value = !owner ? '该 UID 暂无核验记录。'
      : people.size > 1 ? '该 UID 的选手归属有冲突，请复核。'
      : `所属选手 ${owner.personNickname} · 档案 ID ${owner.personProfileId} · 已登记昵称 ${[...new Set(result.profiles.map(profile=>profile.nickname))].join('、')}`
  } catch (cause) {
    identityStatus.value = cause instanceof Error ? cause.message : 'UID 查询失败'
  } finally {
    identityBusy.value = false
  }
}

function rankAdjustmentLabel(row: RankFeedbackEntry | null | undefined, probability: number | null) {
  if (!row) return '无已核对样本'
  const sample = `${signed(row.weightedGap)} 名 · ${row.samples7} 场`
  return probability == null || row.probabilityBefore == null
    ? sample
    : `${sample} · ${signed((probability - row.probabilityBefore) * 100)} 个百分点`
}

function onRankFeedbackToggle(event: Event) {
  if ((event.currentTarget as HTMLDetailsElement).open) void loadRankFeedback(false)
}

async function loadRankFeedback(generate: boolean) {
  if (rankFeedbackBusy.value) return
  if (generate && isRankFeedbackGenerated.value) return
  rankFeedbackBusy.value = true
  rankFeedbackError.value = ''
  rankFeedbackGeneration.value = ''
  try {
    if (generate) {
      const result = await researchApi<{board: RankFeedbackBoard; generation: {
        generated: number; unchanged: number; live: number; withdrawn: number; skipped: unknown[]
      }}>(
        'rank-feedback/generate', {})
      rankFeedback.value = result.board
      rankFeedbackGeneratedOnce.value = true
      const {generated, unchanged, live, withdrawn, skipped} = result.generation
      rankFeedbackGeneration.value = [
        `新增或更新 ${generated} 场`, `重算后无变化 ${unchanged} 场`, `保留真实快照 ${live} 场`,
        withdrawn ? `撤下过期补算 ${withdrawn} 场` : '',
        skipped.length ? `${skipped.length} 场暂缺生成条件` : '',
      ].filter(Boolean).join(' · ')
    } else {
      rankFeedback.value = await researchApi<RankFeedbackBoard>('rank-feedback')
    }
  } catch (cause) {
    rankFeedbackError.value = cause instanceof Error ? cause.message : '红黑榜加载失败'
  } finally {
    rankFeedbackBusy.value = false
  }
}

watch([players, bannedFaction], () => {
  forecastRequest++
  forecast.value = null
  forecastBusy.value = false
  forecastError.value = ''
}, {deep: true, flush: 'sync'})

function lineupLabel(projection?: BuildProjection) {
  if (!projection?.candidates.length) return '阵容待确认'
  const candidates = projection.candidates.slice(0, 3).map(candidate =>
    `${candidate.build} ${(candidate.share * 100).toFixed(1)}%`
  )
  if (projection.unknownShare > 0) candidates.push(`未知 ${(projection.unknownShare * 100).toFixed(1)}%`)
  return candidates.join('、')
}

function talentLabel(projection?: TalentProjection) {
  if (!projection?.candidates.length) return '天赋待确认'
  return [...new Set(projection.candidates.map(candidate => candidate.talent))].slice(0, 3).join('、')
}

function probabilityLabel(probability?: number | null) {
  return probability == null ? '未计算' : `${(probability * 100).toFixed(2)}%`
}

function formatCutoff(cutoff?: string) {
  return cutoff ? new Date(cutoff).toLocaleString('zh-CN') : ''
}

function applyBatchPaste() {
  const names = batchPasteText.value.trim().split(/[,，、\s]+/).filter(Boolean)
  if (names.length > 6) {
    forecastError.value = '批量名单最多包含六位选手。'
    return
  }
  players.value = Array.from({length: 6}, (_, index) => ({...emptySeat(), profileId: names[index] ?? ''}))
}

function clearRoster() {
  batchPasteText.value = ''
  players.value = Array.from({length: 6}, emptySeat)
}

async function runForecast() {
  if (!canForecast.value) return
  const request = ++forecastRequest
  forecastBusy.value = true
  forecast.value = null
  forecastError.value = ''
  try {
    const model = await researchApi<WinnerModel>('forecast', {
      bannedFaction: bannedFaction.value.trim() === '无禁用' ? null : bannedFaction.value.trim(),
      players: players.value.map(player => {
        const val = player.profileId.trim()
        const resolvedId = nickToId.value.get(val) ?? val
        return { profileId: resolvedId, commander: player.commander.trim() }
      })
    })
    if (request === forecastRequest) forecast.value = model
  } catch (error) {
    if (request === forecastRequest) forecastError.value = error instanceof Error ? error.message : '预测失败'
  } finally {
    if (request === forecastRequest) forecastBusy.value = false
  }
}

function handleGlobalPaste(event: ClipboardEvent) {
  const item = [...(event.clipboardData?.items ?? [])].find(entry => entry.type.startsWith('image/'))
  if (!item) return
  const screenshot = item.getAsFile()
  if (!screenshot) return
  activeTab.value = 'audit'
  file.value = screenshot
  draft.value = null
  result.value = null
  confirmed.value = false
}

onMounted(async () => {
  window.addEventListener('paste', handleGlobalPaste)
  try {
    await refreshCatalogData()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '档案加载失败'
    forecastError.value = error.value
  }
})
onUnmounted(() => window.removeEventListener('paste', handleGlobalPaste))
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

  button {
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

    &[aria-pressed="true"] {
      background: $bg-surface;
      color: $color-primary;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
      font-weight: 700;
    }
  }
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

.shot-model,
.talent-panel {
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

.talent-panel {
  overflow-x: auto;

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th, td {
    padding: 6px 10px;
    text-align: left;
    vertical-align: top;
  }

  small {
    display: block;
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

.forecast-batch,
.forecast-fields,
.forecast-roster {
  display: grid;
  gap: 14px;
  margin-bottom: 18px;
}

.forecast-batch {
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: end;
}

.forecast-fields {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.forecast-roster {
  grid-template-columns: repeat(3, minmax(0, 1fr));

  @media (max-width: 960px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
}

.forecast-seat {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 10px;
  margin: 0 !important;
  padding: 16px !important;
  background: $bg-surface !important;
  border: 1px solid $border-subtle !important;
  border-radius: $radius-md !important;
  box-shadow: $shadow-xs;
  transition: $transition-base;

  &:hover {
    border-color: $border-hover !important;
    box-shadow: $shadow-sm;
  }

  &:focus-within {
    border-color: rgba($color-primary, 0.45) !important;
    box-shadow: 0 2px 10px rgba(30, 70, 58, 0.08);
  }

  legend {
    padding: 2px 10px !important;
    font-size: 12px !important;
    font-weight: 700 !important;
    color: $color-primary !important;
    background: $color-primary-light;
    border-radius: $radius-full;
  }
}

.forecast-batch label,
.forecast-fields label,
.forecast-seat label {
  display: grid;
  gap: 6px;
  color: $text-secondary;
  font-size: 12.5px;
  font-weight: 600;
}

.forecast-batch input,
.forecast-fields input,
.forecast-fields select,
.forecast-seat input,
.forecast-seat select {
  width: 100%;
  box-sizing: border-box;
}

.shot-workbench .forecast-submit {
  @include button-primary;
  padding: 10px 24px;
  font-size: 14px;
  font-weight: 600;
  min-height: 42px;
  color: $text-inverse;
  background: linear-gradient(135deg, $color-primary 0%, $color-primary-dark 100%);
  box-shadow: 0 2px 6px rgba(30, 70, 58, 0.22);

  &:hover:not(:disabled) {
    color: $text-inverse;
    transform: translateY(-1px);
    box-shadow: 0 4px 10px rgba(30, 70, 58, 0.28);
  }

  &:disabled {
    color: $text-inverse;
    opacity: 0.55;
    box-shadow: none;
  }
}

.account-identity {
  margin-top: 18px;
  padding: 16px 20px;
  background: $bg-canvas;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;

  > summary {
    cursor: pointer;
    font-size: 14px;
    font-weight: 700;
    color: $color-primary;
    user-select: none;
  }
}

.identity-merge-panel,
.rank-feedback {
  margin-top: 18px;
  background: $bg-surface;
  border: 1px solid $border-subtle;
  border-radius: $radius-lg;
  box-shadow: $shadow-xs;
  overflow: hidden;

  .rank-feedback-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    padding: 15px 20px;
    background: linear-gradient(180deg, #fafcfb 0%, #f3f7f5 100%);
    cursor: pointer;
    user-select: none;
    list-style: none;
    transition: $transition-fast;

    &::-webkit-details-marker {
      display: none;
    }

    &:hover {
      background: #eef4f1;
    }

    .summary-title {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 700;
      color: $text-primary;

      &::before {
        content: '▸';
        display: inline-block;
        font-size: 13px;
        color: $color-primary;
        transition: transform 0.2s $ease-bounce;
      }
    }

    .summary-sub {
      font-size: 12px;
      font-weight: 500;
      color: $text-muted;
    }
  }

  &[open] .rank-feedback-summary {
    border-bottom: 1px solid $border-subtle;

    .summary-title::before {
      transform: rotate(90deg);
    }
  }
}

.identity-merge-body {
  padding: 16px 20px 18px;
}

.merge-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;

  .merge-desc {
    flex: 1;
    min-width: 240px;
    margin: 0;
    font-size: 12.5px;
    color: $text-secondary;
    line-height: 1.6;

    code {
      font-family: $font-mono;
      font-size: 11.5px;
      padding: 1px 5px;
      background: $bg-subtle;
      border-radius: $radius-xs;
      color: $color-primary;
    }
  }

  .btn-sync-identities {
    background-color: $color-primary-light;
    color: $color-primary;
    border-color: rgba($color-primary, 0.28);
    font-weight: 600;

    &:hover:not(:disabled) {
      background-color: $color-primary;
      color: $text-inverse;
      border-color: $color-primary;
    }
  }
}

.quick-merge-form {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
  gap: 10px;
  align-items: end;
  padding: 14px;
  background: $bg-canvas;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;

  .btn-quick-merge {
    min-height: 38px;
    padding: 8px 16px;
    font-weight: 600;
    background-color: $color-primary;
    color: $text-inverse;
    border-color: $color-primary;

    &:hover:not(:disabled) {
      background-color: $color-primary-hover;
      color: $text-inverse;
    }
  }

  @media (max-width: 1024px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    .btn-quick-merge {
      grid-column: 1 / -1;
      width: 100%;
    }
  }

  @media (max-width: $bp-sm) {
    grid-template-columns: 1fr;
  }
}

.merge-feedback {
  margin: 12px 0 0;
  padding: 10px 14px;
  font-size: 12.5px;
  font-weight: 500;
  color: $color-success;
  background: $color-success-light;
  border: 1px solid $color-success-border;
  border-radius: $radius-sm;

  &.is-error {
    color: $color-danger;
    background: $color-danger-light;
    border-color: $color-danger-border;
  }
}

.rank-feedback-body {
  padding: 18px 20px 20px;
}

.rank-feedback-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}

.rank-feedback-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;

  label {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: $text-secondary;
  }

  select {
    width: auto;
    min-width: 124px;
    padding: 7px 12px;
  }

  .btn-rank-generate {
    padding: 7px 14px;
    font-size: 12.5px;
    font-weight: 600;

    &:not(.is-generated):not(:disabled) {
      background-color: $color-primary-light;
      color: $color-primary;
      border-color: rgba($color-primary, 0.28);

      &:hover {
        background-color: $color-primary;
        color: $text-inverse;
        border-color: $color-primary;
      }
    }

    &.is-generated {
      background-color: $bg-subtle;
      color: $color-primary;
      border-color: rgba($color-primary, 0.2);
      opacity: 0.85;
      cursor: default;
    }
  }
}

.rank-meta-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;

  .meta-chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 500;
    color: $text-secondary;
    background: $bg-subtle;
    border: 1px solid $border-subtle;
    border-radius: $radius-full;
    font-variant-numeric: tabular-nums;

    &.is-weight {
      background: $color-primary-light;
      color: $color-primary-dark;
      border-color: rgba($color-primary, 0.16);
      font-weight: 600;
    }
  }
}

.rank-status-msg,
.rank-empty-notice {
  margin: 8px 0 0;
  padding: 20px;
  text-align: center;
  font-size: 13px;
  color: $text-muted;
  background: $bg-canvas;
  border: 1px dashed $border-hover;
  border-radius: $radius-md;
}

.rank-error-msg {
  margin: 8px 0 0;
  padding: 12px 14px;
  font-size: 13px;
  color: $color-danger;
  background: $color-danger-light;
  border: 1px solid $color-danger-border;
  border-radius: $radius-md;
}

.rank-gen-banner {
  margin: 0 0 14px;
  padding: 10px 14px;
  font-size: 12.5px;
  font-weight: 500;
  color: $color-success;
  background: $color-success-light;
  border: 1px solid $color-success-border;
  border-radius: $radius-sm;
}

.rank-dual-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;

  @media (max-width: 920px) {
    grid-template-columns: 1fr;
  }
}

.rank-column {
  min-width: 0;
  background: $bg-surface;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  overflow: hidden;

  &.is-red {
    border-color: rgba(#dc2626, 0.22);

    .rank-col-header {
      background: linear-gradient(135deg, #fff5f5 0%, #fef7ee 100%);
      border-bottom: 1px solid rgba(#dc2626, 0.14);
    }

    .col-dot {
      background: #dc2626;
      box-shadow: 0 0 0 3px rgba(#dc2626, 0.16);
    }

    .col-title-wrap h4 {
      color: #991b1b;
    }

    .col-count-pill {
      color: #b91c1c;
      background: rgba(#dc2626, 0.1);
      border-color: rgba(#dc2626, 0.2);
    }
  }

  &.is-black {
    border-color: #cbd5e1;

    .rank-col-header {
      background: linear-gradient(135deg, #f1f5f9 0%, #f8fafc 100%);
      border-bottom: 1px solid #e2e8f0;
    }

    .col-dot {
      background: #334155;
      box-shadow: 0 0 0 3px rgba(#334155, 0.15);
    }

    .col-title-wrap h4 {
      color: #1e293b;
    }

    .col-count-pill {
      color: #334155;
      background: #e2e8f0;
      border-color: #cbd5e1;
    }
  }
}

.rank-col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;

  .col-title-wrap {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;

    .col-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    h4 {
      margin: 0;
      font-size: 14.5px;
      font-weight: 800;
    }

    small {
      font-size: 11.5px;
      color: $text-muted;
    }
  }

  .col-count-pill {
    flex-shrink: 0;
    padding: 2px 9px;
    font-size: 11.5px;
    font-weight: 700;
    border: 1px solid transparent;
    border-radius: $radius-full;
    font-variant-numeric: tabular-nums;
  }
}

.rank-col-table-wrap {
  @include table-scroll-wrap;
  max-height: 460px;
  overflow-y: auto;
}

.rank-col-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  text-align: left;

  thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    padding: 8px 12px;
    font-size: 11.5px;
    font-weight: 600;
    color: $text-muted;
    background: #fafcfb;
    border-bottom: 1px solid $border-subtle;
    white-space: nowrap;
  }

  tbody tr {
    border-bottom: 1px solid $border-subtle;
    transition: background-color 0.14s ease;

    &:last-child {
      border-bottom: none;
    }

    &:hover {
      background-color: $bg-card-hover;
    }
  }

  th,
  td {
    padding: 10px 12px;
    vertical-align: top;
  }

  .num-col {
    text-align: right;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    vertical-align: middle;
  }

  .player-info-cell {
    min-width: 170px;
    font-weight: 500;
  }

  .player-main-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .uid-chip {
    display: inline-flex;
    align-items: center;
    padding: 1px 6px;
    font-family: $font-mono;
    font-size: 10.5px;
    font-weight: 600;
    color: $text-muted;
    background: $bg-subtle;
    border: 1px solid $border-subtle;
    border-radius: $radius-xs;

    &.is-badge {
      font-family: $font-sans;
      color: $color-accent-dark;
      background: $color-accent-light;
      border-color: $color-warning-border;
    }
  }

  .rank-order-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    font-size: 11px;
    font-weight: 700;
    color: $text-secondary;
    background: $bg-subtle;
    border-radius: $radius-xs;
    flex-shrink: 0;
  }

  .rank-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    flex-shrink: 0;
    background: $bg-subtle;
    border: 1px solid $border-subtle;
  }

  .rank-player-name {
    font-size: 13px;
    font-weight: 700;
    color: $text-primary;
  }

  .rank-source-details {
    margin-top: 4px;
    padding-left: 28px;
    font-size: 11.5px;
    font-weight: 400;
    color: $text-muted;

    summary {
      cursor: pointer;
      user-select: none;
      color: $text-secondary;

      &:hover {
        color: $color-primary;
      }
    }
  }

  .rank-no-source {
    display: block;
    margin-top: 3px;
    padding-left: 28px;
    font-size: 11px;
    color: $text-placeholder;
  }
}

.gap-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 700;
  border-radius: $radius-full;

  &.is-red {
    color: #b91c1c;
    background: #fef2f2;
    border: 1px solid #fecaca;
  }

  &.is-black {
    color: #334155;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
  }
}

.rank-col-empty {
  padding: 28px 16px;
  text-align: center;
  font-size: 12.5px;
  color: $text-muted;
}

.rank-account-list {
  margin: 5px 0 0;
  padding-left: 14px;
  font-size: 11.5px;
  line-height: 1.55;
  color: $text-secondary;
}

.forecast-result {
  margin-top: 20px;
}

.forecast-table {
  @include table-scroll-wrap;
  margin-top: 12px;
  background: $bg-surface;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;

  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
    font-size: 13px;
  }

  th,
  td {
    border-bottom: 1px solid $border-subtle;
    padding: 10px 12px;
    white-space: nowrap;
  }

  thead th {
    background: $bg-subtle;
    color: $text-secondary;
    font-size: 12px;
    font-weight: 600;
  }

  tbody tr:last-child td,
  tbody tr:last-child th {
    border-bottom: none;
  }

  tbody tr:hover td,
  tbody tr:hover th {
    background: $bg-card-hover;
  }
}

@media (max-width: $bp-md) {
  .shot-workbench {
    padding: 16px;
    margin: 12px 0;
  }

  .workbench-header-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 14px;

    h2 {
      font-size: 18px;
    }
  }

  .workbench-tabs {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;

    button {
      padding: 9px 10px;
      font-size: 13px;
      text-align: center;
    }
  }

  .shot-upload,
  .shot-meta,
  .shot-profiles,
  .shot-seat,
  .shot-seat-context {
    grid-template-columns: 1fr;
  }

  .shot-restore {
    align-items: stretch;
    flex-direction: column;
    padding: 14px;
  }

  .forecast-batch {
    grid-template-columns: 1fr 1fr;
    gap: 10px;

    label {
      grid-column: 1 / -1;
    }

    button {
      min-height: 40px;
    }
  }

  .forecast-submit {
    width: 100%;
    min-height: 44px;
  }

  .account-identity {
    padding: 14px;
  }

  .rank-feedback {
    .rank-feedback-summary {
      padding: 14px;
    }

    .rank-feedback-body {
      padding: 14px;
    }
  }

  .rank-feedback-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .rank-feedback-controls {
    flex-direction: column;
    align-items: stretch;

    label {
      justify-content: space-between;
    }

    .btn-rank-generate {
      width: 100%;
      min-height: 40px;
    }
  }

  .rank-meta-strip .meta-chip {
    width: 100%;
    justify-content: center;
  }

  .shot-model,
  .talent-panel {
    padding: 14px 16px;
  }

  .forecast-table {
    table {
      font-size: 12.5px;
    }

    th,
    td {
      padding: 8px 10px;
    }
  }
}
</style>
