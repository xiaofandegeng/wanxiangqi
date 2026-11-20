import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildTalentStatistics} from '../src/prediction/talent-statistics.mjs'
import {assessRoster} from '../src/prediction/screenshot-analysis.mjs'

const cutoff = '2026-11-20T15:00:00.000Z'
const version = 'v1.11.1'
const matches = ['18', '19'].flatMap(day => {
 const {matches} = JSON.parse(readFileSync(new URL(`../../docs/prediction_artifacts/nov${day}/game-results-verified.json`, import.meta.url)))
 return matches.map(match => ({
  id:match.matchId, day:match.day, materialSha256:match.evidenceSha256,
  seats:match.seats.map(seat=>({slot:seat.rank, build:seat.build, winner:seat.rank===1}))
 }))
})

test('天赋样本按证据指纹、入库可见时间与版本计数', () => {
 assert.deepEqual(buildTalentStatistics(matches, '2026-11-20T14:29:00Z'), {})
 const statistics = buildTalentStatistics(matches, cutoff)
 const find = (version,build,talent) => statistics[version].find(row=>row.build===build && row.talent===talent)
 const synergy = find(version, '三分登场', '点兵点将')
 assert.deepEqual([synergy.wins,synergy.appearances,synergy.distinctMatches,synergy.buildWins,synergy.buildAppearances], [3,4,3,4,11])
 assert.ok(synergy.logWeight > 0 && synergy.logWeight <= 0.15)
 for (const patch of ['v1.10.1', version]) {
  const dilin = find(patch,'逐鹿帝临','帝临')
  assert.equal(dilin.appearances,1)
  assert.equal(dilin.logWeight,0)
 }
 const mismatched = matches.map(match=>({...match,materialSha256:'MISMATCHED'}))
 assert.deepEqual(buildTalentStatistics(mismatched,cutoff)[version],[])
})

test('赛中对已取得天赋与已知阵容应用同版本修正，赛前和结算图受阶段约束', () => {
 const catalog={matches,players:[],sources:[],counts:{},talentStatistics:buildTalentStatistics(matches,cutoff)}
 const draft={featureCutoff:cutoff,ocr:{phaseHint:'UNKNOWN'}}
 const input={phase:'IN_PROGRESS',mode:'WANXIANG',version,identityConfirmed:true,operator:'TEST',
  experimentalProbability:true,players:Array.from({length:6},(_,i)=>({
   nickname:`TEST-${i}`, visiblePlan:'三分登场', selectedTalents:i===0?['点兵点将','点兵点将']:[]
  }))}
 const {model,aceContext}=assessRoster(catalog,input,draft)
 assert.equal(aceContext.supportStage,'CLOSED')
 assert.deepEqual(aceContext.players[0].selectedTalents,['点兵点将'])
 assert.ok(model.players[0].probability > model.talentAdjustment.players[0].baseProbability)
 assert.ok(Math.abs(model.players.reduce((sum,seat)=>sum+seat.probability,0)-1)<1e-12)
 assert.equal(assessRoster(catalog,{...input,version:'v1.10.1'},draft).model.talentAdjustment.players[0].logWeight,0)
 assert.equal(assessRoster(catalog,{...input,mode:'DIAMOND'},draft).model.talentAdjustment.players[0].logWeight,0)
 assert.throws(()=>assessRoster(catalog,{...input,phase:'PREMATCH'},draft),/赛中推演/)
 assert.throws(()=>assessRoster(catalog,input,{...draft,ocr:{phaseHint:'POSTMATCH_INDICATORS'}}),/赛后核对/)
})
