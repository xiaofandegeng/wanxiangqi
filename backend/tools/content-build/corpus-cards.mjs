// v6 M4-2 · 官方卡牌图鉴语料（第一方数据接口 → 实体资料）
//
// 数据来源：官网卡牌图鉴四个官方 JSON 接口（portal cards.js 以 $.getJSON 拉取）
//  + cards.js 本体（关键词/阵营/品阶/分类口径的官方定义）。
// 原始 JSON 以字节级副本固定在 data/ 下。两级指纹（2026-10-04 发现官方 JSON
// 接口内嵌轮换内容，纯字节锁定会误伤）：
//  - sha256（字节指纹）：data 文件本身的 sha256——快照出处锚定，永不变；
//  - semanticSha256（语义指纹）：剥离官方轮换子树后的规范化 JSON sha256，
//    构建时对「本地文件」与「raw_materials 存证」双侧计算并断言相等——
//    实质数据（名称/品阶/效果原文/关键词/技能/属性/费用/觉醒/获取）任一
//    变化仍会构建失败，不静默用过期数据。
// 轮换子树（本站 facts 不读取、比对时剥离，原件仍完整存证于 raw_materials）：
//  - previewCards / sourceCards：官方「预告卡/来源卡」展示区，内容随运营轮换；
//  - skillList[].url：技能视频签名 URL（video2.osgame.qq.com/<签名>/<过期hex>/…），
//    签名随服务端重发轮换（skillList[].desc 等文本字段不轮换）。
//
// 实体 ID 策略：id = slug = `<前缀>-<官方目录ID>`（hero-1231/equip-56/…），
// 直接采用第一方稳定 ID，可追溯回官方目录；displayName 为官方名称。
//
// 铁律：facts 只登记目录明示内容（品阶/阵营/关键词/技能原文/属性数值/费用/
// 觉醒描述/获取说明），文本经 cleanRichText 去标记后必须与存证 JSON 中
// 对应字段原文逐字相等（构建时机械化断言）；目录未给的推断一律不写。

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')

// 固定指纹：data 文件 ↔ 官方接口存证 双向锁定（语义指纹见上方两级指纹说明）
export const CARD_DATA_FILES = [
  {
    file: 'oscard-heroes.json', recordKey: 'official:cards:heroes', arrayKey: 'heroCards',
    kind: 'HERO', idPrefix: 'hero',
    sha256: 'b26192569570631d1cc9560f7ff242bc9143bf8b1cbe507be8a0664c391d33f1',
    semanticSha256: 'c38a6f1365a641508509a374a9f02c4e396939ada818c08e442472db53266ebb'
  },
  {
    file: 'oscard-effects.json', recordKey: 'official:cards:effects', arrayKey: 'effectCards',
    kind: 'EFFECT_CARD', idPrefix: 'effcard',
    sha256: '538b3094e8813e9fba6c84aa3ec5c69f57419cd1b24298950d02c374d541fdd7',
    semanticSha256: 'f7c5f22d883273fa29deca55f92d48cc399b4659e6490a662019d763c5034176'
  },
  {
    file: 'oscard-equips.json', recordKey: 'official:cards:equips', arrayKey: 'equipCards',
    kind: 'EQUIPMENT', idPrefix: 'equip',
    sha256: 'c4b72089a4fa0699cf9314e2358d41899fe9c32fcc5d726d4a0785240e31f980',
    semanticSha256: 'd90f95558549794184c1b45029ee7896cdc272e8c6d55906d5653c3746a2759f'
  },
  {
    file: 'oscard-talents.json', recordKey: 'official:cards:talents', arrayKey: 'talentCards',
    kind: 'TALENT', idPrefix: 'tal',
    sha256: '3c0c6ce1a6710a09f971f17af06ff0bfd4cef0ea2b8f79567372cae1f6f6aced',
    semanticSha256: 'ec290b20777fe8b899339bdeb8720a4c4d801dc6ac3887dc388b5a1f4d2aed3b'
  },
  {
    file: 'portal-cards.js', recordKey: 'official:cards:js', arrayKey: null,
    kind: null, idPrefix: null,
    sha256: 'b002a32d6c8c3081986d66a59122f061b0e7311f33e70a1f00dd51af027fc26c'
    // 静态 JS 文件、字节稳定：无轮换内容，只做字节锁定（无 semanticSha256）
  }
]

/** 剥离官方轮换内容（previewCards/sourceCards 展示区 + skillList[].url 签名视频 URL） */
export function stripVolatileCards(value, parentKey = null) {
  if (Array.isArray(value)) return value.map(x => stripVolatileCards(x, parentKey))
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value).sort()) {
      if (k === 'previewCards' || k === 'sourceCards') continue
      if (k === 'url' && parentKey === 'skillList') continue
      out[k] = stripVolatileCards(value[k], k)
    }
    return out
  }
  return value
}

/** 语义指纹：剥离轮换子树后按键序规范化序列化的 sha256 */
export function canonicalCardsSha256(parsedJson) {
  const canonical = JSON.stringify(stripVolatileCards(parsedJson))
  return crypto.createHash('sha256').update(canonical).digest('hex')
}

