// Same authenticated backend program as UI; no manually supplied probabilities.
import fs from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1]
if(!args.includes('--draft')||!args.includes('--request-file'))throw Error('Required: --draft ID --request-file PATH')
const token=(await fs.readFile(fileURLToPath(new URL('../.env.prediction.local',import.meta.url)),'utf8')).match(/^ADMIN_TOKEN=(\S+)$/m)?.[1]
if(!token)throw Error('Local prediction token missing')
const raw=JSON.parse(await fs.readFile(arg('--request-file'),'utf8')),input={...(raw.input||raw),experimentalProbability:true}
const response=await fetch(`http://127.0.0.1:8082/api/v1/admin/prediction/screenshots/${encodeURIComponent(arg('--draft'))}/analyze`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(input)})
const result=await response.json();if(!response.ok)throw Error(result.error||'Backend computation failed')
console.log(JSON.stringify(result.data,null,2))
