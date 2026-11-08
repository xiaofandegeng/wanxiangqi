<template>
 <div class="research-page">
  <header class="research-heading"><div><p class="eyebrow">王者万象棋 / 王牌对决</p><h1>{{ titles[section] }}</h1><p>逐场整理真实赛果，以可核对的数据研究选手表现。</p></div><span class="research-label">内部研究 · 未校准模型</span></header>
  <section v-if="!ready" class="research-auth"><h2>连接你的研究数据</h2><p>选手记录和原件默认仅管理端可见。填写当前后端 ADMIN_TOKEN 后开始；普通教学资料仍可从资料入口访问。</p><form @submit.prevent="connect"><input v-model="token" type="password" autocomplete="off" aria-label="管理凭证" placeholder="管理凭证 ADMIN_TOKEN" required><button class="primary">连接工作台</button></form><p class="muted">凭证保存在当前浏览器，端口或浏览器变化后需重新配置。</p></section>
  <template v-else>
   <div class="research-toolbar"><span>{{ loaded ? `完整排名赛果 ${matches.length} 场登记 · ${stats.eligibleMatches} 场有效` : '正在读取数据库…' }}</span><div><button @click="load">刷新</button><button v-if="hasToken" @click="disconnect">清除凭证</button></div></div>
   <p v-if="error" role="alert" class="research-error">{{ error }} <button @click="load">重试</button></p>
   <template v-if="loaded">
   <template v-if="section==='overview'">
    <div class="research-metrics"><div><strong>{{ stats.eligibleMatches }}</strong><span>已核验完整赛果</span></div><div><strong>{{ stats.players.length }}</strong><span>选手 / 模式 / 版本分组</span></div><div><strong>{{ matches.filter(m=>m.status==='PENDING').length }}</strong><span>待人工核验</span></div><div><strong>{{ stats.unlinkedSeats }}</strong><span>缺UID席位，不合并统计</span></div></div>
    <section class="research-split"><div><h2>先有赛果，再谈预测</h2><p>完整排名用于均排与前三统计；六席名单加冠军用于整理冠军胜负样本，来源样本在玩法档案中单列，尚未通过核验的资料不当作完整战绩。旧隔离战绩与普通排位阵容统计不混入。</p><router-link class="research-link" to="/research/import">录入最新赛果 →</router-link></div><ol><li>上传并核验原件</li><li>录入六名选手与最终排名</li><li>复核后计入选手统计</li><li>按模式版本核对后进行时间回测</li></ol></section>
    <section class="research-note"><h2>来源核验进度</h2><p>奇迹司万象档案247场均仅含冠军，暂不可作为完整赛果。抖音软柿【万象棋】（76823812617）统计视频已列入候选，已确认作者与作品；参赛名单、阵容标签与冠军已转写至独立玩法档案；未证实完整排名，不进入完整赛果统计。</p><p>另已找到该作者10月22–28日真人选手周汇总，含登顶、前三与平均排名。<a href="https://www.douyin.com/note/7702134290347265295" target="_blank" rel="noreferrer">查看原作品</a>；汇总不还原成逐局赛果。</p><p>尚未验证持续自动获取。支持手工整理与触发更新，不标称实时预测。</p></section>
   </template>
   <ObservationInbox v-else-if="section==='sources'" />
   <PlayerCatalog v-else-if="section==='roster'" />
   <template v-else-if="section==='matches'">
    <div class="research-filters"><select v-model="mode" aria-label="模式"><option value="">全部模式</option><option value="WANXIANG">万象大赛</option><option value="DIAMOND">钻石狂潮</option></select><input v-model="query" placeholder="按选手、来源或版本搜索" aria-label="筛选场次"></div>
    <p v-if="!filteredMatches.length" class="research-empty">暂无符合条件的场次。收到最新数据后，从「数据录入」建立完整赛果。</p>
    <article v-for="m in filteredMatches" :key="m.id" class="research-match"><header><h2>{{ modeName(m.mode) }} · {{ formatTime(m.playedAt) }}</h2><span>{{ m.status==='VERIFIED'?'已核验':m.status==='PENDING'?'待核验':'已隔离' }}</span></header><p class="muted">{{ m.version }} · {{ m.platform }} / {{ m.region }} · {{ m.sourceKey }}</p><div class="research-table"><table><thead><tr><th>名次</th><th>选手</th><th>UID</th></tr></thead><tbody><tr v-for="s in m.seats" :key="s.rank"><td>{{ s.rank }}</td><td>{{ s.nickname }}</td><td>{{ s.uid || '未确认，不跨场合并' }}</td></tr></tbody></table></div><p class="muted">原件 {{ m.evidenceId }} · {{ m.evidenceLocator }}</p><form v-if="m.status!=='QUARANTINED'" class="verify-row" @submit.prevent="verify(m.id)"><input v-model="operator" placeholder="核验人" aria-label="核验人" required><button v-if="m.status==='PENDING'" :disabled="busy">已对照原件，确认六席正确</button><button type="button" :disabled="busy" @click="quarantine(m.id)">隔离错误场次</button></form></article>
   </template>
   <template v-else-if="section==='players'">
    <p class="research-note">模式、版本、平台、区服与UID分开统计；只展示仍有有效原件的已核验记录。同名不自动合并。</p>
    <p v-if="!stats.players.length" class="research-empty">暂无可统计选手。待完整赛果核验、稳定UID确认后自动汇总。</p>
    <div v-else class="research-table"><table><thead><tr><th>选手 / UID</th><th>模式 / 版本</th><th>平台 / 区服</th><th>场数</th><th>登顶</th><th>前三</th><th>平均名次</th></tr></thead><tbody><tr v-for="p in stats.players" :key="p.key+p.mode+p.version"><td>{{ p.nickname }}<small>{{ p.uid }}</small></td><td>{{ modeName(p.mode) }}<small>{{ p.version }}</small></td><td>{{ p.platform }} / {{ p.region }}</td><td>{{ p.matches }}</td><td>{{ p.wins }}（{{ percent(p.winRate) }}）</td><td>{{ p.top3 }}（{{ percent(p.top3Rate) }}）</td><td>{{ p.avgRank.toFixed(2) }}</td></tr></tbody></table></div>
   </template>
   <template v-else-if="section==='predict'">
    <ScreenshotWorkbench />

   </template>
   <template v-else-if="section==='import'">
    <section class="research-note"><h2>录入前准备</h2><p>先到 <router-link to="/admin/sources">原件管理</router-link> 上传截图并核验，复制证据编号。截图没有UID时可留空，不凭昵称跨场归并。原件与场次是两次独立核验，上传不等于统计生效。</p></section>
    <form class="research-form" @submit.prevent="importMatch"><label>来源唯一场次键<input v-model="form.sourceKey" required placeholder="来源:平台:区服:日期时段"></label><label>模式<select v-model="form.mode"><option value="WANXIANG">万象大赛</option><option value="DIAMOND">钻石狂潮</option></select></label><label>比赛时间（含时区）<input v-model="form.playedAt" required placeholder="ISO8601，例如末尾 +08:00"></label><label>游戏版本<input v-model="form.version" required></label><label>平台<input v-model="form.platform" required placeholder="按原件填写"></label><label>区服<input v-model="form.region" required></label><label>证据编号<input v-model="form.evidenceId" required></label><label>原件定位<input v-model="form.evidenceLocator" required placeholder="图片页码或录屏时间位置"></label><fieldset class="six-seats"><legend>完整六席，按最终排名录入</legend><div v-for="s in form.seats" :key="s.rank"><span>{{ s.rank }}</span><input v-model="s.nickname" required :aria-label="`第${s.rank}名昵称`" placeholder="原始昵称"><input v-model="s.uid" :aria-label="`第${s.rank}名UID`" placeholder="UID，可留空"></div></fieldset><button class="primary" :disabled="busy">保存为待核验</button></form>
    <details class="research-note"><summary>批量整理前的单场JSON入口</summary><p>每次仅接收一个完整场次，256KB上限。录入成功后进入待核验，重复键内容相同幂等、不同拒绝覆盖。</p><textarea v-model="jsonInput" rows="10" aria-label="场次JSON" placeholder="粘贴与上方字段同结构的场次对象"></textarea><button :disabled="busy" @click="importJson">校验并保存JSON</button></details>
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
import {computed,watch,ref} from 'vue'
import {useRoute} from 'vue-router'
import {researchApi,localResearch,getAdminToken,setAdminToken,type ResearchMatch,type Stats} from '../api/prediction'
const route=useRoute()
const section=computed(()=>String(route.meta.researchSection||'overview'))
const titles:Record<string,string>={overview:'王牌对决研究工作台',matches:'场次与赛果',players:'选手统计',predict:'赛前研究',import:'数据录入',sources:'来源资料',roster:'选手玩法档案'}
const hasToken=ref(Boolean(getAdminToken()))
const ready=computed(()=>hasToken.value || (localResearch && ['overview','roster','sources','matches','players'].includes(section.value)))
const token=ref(''),error=ref(''),feedback=ref(''),busy=ref(false),loaded=ref(false)
const matches=ref<ResearchMatch[]>([]),stats=ref<Stats>({eligibleMatches:0,unlinkedSeats:0,players:[]})
const mode=ref(''),query=ref(''),operator=ref(''),jsonInput=ref('')
const form=ref({sourceKey:'',mode:'WANXIANG',playedAt:'',platform:'',region:'',version:'',evidenceId:'',evidenceLocator:'',seats:Array.from({length:6},(_,i)=>({rank:i+1,nickname:'',uid:''}))})
const filteredMatches=computed(()=>matches.value.filter(m=>(!mode.value||m.mode===mode.value)&&JSON.stringify(m).toLowerCase().includes(query.value.toLowerCase())))
const modeName=(s:string)=>s==='WANXIANG'?'万象大赛':'钻石狂潮'
const percent=(n:number)=>(n*100).toFixed(1)+'%'
const formatTime=(s:string)=>new Date(s).toLocaleString('zh-CN')
async function load(){error.value='';try{const [m,s]=await Promise.all([researchApi<ResearchMatch[]>('matches'),researchApi<Stats>('stats')]);matches.value=m;stats.value=s;loaded.value=true}catch(e){error.value=e instanceof Error?e.message:'加载失败';loaded.value=false}}
async function connect(){setAdminToken(token.value.trim());token.value='';hasToken.value=true;await load()}
function disconnect(){setAdminToken(null);hasToken.value=false;loaded.value=false;matches.value=[];stats.value={eligibleMatches:0,unlinkedSeats:0,players:[]};error.value='';feedback.value=''}
async function action(fn:()=>Promise<void>){busy.value=true;feedback.value='';error.value='';try{await fn()}catch(e){error.value=e instanceof Error?e.message:'操作失败'}finally{busy.value=false}}
async function save(raw:unknown){const r=await researchApi<{deduplicated:boolean}>('matches',raw);await load();feedback.value=r.deduplicated?'相同场次已存在，没有重复导入。':'已保存待核验场次，请对照原件后在场次页确认。'}
const importMatch=()=>action(()=>save(form.value))
const importJson=()=>action(async()=>{await save(JSON.parse(jsonInput.value))})
const verify=(id:string)=>action(async()=>{await researchApi(`matches/${encodeURIComponent(id)}/verify`,{operator:operator.value});await load();feedback.value='场次已核验，统计已刷新。'})
const quarantine=(id:string)=>action(async()=>{await researchApi(`matches/${encodeURIComponent(id)}/quarantine`,{operator:operator.value});await load();feedback.value='场次已隔离，不再参与当前统计。历史研究运行仍保留原快照。'})
watch(section,()=>{if(ready.value && !loaded.value)load()},{immediate:true})
</script>
<style scoped>
.research-page{max-width:1160px;margin:auto;color:#182b31}.research-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;border-bottom:1px solid #d9dedc;padding:12px 0 26px;margin-bottom:24px}.research-heading h1{font-size:30px;line-height:1.3;margin:7px 0 10px}.research-heading p{color:#61716f}.eyebrow{font-size:12px;letter-spacing:1px}.research-label{font-size:12px;color:#725b2e;white-space:nowrap}.research-auth,.research-note,.research-match,.research-result{padding:22px;background:white;border:1px solid #dce2de;margin:18px 0}.research-auth h2,.research-note h2,.research-split h2{font-size:19px;margin-bottom:12px}.research-auth p,.research-note p,.research-split p{line-height:1.9}.research-auth form{display:flex;gap:10px;margin:18px 0}.research-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;color:#64736d}.research-toolbar button{margin-left:8px}button,.research-link{display:inline-block;border:1px solid #b8c7c0;border-radius:4px;padding:9px 14px;color:#285c4e;background:white;font-weight:600}button:disabled{opacity:.45;cursor:not-allowed}.primary{background:#285c4e;color:white}.research-metrics{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #dce2de;margin:18px 0 30px}.research-metrics div{padding:18px 14px}.research-metrics strong{display:block;font-size:32px;font-weight:650}.research-metrics span,.muted{color:#687973;font-size:13px}.research-split{display:grid;grid-template-columns:1.4fr 1fr;gap:40px;padding:20px 0}.research-split ol{padding-left:24px;line-height:2.5}.research-link{margin-top:20px}.research-empty{padding:45px 22px;background:white;border:1px dashed #ccd5cf;text-align:center;color:#64736d}.research-filters,.verify-row{display:flex;gap:12px;margin:18px 0}.research-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;background:white;border:1px solid #dce2de;padding:24px;margin:20px 0}.research-form label{display:flex;flex-direction:column;gap:7px;font-size:13px}.research-page input,.research-page select,.research-page textarea{padding:10px 12px;border:1px solid #bac8c1;border-radius:3px;background:#fff;max-width:100%;min-width:0}.research-auth input{flex:1}.six-seats{grid-column:1/-1;border:0;padding:12px 0}.six-seats legend{font-weight:600}.six-seats div{display:grid;grid-template-columns:30px 1fr 1fr;align-items:center;gap:10px;margin:10px 0}.research-table{overflow:auto;margin:16px 0}.research-table table{width:100%;border-collapse:collapse;text-align:left;font-size:14px}.research-table th,.research-table td{padding:12px;border-bottom:1px solid #e1e7e3;white-space:nowrap}.research-table th{color:#64736d;font-size:12px}.research-table small{display:block;color:#687973}.research-match header{display:flex;justify-content:space-between;gap:12px}.research-match h2{font-size:18px}.research-page textarea{display:block;width:100%;margin:12px 0}.research-error{background:#fff1ef;color:#a33629;padding:15px;margin:16px 0}.research-success{padding:16px;color:#285c4e;background:#eaf4ee}.prob-row{display:grid;grid-template-columns:1fr 2fr 65px 50px;gap:12px;align-items:center;margin:16px 0}.prob-row meter{width:100%}.research-note a{color:#285c4e;text-decoration:underline}.research-note summary{cursor:pointer}@media(max-width:700px){.research-heading{align-items:flex-start;flex-direction:column}.research-heading h1{font-size:25px}.research-metrics{grid-template-columns:repeat(2,1fr)}.research-split{grid-template-columns:1fr;gap:16px}.research-form{grid-template-columns:1fr;padding:16px}.research-auth form,.verify-row,.research-filters{flex-direction:column}.research-toolbar{flex-wrap:wrap}.research-note,.research-auth,.research-match{padding:16px}.prob-row{grid-template-columns:1fr 1fr 55px}.prob-row small{grid-column:1/-1}.six-seats div{grid-template-columns:20px 1fr}.six-seats input:last-child{grid-column:2}.research-label{white-space:normal}}
</style>
