// 专用开发入口：独立库、固定端口、持久本地令牌。不读取业务库配置。
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomBytes} from 'node:crypto'
import {spawn} from 'node:child_process'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const file=path.join(root,'.env.prediction.local')
if(!fs.existsSync(file))fs.writeFileSync(file,`ADMIN_TOKEN=${randomBytes(32).toString('hex')}\n`,{mode:0o600})
const token=fs.readFileSync(file,'utf8').match(/^ADMIN_TOKEN=(\S+)$/m)?.[1]
if(!token)throw new Error('.env.prediction.local 缺少ADMIN_TOKEN')
console.log('预测开发库固定为 wanxiangqi_prediction_dev；端口8082。管理凭证见 backend/.env.prediction.local（勿提交）。')
const child=spawn(process.execPath,['--watch','src/server.js'],{cwd:root,stdio:'inherit',env:{...process.env,PGDATABASE:'wanxiangqi_prediction_dev',PGHOST:process.env.PGHOST||'127.0.0.1',PGUSER:process.env.PGUSER||process.env.USER,HOST:'127.0.0.1',PORT:'8082',ADMIN_TOKEN:token}})
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
child.on('exit',code=>process.exit(code||0))
