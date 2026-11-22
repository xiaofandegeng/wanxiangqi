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
      <label>批量选手 ID<input v-model="batchPasteText" placeholder="按换行、逗号或空格分隔六个档案 ID" @keydown.enter.prevent="applyBatchPaste"></label>
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
    <datalist id="forecast-players"><option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.nickname }}</option></datalist>

    <div class="forecast-roster">
      <fieldset v-for="(player, i) in players" :key="i" class="forecast-seat">
        <legend>第 {{ i + 1 }} 席</legend>
        <label>选手档案 ID<input v-model="player.profileId" list="forecast-players" maxlength="160"></label>
        <span v-if="profileNames.get(player.profileId.trim())">{{ profileNames.get(player.profileId.trim()) }}</span>
        <label>本场棋手<input v-model="player.commander" list="forecast-commanders" maxlength="160"></label>
      </fieldset>
    </div>
    <p v-if="hasDuplicateIds" role="alert">同一档案只能填入一个席位。</p>
    <button type="button" class="forecast-submit" :disabled="forecastBusy || !canForecast" @click="runForecast">
      {{ forecastBusy ? '正在读取数据库并计算…' : '计算赛前预测' }}
    </button>
    <p v-if="forecastError" role="alert">{{ forecastError }}</p>

    <section v-if="forecast" class="shot-model forecast-result" aria-live="polite">
      <h3>{{ forecast.status === 'INSUFFICIENT_DATABASE_HISTORY' ? '样本不足 · 阵容推测' : '本场预测' }}</h3>
      <p>{{ forecast.notice }}</p>
      <p>{{ forecast.trainingMatches }} 场入库训练记录 · {{ forecast.modelVersion }} · 截止 {{ formatCutoff(forecast.cutoff) }}</p>
      <div class="forecast-table">
        <table>
          <thead><tr><th>席位</th><th>选手</th><th>本场棋手</th><th>入库战绩</th><th>同棋手阵容战绩</th><th>阵容倾向</th><th>天赋推测</th><th>夺冠概率</th></tr></thead>
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
import {computed,onMounted,onUnmounted,ref,watch} from 'vue'
import {uploadEvidence} from '../api/index'
import {researchApi} from '../api/prediction'

const activeTab = ref<'instant' | 'audit'>('instant')
const batchPasteText = ref('')
type CatalogProfile = {id: string; nickname: string}
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
interface WinnerModel {
  status: string
  cutoff: string
  buildProjections: BuildProjection[]
  talentProjections?: {version: string | null; players: TalentProjection[]}
  modelVersion: string
  trainingMatches: number
  notice: string
  players: {nickname: string; probability: number | null; historicalMatches: number; historicalWins: number}[]
}
interface Result {status:string;notice:string;featureCutoff:string;blockers:string[];players:{nickname:string;profileNickname:string|null;recent7:Sample;recent7Matches?:{matchId:string|null;day:string;ordinal:number|null;build:string|null;commander:string|null;winner:boolean;sourceUrl:string|null}[];recent30:Sample;buildRates:{label:string;wins:number;observations:number;observedWinShare:number}[];claims:{id:string;kind:string;text:string;sourceUrl:string}[]}[]}
const capturedAt=ref('')
const file=ref<File|null>(null),operator=ref(''),evidenceId=ref(''),busy=ref(false),error=ref(''),draft=ref<Draft|null>(null),result=ref<Result|null>(null),confirmed=ref(false)
const savedAnalysisId=ref('')
const emptySeat = () => ({profileId: '', commander: ''})
const emptyAuditSeat = () => ({profileId: '', nickname: ''})
const bannedFaction = ref('')
const profiles = ref<CatalogProfile[]>([])
const players = ref(Array.from({length: 6}, emptySeat))
const auditPlayers = ref(Array.from({length: 6}, emptyAuditSeat))
const profileNames = computed(() => new Map(profiles.value.map(profile => [profile.id, profile.nickname])))
const hasDuplicateIds = computed(() => {
  const ids = players.value.map(player => player.profileId.trim()).filter(Boolean)
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
let forecastRequest = 0

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
      players: players.value.map(player => ({profileId: player.profileId.trim(), commander: player.commander.trim()}))
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
    const catalog = await researchApi<{players: CatalogProfile[]; matches?: {ban?: string | null; seats: CatalogSeat[]}[]}>('catalog')
    profiles.value = catalog.players ?? []
    const matches = catalog.matches ?? []
    const seats = matches.flatMap(match => match.seats)
    const labels = (values: (string | null | undefined)[]) => [...new Set(values.filter((value): value is string => Boolean(value && value !== 'UNKNOWN')))].sort()
    catalogOptions.value = {
      bans: labels(matches.map(match => match.ban)),
      commanders: labels(seats.map(seat => seat.reviewedCommander))
    }
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
  gap: 12px;
  margin-bottom: 16px;
}
.forecast-batch {
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: end;
}
.forecast-fields { grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
.forecast-roster { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.forecast-seat {
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 10px;
}
.forecast-batch label,
.forecast-fields label,
.forecast-seat label {
  display: grid;
  gap: 5px;
  color: $text-secondary;
  font-size: 13px;
}
.forecast-batch input,
.forecast-fields input,
.forecast-fields select,
.forecast-seat input,
.forecast-seat select {
  width: 100%;
  box-sizing: border-box;
}
.forecast-submit {
  background: $color-primary;
  color: #fff;
  border-color: transparent;
}
.forecast-submit:disabled { opacity: 0.55; }
.forecast-result { margin-top: 18px; }
.forecast-table { overflow-x: auto; }
.forecast-table table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 13px;
}
.forecast-table th,
.forecast-table td {
  border-bottom: 1px solid $border-subtle;
  padding: 8px 10px;
}
@media (max-width: 768px) {
  .shot-workbench { padding: 16px; }
  .shot-upload, .shot-meta, .shot-profiles, .shot-seat, .shot-seat-context { grid-template-columns: 1fr; }
  .shot-restore { align-items: stretch; flex-direction: column; }
  .forecast-batch { grid-template-columns: 1fr 1fr; }
  .forecast-batch label { grid-column: 1 / -1; }
}
</style>
