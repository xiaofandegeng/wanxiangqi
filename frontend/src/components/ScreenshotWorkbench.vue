<template>
<section class="shot-workbench">
 <h2>王牌对决 · 本场分析</h2><p>确认六名参赛选手 → 填写赛前已揭示的棋手和禁用阵营 → 对照历史记录。</p>
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
</section>
</template>
<script setup lang="ts">
import {computed,onMounted,ref,watch} from 'vue'
import {uploadEvidence} from '../api/index'
import {researchApi} from '../api/prediction'
import {
  evaluate6PlayerMatchup,
  CURRENT_LATEST_VERSION,
  GAME_VERSIONS,
  type SixPlayerMatchupResult
} from '../utils/player-matchup'
import {getPlayerAvatar} from '../utils/player-avatar'
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
 try{const uploaded=await uploadEvidence(file.value,{capturedAt:new Date(capturedAt.value).toISOString(),providedBy:operator.value,kind:'CONTENT_ASSET',usageScope:'INTERNAL_ONLY',note:'赛前截图识别草稿；非赛果核验'});evidenceId.value=uploaded.evidenceId;draft.value=await researchApi<Draft>('screenshots',{evidenceId:uploaded.evidenceId});players.value=Array.from({length:6},(_,i)=>({nickname:draft.value?.ocr.rows[i]?.rawText||'',profileId:'',commander:'',visiblePlan:''}))}catch(e){error.value=e instanceof Error?e.message:'识别失败'}finally{busy.value=false}}
async function analyze(){if(!draft.value)return;busy.value=true;error.value='';result.value=null;try{result.value=await researchApi<Result>(`screenshots/${draft.value.id}/analyze`,{experimentalProbability:experimentalProbability.value,phase:'PREMATCH',identityConfirmed:confirmed.value,operator:operator.value,mode:mode.value,version:version.value,aceContext:{supportStage:supportStage.value,bannedFaction:bannedFaction.value},players:players.value.map(p=>({nickname:p.nickname,profileId:p.profileId||null,commander:p.commander,visiblePlan:p.visiblePlan}))})}catch(e){error.value=e instanceof Error?e.message:'分析失败'}finally{busy.value=false}}
watch([players,operator,confirmed,mode,version,capturedAt,experimentalProbability,supportStage,bannedFaction],()=>{result.value=null},{deep:true})

// 实时计算同场克制、禁选阵营与最新版本更迭影响
const matchupResult=computed<SixPlayerMatchupResult|null>(()=>{
 const valid=players.value.filter(p=>p.nickname&&p.nickname.trim())
 if(valid.length<2)return null
 return evaluate6PlayerMatchup(valid,bannedFaction.value,catalogMatches.value,version.value||CURRENT_LATEST_VERSION)
})

onMounted(async()=>{
 try{
  const cat=await researchApi<{players:{id:string;nickname:string}[];matches:any[]}>('catalog')
  profiles.value=cat.players||[]
  catalogMatches.value=cat.matches||[]
 }catch(e){error.value=e instanceof Error?e.message:'档案加载失败'}
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