/** 富文本标记清理：只去标签（a/color/b），保留全部文字内容与标点 */
export function cleanRichText(text) {
  if (!text) return ''
  return String(text)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function qualityLabel(q) {
  return `${q}阶`
}

/** 英雄牌 → 实体（品阶/阵营/关键词/技能/属性/费用/觉醒/获取） */
function heroFacts(card) {
  const h = card.heroCard || {}
  const facts = {
    quality: qualityLabel(card.quality),
    camp: card.relationName || null,
    effectText: cleanRichText(card.desc),
    shopBuyCost: card.shopBuyCost ? `能量 ${card.shopBuyCost.Count}` : null,
    cardImage: card.cardImage || card.image || null
  }
  if (Array.isArray(h.keywordDescription) && h.keywordDescription.length) {
    facts.keywords = h.keywordDescription.map(k => `${k.name}：${cleanRichText(k.desc)}`)
  }
  if (Array.isArray(h.skillList) && h.skillList.length) {
    facts.skills = h.skillList.map(s => {
      const row = { name: s.name, text: cleanRichText(s.desc) }
      if (s.enhanceSkill && Array.isArray(s.enhanceSkill.params) && s.enhanceSkill.params.length) {
        row.levelEnhance = s.enhanceSkill.params.map(p => `${p.level}级：${cleanRichText(p.desc)}`)
      }
      return row
    })
  }
  if (h.awakeingCard && h.awakeingCard.desc) {
    facts.awakeningText = cleanRichText(h.awakeingCard.desc)
  }
  if (h.properties && typeof h.properties === 'object') {
    const props = h.properties
    facts.baseProperties = {
      生命值: props.HP, 物理攻击力: props.phyAttack, 法术攻击力: props.magAttack,
      物理防御: props.phyDefense, 法术防御: props.magDefense, 攻击距离: props.attackDistance
    }
  }
  if (card.cardGetDesc) facts.howToGet = cleanRichText(card.cardGetDesc)
  return facts
}

/** 装备牌/效果牌/天赋牌 → 实体（品阶/效果原文/费用/获取） */
function simpleCardFacts(card) {
  const facts = {
    quality: qualityLabel(card.quality),
    effectText: cleanRichText(card.desc),
    cardImage: card.cardImage || card.image || null
  }
  if (card.shopBuyCost && card.shopBuyCost.Count) facts.shopBuyCost = `能量 ${card.shopBuyCost.Count}`
  if (card.cardGetDesc) facts.howToGet = cleanRichText(card.cardGetDesc)
  if (card.talentStageDesc) facts.unlockNote = cleanRichText(card.talentStageDesc)
  if (card.relationName) facts.camp = card.relationName
  return facts
}

function cardToEntity(card, kind, idPrefix) {
  const id = `${idPrefix}-${card.id}`
  const facts = kind === 'HERO' ? heroFacts(card) : simpleCardFacts(card)
  return {
    id, slug: id, kind,
    displayName: card.name,
    // 编辑附加事实（阵容角色等）由 corpus-entities.mjs 按 displayName 注入
    facts
  }
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'))
}

/** 全量目录实体（构建时逐条与存证断言后入库） */
export function buildCatalogEntities() {
  const entities = []
  const catalogs = [] // { recordKey, arrayKey, cards } 供核查
  for (const def of CARD_DATA_FILES) {
    if (!def.arrayKey) continue // cards.js 是口径来源，不产实体
    const data = loadJson(def.file)
    const cards = data[def.arrayKey] || []
    cards.forEach(card => entities.push(cardToEntity(card, def.kind, def.idPrefix)))
    catalogs.push({ recordKey: def.recordKey, arrayKey: def.arrayKey, cards })
  }
  return { entities, catalogs }
}

/** cards.js 口径：关键词官方定义（含图鉴未单列的「图腾」）+ 阵营清单 */
export function extractCardsJsCaliber() {
  const js = fs.readFileSync(path.join(DATA_DIR, 'portal-cards.js'), 'utf8')
  const keywords = []
  const kwBlock = js.match(/name: '关键词',[\s\S]*?list: \[([\s\S]*?)\]/)
  if (kwBlock) {
    for (const m of kwBlock[1].matchAll(/\{id: (\d+), name: '([^']+)', short: '[^']+', image: [^,]+, mark: '([^']+)'\}/g)) {
      keywords.push({ id: Number(m[1]), name: m[2], definition: m[3] })
    }
  }
  const camps = []
  const campBlock = js.match(/name: '阵营',[\s\S]*?list: \[([\s\S]*?)\]/)
  if (campBlock) {
    for (const m of campBlock[1].matchAll(/\{id: (\d+), name: '([^']+)', short: '[^']+'/g)) {
      camps.push({ id: Number(m[1]), name: m[2] })
    }
  }
  return { keywords, camps }
}

/** 按官方名称查目录实体（供阵容构成/编辑事实按名称挂接） */
export function indexCatalogByName(entities) {
  const map = new Map()
  for (const e of entities) {
    if (!map.has(e.displayName)) map.set(e.displayName, [])
    map.get(e.displayName).push(e)
  }
  return map
}
