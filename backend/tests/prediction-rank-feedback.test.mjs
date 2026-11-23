import {test} from 'node:test'
import assert from 'node:assert/strict'
import {summarizeRankFeedback} from '../src/prediction/rank-feedback.mjs'
import {forecastRoster} from '../src/prediction/screenshot-analysis.mjs'

const cutoff = '2026-11-22T08:00:00Z'
const players = Array.from({length:6}, (_, index) => ({id:`player-${index}`, nickname:`TEST ${index}`}))
const input = {bannedFaction:'大河', players:players.map(({id}) => ({profileId:id, commander:'玉环'}))}

function match(day, ranks) {
 const id = `rank-fixture-${day}`
 const date = `2026-11-${day}`
 return {
  match:{id, day:date, ban:'大河', scheduledAt:`${date}T08:00:00Z`, matchType:'full_transcribed', materialSha256:id,
   seats:players.map((p,index) => ({slot:index+1,playerId:p.id,reviewedCommander:'玉环',winner:ranks[index]===1,build:'日落海倒转'}))},
  forecast:{id,recordedAt:new Date(`${date}T07:59:59.900Z`),bannedFaction:'大河',
   players:players.map((p,index)=>({id:p.id,commander:'玉环',probability:(6-index)/21})).reverse()},
  proof:{matchId:id,materialSha256:id,ranks,availableAt:`${date}T09:00:00Z`},
 }
}
const makeCatalog = (...fixtures) => ({players, matches:fixtures.map(row=>row.match),
 rankEvidence:fixtures.map(row=>row.proof), prematchForecasts:fixtures.map(row=>row.forecast)})

test('前三天与前七天均值按 70/30 叠加，实际超预期的人提高夺冠概率', () => {
 const catalog = makeCatalog(match(19,[6,2,3,4,5,1]),match(16,[1,2,3,4,5,6]),
  match(15,[1,2,3,4,5,6]),match(14,[6,2,3,4,5,1]))
 const board = summarizeRankFeedback(catalog,cutoff)
 assert.equal(board.settledMatches,3)
 const first = board.black.find(row=>row.profileId===players[0].id)
 const last = board.red.find(row=>row.profileId===players[5].id)
 assert.deepEqual([last.samples3,last.samples7,last.average3,last.average7,last.weightedGap],[1,3,5,5/3,4])
 assert.equal(first.weightedGap,-4)
 const baseline = forecastRoster({...catalog,prematchForecasts:[]}, input, cutoff)
 const adjusted = forecastRoster(catalog, input, cutoff)
 assert.ok(adjusted.players[5].probability > baseline.players[5].probability)
 assert.ok(adjusted.players[0].probability < baseline.players[0].probability)
 assert.ok(Math.abs(adjusted.players.reduce((sum,row)=>sum+row.probability,0)-1)<1e-12)
})

test('同场取最早的有效快照，排除迟到、赛果未可见、名单冲突和未核对名次', () => {
 const old = match(18,[1,2,3,4,5,6])
 const eligible = match(20,[6,2,3,4,5,1])
 const late = match(19,[6,2,3,4,5,1])
 late.forecast.recordedAt = late.match.scheduledAt
 const unreadable = match(21,[6,2,3,4,5,1])
 unreadable.proof.availableAt = '2026-11-22T08:00:00.001Z'
 const sameDay = match(22,[6,2,3,4,5,1])
 const catalog = makeCatalog(old,eligible,late,unreadable,sameDay)
 catalog.prematchForecasts.push({...eligible.forecast,id:'duplicate',recordedAt:new Date('2026-11-20T07:59:59.950Z'),
  players:eligible.forecast.players.map(row=>({...row,probability:1/6}))})
 const board = summarizeRankFeedback(catalog,cutoff)
 assert.equal(board.settledMatches,2)
 assert.equal(board.red[0].weightedGap,4.25)
 catalog.matches.push({...eligible.match,id:'ambiguous'})
 old.proof.materialSha256 = 'incorrect'
 assert.equal(summarizeRankFeedback(catalog,cutoff).settledMatches,0)
})

test('只有第 4–7 天记录时保留 30%，并列预测使用平均名次', () => {
 const fixture = match(17,[1,2,3,4,5,6])
 fixture.forecast.players.forEach(row=>{row.probability=1/6})
 const board = summarizeRankFeedback(makeCatalog(fixture),cutoff)
 assert.equal(board.red[0].matches[0].predictedRank,3.5)
 assert.equal(board.red[0].average3,null)
 assert.equal(board.red[0].weightedGap,0.75)
})

test('补算进入两档红黑榜并修正概率，同场真实快照始终优先', () => {
 const older = match(16,[6,2,3,4,5,1])
 const latest = match(21,[6,2,3,4,5,1])
 const catalog = makeCatalog(older,latest)
 catalog.prematchForecasts = []
 catalog.rankReplays = [older,latest].map(row => ({
  matchId:row.match.id,materialSha256:row.match.materialSha256,
  generatedAt:'2026-11-22T07:00:00Z',players:row.forecast.players,bannedFaction:'大河',
 }))
 const board = summarizeRankFeedback(catalog,cutoff)
 assert.deepEqual([board.windows.recent3.replayed,board.windows.recent7.replayed],[1,2])
 assert.equal(board.windows.recent3.red[0].matches[0].source,'REPLAY')
 assert.ok(forecastRoster(catalog,input,cutoff).players[5].probability >
  forecastRoster({...catalog,rankReplays:[]},input,cutoff).players[5].probability)
 catalog.prematchForecasts = [{...latest.forecast,
  players:latest.forecast.players.map(row => ({...row,probability:1/6}))}]
 const withLive = summarizeRankFeedback(catalog,cutoff)
 assert.deepEqual([withLive.settledMatches,withLive.windows.recent3.live,withLive.windows.recent3.replayed],[2,1,0])
 assert.equal(withLive.windows.recent3.red[0].average3,2.5)
})

test('同一选手多账号汇总，同一 UID 的旧昵称和新昵称贡献同一账号', () => {
 const person = players[5]
 const account = {platform:'fixture',region:'fixture',uid:'001'}
 const fixtures = [16,19,21].map(day=>match(day,[6,2,3,4,5,1]))
 const alternateProfiles = ['fixture-old-name','fixture-new-name']
 for (const [index,id] of alternateProfiles.entries()) {
  fixtures[index].match.seats[5].sourceProfileId = id
  fixtures[index].forecast.players.find(player=>player.id===person.id).id = id
 }
 const catalog = {...makeCatalog(...fixtures),
  playerAliases:alternateProfiles.map(alias_id=>({alias_id,canonical_id:person.id})),
  sourceProfiles:[
   {...person,account:{...account,uid:'002'}},
   ...alternateProfiles.map(id=>({id,nickname:id,account})),
  ],
 }
 const row = summarizeRankFeedback(catalog,cutoff).red.find(entry=>entry.profileId===person.id)
 assert.equal(row.samples7,3)
 assert.deepEqual(row.accounts.map(entry=>[entry.account.uid,entry.samples3,entry.samples7]),[['002',1,1],['001',1,2]])
 assert.deepEqual(row.accounts[1].profiles.map(profile=>profile.nickname),alternateProfiles)
 assert.equal(row.matches.find(m=>m.matchId===fixtures[0].match.id).accountNickname,alternateProfiles[0])
})
