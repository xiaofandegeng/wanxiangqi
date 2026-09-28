import fs from 'node:fs';

async function extractAllPlayers() {
  const content = fs.readFileSync('/Users/lhw/.gemini/antigravity-ide/brain/9d4223b7-105f-4cf2-8e62-cb39ad62ebf0/.system_generated/logs/transcript_full.jsonl', 'utf-8');

  const allPlayers = new Map();

  // Pattern 1: JSON formatted { "uid": "...", "displayName": "...", "nickname": "...", "rank": ..., "playerId": "...", "points": ... }
  // or single quotes format { uid: '...', displayName: '...', ... }
  // We can normalize whitespace and escaped newlines:
  const normalized = content.replace(/\\r/g, '').replace(/\\n/g, '\n');

  // Let's match any block containing uid, displayName, rank, points, playerId
  const playerRegex = /\{[^{}]*?(?:uid|displayName)[^{}]*?(?:playerId)[^{}]*?\}/g;
  let match;

  while ((match = playerRegex.exec(normalized)) !== null) {
    const block = match[0];
    const uidMatch = block.match(/['"]?uid['"]?\s*:\s*['"]([^'"]*)['"]/);
    const nameMatch = block.match(/['"]?displayName['"]?\s*:\s*['"]([^'"]+)['"]/);
    const rankMatch = block.match(/['"]?rank['"]?\s*:\s*(\d+)/);
    const idMatch = block.match(/['"]?playerId['"]?\s*:\s*['"]([^'"]+)['"]/);
    const pointsMatch = block.match(/['"]?points['"]?\s*:\s*(\d+)/);

    if (nameMatch && idMatch) {
      allPlayers.set(idMatch[1], {
        uid: uidMatch ? uidMatch[1] : '',
        displayName: nameMatch[1],
        nickname: nameMatch[1],
        rank: rankMatch ? parseInt(rankMatch[1], 10) : 99,
        playerId: idMatch[1],
        points: pointsMatch ? parseInt(pointsMatch[1], 10) : 0
      });
    }
  }

  console.log('Total unique real players found:', allPlayers.size);
  const arr = Array.from(allPlayers.values()).sort((a, b) => a.rank - b.rank);
  console.log('Players found:');
  arr.forEach((p, idx) => {
    console.log(`${idx + 1}. [Rank ${p.rank}] ${p.displayName} (UID: ${p.uid || '无'}, Points: ${p.points}, ID: ${p.playerId})`);
  });

  fs.writeFileSync('./tools/emulator-watcher/data/extracted_real_players.json', JSON.stringify(arr, null, 2));
  console.log('Saved to tools/emulator-watcher/data/extracted_real_players.json');
}

extractAllPlayers();
