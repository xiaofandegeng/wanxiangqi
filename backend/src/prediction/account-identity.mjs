import { fail } from './domain.mjs'
import {
  CREDENTIAL_TYPES,
  VERIFIED_PLAYER_IDENTITY_GROUPS,
  derivePersonUid,
} from '../../../shared/player-registry.mjs'

function text(value, label, limit = 160) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > limit) {
    throw fail(`请填写有效的${label}`, 'INVALID_ACCOUNT_IDENTITY')
  }
  return value.trim()
}

const namespace = value => value.normalize('NFKC').toLowerCase()

function accountKey(raw) {
  return [namespace(text(raw?.platform,'平台')),namespace(text(raw?.region,'区服')),text(raw?.uid,'游戏 UID')]
}

export function formatAccountCredential(account) {
  if (!account?.uid) return null
  if (account.credentialType && account.credentialType !== 'GAME_UID') {
    const meta = CREDENTIAL_TYPES[account.credentialType]
    return `${meta?.label ?? account.region} #${account.uid}`
  }
  return `${account.platform} / ${account.region} · UID ${account.uid}`
}

export async function lookupAccountIdentity(pool, raw) {
  const [platform,region,uid] = accountKey(raw)
  const {rows:profiles} = await pool.query(`
    SELECT origin.id AS "profileId",origin.nickname,
      person.id AS "personProfileId",person.nickname AS "personNickname",
      COALESCE(person.person_uid, 'WXQP-' || upper(substr(person.id,1,10))) AS "personUid"
    FROM prediction_catalog_account_uids a
    JOIN prediction_catalog_players origin ON origin.id=a.profile_id
    LEFT JOIN prediction_catalog_player_links l ON l.alias_id=a.profile_id
    JOIN prediction_catalog_players person ON person.id=COALESCE(l.canonical_id,a.profile_id)
    WHERE a.platform=$1 AND a.region=$2 AND a.uid=$3
    ORDER BY origin.nickname,origin.id`,[platform,region,uid])
  return {platform,region,uid,profiles}
}

export async function registerAccountIdentity(pool, raw, checkEvidence) {
  const profileId = text(raw?.profileId,'选手档案 ID')
  const personProfileId = raw?.personProfileId ? text(raw.personProfileId,'所属选手档案 ID') : null
  const [platform,region,uid] = accountKey(raw)
  const evidenceId = text(raw?.evidenceId,'核验证据编号')
  const reviewNote = text(raw?.reviewNote,'核对说明',500)
  if (raw?.identityConfirmed !== true) throw fail('请先核对证据中的游戏 UID 和账号归属','IDENTITY_CONFIRMATION_REQUIRED')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT pg_advisory_xact_lock(hashtext('prediction-catalog-account-uids'))")
    await checkEvidence(client,evidenceId,true)
    const {rows:profiles} = await client.query(`
      SELECT p.id, COALESCE(l.canonical_id,p.id) AS "personId"
      FROM prediction_catalog_players p LEFT JOIN prediction_catalog_player_links l ON l.alias_id=p.id
      WHERE p.id=ANY($1::text[])`, [[profileId,personProfileId].filter(Boolean)])
    const selected = profiles.find(row=>row.id===profileId)
    const explicitPerson = profiles.find(row=>row.id===personProfileId)?.personId
    if (!selected || (personProfileId && !explicitPerson)) throw fail('选手档案不存在','PROFILE_UNAVAILABLE')
    const {rows:[prior]} = await client.query(`
      SELECT platform,region,uid FROM prediction_catalog_account_uids WHERE profile_id=$1`,[profileId])
    if (prior && (prior.platform!==platform || prior.region!==region || prior.uid!==uid)) {
      throw fail('该来源档案已有不同的核验 UID，请核对原件','ACCOUNT_UID_CONFLICT',409)
    }
    const {rows:existingAccounts} = await client.query(`
      SELECT DISTINCT COALESCE(l.canonical_id,a.profile_id) AS "personId"
      FROM prediction_catalog_account_uids a LEFT JOIN prediction_catalog_player_links l ON l.alias_id=a.profile_id
      WHERE a.platform=$1 AND a.region=$2 AND a.uid=$3`,[platform,region,uid])
    const establishedPerson = existingAccounts[0]?.personId
    if (existingAccounts.length>1 || (establishedPerson && explicitPerson && establishedPerson!==explicitPerson)) {
      throw fail('该游戏 UID 已登记在另一选手名下，请核对归属','ACCOUNT_PERSON_CONFLICT',409)
    }
    const target = establishedPerson ?? explicitPerson ?? selected.personId
    if (target!==selected.personId) {
      const {rows:[conflicts]} = await client.query(`
        SELECT
          EXISTS(SELECT 1 FROM prediction_catalog_player_links WHERE canonical_id=$1) AS "hasLinkedProfiles",
          EXISTS(SELECT 1 FROM prediction_catalog_plays p JOIN prediction_catalog_plays q ON q.match_id=p.match_id
            LEFT JOIN prediction_catalog_player_links l ON l.alias_id=q.player_id
            WHERE p.player_id=$1 AND COALESCE(l.canonical_id,q.player_id)=$2) AS "sameMatch"
      `,[profileId,target])
      if (selected.personId!==profileId || conflicts.hasLinkedProfiles || conflicts.sameMatch) {
        throw fail('账号已有归属或曾与该选手同场，请复核身份关系','ACCOUNT_PERSON_CONFLICT',409)
      }
      await client.query(`
        INSERT INTO prediction_catalog_player_links(alias_id,canonical_id,review_note) VALUES($1,$2,$3)
      `,[profileId,target,`UID 证据 ${evidenceId} · ${reviewNote}`])
      await client.query('REFRESH MATERIALIZED VIEW prediction_player_build_profiles')
    }
    await client.query(`
      INSERT INTO prediction_catalog_account_uids(profile_id,platform,region,uid,credential_type,evidence_id,review_note)
      VALUES($1,$2,$3,$4,'GAME_UID',$5,$6) ON CONFLICT (profile_id) DO NOTHING
    `,[profileId,platform,region,uid,evidenceId,reviewNote])
    await client.query('COMMIT')
    return {profileId,personProfileId:target,personUid:derivePersonUid(target),platform,region,uid,deduplicated:Boolean(prior)}
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {client.release()}
}

