// @vitest-environment happy-dom
import {describe,it,expect,vi,afterEach} from 'vitest'
import {createApp,nextTick,type App} from 'vue'
import Workbench from '../src/components/ScreenshotWorkbench.vue'
const {api,upload}=vi.hoisted(()=>({api:vi.fn(),upload:vi.fn()}))
vi.mock('../src/api/prediction',()=>({researchApi:api}))
vi.mock('../src/api/index',()=>({uploadEvidence:upload}))
let app:App
it('红黑榜双栏呈现、可切换窗口，且只能生成一次不可重复生成',async()=>{
 const redRow={profileId:'P',nickname:'TEST 红榜选手',samples3:1,samples7:2,average3:3,average7:2,weightedGap:2.7,
  accounts:[{key:'UID',account:{platform:'test',region:'test',uid:'001'},samples3:1,samples7:2,
   profiles:[{profileId:'P',nickname:'TEST 旧昵称',samples3:1,samples7:1},
    {profileId:'A',nickname:'TEST 新昵称',samples3:0,samples7:1}]}]}
 const blackRow={profileId:'B',nickname:'TEST 黑榜选手',samples3:1,samples7:1,average3:-2,average7:-2,weightedGap:-2}
 const initialBoard={generated:false,windows:{recent3:{live:1,replayed:0,red:[redRow],black:[blackRow]},recent7:{live:1,replayed:0,red:[redRow],black:[blackRow]}}}
 const generatedBoard={generated:true,windows:{recent3:{live:1,replayed:1,red:[redRow],black:[blackRow]},recent7:{live:1,replayed:1,red:[redRow],black:[blackRow]}}}
 api.mockClear()
 api.mockImplementation(async(action:string)=>action==='catalog'?{players:[]}:
  action==='rank-feedback/generate'?{board:generatedBoard,generation:{generated:1,unchanged:1,live:1,withdrawn:0,skipped:[]}}:initialBoard)
 const el=await mount()
 const board=el.querySelector<HTMLDetailsElement>('.rank-feedback')!
 expect(api).not.toHaveBeenCalledWith('rank-feedback')
 board.open=true
 board.dispatchEvent(new Event('toggle'))
 await wait()
 expect(api).toHaveBeenCalledWith('rank-feedback')
 const redCol=board.querySelector('.rank-column.is-red')!
 const blackCol=board.querySelector('.rank-column.is-black')!
 expect(redCol.textContent).toContain('TEST 红榜选手')
 expect(blackCol.textContent).toContain('TEST 黑榜选手')
 expect(redCol.textContent).toContain('+2.00 名')
 expect(redCol.textContent).toContain('1 个已核验账号 · 2 份档案')
 expect(redCol.textContent).toContain('TEST 新昵称')
 const select=board.querySelector('select')!
 select.value='recent3'
 select.dispatchEvent(new Event('change'))
 await nextTick()
 expect(redCol.textContent).toContain('+3.00 名')
 expect(board.textContent).toContain('最近 3 天 70%')
 const genBtn=board.querySelector<HTMLButtonElement>('.btn-rank-generate')!
 expect(genBtn.disabled).toBe(false)
 expect(genBtn.textContent).toContain('生成红黑榜')
 genBtn.click()
 await wait()
 expect(api).toHaveBeenCalledWith('rank-feedback/generate',{})
 expect(board.textContent).toContain('新增或更新 1 场')
 expect(genBtn.disabled).toBe(true)
 expect(genBtn.textContent).toContain('红黑榜已生成')
 genBtn.click()
 await wait()
 expect(api.mock.calls.filter(([action])=>action==='rank-feedback/generate')).toHaveLength(1)
})
const wait=()=>new Promise(r=>setTimeout(r,10))
async function mount(){document.body.innerHTML='';const el=document.createElement('div');document.body.append(el);app=createApp(Workbench);app.mount(el);await wait();return el}
afterEach(()=>app?.unmount())
describe('截图工作台',()=>{
 it('极速推演提交六席和当场条件，并显示数据库返回的未知值',async()=>{
  api.mockClear()
  api.mockImplementation(async(action:string)=>{
   if(action==='catalog') return {players:[],matches:[]}
   if(action!=='forecast') throw new Error('unexpected action')
   return {
    status:'INSUFFICIENT_DATABASE_HISTORY',trainingMatches:7,modelVersion:'TEST-DB',notice:'入库记录不足',
    players:Array.from({length:6},(_,i)=>({nickname:`选手${i+1}`,probability:null,historicalMatches:0,historicalWins:0})),
    buildProjections:Array.from({length:6},()=>({candidates:[],commanderSamples:0,commanderWins:0,unknownShare:1})),
    talentProjections:{version:'v1.11.1',players:Array.from({length:6},(_,i)=>({
     buildSamples:i===0?3:0,talentSamples:i===0?1:0,
     candidates:i===0?[{build:'三分登场',talent:'点兵点将',observations:1,buildSamples:3}]:[]
    }))}
   }
  })
  const el=await mount()
  const roster=el.querySelector<HTMLInputElement>('.forecast-batch input')!
  roster.value='选手1 选手2 选手3 选手4 选手5 选手6'
  roster.dispatchEvent(new Event('input'))
  el.querySelector<HTMLButtonElement>('.forecast-batch button')!.click()
  await nextTick()
  const button=el.querySelector<HTMLButtonElement>('.forecast-submit')!
  expect(button.disabled).toBe(true)
  for(const commander of el.querySelectorAll<HTMLInputElement>('input[list=forecast-commanders]')){
   commander.value='已选棋手'
   commander.dispatchEvent(new Event('input'))
  }
  const ban=el.querySelector<HTMLInputElement>('input[list=forecast-bans]')!
  ban.value='三分'
  ban.dispatchEvent(new Event('input'))
  await nextTick()
  expect(button.disabled).toBe(false)
  button.click()
  await wait()
  const payload=api.mock.calls.find(([action])=>action==='forecast')![1]
  expect(payload).toEqual({bannedFaction:'三分',players:Array.from({length:6},(_,i)=>({
   profileId:`选手${i+1}`,commander:'已选棋手'
  }))})
  expect(el.querySelector('.forecast-result')?.textContent).toContain('7 场入库训练')
  expect(el.querySelector('.forecast-result')?.textContent).toContain('阵容待确认')
  expect(el.querySelector('.forecast-result')?.textContent).toContain('点兵点将')
  expect(el.querySelector('.forecast-result')?.textContent).toContain('天赋待确认')
  expect(el.querySelector('.forecast-result')?.textContent).toContain('未计算')
  expect(el.querySelector('.forecast-result')?.textContent).not.toContain('16.67%')
 })
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

it('截图核对只提交名单与资料确认，保留独立的预测表单',async()=>{
 api.mockClear()
 api.mockImplementation(async(action:string)=>action==='catalog'?{players:[]}:
  action==='screenshots'?{id:'TEST',featureCutoff:'2026-10-31T00:00:00Z',ocr:{
   phaseHint:'POSTMATCH_INDICATORS',rows:Array.from({length:6},(_,i)=>({rawText:'TEST'+i,candidates:[]}))
  }}:{status:'DATA_AUDIT_ONLY',notice:'资料核对完成',featureCutoff:'2026-10-31T00:00:00Z',blockers:[],players:[]})
 upload.mockResolvedValue({evidenceId:'TEST-EV'})
 const el=await mount()
 const forecastId=el.querySelector<HTMLInputElement>('input[list=forecast-players]')!
 forecastId.value='PREMATCH-ID'
 forecastId.dispatchEvent(new Event('input'))
 const image=el.querySelector<HTMLInputElement>('input[type=file]')!
 Object.defineProperty(image,'files',{value:[new File(['TEST'],'fixture.png')]})
 image.dispatchEvent(new Event('change'))
 const time=el.querySelector<HTMLInputElement>('input[type=datetime-local]')!
 time.value='2026-10-31T12:00'
 time.dispatchEvent(new Event('input'))
 const operator=el.querySelector<HTMLInputElement>('input[placeholder="操作人标识"]')!
 operator.value='复核人'
 operator.dispatchEvent(new Event('input'))
 await nextTick()
 el.querySelector('.shot-upload')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))
 await wait()
 expect(forecastId.value).toBe('PREMATCH-ID')
 const confirmed=el.querySelector<HTMLInputElement>('.shot-review .shot-confirm input')!
 confirmed.checked=true
 confirmed.dispatchEvent(new Event('change'))
 el.querySelector('.shot-review')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))
 await wait()
 expect(api.mock.calls.find(([action])=>action==='screenshots/TEST/analyze')?.[1]).toEqual({
  identityConfirmed:true,operator:'复核人',
  players:Array.from({length:6},(_,i)=>({nickname:'TEST'+i,profileId:null}))
 })
 expect(api.mock.calls.some(([action])=>action==='forecast')).toBe(false)
 expect(el.querySelector('.shot-result')?.textContent).toContain('资料核对完成')
})

