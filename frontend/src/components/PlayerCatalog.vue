<template>
 <section class="catalog">
  <header><div><h2>选手与玩法档案</h2><p>从日图查到使用记录，从周报查到作者专长评价。</p></div><button @click="load">刷新资料库</button></header>
  <p v-if="error" role="alert">{{ error }} <button @click="load">重试</button></p>
  <p v-else-if="!catalog">正在读取数据库…</p>
  <template v-else>
   <p class="notice">{{ catalog.notice }}</p>
   <p class="counts">{{ catalog.counts.matches }} 场来源记录 · {{ catalog.counts.plays }} 席位 · {{ catalog.counts.players }} 个昵称档案 · {{ catalog.counts.claims }} 条作者声明</p>
   <label class="search">查选手或玩法<input v-model="query" placeholder="例如：世薄情、三分登场、玉环" /></label>
   <p v-if="!filtered.length">没有符合条件的档案。</p>
   <div class="profiles">
    <article v-for="p in filtered" :key="p.id">
     <h3>{{ p.nickname }}</h3><p class="muted">来源内昵称 · UID 未确认 · {{ p.observedMatches }} 次观察 / {{ p.observedWins }} 次来源记载获胜</p>
     <dl><dt>样本内重复玩法</dt><dd>{{ p.commonBuilds.length ? p.commonBuilds.join('、') : '样本不足或无明显重复' }}</dd><dt>已证实擅长阵容</dt><dd>尚无充分逐局统计证明</dd></dl>
     <p class="muted">重复玩法门槛：至少 3 次观察，某标签出现至少 2 次且占一半；仅描述此样本，不代表长期习惯或同版本强度。</p>
     <p class="muted">下列比例仅为来源所列选择标签的样本登顶次数／观察次数，不是本场预测概率或最终阵容胜率。</p>
     <div class="tags"><span v-for="b in p.builds" :key="b.label">{{ b.label }} × {{ b.observations }} · 登顶 {{ b.winsForSourceLabel }}/{{ b.observations }}</span></div>
     <details><summary>获胜阵容与逐场选择（{{ p.history.length }}）</summary><ul><li v-for="h in p.history" :key="h.matchId"><a :href="h.sourceUrl" target="_blank" rel="noreferrer">{{ h.day }} 第 {{ h.ordinal }} 场</a>：{{ h.build }}<strong v-if="h.rank===1"> → 获胜：{{ h.winnerBuild }}</strong><span v-else> · 最终名次未知</span></li></ul></details>
     <details v-if="p.claims.length"><summary>来源作者的专长评价（{{ p.claims.length }}）</summary><ul><li v-for="c in p.claims" :key="c.id"><b>{{ c.kind==='COMMANDER_AUTHOR_CLAIM'?'棋手关联':'玩法关联' }}</b>：{{ c.text }} <a :href="c.sourceUrl" target="_blank" rel="noreferrer">{{ c.windowStart }}～{{ c.windowEnd }} 原文</a><p v-if="c.aggregate">原报：{{ c.aggregate.winsReported }} 登顶，前三 {{ c.aggregate.top3Reported }}/{{ c.aggregate.appearancesReported }}，均排 {{ c.aggregate.averageRankReported }}<strong v-if="!c.aggregate.averageCompatibleWithIntegerRanksAt2Decimals"> · 均排与场次不相容，待核查</strong></p></li></ul></details>
    </article>
   </div>
   <details class="coverage"><summary>采集覆盖台账：{{ catalog.sources.filter(s=>s.status==='TRANSCRIBED').length }}/{{ catalog.sources.length }} 篇已转写</summary><p>发现链接不等于已采集；未转写来源不会增加玩家玩法次数。</p><ul><li v-for="s in catalog.sources" :key="s.url"><a :href="s.url" target="_blank" rel="noreferrer">{{ s.title.split('。')[0] }}</a> — {{ s.status==='TRANSCRIBED'?'已转写':'待采集' }} / {{ s.matches }} 场 <strong v-if="s.note">{{ s.note }}</strong></li></ul></details>
  </template>
 </section>
</template>
<script setup lang="ts">
import {computed,onMounted,ref} from 'vue'
import {researchApi} from '../api/prediction'
interface Claim {id:string;kind:string;text:string;sourceUrl:string;windowStart:string;windowEnd:string;aggregate:null|{winsReported:number;top3Reported:number;appearancesReported:number;averageRankReported:number;averageCompatibleWithIntegerRanksAt2Decimals:boolean}}
interface Profile {id:string;nickname:string;observedMatches:number;observedWins:number;commonBuilds:string[];builds:{label:string;observations:number;winsForSourceLabel:number}[];claims:Claim[];history:{matchId:string;day:string;ordinal:number;build:string;rank:number|null;winnerBuild:string|null;sourceUrl:string}[]}
interface Catalog {notice:string;counts:{matches:number;plays:number;players:number;claims:number};players:Profile[];sources:{url:string;title:string;status:string;matches:number;note:string|null}[]}
const catalog=ref<Catalog|null>(null),error=ref(''),query=ref('')
const filtered=computed(()=>catalog.value?.players.filter(p=>[p.nickname,...p.builds.map(b=>b.label),...p.claims.map(c=>c.text)].join(' ').toLowerCase().includes(query.value.trim().toLowerCase()))||[])
async function load(){error.value='';catalog.value=null;try{catalog.value=await researchApi<Catalog>('catalog')}catch(e){error.value=e instanceof Error?e.message:'资料库加载失败'}}
onMounted(load)
</script>
<style scoped>
.catalog{margin:20px 0}.catalog header{display:flex;justify-content:space-between;gap:16px;align-items:center}.catalog h2{font-size:22px}.catalog header p{margin:10px 0;color:#64736d}.catalog button{border:1px solid #b8c7c0;background:white;padding:9px 14px;border-radius:4px;color:#285c4e}.notice{background:#eef3ef;padding:16px;line-height:1.8;margin:16px 0}.counts{font-weight:600}.search{display:block;margin:20px 0}.search input{display:block;width:100%;padding:12px;border:1px solid #bac8c1;background:white;margin-top:8px}.profiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.profiles article{min-width:0;border:1px solid #dce2de;padding:20px;background:white;overflow-wrap:anywhere}.profiles h3{font-size:20px}.muted{font-size:12px;color:#687973;line-height:1.8;margin:10px 0}.profiles dl{display:grid;grid-template-columns:120px 1fr;font-size:13px;gap:9px;margin:16px 0}.profiles dt{color:#687973}.tags{display:flex;flex-wrap:wrap;gap:6px;margin:14px 0}.tags span{background:#edf3ef;padding:5px 8px;font-size:12px}.catalog details{font-size:13px;line-height:1.9;margin-top:12px}.catalog summary{cursor:pointer;font-weight:600}.catalog ul{padding-left:18px}.catalog li{margin:9px 0}.catalog a{color:#285c4e;text-decoration:underline}.catalog strong{color:#99602c}.coverage{padding:18px;background:white;border:1px solid #dce2de}@media(max-width:700px){.profiles{grid-template-columns:1fr}.catalog header{align-items:flex-start;flex-direction:column}.profiles article{padding:16px}.profiles dl{grid-template-columns:100px 1fr}}
</style>