async function resolveProfileByQuery(client, query, label) {
  const q = text(query, label)
  const {rows} = await client.query(`
    SELECT p.id, p.nickname, COALESCE(l.canonical_id, p.id) AS "canonicalId"
    FROM prediction_catalog_players p
    LEFT JOIN prediction_catalog_player_links l ON l.alias_id=p.id
    WHERE p.id=$1 OR p.nickname=$1 OR p.person_uid=upper($1)
    ORDER BY (p.id=$1) DESC, (l.canonical_id IS NULL) DESC, p.id
    LIMIT 1
  `, [q])
  if (!rows[0]) throw fail(`未找到${label}「${q}」`, 'PROFILE_UNAVAILABLE', 404)
  return rows[0]
}

async function findCoappearanceConflict(client, rootA, rootB) {
  const {rows} = await client.query(`
    WITH group_a AS (
      SELECT $1::text AS id UNION SELECT alias_id FROM prediction_catalog_player_links WHERE canonical_id=$1
    ),
    group_b AS (
      SELECT $2::text AS id UNION SELECT alias_id FROM prediction_catalog_player_links WHERE canonical_id=$2
    )
    SELECT m.id AS "matchId", m.day::text AS day, m.ordinal, pa.nickname AS "nickA", pb.nickname AS "nickB"
    FROM prediction_catalog_plays a
    JOIN prediction_catalog_plays b ON b.match_id=a.match_id AND b.slot<>a.slot
    JOIN prediction_catalog_matches m ON m.id=a.match_id
    JOIN prediction_catalog_players pa ON pa.id=a.player_id
    JOIN prediction_catalog_players pb ON pb.id=b.player_id
    WHERE a.player_id IN (SELECT id FROM group_a)
      AND b.player_id IN (SELECT id FROM group_b)
    ORDER BY m.day DESC, m.ordinal DESC
    LIMIT 1
  `, [rootA, rootB])
  return rows[0] ?? null
}

