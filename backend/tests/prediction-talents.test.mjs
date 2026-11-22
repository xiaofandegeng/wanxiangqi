import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {buildTalentStatistics} from '../src/prediction/talent-statistics.mjs'
import {forecastRoster} from '../src/prediction/screenshot-analysis.mjs'
import {TALENT_RULES} from '../../shared/talent-impact.mjs'

const evidence=JSON.parse(readFileSync(new URL('../data/talent-settlement-observations.json',import.meta.url)))
function databaseEvidenceAt(cutoff){
 return [evidence,...evidence.additions].filter(batch=>Date.parse(batch.reviewedAt)<=Date.parse(cutoff))
  .flatMap(batch=>batch.matches.map(match=>({
   ...match,version:match.matchId.includes('2026-11-18')?'v1.10.1':'v1.11.1',
   seats:match.seats.map(icons=>icons.map(([,name])=>name))
  })))
}
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
 assert.deepEqual(buildTalentStatistics(matches, databaseEvidenceAt('2026-11-20T14:29:00Z')), {})
 assert.deepEqual(buildTalentStatistics(matches, []), {})
 const statistics = buildTalentStatistics(matches, databaseEvidenceAt(cutoff))
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
 assert.deepEqual(buildTalentStatistics(mismatched,databaseEvidenceAt(cutoff)),{})
})

test('赛前只根据同选手棋手阵容和已核对的历史天赋估算，缺样本保留未知', () => {
 const players=Array.from({length:6},(_,i)=>({id:`person-${i}`,nickname:`TEST-${i}`}))
 const input={bannedFaction:null,players:players.map(({id},index)=>({profileId:id,commander:index===0?'白歌':'马可'}))}
 const records=Array.from({length:5},(_,i)=>({
  id:`history-${i}`,day:`2026-11-1${i}`,matchType:'full_transcribed',materialSha256:`source-${i}`,
  seats:players.map((player,index)=>({
   slot:index+1,playerId:player.id,build:'三分登场',winner:index===0,
   reviewedCommander:index===0&&i!==4?'白歌':'马可'
  }))
 }))
 const talentEvidence=records.map((record,index)=>({
  matchId:record.id,materialSha256:index===3?'WRONG':record.materialSha256,version,
  seats:[index===4?['帝临']:['点兵点将'],['镜像迷离'],[],[],[],[]]
 }))
 const catalog={matches:records,players,talentEvidence}
 const forecast=forecastRoster(catalog,input,cutoff)
 assert.equal(forecast.talentProjections.version,version)
 const talent=forecast.talentProjections.players[0]
 assert.equal(talent.buildSamples,4)
 assert.equal(talent.talentSamples,3)
 assert.deepEqual(talent.candidates,[{
  build:'三分登场',talent:'点兵点将',observations:3,buildSamples:4,observedShare:.75
 }])
 assert.ok(forecast.players[0].probability>talent.baseProbability)
 assert.deepEqual(forecast.talentProjections.players[2].candidates,[])
 assert.ok(Math.abs(forecast.players.reduce((sum,seat)=>sum+seat.probability,0)-1)<1e-12)
 const banned=forecastRoster(catalog,{...input,bannedFaction:'三分'},cutoff)
 assert.deepEqual(banned.talentProjections.players[0].candidates,[])
 const sameDay={...records[0],id:'same-day',day:'2026-11-20'}
 const sameDayTalent={...talentEvidence[0],matchId:sameDay.id,version:'v9.0.0'}
 assert.deepEqual(
  forecastRoster({...catalog,matches:[...records,sameDay],talentEvidence:[...talentEvidence,sameDayTalent]},input,cutoff),
  forecast
 )
})

test('续录的天赋保留原预测截止时间，新增场次按原图指纹入样', () => {
 const old=buildTalentStatistics(matches,databaseEvidenceAt('2026-11-20T14:40:00Z'))
 const expanded=buildTalentStatistics(matches,databaseEvidenceAt(cutoff))
 assert.deepEqual(Object.values(expanded).map(rows=>rows.length),[82,77])
 assert.ok(Object.values(expanded).flat().every(row=>Object.hasOwn(TALENT_RULES,row.talent)))
 assert.equal(old[version].some(row=>row.build==='三分登场' && row.talent==='危险数字'),false)
 const added=expanded[version].find(row=>row.build==='三分登场' && row.talent==='危险数字')
 assert.deepEqual([added.appearances,added.wins,added.distinctMatches,added.logWeight],[2,1,2,0])
 const newBatch=evidence.additions.find(batch=>batch.matches.some(match=>match.matchId==='ruanshi:2026-11-20:1'))
 const record=newBatch.matches[0]
 const newMatch={id:record.matchId,day:'2026-11-20',materialSha256:record.materialSha256,
  seats:Array.from({length:6},(_,i)=>({slot:i+1,build:i===0?'日落海艾琳':'TEST',winner:i===0}))}
 const afterReview=new Date(Date.parse(newBatch.reviewedAt)+1000).toISOString()
 const hasNewMatch=(match,at)=>buildTalentStatistics([...matches,match],databaseEvidenceAt(at))[version]
  .some(row=>row.build==='日落海艾琳' && row.talent==='末世')
 assert.equal(hasNewMatch(newMatch,cutoff),false)
 assert.equal(hasNewMatch(newMatch,afterReview),true)
 assert.equal(hasNewMatch({...newMatch,materialSha256:'MISMATCHED'},afterReview),false)
})
