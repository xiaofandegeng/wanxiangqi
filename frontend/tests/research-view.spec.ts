// @vitest-environment happy-dom
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {createApp,nextTick,type App} from 'vue'
import Research from '../src/views/research.vue'
const state=vi.hoisted(()=>({token:null as string|null,section:'overview',api:vi.fn()}))
vi.mock('vue-router',()=>({useRoute:()=>({meta:{researchSection:state.section}})}))
vi.mock('../src/api/prediction',()=>({localResearch:false,getAdminToken:()=>state.token,setAdminToken:(v:string|null)=>{state.token=v},researchApi:(...a:unknown[])=>state.api(...a)}))
let app:App|undefined
const settle=()=>new Promise(r=>setTimeout(r,10))
async function mount(){const host=document.createElement('div');document.body.append(host);app=createApp(Research);app.component('router-link',{template:'<a><slot /></a>'});app.mount(host);await settle();return host}
beforeEach(()=>{state.token=null;state.section='overview';state.api.mockReset();state.api.mockImplementation(async(action:string)=>action==='stats'?{eligibleMatches:0,unlinkedSeats:0,players:[]}:[]);document.body.innerHTML=''})
afterEach(()=>app?.unmount())
describe('预测工作台',()=>{
 it('无凭证显示连接入口，不请求管理数据',async()=>{const host=await mount();expect(host.textContent).toContain('连接你的研究数据');expect(state.api).not.toHaveBeenCalled()})
 it('空库如实零统计，不展示虚构选手；清除凭证后撤下内部内容',async()=>{state.token='TEST-ONLY';const host=await mount();expect(host.textContent).toContain('完整排名赛果 0 场登记');expect(host.textContent).toContain('先有赛果');const b=[...host.querySelectorAll('button')].find(b=>b.textContent==='清除凭证')!;b.click();await nextTick();expect(state.token).toBeNull();expect(host.textContent).not.toContain('完整排名赛果 0 场登记')})
 it('接口失败不冒充空库',async()=>{state.token='TEST-ONLY';state.api.mockRejectedValue(new Error('连接失败'));const host=await mount();expect(host.querySelector('[role=alert]')?.textContent).toContain('连接失败');expect(host.textContent).not.toContain('先有赛果')})
 it('预测空态不出概率，按钮禁用',async()=>{state.token='TEST-ONLY';state.section='predict';const host=await mount();expect(host.textContent).toContain('王牌对决 · 本场分析');expect(host.textContent).not.toContain('生成研究基线');expect(host.querySelector<HTMLButtonElement>('button.primary')?.disabled).toBe(true);expect(host.querySelector('meter')).toBeNull()})
})