async function upsertBadgeCredential(client, profileId, canonicalId, credential, note) {
  if (!credential?.type || !credential?.value) return null
  const meta = CREDENTIAL_TYPES[credential.type]
  if (!meta) throw fail('不支持的唯一凭证类型', 'INVALID_CREDENTIAL_TYPE')
  const uid = text(credential.value, meta.label, 80)
  const platform = credential.type === 'GAME_UID'
    ? namespace(credential.platform?.trim() || '王者万象棋')
    : '王者万象棋'
  const region = credential.type === 'GAME_UID'
    ? namespace(credential.region?.trim() || meta.defaultRegion)
    : meta.defaultRegion

  const {rows:owners} = await client.query(`
    SELECT DISTINCT COALESCE(l.canonical_id, a.profile_id) AS "personId"
    FROM prediction_catalog_account_uids a
    LEFT JOIN prediction_catalog_player_links l ON l.alias_id=a.profile_id
    WHERE a.platform=$1 AND a.region=$2 AND a.uid=$3
  `, [platform, region, uid])
  if (owners.some(row => row.personId !== canonicalId)) {
    throw fail(`${meta.label} #${uid} 已绑定在其他选手名下，请复核`, 'ACCOUNT_PERSON_CONFLICT', 409)
  }

  for (const targetProfileId of [...new Set([profileId, canonicalId])]) {
    await client.query(`
      INSERT INTO prediction_catalog_account_uids(profile_id,platform,region,uid,credential_type,evidence_id,review_note)
      VALUES($1,$2,$3,$4,$5,NULL,$6)
      ON CONFLICT (profile_id) DO UPDATE
        SET platform=EXCLUDED.platform, region=EXCLUDED.region, uid=EXCLUDED.uid,
            credential_type=EXCLUDED.credential_type, review_note=EXCLUDED.review_note
        WHERE prediction_catalog_account_uids.evidence_id IS NULL
    `, [targetProfileId, platform, region, uid, meta.code, note])
  }
  return { credentialType: meta.code, platform, region, uid }
}

