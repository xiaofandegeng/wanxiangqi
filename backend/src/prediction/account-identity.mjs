import { fail } from './domain.mjs'

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

export async function lookupAccountIdentity(pool, raw) {
  const [platform,region,uid] = accountKey(raw)
  const {rows:profiles} = await pool.query(`
    SELECT origin.id AS "profileId",origin.nickname,
      person.id AS "personProfileId",person.nickname AS "personNickname"
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
      INSERT INTO prediction_catalog_account_uids(profile_id,platform,region,uid,evidence_id,review_note)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (profile_id) DO NOTHING
    `,[profileId,platform,region,uid,evidenceId,reviewNote])
    await client.query('COMMIT')
    return {profileId,personProfileId:target,platform,region,uid,deduplicated:Boolean(prior)}
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {client.release()}
}
