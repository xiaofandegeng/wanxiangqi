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
 it('选手统计排行榜支持按胜场、胜率、出场数排序切换',async()=>{
  state.token='TEST-ONLY';
  state.section='players';
  state.api.mockImplementation(async(action:string)=>{
    if (action === 'catalog') {
      return {
        counts: { players: 2, matches: 2, plays: 12, claims: 0, sources: 1 },
        players: [
          { id: 'p1', nickname: '选手甲', observedMatches: 10, observedWins: 2, commonBuilds: [], builds: [], claims: [], history: [] },
          { id: 'p2', nickname: '选手乙', observedMatches: 4, observedWins: 3, commonBuilds: [], builds: [], claims: [], history: [] }
        ]
      }
    }
    return action === 'stats' ? { eligibleMatches: 0, unlinkedSeats: 0, players: [] } : []
  })
  const host = await mount()
  expect(host.textContent).toContain('王牌对决选手登顶排行榜')
  // 默认胜场排序：选手乙(3胜)在第一行，选手甲(2胜)在第二行
  const names = () => [...host.querySelectorAll('.player-name')].map(el => el.textContent?.trim())
  expect(names()).toEqual(['选手乙', '选手甲'])

  // 点击观察场次表头排序
  const thMatches = [...host.querySelectorAll('th')].find(th => th.textContent?.includes('观察场次'))!
  thMatches.click()
  await nextTick()
  // 降序：选手甲(10场)排第一
  expect(names()).toEqual(['选手甲', '选手乙'])

  // 再次点击观察场次切换为升序
  thMatches.click()
  await nextTick()
  // 升序：选手乙(4场)排第一
  expect(names()).toEqual(['选手乙', '选手甲'])

  // 点击登顶胜率表头排序
  const thWinRate = [...host.querySelectorAll('th')].find(th => th.textContent?.includes('登顶胜率'))!
  thWinRate.click()
  await nextTick()
  // 降序：选手乙(75%)在第一，选手甲(20%)在第二
  expect(names()).toEqual(['选手乙', '选手甲'])
 })
})
