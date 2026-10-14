<template><figure class="game-art" :class="`art-${variant}`"><img v-if="url && !failed" :key="url" :src="url" :alt="`${name || art?.name || '卡牌'}官方图片`" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="failed = true" /><div v-else class="art-unavailable">{{ name || art?.name }}<small>暂无可用图片</small></div></figure></template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import images from '../data/official-art.json'
const props = withDefaults(defineProps<{entityId?:string;name?:string;variant?:'portrait'|'thumb'|'card'}>(),{variant:'thumb'})
const catalog = images as Record<string,{name:string;portrait:string|null;thumb:string|null;card:string|null}>
const art = computed(()=> (props.entityId ? catalog[props.entityId] : undefined) || Object.values(catalog).find(a=>a.name===props.name))
const url = computed(()=> props.variant==='card' ? art.value?.card : props.variant==='portrait' ? art.value?.portrait || art.value?.thumb : art.value?.thumb || art.value?.portrait)
const failed=ref(false);watch(url,()=>{failed.value=false})
</script>
<style scoped>
.game-art{margin:0;overflow:hidden;background:#ebe9e2;border:1px solid #d9d6cc;border-radius:3px}.game-art img{display:block;width:100%;height:100%;object-fit:contain}.art-thumb{width:44px;height:44px;flex-shrink:0}.art-portrait{width:100%;aspect-ratio:3/4}.art-portrait img{object-fit:cover;object-position:top}.art-card{width:min(100%,280px);flex-shrink:0;aspect-ratio:3/4}.art-unavailable{height:100%;min-height:44px;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#68655c;font-size:12px;text-align:center}.art-unavailable small{font-size:10px}
</style>
