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
      <label>批量名单<input v-model="batchPasteText" placeholder="按换行、逗号或空格分隔六位选手" @keydown.enter.prevent="applyBatchPaste"></label>
      <button type="button" @click="applyBatchPaste">填入六席</button>
      <button type="button" @click="clearRoster">清空名单</button>
    </div>
    <div class="forecast-fields">
      <label>阶段<select v-model="analysisPhase"><option value="PREMATCH">赛前</option><option value="IN_PROGRESS">赛中</option></select></label>
      <label>模式<select v-model="mode"><option value="">请选择</option><option value="WANXIANG">万象大赛</option><option value="DIAMOND">钻石狂潮</option></select></label>
      <label>版本<select v-model="version">
        <option value="UNKNOWN">未确认</option>
        <option v-for="release in GAME_VERSIONS" :key="release.version" :value="release.version">{{ release.version }}</option>
      </select></label>
      <label>当场禁用<input v-model="bannedFaction" list="forecast-bans" maxlength="160" placeholder="未知留空"></label>
    </div>
    <datalist id="forecast-bans"><option v-for="ban in catalogOptions.bans" :key="ban" :value="ban" /></datalist>
    <datalist id="forecast-commanders"><option v-for="commander in catalogOptions.commanders" :key="commander" :value="commander" /></datalist>
    <datalist id="forecast-builds"><option v-for="build in catalogOptions.builds" :key="build" :value="build" /></datalist>

    <div class="forecast-roster">
      <fieldset v-for="(player, i) in players" :key="i" class="forecast-seat">
        <legend>第 {{ i + 1 }} 席</legend>
        <label>选手昵称<input v-model="player.nickname" maxlength="160" @input="player.profileId = ''"></label>
        <label v-if="player.nickname.trim()">入库档案
          <select v-model="player.profileId">
            <option value="">按唯一同名档案匹配</option>
            <option v-for="profile in candidates(player.nickname, false)" :key="profile.id" :value="profile.id">{{ profile.nickname }} · {{ profile.observedMatches }} 战{{ profile.author ? ` · ${profile.author}` : '' }}</option>
          </select>
        </label>
        <label>已知棋手<input v-model="player.commander" list="forecast-commanders" maxlength="160" placeholder="未知留空"></label>
        <label>已知阵容<input v-model="player.visiblePlan" list="forecast-builds" maxlength="160" placeholder="未知留空"></label>
        <label v-if="analysisPhase === 'IN_PROGRESS' && mode === 'WANXIANG'">已取得天赋
          <select v-model="player.selectedTalents" multiple size="3">
            <option v-for="(rule, talent) in TALENT_RULES" :key="talent" :value="talent" :title="rule">{{ talent }}</option>
          </select>
        </label>
      </fieldset>
    </div>
    <p v-if="hasDuplicates" role="alert">六席名单存在重复，请先核对。</p>
    <button type="button" class="forecast-submit" :disabled="forecastBusy || !mode || hasDuplicates || players.some(p => !p.nickname.trim())" @click="runForecast">
      {{ forecastBusy ? '正在读取数据库并计算…' : '计算本场预测' }}
    </button>
    <p v-if="forecastError" role="alert">{{ forecastError }}</p>

    <section v-if="forecast" class="shot-model forecast-result" aria-live="polite">
      <h3>{{ forecast.status === 'INSUFFICIENT_DATABASE_HISTORY' ? '样本不足 · 阵容推测' : '本场预测' }}</h3>
      <p>{{ forecast.notice }}</p>
      <p>{{ forecast.trainingMatches }} 场入库训练记录 · {{ forecast.modelVersion }} · 截止 {{ formatCutoff(forecast.cutoff) }}</p>
      <div class="forecast-table">
        <table>
          <thead><tr><th>席位</th><th>选手</th><th>本场棋手</th><th>入库战绩</th><th>同棋手阵容战绩</th><th>阵容倾向</th><th>夺冠概率</th></tr></thead>
          <tbody>
            <tr v-for="(player, i) in forecast.players" :key="i">
              <td>{{ i + 1 }}</td>
              <th scope="row">{{ player.nickname }}</th>
              <td>{{ players[i]?.commander || '未确认' }}</td>
              <td>{{ player.historicalMatches }} 战 {{ player.historicalWins }} 冠</td>
              <td>{{ players[i]?.commander ? `${forecast.buildProjections?.[i]?.commanderSamples ?? 0} 战 ${forecast.buildProjections?.[i]?.commanderWins ?? 0} 冠` : '未选棋手' }}</td>
              <td>{{ lineupLabel(forecast.buildProjections?.[i]) }}</td>
              <td>{{ probabilityLabel(player.probability) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <details v-if="forecast.talentAdjustment">
        <summary>天赋证据</summary>
        <ul>
          <li v-for="(impact, i) in forecast.talentAdjustment.players" :key="i">
            {{ forecast.players[i]?.nickname }} {{ probabilityLabel(impact.baseProbability) }} → {{ probabilityLabel(forecast.players[i]?.probability) }}
            <span v-for="pair in impact.pairs" :key="pair.talent"> · {{ pair.build }} × {{ pair.talent }} {{ pair.wins }}/{{ pair.appearances }} 冠</span>
          </li>
        </ul>
      </details>
    </section>
  </section>

  <!-- 2. 传统截图审计与合规台账模式 (保留完整审计台账流程) -->
  <div v-show="activeTab === 'audit'" class="audit-mode-panel">
  <form class="shot-upload" @submit.prevent="read">
   <label>赛前或赛中截图<input type="file" accept="image/png,image/jpeg,image/webp" @change="selectFile"><small v-if="file">{{ file.name }}</small></label>
   <label>实际截图采集时间<input v-model="capturedAt" type="datetime-local" step="1" :readonly="!!draft" required></label>
   <label>复核人<input v-model="operator" required maxlength="160" placeholder="操作人标识"></label>
   <button class="primary" :disabled="busy||!file">{{ busy?'处理中…':'保存原图并识别' }}</button>
  </form>
  <form class="shot-restore" @submit.prevent="loadSaved"><label>已保存分析编号<input v-model="savedAnalysisId" maxlength="100" placeholder="填写分析编号，恢复当时计算快照"></label><button :disabled="busy||!savedAnalysisId.trim()">载入分析</button></form>
  <p class="muted">原图仅存本机后端与数据库，默认内部使用。当前OCR使用macOS本地Vision；不支持的服务器会明确提示。识别结果必须人工确认。</p>
  <p v-if="error" role="alert">{{ error }}</p><p v-if="evidenceId" class="muted">已保存原件：{{ evidenceId }}；上传不等于材料／赛果核验。</p>
  <template v-if="draft">
   <p class="shot-warning" v-if="draft.ocr.phaseHint==='POSTMATCH_INDICATORS'">图片中识别到赛后标记，仅用于核对文字和历史资料。</p>
   <details><summary>查看OCR原文与候选（{{ draft.ocr.rows.length }}行）</summary><ul><li v-for="(r,i) in draft.ocr.rows" :key="i">{{ r.rawText }} → {{ r.candidates.map(c=>c.nickname).join('、')||'未找到候选' }}</li></ul></details>
   <form class="shot-review" @submit.prevent="analyze">
    <div class="shot-meta">
     <label>本场模式
       <select v-model="mode" required>
         <option value="">请选择</option>
         <option value="WANXIANG">万象大赛</option>
         <option value="DIAMOND">钻石狂潮</option>
       </select>
     </label>
     <label>当前游戏版本
       <select v-model="version" required class="version-select">
         <option v-for="v in GAME_VERSIONS" :key="v.version" :value="v.version">
           {{ v.version }} {{ v.isLatest ? ' (官方最新版本)' : '' }} - {{ v.title }}
         </option>
         <option value="UNKNOWN">其他 / 未登记版本</option>
       </select>
     </label>
    </div>
    <div class="shot-meta"><label v-if="analysisPhase === 'PREMATCH'">截图时支持状态<select v-model="supportStage"><option value="UNKNOWN">不确定</option><option value="OPEN">仍可支持</option><option value="CLOSED">已结束支持</option></select></label><label>截图阶段<select v-model="analysisPhase"><option value="PREMATCH">赛前</option><option value="IN_PROGRESS">赛中</option></select></label><label>当时已揭示的禁用阵营<input v-model="bannedFaction" maxlength="160" placeholder="未显示则留空，不从赛后材料补填"></label></div>
    <p class="muted">填写截图时已确认的棋手和玩法。历史场次的模式与版本仍有缺口，冠军概率基于已入库的来源赛果，天赋调整按版本匹配。</p>
    <fieldset>
     <legend>六人确认（名单序号不是排名）</legend>
     <div class="shot-seat" v-for="(p,i) in players" :key="i">
      <span>{{ i+1 }}</span>
      <label>截图昵称<input v-model="p.nickname" required maxlength="160" @input="p.profileId='';result=null"></label>
      <label>选择历史昵称档案<select v-model="p.profileId" @change="result=null"><option value="">未匹配／没有该选手历史</option><option v-for="profile in candidates(p.nickname)" :key="profile.id" :value="profile.id">{{ profile.nickname }}</option></select></label>
      <div class="shot-seat-context">
       <label>已揭示棋手<input v-model="p.commander" maxlength="160" placeholder="未显示棋手则留空"></label>
       <label>当时已知玩法<input v-model="p.visiblePlan" maxlength="160" placeholder="未知留空，非赛后成型阵容"></label>
       <label v-if="analysisPhase === 'IN_PROGRESS' && mode === 'WANXIANG'">已取得天赋
        <select v-model="p.selectedTalents" multiple size="3">
         <option v-for="(rule, talent) in TALENT_RULES" :key="talent" :value="talent" :title="rule">{{ talent }}</option>
        </select>
       </label>
      </div>
     </div>
    </fieldset>
    <p v-if="hasDuplicates" class="shot-warning">存在重复昵称，请先核对OCR；不能用重复行补齐六人。</p>
    <label class="shot-confirm"><input type="checkbox" v-model="confirmed">我已核对截图阶段、六席名单与已填写的当时信息。</label>
    <label class="shot-confirm"><input type="checkbox" v-model="experimentalProbability">由后端程序计算实验概率（使用来源昵称历史，尚未校准，不自动分配钻石）</label>
    <button class="primary" :disabled="busy||!mode||!confirmed||hasDuplicates||players.some(p=>!p.nickname.trim())">{{ experimentalProbability?'程序计算实验概率':'生成历史分析' }}</button>
   </form>
  </template>
  <section v-if="result" class="shot-result" aria-live="polite">
   <h3>分析结果：{{ result.status==='EXPERIMENTAL_PROBABILITIES' ? '程序计算 · 未校准实验概率' : '历史资料分析' }}</h3><p>{{ result.notice }}</p>
   <p class="shot-warning">虚拟钻石／积分建议：暂不分配，保留100%。当前没有经过校准的六人获胜概率。</p>
   <section v-if="result.model" class="shot-model"><h3>后端模型结果</h3><p>{{ result.model.modelVersion }} · {{ result.model.trainingMatches }} 场训练 · {{ result.model.calibrated?'已校准':'未校准' }}</p><p>{{ result.model.notice }}</p><ol><li v-for="p in result.model.players" :key="p.nickname"><strong>{{ p.nickname }}：{{ probabilityLabel(p.probability) }}</strong><span v-if="p.coldStart"> · 无可关联入库战绩</span></li></ol><p v-if="result.model.diagnostic?.model">历史逐场对照 {{ result.model.diagnostic.evaluatedMatches }} 场<span v-if="result.model.diagnostic.strictHits !== undefined">，唯一首选命中真实冠军 {{ result.model.diagnostic.strictHits }} 场</span>。对数损失 {{ result.model.diagnostic?.model.logLoss.toFixed(3) }}（越低越好）。</p><details><summary>复算依据</summary><p>数据指纹 {{ result.model.dataHash }}</p><p>每次模型结果随分析记录保存。综合模型使用确认的禁用和玩法，以及此前比赛的交手与阵容记录。</p></details></section>
   <details v-if="result.model?.buildProjections" class="shot-model">
    <summary>六人阵容倾向</summary>
    <ul>
     <li v-for="(projection, i) in result.model.buildProjections" :key="i">
      <strong>{{ result.model.players[i]?.nickname }}</strong>
      <span v-if="!projection.candidates.length"> · 阵容待确认</span>
      <span v-else> · {{ projection.candidates.slice(0, 3).map(c => c.build + ' ' + (c.share * 100).toFixed(1) + '%').join('、') }}</span>
      <span> · 历史夺冠 {{ result.model.players[i]?.historicalWins ?? '—' }}/{{ result.model.players[i]?.historicalMatches ?? '—' }} 场，已知玩法 {{ projection.personalSamples }} 条，当前棋手已核对阵容 {{ projection.commanderSamples }} 战<span v-if="projection.commanderWins !== undefined"> {{ projection.commanderWins }} 冠</span>，未知 {{ (projection.unknownShare * 100).toFixed(1) }}%</span>
     </li>
    </ul>
    <p>百分比为阵容倾向权重。选定棋手后，按该选手使用这个棋手的实战记录估算。已确认玩法直接使用。</p>
   </details>
   <details v-if="result.model?.talentAdjustment" class="shot-model">
    <summary>天赋调整依据</summary>
    <ul>
     <li v-for="(impact, i) in result.model.talentAdjustment.players" :key="i">
      {{ result.model.players[i]?.nickname }} {{ (impact.baseProbability * 100).toFixed(2) }}% → {{ probabilityLabel(result.model.players[i]?.probability) }}
      <span v-for="pair in impact.pairs" :key="pair.talent">
       · {{ pair.build }} × {{ pair.talent }} {{ pair.wins }}/{{ pair.appearances }}，同阵容 {{ pair.buildWins }}/{{ pair.buildAppearances }}
      </span>
     </li>
    </ul>
    <p>赛中估计使用已取得天赋与当时已知玩法。同版本样本不足时该席不加天赋分。</p>
   </details>
   <p>数据截止：{{ new Date(result.featureCutoff).toLocaleString('zh-CN') }}；同日无精确时间的历史场次保守排除。</p>


  <section v-if="result.aceContext" class="shot-context-result"><h3>本场条件</h3><p>阵营禁用与已知玩法参与实验概率计算。</p><p>禁用：{{ result.aceContext.bannedFaction || '未提供' }}</p><ul><li v-for="p in result.aceContext.players" :key="p.seat">{{ p.nickname }} · 棋手 {{ p.commander||'未知' }} · 玩法 {{ p.visiblePlan||'未知' }}</li></ul><p v-for="g in result.aceContext.sharedPlans" :key="g.label">{{ g.label }}：席位 {{ g.seats.join('、') }} 选择标签相同，需复核实际英雄竞争；不据此直接加减胜率。</p><p v-for="w in result.aceContext.warnings.filter(w => !w.includes('RETURN'))" :key="w">{{ contextWarnings[w]||w }}</p><a v-for="source in result.aceContext.rules.sources" :key="source.url" :href="source.url" target="_blank" rel="noreferrer">{{ source.title }} </a></section>
  <ul class="shot-gaps"><li v-for="b in result.blockers" :key="b">{{ blockerNames[b]||b }}</li></ul>
  <div class="shot-profiles"><article v-for="(p,i) in result.players" :key="i"><h4>{{ p.nickname }}</h4><p>档案：{{ p.profileNickname||'未匹配' }} · 程序概率：{{ p.probability == null ? '未计算' : (p.probability*100).toFixed(2)+'%（实验）' }}</p><p v-if="p.recent7.observations">近 7 日已收录 {{ p.recent7.observations }} 场，夺冠 {{ p.recent7.wins }} 场。</p>
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
import { GAME_VERSIONS } from '../utils/player-matchup'
import { TALENT_RULES, type TalentImpact } from '../../../shared/talent-impact.mjs'

const activeTab = ref<'instant' | 'audit'>('instant')
const batchPasteText = ref('')
type CatalogProfile = {id: string; nickname: string; author?: string; observedMatches: number}
type CatalogSeat = {reviewedCommander?: string | null; build?: string | null}
type BuildProjection = {personalSamples: number; commanderSamples: number; commanderWins?: number; unknownShare: number; candidates: {build: string; share: number}[]}

interface Candidate {id:string;nickname:string;similarity:number}
interface Draft {id:string;featureCutoff:string;ocr:{phaseHint:string;rows:{rawText:string;candidates:Candidate[]}[]}}
interface Sample {wins:number;observations:number}
interface AceContext {notice:string;bannedFaction:string|null;rules:{perPlayerSupportCap:number|null;sources:{title:string;url:string}[]};players:{seat:number;nickname:string;commander:string|null;visiblePlan:string|null;returnMultiplier:number|null;breakEvenProbability:number|null}[];sharedPlans:{label:string;seats:number[]}[];warnings:string[]}
interface WinnerModel {status?:string;cutoff?:string;buildProjections?:BuildProjection[];talentAdjustment?:{players:(TalentImpact & {baseProbability:number})[]};modelVersion:string;trainingMatches:number;calibrated:boolean;notice:string;dataHash:string;players:{nickname:string;probability:number|null;historicalMatches?:number;historicalWins?:number;coldStart:boolean}[];diagnostic:{strictHits?:number;evaluatedMatches:number;model:null|{logLoss:number};uniform:null|{logLoss:number};notice:string}|null}
interface Result {model?:WinnerModel|null;aceContext?:AceContext;status:string;notice:string;featureCutoff:string;blockers:string[];players:{probability?:number|null;nickname:string;profileNickname:string|null;recent7:Sample;recent7Matches?:{matchId:string|null;day:string;ordinal:number|null;build:string|null;commander:string|null;winner:boolean;sourceUrl:string|null}[];recent30:Sample;buildRates:{label:string;wins:number;observations:number;observedWinShare:number}[];claims:{id:string;kind:string;text:string;sourceUrl:string}[]}[]}
const capturedAt=ref('')
const file=ref<File|null>(null),operator=ref(''),evidenceId=ref(''),busy=ref(false),error=ref(''),draft=ref<Draft|null>(null),result=ref<Result|null>(null),confirmed=ref(false),mode=ref(''),version=ref('UNKNOWN')
const savedAnalysisId=ref('')
const analysisPhase=ref<'PREMATCH'|'IN_PROGRESS'>('PREMATCH')
const emptySeat = () => ({nickname:'',profileId:'',commander:'',visiblePlan:'',selectedTalents:[] as string[]})
async function loadSaved(){busy.value=true;error.value='';result.value=null;draft.value=null;confirmed.value=false;try{result.value=await researchApi<Result>(`screenshot-analyses/${encodeURIComponent(savedAnalysisId.value.trim())}`)}catch(e){error.value=e instanceof Error?e.message:'读取失败'}finally{busy.value=false}}
const experimentalProbability=ref(true)
const supportStage=ref('UNKNOWN'),bannedFaction=ref('')
const contextWarnings:Record<string,string>={UNKNOWN_RULE_VERSION:'该版本尚未核对官方支持上限，不套用其他版本',SUPPORT_NOT_CONFIRMED_OPEN:'尚未确认仍可支持，不能执行支持方案',MISSING_RETURN_QUOTES:'部分返奖率缺失，无法比较全部六席报价',RETURN_BASIS_UNCONFIRMED:'尚未确认返奖是否含本金，暂不计算保本阈值'}
const profiles=ref<CatalogProfile[]>([]),players=ref(Array.from({length:6},emptySeat))
const blockerNames:Record<string,string>={UNCALIBRATED_MODEL:'尚未完成时间回测和概率校准',UNCONFIRMED_HISTORICAL_IDENTITIES:'历史账号身份未确认，昵称不等于稳定UID',UNKNOWN_HISTORICAL_MODE_VERSION:'历史模式和游戏版本未核全',UNVERIFIED_SOURCE_RESULTS:'来源赛果尚未完成独立核验',UNMATCHED_PLAYER:'有选手未匹配历史档案',INCOMPLETE_SOURCE_COVERAGE:'历史来源尚未采集齐全',SCREENSHOT_HAS_POSTMATCH_INDICATORS:'截图存在赛后标记'}
const normalize=(s:string)=>s.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase()
const hasDuplicates=computed(()=>{const names=players.value.map(p=>p.nickname.normalize('NFKC').replace(/\s/g,'').toLowerCase()).filter(Boolean);return new Set(names).size!==names.length})
function candidates(name:string, includeOcr = true){const ids=new Set(includeOcr ? draft.value?.ocr.rows.find(r=>r.rawText===name)?.candidates.map(c=>c.id)||[] : []);const q=normalize(name);return profiles.value.filter(p=>!q||normalize(p.nickname).includes(q)||q.includes(normalize(p.nickname))||ids.has(p.id))}
function selectFile(event:Event){file.value=(event.target as HTMLInputElement).files?.[0]||null;draft.value=null;result.value=null;evidenceId.value='';confirmed.value=false}
async function read(){if(!file.value)return;busy.value=true;error.value='';draft.value=null;result.value=null;confirmed.value=false
 try{const uploaded=await uploadEvidence(file.value,{capturedAt:new Date(capturedAt.value).toISOString(),providedBy:operator.value,kind:'CONTENT_ASSET',usageScope:'INTERNAL_ONLY',note:'对局截图分析原件'});evidenceId.value=uploaded.evidenceId;draft.value=await researchApi<Draft>('screenshots',{evidenceId:uploaded.evidenceId});players.value=Array.from({length:6},(_,i)=>({...emptySeat(),nickname:draft.value?.ocr.rows[i]?.rawText||''}))}catch(e){error.value=e instanceof Error?e.message:'识别失败'}finally{busy.value=false}}
async function analyze(){if(!draft.value||!mode.value)return;busy.value=true;error.value='';result.value=null;try{result.value=await researchApi<Result>(`screenshots/${draft.value.id}/analyze`,{experimentalProbability:experimentalProbability.value,phase:analysisPhase.value,identityConfirmed:confirmed.value,operator:operator.value,mode:mode.value,version:version.value,aceContext:{supportStage:supportStage.value,bannedFaction:bannedFaction.value},players:players.value.map(p=>({nickname:p.nickname,profileId:p.profileId||null,commander:p.commander,visiblePlan:p.visiblePlan,selectedTalents:analysisPhase.value==='IN_PROGRESS'&&mode.value==='WANXIANG'?p.selectedTalents:[]}))})}catch(e){error.value=e instanceof Error?e.message:'分析失败'}finally{busy.value=false}}
watch([players,operator,confirmed,mode,version,capturedAt,experimentalProbability,supportStage,bannedFaction,analysisPhase],()=>{result.value=null},{deep:true})

const catalogOptions = ref<{bans: string[]; commanders: string[]; builds: string[]}>({bans: [], commanders: [], builds: []})
const forecast = ref<WinnerModel | null>(null)
const forecastBusy = ref(false)
const forecastError = ref('')
let forecastRequest = 0

watch([players, mode, version, bannedFaction, analysisPhase], () => {
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
  players.value = Array.from({length: 6}, (_, index) => ({...emptySeat(), nickname: names[index] ?? ''}))
}

function clearRoster() {
  batchPasteText.value = ''
  players.value = Array.from({length: 6}, emptySeat)
}

async function runForecast() {
  if (!mode.value || players.value.some(player => !player.nickname.trim()) || hasDuplicates.value) return
  const request = ++forecastRequest
  forecastBusy.value = true
  forecast.value = null
  forecastError.value = ''
  try {
    const model = await researchApi<WinnerModel>('forecast', {
      phase: analysisPhase.value,
      mode: mode.value,
      version: version.value,
      aceContext: {bannedFaction: bannedFaction.value},
      players: players.value.map(player => ({
        ...player,
        profileId: player.profileId || null,
        selectedTalents: analysisPhase.value === 'IN_PROGRESS' && mode.value === 'WANXIANG' ? player.selectedTalents : []
      }))
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
    profiles.value = catalog.players
    const matches = catalog.matches ?? []
    const seats = matches.flatMap(match => match.seats)
    const labels = (values: (string | null | undefined)[]) => [...new Set(values.filter((value): value is string => Boolean(value && value !== 'UNKNOWN')))].sort()
    catalogOptions.value = {
      bans: labels(matches.map(match => match.ban)),
      commanders: labels(seats.map(seat => seat.reviewedCommander)),
      builds: labels(seats.map(seat => seat.build))
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
