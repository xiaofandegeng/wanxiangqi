// 从已存证的官方卡牌目录生成图片索引；不编造素材、不改动数据库。
import fs from 'node:fs'
import {fileURLToPath} from 'node:url'
const data = new URL('../../backend/tools/content-build/data/', import.meta.url)
const output = {}
for(const [type,key,prefix] of [['heroes','heroCards','hero'],['equips','equipCards','equip'],['effects','effectCards','effcard'],['talents','talentCards','tal']]) {
 const raw=JSON.parse(fs.readFileSync(new URL(`oscard-${type}.json`,data),'utf8'))
 for(const c of raw[key]) output[`${prefix}-${c.id}`]={name:c.name,portrait:c.image || null,thumb:c.thumb || null,card:c.cardImage || null,skills:(c.heroCard?.skillList || []).map(s=>({name:s.name,icon:s.icon || null,description:(s.desc || '').replace(/<[^>]+>/g,'')}))}
}
fs.writeFileSync(fileURLToPath(new URL('../src/data/official-art.json',import.meta.url)),JSON.stringify(output,null,2)+'\n')
console.log(`官方图片索引：${Object.keys(output).length} 张卡牌`)
