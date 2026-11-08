// 增量导入本地已转写来源包；仅预测开发库和独立测试库。不会读取业务 .env。
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import pg from 'pg'
import {runMigrations} from '../src/migrate.mjs'
import {importCatalog,CatalogService} from '../src/prediction/catalog.mjs'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..')
const args=process.argv.slice(2),at=args.indexOf('--db'),db=at<0?'wanxiangqi_prediction_dev':args[at+1]
if(db!=='wanxiangqi_prediction_dev'&&!/^wanxiangqi_[a-z0-9_]+_test$/.test(db||''))throw new Error('拒绝非预测开发库/专用测试库；业务库不在本工具授权范围')
const pool=new pg.Pool({host:process.env.PGHOST||'127.0.0.1',port:Number(process.env.PGPORT||5432),user:process.env.PGUSER||process.env.USER,database:db})
try{
 const c=await pool.connect();try{await runMigrations(c)}finally{c.release()}
 const data=JSON.parse(await fs.readFile(path.join(root,'backend/data/prediction-catalog/ruanshi.json'),'utf8'))
 const imported=await importCatalog(pool,data,async m=>{const file=path.resolve(root,m.file);if(!file.startsWith(path.join(root,'docs/prediction_artifacts')+path.sep))throw new Error('原件必须在项目研究存证目录');return fs.readFile(file)})
 const summary=await new CatalogService(pool).list()
 console.log(JSON.stringify({database:db,...imported,...summary.counts,contributesToModel:false},null,2))
}finally{await pool.end()}
