<template>
<section v-if="skills.length || heroes.length || guide || basics.length" class="teaching-media">
<div v-if="basics.length" class="basic-illustrations"><figure v-for="image in basics" :key="image.url"><figcaption>{{ image.title }} · 官方示意图</figcaption><a :href="image.url" target="_blank" rel="noopener noreferrer"><img v-if="!broken[image.url]" :src="image.url" :alt="image.title" loading="lazy" @error="broken[image.url]=true"/><span v-else>图片暂时加载失败，点击查看原图</span></a></figure></div>
<template v-if="skills.length"><h3>技能与效果</h3><article v-for="skill in skills" :key="skill.name" class="skill-row"><img v-if="skill.icon && !broken[skill.icon]" :src="skill.icon" :alt="skill.name" width="64" height="64" loading="lazy" referrerpolicy="no-referrer" @error="broken[skill.icon]=true"/><div><h4>{{ skill.name }}</h4><p>{{ skill.description }}</p></div></article></template>
<template v-if="heroes.length"><h3>本课涉及的卡牌</h3><div class="lesson-hero-strip"><router-link v-for="hero in heroes" :key="hero.id" :to="`/library/heroes/${hero.id}`"><GameArt :entity-id="hero.id" :name="hero.name" variant="portrait"/><span>{{ hero.name }}</span></router-link></div></template>
<figure v-if="guide" class="official-guide"><figcaption>官方阵容图解 · {{ guide.name }} <a :href="guide.url" target="_blank" rel="noopener noreferrer">查看原图 ↗</a></figcaption><a :href="guide.url" target="_blank" rel="noopener noreferrer"><img v-if="!broken[guide.url]" :src="guide.url" :alt="`${guide.name}官方阵容与过渡图解`" loading="lazy" referrerpolicy="no-referrer" @error="broken[guide.url]=true"/><p v-else>图解暂时加载失败，可点击查看原图。</p></a></figure>
<p class="media-credit">图片来自王者万象棋官方卡牌图鉴与新手指引；请结合本页适用版本阅读。</p>
</section>
</template>
<script setup lang="ts">
import { computed, reactive } from 'vue'
import images from '../data/official-art.json'
import GameArt from './GameArt.vue'
const props=defineProps<{entityId?:string;text?:string;lessonSlug?:string}>()
const basicMap: Record<string, {title:string;file:string}[]> = {
 "a-first-look": [{title:"万象大赛：对战与生命值",file:"swiper1_1.png"},{title:"认识棋手",file:"swiper2_1.png"}],
 "b-growth-resource": [{title:"能量与购买",file:"swiper5_1.png"}],
 "b2-energy-ledger": [{title:"能量与购买",file:"swiper5_1.png"}],
 "c-card-effects": [{title:"认识英雄卡牌",file:"swiper3_1.png"},{title:"认识天赋",file:"swiper4_1.png"}]
}
const basics=computed(()=> (basicMap[props.lessonSlug || ""] || []).map(a=>({title:a.title,url:`https://game.gtimg.cn/images/osgame/cp/a202609xszy/${a.file}`})))
const broken=reactive<Record<string,boolean>>({})
const skills=computed(()=> images[props.entityId as keyof typeof images]?.skills || [])
const heroes=computed(()=>props.entityId ? [] : Object.entries(images).filter(([id,a])=>id.startsWith('hero-') && props.text?.includes(a.name)).slice(0,8).map(([id,a])=>({id,name:a.name})))
const guide=computed(()=>{const names=['三分','日落海','大河','河洛','逐鹿'];const i=names.findIndex(n=>props.text?.includes(n));return i<0?null:{name:`${names[i]}阵容`,url:`https://game.gtimg.cn/images/osgame/cp/a202609xszy/guide_${i+1}_3.jpg`}})
</script>
<style scoped>
.basic-illustrations{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-bottom:20px}.basic-illustrations img{display:block;width:100%;height:auto;margin-top:10px}.teaching-media{padding:20px 0;border-block:1px solid #d9d6cc}h3{font-size:18px;margin:0 0 16px}h4{font-size:15px;margin:0 0 6px}.skill-row{display:flex;gap:16px;margin:16px 0;align-items:flex-start}.skill-row img{flex-shrink:0;border-radius:4px;object-fit:contain}.skill-row p{font-size:14px;line-height:1.85}.lesson-hero-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,140px));gap:12px;margin-bottom:20px}.lesson-hero-strip span{display:block;padding:6px 0;font-size:13px}.official-guide{margin:20px 0 0}.official-guide img{display:block;width:100%;max-width:760px;height:auto;margin:12px auto}figcaption{font-size:14px;font-weight:600}figcaption a{margin-left:12px;font-size:12px;color:#35635b}.media-credit{font-size:11px;color:#767365;margin-top:12px}@media(max-width:600px){.lesson-hero-strip{grid-template-columns:repeat(3,minmax(0,1fr))}.skill-row{gap:10px}.skill-row img{width:48px;height:48px}}
</style>