export async function linkPlayerAlias(pool, raw) {
  const aliasProfileQuery = raw?.aliasPlayer ?? raw?.aliasNickname ?? raw?.aliasId
  const canonicalProfileQuery = raw?.canonicalPlayer ?? raw?.canonicalNickname ?? raw?.canonicalId
  const reviewNote = raw?.reviewNote?.trim()
    ? text(raw.reviewNote, '归并说明', 500)
    : '人工核对改名归并'
  const credential = raw?.credentialType && raw?.credentialValue
    ? { type: String(raw.credentialType).trim(), value: String(raw.credentialValue).trim(), platform: raw.platform, region: raw.region }
    : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query("SELECT pg_advisory_xact_lock(hashtext('prediction-catalog-account-uids'))")
    const aliasNode = await resolveProfileByQuery(client, aliasProfileQuery, '待归并改名昵称')
    const canonicalNode = await resolveProfileByQuery(client, canonicalProfileQuery, '主选手昵称')
    const sourceRoot = aliasNode.canonicalId
    const targetRoot = canonicalNode.canonicalId

    let linkedCount = 0
    if (sourceRoot !== targetRoot) {
      const conflict = await findCoappearanceConflict(client, sourceRoot, targetRoot)
      if (conflict) {
        throw fail(
          `检测到同场对战冲突（${conflict.day} 第 ${conflict.ordinal} 场：「${conflict.nickA}」与「${conflict.nickB}」同局出战），属于不同参赛账号，禁止合并`,
          'ACCOUNT_COAPPEARANCE_CONFLICT',
          409
        )
      }
      // 保持扁平单跳结构：将原本挂在 sourceRoot 下的子别名一并重挂至 targetRoot
      const repointed = await client.query(`
        UPDATE prediction_catalog_player_links
        SET canonical_id=$2, review_note=review_note || ' → 归并至 ' || $3
        WHERE canonical_id=$1 AND alias_id<>$2
      `, [sourceRoot, targetRoot, canonicalNode.nickname])
      const inserted = await client.query(`
        INSERT INTO prediction_catalog_player_links(alias_id, canonical_id, review_note)
        VALUES($1, $2, $3)
        ON CONFLICT (alias_id) DO UPDATE SET canonical_id=EXCLUDED.canonical_id, review_note=EXCLUDED.review_note
      `, [sourceRoot, targetRoot, reviewNote])
      linkedCount = (repointed.rowCount ?? 0) + (inserted.rowCount ?? 0)
    }

    const badge = await upsertBadgeCredential(client, aliasNode.id, targetRoot, credential, reviewNote)
    await client.query(`
      UPDATE prediction_catalog_players SET identity_status='VERIFIED_PERSON_UID'
      WHERE id=$1 OR id IN (SELECT alias_id FROM prediction_catalog_player_links WHERE canonical_id=$1)
    `, [targetRoot])

    if (linkedCount > 0) {
      await client.query('REFRESH MATERIALIZED VIEW prediction_player_build_profiles')
    }
    const {rows:[canonicalInfo]} = await client.query(
      'SELECT id, nickname FROM prediction_catalog_players WHERE id=$1',
      [targetRoot]
    )
    await client.query('COMMIT')
    return {
      linked: linkedCount > 0,
      alreadyLinked: sourceRoot === targetRoot,
      linkedCount,
      aliasId: aliasNode.id,
      aliasNickname: aliasNode.nickname,
      canonicalId: targetRoot,
      canonicalNickname: canonicalInfo?.nickname ?? canonicalNode.nickname,
      personUid: derivePersonUid(targetRoot),
      badge: badge ? formatAccountCredential(badge) : null
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function syncVerifiedPlayerIdentities(pool) {
  const client = await pool.connect()
  let linkedGroups = 0
  let linkedAliases = 0
  let registeredBadges = 0
  const skippedConflicts = []

  try {
    await client.query('BEGIN')
    await client.query("SELECT pg_advisory_xact_lock(hashtext('prediction-catalog-account-uids'))")
    const {rows:allPlayers} = await client.query(`
      SELECT p.id, p.nickname, COALESCE(l.canonical_id, p.id) AS "canonicalId"
      FROM prediction_catalog_players p
      LEFT JOIN prediction_catalog_player_links l ON l.alias_id=p.id
      ORDER BY p.available_at, p.id
    `)
    const byNickname = new Map()
    for (const row of allPlayers) {
      const list = byNickname.get(row.nickname) ?? []
      list.push(row)
      byNickname.set(row.nickname, list)
    }

    for (const group of VERIFIED_PLAYER_IDENTITY_GROUPS) {
      const orderedNames = [group.canonical, ...group.aliases]
      const matchedNodes = orderedNames.flatMap(name => byNickname.get(name) ?? [])
      if (!matchedNodes.length) continue

      const primaryNode = (byNickname.get(group.canonical)?.[0]) ?? matchedNodes[0]
      // 动态查询最新的 canonicalId
      const {rows:[rootRow]} = await client.query(
        'SELECT COALESCE((SELECT canonical_id FROM prediction_catalog_player_links WHERE alias_id=$1), $1) AS root',
        [primaryNode.id]
      )
      const targetRoot = rootRow.root
      let groupChanged = false

      for (const node of matchedNodes) {
        const {rows:[nodeRootRow]} = await client.query(
          'SELECT COALESCE((SELECT canonical_id FROM prediction_catalog_player_links WHERE alias_id=$1), $1) AS root',
          [node.id]
        )
        const sourceRoot = nodeRootRow.root
        if (sourceRoot === targetRoot) continue

        const conflict = await findCoappearanceConflict(client, sourceRoot, targetRoot)
        if (conflict) {
          skippedConflicts.push({
            group: group.canonical,
            alias: node.nickname,
            matchId: conflict.matchId,
            day: conflict.day
          })
          continue
        }

        await client.query(`
          UPDATE prediction_catalog_player_links
          SET canonical_id=$2
          WHERE canonical_id=$1 AND alias_id<>$2
        `, [sourceRoot, targetRoot])
        const res = await client.query(`
          INSERT INTO prediction_catalog_player_links(alias_id, canonical_id, review_note)
          VALUES($1, $2, $3)
          ON CONFLICT (alias_id) DO NOTHING
        `, [sourceRoot, targetRoot, group.note])
        if (res.rowCount > 0) {
          linkedAliases += res.rowCount
          groupChanged = true
        }
      }

      if (group.badge) {
        const {credentialType, platform, region, uid} = group.badge
        for (const node of matchedNodes) {
          const res = await client.query(`
            INSERT INTO prediction_catalog_account_uids(profile_id,platform,region,uid,credential_type,evidence_id,review_note)
            VALUES($1,$2,$3,$4,$5,NULL,$6)
            ON CONFLICT (profile_id) DO NOTHING
          `, [node.id, platform, region, uid, credentialType, group.note])
          registeredBadges += res.rowCount ?? 0
        }
      }

      await client.query(`
        UPDATE prediction_catalog_players SET identity_status='VERIFIED_PERSON_UID'
        WHERE id=$1 OR id IN (SELECT alias_id FROM prediction_catalog_player_links WHERE canonical_id=$1)
      `, [targetRoot])

      if (groupChanged) linkedGroups++
    }

    if (linkedAliases > 0) {
      await client.query('REFRESH MATERIALIZED VIEW prediction_player_build_profiles')
    }
    await client.query('COMMIT')
    return { linkedGroups, linkedAliases, registeredBadges, skippedConflicts }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
