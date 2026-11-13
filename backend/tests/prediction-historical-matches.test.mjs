import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHistoricalSnapshotMatches } from '../src/prediction/historical-matches.mjs'

test('冠军快照不推断棋手，不生成未记录的对手', () => {
  const matches = buildHistoricalSnapshotMatches()
  assert.ok(matches.length > 0)
  for (const match of matches) {
    assert.equal(match.matchType, 'winner_snapshot')
    assert.equal(match.seats.length, 1)
    assert.equal(match.seats[0].nickname, match.winnerNickname)
    assert.equal(match.seats[0].commander, '')
    assert.equal(match.seats[0].avatar, null)
  }
})
