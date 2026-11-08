<template>
 <section class="source-inbox">
  <div class="source-note"><h2>资料有缺项，也可以如实留存</h2><p>有六人名单和冠军、但没有完整名次，选择「名单与冠军」。只有周统计，选择「选手周期汇总」。两类资料独立核验，始终不进入逐场统计或预测训练，不补造缺失名次。</p><p>原件先在 <router-link to="/admin/sources">原件与来源</router-link> 上传；来源链接用于复核，不会由服务器自动抓取。</p></div>
  <details class="source-create" :open="!observations.length"><summary>新增来源资料</summary>
  <form class="source-form" @submit.prevent="save">
   <label>资料类型<select v-model="kind"><option value="ROSTER_WINNER">参赛名单与冠军</option><option value="PLAYER_AGGREGATE">真人选手周期汇总</option></select></label>
   <label>来源唯一键<input v-model="form.sourceKey" required placeholder="作品编号:图片页码:资料类型"></label>
   <label>来源名称<input v-model="form.sourceName" required placeholder="作者或站点名称"></label>
   <label>作品链接<input v-model="form.sourceUrl" type="url" required placeholder="https://…"></label>
   <label>窗口开始日期<input v-model="form.windowStart" type="date" required></label>
   <label>窗口结束日期<input v-model="form.windowEnd" type="date" required></label>
   <label>比赛模式<select v-model="form.mode"><option value="WANXIANG">万象大赛</option><option value="DIAMOND">钻石狂潮</option></select></label>
   <label>版本（未确认留空）<input v-model="form.version"></label>
   <label>平台（未确认留空）<input v-model="form.platform"></label>
   <label>区服（未确认留空）<input v-model="form.region"></label>
   <label>原件证据编号<input v-model="form.evidenceId" required></label>
   <label>原件定位<input v-model="form.evidenceLocator" required placeholder="图集第几张或录屏时间点"></label>
   <fieldset v-if="kind==='ROSTER_WINNER'" class="source-wide"><legend>按原图顺序填六名参赛者，序号不是最终排名</legend><div v-for="(p,i) in participants" :key="i" class="source-player"><span>{{ i+1 }}</span><input v-model="p.nickname" required :aria-label="`名单第${i+1}人昵称`" placeholder="原始昵称"><input v-model="p.uid" :aria-label="`名单第${i+1}人UID`" placeholder="UID，未确认留空"></div><label>冠军<select v-model.number="winnerSlot"><option v-for="(p,i) in participants" :key="i" :value="i+1">名单位置 {{ i+1 }} · {{ p.nickname || '待填写' }}</option></select></label></fieldset>
   <fieldset v-else class="source-wide"><legend>仅填写原图已公布的数值，不按四舍五入百分比反推场数</legend><div v-for="(row,i) in rows" :key="i" class="aggregate-edit"><label>昵称<input v-model="row.nickname" required :aria-label="`汇总第${i+1}行昵称`"></label><label>UID（可空）<input v-model="row.uid"></label><label>出场数<input v-model.number="row.appearances" type="number" min="1" max="1000000" required></label><label>登顶数<input v-model.number="row.wins" type="number" min="0" required></label><label>前三数<input v-model.number="row.top3" type="number" min="0" required></label><label>平均名次（可空）<input v-model="row.avgRank" type="number" min="1" max="6" step="0.01"></label><button v-if="rows.length>1" type="button" @click="rows.splice(i,1)">删除此行</button></div><button type="button" :disabled="rows.length>=200" @click="rows.push(blankRow())">添加选手行</button></fieldset>
   <button class="source-primary" :disabled="busy">保存资料，等待复核</button>
  </form>
  </details>
  <p v-if="error" role="alert" class="source-error">{{ error }}</p><p v-if="feedback" role="status" class="source-feedback">{{ feedback }}</p>
  <div class="source-toolbar"><h2>已登记来源资料</h2><div><input v-model="operator" aria-label="资料复核人" placeholder="复核人标识"><button :disabled="busy" @click="load">刷新</button></div></div>
  <p v-if="loading">正在读取来源资料…</p><p v-else-if="!failed && !observations.length" class="source-note">暂无资料。可先登记软柿的原图，再核对名单或周期汇总。</p>
  <article v-for="item in observations" :key="item.id" class="source-item">
   <header><h3>{{ item.kind==='ROSTER_WINNER'?'名单与冠军':'选手周期汇总' }} · {{ item.sourceName }}</h3><span>{{ stateLabel(item) }}</span></header>
   <p>{{ item.windowStart }} ～ {{ item.windowEnd }} · {{ item.mode==='WANXIANG'?'万象大赛':'钻石狂潮' }} · {{ item.version || '版本未确认' }}</p><p class="source-muted">{{ item.platform || '平台未确认' }} / {{ item.region || '区服未确认' }} · {{ item.sourceKey }}</p><a :href="item.sourceUrl" target="_blank" rel="noreferrer">查看来源原作品 ↗</a>
   <p class="source-muted">原件 {{ item.evidenceId }} · {{ item.evidenceLocator }}</p>
   <p v-if="item.kind==='ROSTER_WINNER'" class="source-champion">冠军：{{ item.participants?.[(item.winnerSlot || 1)-1]?.nickname }}；其他五人的最终名次未知。</p>
   <div class="source-table"><table v-if="item.kind==='ROSTER_WINNER'"><thead><tr><th>名单序号（非排名）</th><th>选手</th><th>UID</th><th>已知赛果</th></tr></thead><tbody><tr v-for="(p,i) in item.participants" :key="i"><td>{{ i+1 }}</td><td>{{ p.nickname }}</td><td>{{ p.uid || '未确认' }}</td><td>{{ item.winnerSlot===i+1?'冠军':'名次未知' }}</td></tr></tbody></table><table v-else><thead><tr><th>选手</th><th>出场数</th><th>登顶数</th><th>前三数</th><th>登顶率</th><th>平均名次</th></tr></thead><tbody><tr v-for="(r,i) in item.rows" :key="i"><td>{{ r.nickname }}<small>{{ r.uid || 'UID未确认' }}</small></td><td>{{ r.appearances }}</td><td>{{ r.wins }}</td><td>{{ r.top3 }}</td><td>{{ (100*r.wins/r.appearances).toFixed(1) }}%</td><td>{{ r.avgRank ?? '未公布' }}</td></tr></tbody></table></div>
   <p class="source-boundary">仅作第三方来源参考，不计入本站完整赛果统计。</p>
   <div v-if="item.status!=='QUARANTINED'" class="source-actions"><button v-if="item.status==='PENDING'" :disabled="busy" @click="review(item.id,false)">已对照原件，确认资料</button><button :disabled="busy" @click="review(item.id,true)">隔离错误资料</button></div>
  </article>
 </section>
