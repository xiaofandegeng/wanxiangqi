// @vitest-environment happy-dom
import {describe,it,expect,vi,afterEach} from 'vitest'
import {createApp,nextTick,type App} from 'vue'
import Catalog from '../src/components/PlayerCatalog.vue'
const {api}=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../src/api/prediction',()=>({researchApi:api}))
let app:App
const wait=()=>new Promise(r=>setTimeout(r,10))
async function mount(){document.body.innerHTML='';const el=document.createElement('div');document.body.append(el);app=createApp(Catalog);app.mount(el);await wait();return el}
afterEach(()=>app?.unmount())
describe('选手玩法档案',()=>{
 it('玩法、胜者、作者棋手评价分别呈现，搜索玩法能找到昵称',async()=>{
 api.mockResolvedValue({notice:'未确认UID',counts:{matches:1,plays:6,players:1,claims:1},sources:[],players:[{id:'TEST',nickname:'TEST ONLY',observedMatches:1,observedWins:1,commonBuilds:[],builds:[{label:'测试阵容',observations:1}],history:[{matchId:'TEST',day:'2026-01-01',ordinal:1,build:'测试阵容',rank:1,winnerBuild:'获胜转型',sourceUrl:'https://example.com'}],claims:[{id:'CLAIM',kind:'COMMANDER_AUTHOR_CLAIM',text:'玉环',sourceUrl:'https://example.com',windowStart:'2026-01-01',windowEnd:'2026-01-02',aggregate:null}]}]})
 const el=await mount();expect(el.textContent).toContain('尚无充分逐局统计证明');expect(el.textContent).toContain('棋手关联：玉环');expect(el.textContent).toContain('获胜：获胜转型')
 const input=el.querySelector('input')!;input.value='测试阵容';input.dispatchEvent(new Event('input'));await nextTick();expect(el.querySelectorAll('article')).toHaveLength(1);input.value='没有这个人';input.dispatchEvent(new Event('input'));await nextTick();expect(el.querySelectorAll('article')).toHaveLength(0)
 })
 it('加载失败可重试，不把错误当空库',async()=>{api.mockRejectedValue(new Error('数据库不可用'));const el=await mount();expect(el.querySelector('[role=alert]')?.textContent).toContain('数据库不可用');expect(el.textContent).not.toContain('0 场来源记录')})
})
