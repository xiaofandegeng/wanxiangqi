<template>
  <span v-if="value == null">—</span>
  <span v-else-if="typeof value !== 'object'">{{ value }}</span>
  <ul v-else-if="Array.isArray(value)" class="fact-list"><li v-for="(item,i) in value" :key="i"><FactValue :value="item" /></li></ul>
  <dl v-else class="fact-details"><div v-for="(item,key) in value" :key="key"><dt>{{ labels[String(key)] || key }}</dt><dd><FactValue :value="item" /></dd></div></dl>
</template>
<script setup lang="ts">
defineProps<{value:unknown}>()
const labels:Record<string,string>={name:'名称',text:'效果',levelEnhance:'等级强化',trigger:'触发条件',actions:'操作',goal:'目标',budget:'资源安排',branches:'应变',successSignal:'完成信号',default:'默认方案',alternatives:'替代方案',reason:'原因',risk:'风险',steps:'步骤',condition:'条件',priority:'优先级',notes:'说明',skill:'技能',equipment:'装备',talents:'天赋',positioning:'站位',early:'前期',mid:'中期',late:'后期',core:'核心',title:'要点',description:'说明',cost:'代价',source:'依据',officialNote:'官方说明',sequence:'操作顺序',stopLoss:'止损',counter:'应对',defaultPlan:'默认方案',counterPlans:'应对方案',setup:'准备',effect:'效果',disruption:'中断条件',replacement:'替补',lose:'损失',compensate:'补偿'}
</script>
<style scoped>
.fact-list{padding-left:20px;display:grid;gap:8px}.fact-details{display:grid;gap:12px}.fact-details>div{border-left:2px solid #d9d6cc;padding-left:12px}.fact-details dt{font-weight:600;font-size:13px;margin-bottom:4px}.fact-details dd{font-size:14px;line-height:1.8;overflow-wrap:anywhere}
</style>
