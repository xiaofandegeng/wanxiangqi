// @vitest-environment happy-dom
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {createApp,nextTick,type App} from 'vue'
import Inbox from '../src/components/ObservationInbox.vue'
const {api}=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../src/api/prediction',()=>({researchApi:(...args:unknown[])=>api(...args)}))
let app:App|undefined
const settle=()=>new Promise(r=>setTimeout(r,10))
async function mount(){const host=document.createElement('div');document.body.append(host);app=createApp(Inbox);app.component('router-link',{template:'<a><slot /></a>'});app.mount(host);await settle();return host}
beforeEach(()=>{api.mockReset();api.mockResolvedValue([]);document.body.innerHTML=''})
afterEach(()=>app?.unmount())
describe('来源资料接入',()=>{
 it('真实空态说明资料不进入逐场统计',async()=>{const host=await mount();expect(host.textContent).toContain('暂无资料');expect(host.textContent).toContain('序号不是最终排名');expect(host.querySelectorAll('.source-player')).toHaveLength(6)})
 it('失败状态不误报暂无资料',async()=>{api.mockRejectedValue(new Error('服务离线'));const host=await mount();expect(host.querySelector('[role=alert]')?.textContent).toContain('服务离线');expect(host.textContent).not.toContain('暂无资料')})
 it('切换为汇总后呈现分母输入，不混用六席排名表',async()=>{const host=await mount();const select=host.querySelector('select')!;select.value='PLAYER_AGGREGATE';select.dispatchEvent(new Event('change'));await nextTick();expect(host.querySelectorAll('.source-player')).toHaveLength(0);expect(host.textContent).toContain('出场数');expect(host.textContent).toContain('不按四舍五入百分比反推场数');expect([...host.querySelectorAll<HTMLInputElement>('input[type=number]')].every(input=>input.value==='')).toBe(true)})
 it('名单序号不展示为最终排名，原件失效明确标注',async()=>{api.mockResolvedValue([{id:'TEST',kind:'ROSTER_WINNER',sourceName:'TEST',sourceUrl:'https://example.com',windowStart:'2026-01-01',windowEnd:'2026-01-01',mode:'WANXIANG',status:'VERIFIED',evidenceReady:false,winnerSlot:2,participants:[{nickname:'A',uid:null},{nickname:'B',uid:null}]}]);const host=await mount();expect(host.textContent).toContain('原件已失效');expect(host.textContent).toContain('其他五人的最终名次未知');expect(host.textContent).toContain('名单序号（非排名）')})
 it('保存名单发送winnerSlot，不发送推测rank；成功后重新加载',async()=>{
  const host=await mount();api.mockImplementation(async(action:string,body?:unknown)=>body?{deduplicated:false}:[])
  host.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));await settle()
  const payload=api.mock.calls.find(c=>c.length===2)?.[1] as {participants:Array<Record<string,unknown>>;winnerSlot:number;kind:string}
  expect(payload.kind).toBe('ROSTER_WINNER');expect(payload.winnerSlot).toBe(1);expect(payload.participants).toHaveLength(6);expect(payload.participants.every(p=>!('rank' in p))).toBe(true)
  expect(host.textContent).toContain('未计入完整赛果统计')
 })
})
