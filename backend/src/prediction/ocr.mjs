import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {createHash} from 'node:crypto'
import {fail} from './domain.mjs'
const run=promisify(execFile),source=fileURLToPath(new URL('../../tools/ocr/vision.swift',import.meta.url))
let busy=false
export async function recognizeImage(bytes){
 if(process.platform!=='darwin')throw fail('当前OCR仅支持macOS本地Vision；此服务器未配置可用OCR，不会返回伪识别结果','OCR_UNAVAILABLE',503)
 if(busy)throw fail('已有图片正在识别，请稍后重试','OCR_BUSY',429)
 busy=true;let temp
 try{
 const content=await fs.readFile(source),hash=createHash('sha256').update(content).digest('hex').slice(0,16)
 const cache=path.join(os.tmpdir(),'wxq-vision-ocr'),binary=path.join(cache,'vision-'+hash)
 await fs.mkdir(cache,{recursive:true,mode:0o700})
 try{await fs.access(binary)}catch{await run('/usr/bin/swiftc',['-module-cache-path',path.join(cache,'modules'),source,'-o',binary],{timeout:60000,maxBuffer:1024*1024})}
 temp=await fs.mkdtemp(path.join(os.tmpdir(),'wxq-image-'));const file=path.join(temp,'input.image');await fs.writeFile(file,bytes,{mode:0o600})
 const {stdout}=await run(binary,[file],{timeout:30000,maxBuffer:1024*1024})
 const lines=JSON.parse(stdout)
 if(!Array.isArray(lines)||lines.length>500||!lines.every(l=>typeof l.text==='string'&&l.text.length<=1000&&['x','y','width','height','confidence'].every(k=>Number.isFinite(l[k])&&l[k]>=0&&l[k]<=1)))throw new Error('OCR invalid result')
 return {engine:'apple-vision-v1',lines}
 }catch(e){if(e.status)throw e;throw fail('本地OCR执行失败或图片尺寸超过2400万像素；请检查本机Swift/Vision环境或更换清晰截图','OCR_FAILED',503)}finally{if(temp)await fs.rm(temp,{recursive:true,force:true});busy=false}
}
const clean=s=>s.normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu,'').toLowerCase()
function distance(a,b){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next}return row[b.length]}
export function suggestPlayers(lines,players){
 const header=lines.find(l=>/参赛者|参赛选手/.test(l.text)),rows=[]
 for(const l of lines){
  if(header&&(l.y<=header.y+header.height||l.x<header.x-.12||l.x>header.x+.2))continue
  if(/^(排名|参赛者|返奖率|支持人次|总计支持|已支持|回放|阵容组合)$/.test(l.text.trim())||l.text.trim().length<2)continue
  const name=clean(l.text).slice(0,100)
  const candidates=players.map(p=>{const n=clean(p.nickname);return {id:p.id,nickname:p.nickname,similarity:1-distance(name,n)/Math.max(name.length,n.length,1)}}).filter(p=>p.similarity>=.55).sort((a,b)=>b.similarity-a.similarity).slice(0,5)
  if(header||candidates.length)rows.push({rawText:l.text,ocrConfidence:l.confidence,bounds:{x:l.x,y:l.y,width:l.width,height:l.height},candidates})
 }
 return {rows:rows.slice(0,30),phaseHint:lines.some(l=>/回放|最终胜者|胜者阵容|本场胜利/.test(l.text))?'POSTMATCH_INDICATORS':'UNKNOWN',notice:'相似度仅为昵称文本匹配分数，不是身份确认概率；需人工逐席确认，缺第六人不补造。'}
}
