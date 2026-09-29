// 王者万象棋数据站 - 腾讯王者营地官方战绩数据适配器 (Camp Official Match Adapter)
// 依据 2026 年公测正式版王者营地 App (com.tencent.gamehelper.smoba) 战绩中心协议规范
// v3 S6/P2-B 治理版：
// 1. 解析/校验逻辑保留（契约测试用）；来源恒 UNCONFIGURED —— 未获官方开放 API 确认与
//    用户本人授权材料前，服务层一律 400 拒绝同步（任务书 §3.3）
// 2. 适配器不得授予 verified：核验状态只能由人工核验动作 (V17) 授予，此处恒 false + PENDING
// 3. 缺失字段 → null（'通用'/'自适应常规流'/'RANKED_DIAMOND' 等默认值全部移除）
// 4. available_at 仅来源明确给出时采用；缺失传 null，由导入层以“导入时刻”兜底（≥ matchTime）

export const CAMP_ADAPTER_METADATA = {
  sourceId: 'src-kohcamp-official',
  name: '腾讯王者营地官方战绩网关',
  type: 'OFFICIAL_MATCH_FEED',
  targetUrl: 'https://kohcamp.qq.com/cgi-bin/match/list?game_type=wanxiangqi',
  authMode: 'OPENID_UID_TOKEN',
  license: '腾讯游戏服务协议 / 个人战绩授权（未确认开放 API）',
  pollIntervalSec: 1800,
  status: 'UNCONFIGURED'
}

/**
 * 校验营地原始对局单条数据结构
 */
export function validateCampRawRecord(raw, idx = 0) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`第 ${idx + 1} 条营地对局为空`)
  }

  const campSeq = raw.game_seq || raw.campSeq || raw.match_id || raw.id
  if (!campSeq || typeof campSeq !== 'string') {
    throw new Error(`第 ${idx + 1} 条营地对局缺少官方对局编号 game_seq`)
  }

  const playerUid = raw.role_id || raw.playerUid || raw.uid
  if (!playerUid || typeof playerUid !== 'string') {
    throw new Error(`第 ${idx + 1} 条营地对局缺少选手真实 UID`)
  }

  const rank = parseInt(raw.rank || raw.final_rank || raw.placement, 10)
  if (isNaN(rank) || rank < 1 || rank > 6) {
    throw new Error(`第 ${idx + 1} 条营地对局名次 [${raw.rank}] 非法，自走棋王牌对决必须在 1~6 之间`)
  }

  let matchTime = raw.gametime || raw.match_time || raw.timestamp
  if (!matchTime) {
    throw new Error(`第 ${idx + 1} 条营地对局缺少比赛时间 gametime`)
  }
  const matchDate = new Date(matchTime)
  if (isNaN(matchDate.getTime())) {
    throw new Error(`第 ${idx + 1} 条营地对局时间 [${matchTime}] 非法`)
  }
  const isoMatchTime = matchDate.toISOString()

  // available_at：仅来源明确给出时采用（且必须 ≥ match_time）；缺失 → null
  let isoAvailableAt = null
  if (raw.available_at) {
    const availableDate = new Date(raw.available_at)
    if (isNaN(availableDate.getTime())) {
      throw new Error(`第 ${idx + 1} 条营地对局收录时间 available_at [${raw.available_at}] 非法`)
    }
    if (availableDate.getTime() < matchDate.getTime()) {
      throw new Error(`第 ${idx + 1} 条营地对局收录时间早于比赛时间（时间穿越，拒绝）`)
    }
    isoAvailableAt = availableDate.toISOString()
  }

  const rawRounds = raw.round_num ?? raw.rounds_survived
  const roundsSurvived = Number.isInteger(Number(rawRounds)) ? Number(rawRounds) : null

  return {
    id: `camp-${campSeq}`,
    campSeq: String(campSeq),
    playerId: `p-${playerUid}`,
    playerUid: String(playerUid),
    matchTime: isoMatchTime,
    availableAt: isoAvailableAt,
    mode: raw.mode || null,
    finalRank: rank,
    commander: raw.commander_name || raw.commander || null,
    lineup: raw.lineup_name || raw.lineup || null,
    roundsSurvived,
    threeStars: Array.isArray(raw.three_stars) ? raw.three_stars : [],
    // 适配器永不授予核验状态（V17：verified 只能由人工核验动作授予）
    verified: false,
    recordStatus: 'PENDING',
    evidenceId: `ev-camp-${campSeq}`,
    batchId: raw.batchId || null,
    sourceRecordKey: `kohcamp:${playerUid}:${campSeq}`
  }
}

/**
 * 将官方营地返回的列表包装为数据库兼容的对局数据
 */
export function transformCampMatchList(records) {
  if (!Array.isArray(records)) {
    throw new Error('营地返回数据格式必须为数组')
  }
  return records.map((r, i) => validateCampRawRecord(r, i))
}