it('可恢复历史截图核对资料',async()=>{
 api.mockImplementation(async(action:string)=>action==='catalog'?{players:[]}:
  {status:'DATA_AUDIT_ONLY',notice:'已保存核对资料',featureCutoff:'2026-10-31T00:00:00Z',blockers:[],players:[]})
 const el=await mount()
 const input=el.querySelector<HTMLInputElement>('.shot-restore input')!
 input.value='TEST-ID'
 input.dispatchEvent(new Event('input'))
 el.querySelector('.shot-restore')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))
 await wait()
 expect(api).toHaveBeenCalledWith('screenshot-analyses/TEST-ID')
 expect(el.querySelector('.shot-result')?.textContent).toContain('已保存核对资料')
})

it('支持一键同步改名库、手动归并改名昵称及同场冲突拦截提示',async()=>{
 api.mockClear()
 api.mockImplementation(async(action:string,body?:any)=>{
  if(action==='catalog') return {
   players:[{id:'p-qingci',personUid:'WXQP-B163DF6042',nickname:'抖音EG清辞',linkedNicknames:['EG清辞']}],
   rawPlayers:[{id:'p-alias',nickname:'抖音清辞4连6',canonicalId:'p-qingci'}],
   matches:[]
  }
  if(action==='player-links/sync-verified') return {linkedGroups:8,linkedAliases:15,registeredBadges:5,skippedConflicts:[]}
  if(action==='player-links'){
   if(body.aliasPlayer==='抖音梦飞冻冻') throw new Error('检测到同场对战冲突（2026-11-19 第 8 场），属于不同参赛账号，禁止合并')
   return {linked:true,alreadyLinked:false,aliasNickname:body.aliasPlayer,canonicalNickname:body.canonicalPlayer,personUid:'WXQP-B163DF6042',badge:'开服奠基人 #0014'}
  }
  throw new Error('unexpected '+action)
 })
 const el=await mount()
 const panel=el.querySelector<HTMLDetailsElement>('.identity-merge-panel')!
 panel.open=true
 const syncBtn=panel.querySelector<HTMLButtonElement>('.btn-sync-identities')!
 syncBtn.click()
 await wait()
 expect(api).toHaveBeenCalledWith('player-links/sync-verified',{})
 expect(panel.textContent).toContain('归并 8 组选手')

 const inputs=panel.querySelectorAll<HTMLInputElement>('.quick-merge-form input')
 const select=panel.querySelector<HTMLSelectElement>('.quick-merge-form select')!
 inputs[0].value='抖音梦飞冻冻'
 inputs[0].dispatchEvent(new Event('input'))
 inputs[1].value='抖音梦飞'
 inputs[1].dispatchEvent(new Event('input'))
 await nextTick()
 panel.querySelector<HTMLButtonElement>('.btn-quick-merge')!.click()
 await wait()
 expect(panel.querySelector('.merge-feedback.is-error')?.textContent).toContain('同场对战冲突')

 inputs[0].value='抖音清辞4连6'
 inputs[0].dispatchEvent(new Event('input'))
 inputs[1].value='抖音EG清辞'
 inputs[1].dispatchEvent(new Event('input'))
 select.value='FOUNDER_BADGE'
 select.dispatchEvent(new Event('change'))
 await nextTick()
 inputs[2].value='0014'
 inputs[2].dispatchEvent(new Event('input'))
 await nextTick()
 panel.querySelector<HTMLButtonElement>('.btn-quick-merge')!.click()
 await wait()
 expect(panel.textContent).toContain('WXQP-B163DF6042')
 expect(panel.textContent).toContain('开服奠基人 #0014')
})
