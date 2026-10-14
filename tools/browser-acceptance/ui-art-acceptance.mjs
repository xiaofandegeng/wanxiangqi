// 图文 UI 验收：只启动 v6dev 开发库，不重建开发库，不连接业务库。
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { launchChrome,CdpBrowser,CdpPage,sleep } from './cdp.mjs'
import { fileURLToPath } from 'node:url'
const root=fileURLToPath(new URL('../../',import.meta.url))
const out=root+'docs/v6_artifacts/ui-art-'+new Date().toISOString().replace(/[:.]/g,'-')
fs.mkdirSync(out,{recursive:true})
const backend=spawn('node',['src/server.js'],{cwd:root+'backend',env:{...process.env,PGDATABASE:'wanxiangqi_v6dev',PGHOST:'127.0.0.1',PGUSER:process.env.USER,PORT:'18089',HOST:'127.0.0.1'},stdio:'ignore'})
const vite=spawn('npm',['exec','vite','--','--host','127.0.0.1','--port','5198','--strictPort'],{cwd:root+'frontend',env:{...process.env,WXQ_API_TARGET:'http://127.0.0.1:18089'},stdio:'ignore'})
let browser;const results=[]
try {
 for(let i=0;i<80;i++){try{const r=await fetch('http://127.0.0.1:18089/api/v1/ready');if(r.ok && (await fetch('http://127.0.0.1:5198')).ok)break}catch{}await sleep(250)}
 const launched=await launchChrome();browser=await new CdpBrowser(launched.wsEndpoint,launched).connect();const page=await CdpPage.create(browser)
 for(const width of [360,768,1440])for(const route of ['/','/learn','/library','/library/heroes/hero-1231','/lineups/sanfen-dengchang','/learn/a-first-look']){
  await page.setViewport({width,height:900,mobile:width===360});await page.goto('http://127.0.0.1:5198'+route,{settleMs:1800})
  if(route==='/library')await page.eval(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('天赋'))?.click()`)
  await sleep(900)
  const r=await page.eval(`({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,loaded:Array.from(document.querySelectorAll('img')).filter(i=>i.complete&&i.naturalWidth>0).length,failed:document.querySelectorAll('.art-unavailable').length,missing:!!document.querySelector('.not-found-state') || !!Array.from(document.querySelectorAll('.state-title')).find(e=>e.textContent.includes('未找到')),errors:document.body.innerText.includes('加载失败'),text:document.body.innerText.slice(0,250)})`)
  results.push({width,route,...r,pass:r.overflow<=1&&(route==='/learn'||r.loaded>0)&&!r.errors&&!r.missing})
  await page.screenshot(out+'/'+width+'-'+route.replaceAll('/','_')+'.png')
 }
 fs.writeFileSync(out+'/checks.json',JSON.stringify(results,null,2));console.log(JSON.stringify({out,results},null,2));if(results.some(r=>!r.pass))process.exitCode=1
}finally{await browser?.close();vite.kill('SIGTERM');backend.kill('SIGTERM')}