</template>
<script setup lang="ts">
import {onMounted,ref} from 'vue'
import {researchApi,type SourceObservation} from '../api/prediction'
const kind=ref<'ROSTER_WINNER'|'PLAYER_AGGREGATE'>('ROSTER_WINNER')
const form=ref({sourceKey:'',sourceName:'',sourceUrl:'',windowStart:'',windowEnd:'',mode:'WANXIANG',version:'',platform:'',region:'',evidenceId:'',evidenceLocator:''})
const participants=ref(Array.from({length:6},()=>({nickname:'',uid:''}))),winnerSlot=ref(1)
const blankRow=()=>({nickname:'',uid:'',appearances:'' as number|'',wins:'' as number|'',top3:'' as number|'',avgRank:''})
const rows=ref([blankRow()]),observations=ref<SourceObservation[]>([]),operator=ref('')
const loading=ref(false),busy=ref(false),failed=ref(false),error=ref(''),feedback=ref('')
const stateLabel=(item:SourceObservation)=>item.status==='QUARANTINED'?'已隔离':item.status==='PENDING'?'待复核':item.evidenceReady?'资料已复核':'原件已失效，不可引用'
async function load(){loading.value=true;failed.value=false;error.value='';try{observations.value=await researchApi<SourceObservation[]>('observations')}catch(e){failed.value=true;error.value=e instanceof Error?e.message:'资料读取失败';observations.value=[]}finally{loading.value=false}}
async function act(fn:()=>Promise<void>){busy.value=true;feedback.value='';error.value='';try{await fn()}catch(e){error.value=e instanceof Error?e.message:'操作失败'}finally{busy.value=false}}
const save=()=>act(async()=>{
 const payload={...form.value,kind:kind.value,...(kind.value==='ROSTER_WINNER'?{participants:participants.value,winnerSlot:winnerSlot.value}:{rows:rows.value.map(r=>({...r,avgRank:r.avgRank===''?null:Number(r.avgRank)}))})}
 const result=await researchApi<{deduplicated:boolean}>('observations',payload)
 await load();feedback.value=result.deduplicated?'相同资料已存在，没有重复登记。':'资料已保存为待复核；未计入完整赛果统计。'
})
const review=(id:string,quarantine:boolean)=>act(async()=>{await researchApi(`observations/${id}/${quarantine?'quarantine':'verify'}`,{operator:operator.value});await load();feedback.value=quarantine?'资料已隔离。':'资料已复核，仅作独立来源参考。'})
onMounted(load)
</script>
<style scoped>
.source-inbox{color:#233c35}.source-create{margin:18px 0}.source-create>summary{cursor:pointer;font-weight:600;padding:14px 0}.source-note,.source-item{background:white;border:1px solid #dce2de;padding:20px;margin:18px 0;line-height:1.9}.source-note h2,.source-toolbar h2{font-size:19px}.source-inbox a{color:#285c4e;text-decoration:underline}.source-form{background:white;border:1px solid #dce2de;padding:24px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.source-form label{display:flex;flex-direction:column;gap:6px;font-size:13px}.source-inbox input,.source-inbox select{padding:10px 12px;border:1px solid #bac8c1;border-radius:3px;min-width:0;max-width:100%;background:white}.source-inbox button{padding:10px 14px;border:1px solid #b8c7c0;border-radius:3px;background:white;color:#285c4e}.source-inbox button:disabled{opacity:.5}.source-inbox .source-primary{background:#285c4e;color:white}.source-wide{grid-column:1/-1;border:0;min-width:0}.source-wide legend{font-weight:600;margin:12px 0}.source-player{display:grid;grid-template-columns:24px 1fr 1fr;gap:10px;margin:10px 0;align-items:center}.aggregate-edit{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:16px 0;border-bottom:1px solid #dde5df;margin-bottom:16px}.source-toolbar,.source-item header,.source-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:20px 0}.source-toolbar>div{display:flex;gap:8px}.source-item h3{font-size:17px}.source-table{overflow:auto}.source-table table{border-collapse:collapse;width:100%;text-align:left;font-size:14px}.source-table td,.source-table th{padding:10px;border-bottom:1px solid #e1e7e3;white-space:nowrap}.source-table small{display:block;color:#687973;font-size:11px}.source-muted,.source-boundary{font-size:12px;color:#687973}.source-error{color:#a33629;background:#fff1ef;padding:16px;margin:16px 0}.source-feedback{color:#285c4e;background:#eaf4ee;padding:16px;margin:16px 0}.source-champion{font-weight:600}.source-actions{justify-content:flex-start;flex-wrap:wrap}@media(max-width:700px){.source-form{grid-template-columns:1fr;padding:16px}.source-player{grid-template-columns:24px 1fr}.source-player input:last-child{grid-column:2}.aggregate-edit{grid-template-columns:repeat(2,minmax(0,1fr))}.source-toolbar,.source-item header{align-items:flex-start;flex-direction:column}.source-toolbar>div{width:100%}.source-toolbar input{width:100%}.source-note,.source-item{padding:16px}}
</style>
