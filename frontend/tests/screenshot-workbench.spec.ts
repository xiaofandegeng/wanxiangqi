// @vitest-environment happy-dom
import {describe,it,expect,vi,afterEach} from 'vitest'
import {createApp,nextTick,type App} from 'vue'
import Workbench from '../src/components/ScreenshotWorkbench.vue'
const {api,upload}=vi.hoisted(()=>({api:vi.fn(),upload:vi.fn()}))
vi.mock('../src/api/prediction',()=>({researchApi:api}))
vi.mock('../src/api/index',()=>({uploadEvidence:upload}))
let app:App
const wait=()=>new Promise(r=>setTimeout(r,10))
async function mount(){document.body.innerHTML='';const el=document.createElement('div');document.body.append(el);app=createApp(Workbench);app.mount(el);await wait();return el}
afterEach(()=>app?.unmount())
describe('截图工作台',()=>{
 it('未上传不生成预测，原图上传为内部范围；OCR后仍需六席人工确认',async()=>{
 api.mockImplementation(async(action:string)=>action==='catalog'?{players:[]}:{id:'TEST',featureCutoff:'2026-10-31T00:00:00Z',ocr:{phaseHint:'POSTMATCH_INDICATORS',rows:[{rawText:'TEST-A',candidates:[]}]}});upload.mockResolvedValue({evidenceId:'TEST-EV'})
 const el=await mount();expect(el.querySelector<HTMLButtonElement>('.primary')!.disabled).toBe(true)
 const time=el.querySelector<HTMLInputElement>('input[type=datetime-local]')!;time.value='2026-10-31T12:00';time.dispatchEvent(new Event('input'));const input=el.querySelector<HTMLInputElement>('input[type=file]')!;Object.defineProperty(input,'files',{value:[new File(['TEST ONLY'],'fixture.png',{type:'image/png'})]});input.dispatchEvent(new Event('change'));await nextTick();el.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wait()
 expect(upload.mock.calls[0][1].usageScope).toBe('INTERNAL_ONLY');expect(api).toHaveBeenCalledWith('screenshots',{evidenceId:'TEST-EV'});expect(el.textContent).toContain('赛后标记');expect(el.querySelectorAll('.shot-seat')).toHaveLength(6);expect([...el.querySelectorAll<HTMLInputElement>('.shot-seat > label input')].filter(i=>!i.value)).toHaveLength(5);expect(el.querySelector<HTMLButtonElement>('.shot-review button')!.disabled).toBe(true);expect(el.textContent).not.toContain('50.0%')
 })
 it('OCR不可用保留已入库证据编号，不伪造识别成功',async()=>{api.mockImplementation(async(a:string)=>{if(a==='catalog')return {players:[]};throw new Error('本地OCR不可用')});upload.mockResolvedValue({evidenceId:'TEST-SAVED'})
 const el=await mount();const time=el.querySelector<HTMLInputElement>('input[type=datetime-local]')!;time.value='2026-10-31T12:00';time.dispatchEvent(new Event('input'));const input=el.querySelector<HTMLInputElement>('input[type=file]')!;Object.defineProperty(input,'files',{value:[new File(['TEST'],'fixture.png')]});input.dispatchEvent(new Event('change'));await nextTick();el.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wait();expect(el.querySelector('[role=alert]')?.textContent).toContain('OCR不可用');expect(el.textContent).toContain('TEST-SAVED');expect(el.querySelector('.shot-review')).toBeNull()
 })
})

it('提交棋手与禁用，不提交返奖报价',async()=>{
 api.mockImplementation(async(a:string)=>a==='catalog'?{players:[]}:a==='screenshots'?{id:'TEST',featureCutoff:'2026-10-31T00:00:00Z',ocr:{phaseHint:'UNKNOWN',rows:Array.from({length:6},(_,i)=>({rawText:'TEST'+i,candidates:[]}))}}:{status:'DATA_AUDIT_ONLY',notice:'TEST',featureCutoff:'2026-10-31T00:00:00Z',blockers:[],players:[]});upload.mockResolvedValue({evidenceId:'TEST-EV'})
 const el=await mount();const input=el.querySelector<HTMLInputElement>('input[type=file]')!;Object.defineProperty(input,'files',{value:[new File(['TEST'],'fixture.png')]});input.dispatchEvent(new Event('change'))
 const time=el.querySelector<HTMLInputElement>('input[type=datetime-local]')!;time.value='2026-10-31T12:00';time.dispatchEvent(new Event('input'));await nextTick();el.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wait()
 const stage=el.querySelectorAll<HTMLSelectElement>('.shot-meta select')[1]!;stage.value='OPEN';stage.dispatchEvent(new Event('change'))
 const version=el.querySelector<HTMLInputElement>('.shot-meta input')!;version.value='v1.8.1';version.dispatchEvent(new Event('input'))
 const commander=el.querySelector<HTMLInputElement>('.shot-seat-context input')!;commander.value='小妲己';commander.dispatchEvent(new Event('input'))
 const ban=el.querySelector<HTMLInputElement>('input[placeholder^="未显示"]')!;ban.value='日落海';ban.dispatchEvent(new Event('input'))
 for(const box of el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')){box.checked=true;box.dispatchEvent(new Event('change'))}await nextTick()
 el.querySelector('.shot-review')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wait()
 const payload=api.mock.calls.find((c:any[])=>c[0]==='screenshots/TEST/analyze')![1];expect(payload.experimentalProbability).toBe(true);expect(payload.aceContext.supportStage).toBe('OPEN');expect(payload.aceContext.bannedFaction).toBe('日落海');expect(payload.aceContext).not.toHaveProperty('grossReturnConfirmed');expect(payload.players[0].commander).toBe('小妲己');expect(payload.players[0]).not.toHaveProperty('returnMultiplier');expect(payload.players[1].commander).toBe('');expect(el.textContent).toContain('没有经过校准')
})

it('恢复后端实验概率快照，仅格式化展示，不由前端重新估算',async()=>{
 api.mockImplementation(async(a:string)=>a==='catalog'?{players:[]}:{status:'EXPERIMENTAL_PROBABILITIES',notice:'测试后端结果',featureCutoff:'2026-10-31T00:00:00Z',blockers:[],players:[],model:{modelVersion:'TEST-PROGRAM',trainingMatches:54,calibrated:false,dataHash:'TEST-HASH',notice:'TEST ONLY',players:Array.from({length:6},(_,i)=>({nickname:'TEST'+i,probability:1/6,coldStart:false})),diagnostic:{evaluatedMatches:0,model:null,uniform:null,notice:'测试诊断'}}})
 const el=await mount();const input=el.querySelector<HTMLInputElement>('.shot-restore input')!;input.value='TEST-ID';input.dispatchEvent(new Event('input'));await nextTick();el.querySelector('.shot-restore')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wait()
 expect(api).toHaveBeenCalledWith('screenshot-analyses/TEST-ID');expect(el.querySelectorAll('.shot-model ol li')).toHaveLength(6);expect(el.querySelector('.shot-model')?.textContent).toContain('16.67%');expect(el.textContent).toContain('未校准实验概率')
})
