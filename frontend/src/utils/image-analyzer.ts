// 王者万象棋数据站 - 客户端图片存证与特征提取工具 (v2 真实存证核验版)
// 遵循 v2 规范与验收报告要求 (F06, A11):
// 1. 彻底删除任何文件名猜测逻辑 (严禁通过 18824 / 11768 等文件名命中预设)
// 2. 仅比对已知已核验截图材料的完整 SHA-256 哈希
// 3. 未知图片一律返回 NEED_MANUAL_REVIEW 待人工核验状态，绝不伪造选手名单

export interface ExtractedParticipant {
  slot: number
  nickname: string
  rankText: string
  rankScore: number
  oddsDisplay: number
}

export interface ExtractedLobbyResult {
  recognitionStatus: 'MATCHED_KNOWN_EVIDENCE' | 'NEED_MANUAL_REVIEW' | 'FAILED'
  matchKey: string
  matchTitle: string
  countdown: string
  userDiamondBalance: number
  spectatorCount: number
  sha256: string
  evidenceNote: string
  participants: ExtractedParticipant[]
}

// 已核验真实截图 1 的完整 SHA-256 (media_1790503431300)
const KNOWN_EVIDENCE_18824_SHA256 = 'e4ea43a1b70ad626d5e5508684d5de3d9bf1eb12265ca703a3fb45c2ec4bfa82'

// 已核验真实截图 2 的完整 SHA-256 (media_1790501305141)
const KNOWN_EVIDENCE_11768_SHA256 = 'aa02599c279e88d1d86e927c3f8e6c7104b901a1827b9c66e92823a31e847c2d'

const FIXTURE_MATCH_18824: Omit<ExtractedLobbyResult, 'sha256'> = {
  recognitionStatus: 'MATCHED_KNOWN_EVIDENCE',
  matchKey: 'match-18824-peak',
  matchTitle: '巅峰赛 18824★ 战力巅峰对决 (已核验材料)',
  countdown: '02:29',
  userDiamondBalance: 3422,
  spectatorCount: 59,
  evidenceNote: '该实战截图与数据库存证指纹一致，已通过人工核验审核',
  participants: [
    { slot: 1, nickname: 'EZ夜余', rankText: '最强王者', rankScore: 18824, oddsDisplay: 1.8 },
    { slot: 2, nickname: 'DY校长神Gin', rankText: '最强王者', rankScore: 12091, oddsDisplay: 7.1 },
    { slot: 3, nickname: '抖音李由多', rankText: '最强王者', rankScore: 10075, oddsDisplay: 10.2 },
    { slot: 4, nickname: '抖音EGM皮皮鲨', rankText: '最强王者', rankScore: 10054, oddsDisplay: 10.1 },
    { slot: 5, nickname: '想k益笙菌', rankText: '最强王者', rankScore: 9996, oddsDisplay: 10.5 },
    { slot: 6, nickname: 'B站小优律', rankText: '最强王者', rankScore: 9961, oddsDisplay: 10.3 }
  ]
}

const FIXTURE_MATCH_11768: Omit<ExtractedLobbyResult, 'sha256'> = {
  recognitionStatus: 'MATCHED_KNOWN_EVIDENCE',
  matchKey: 'match-11768-glory',
  matchTitle: '王牌对决 11768★ 荣耀先驱者对决 (已核验材料)',
  countdown: '01:52',
  userDiamondBalance: 2850,
  spectatorCount: 42,
  evidenceNote: '该实战截图与数据库存证指纹一致，已通过人工核验审核',
  participants: [
    { slot: 1, nickname: '白白白白3', rankText: '最强王者', rankScore: 11768, oddsDisplay: 4.2 },
    { slot: 2, nickname: '抖音一茗', rankText: '最强王者', rankScore: 11183, oddsDisplay: 3.8 },
    { slot: 3, nickname: '抖音EZ流儿', rankText: '最强王者', rankScore: 10234, oddsDisplay: 6.2 },
    { slot: 4, nickname: 'Asen', rankText: '最强王者', rankScore: 10132, oddsDisplay: 7.2 },
    { slot: 5, nickname: '抖音刺痛', rankText: '最强王者', rankScore: 9638, oddsDisplay: 7.7 },
    { slot: 6, nickname: 'DY道无涯', rankText: '最强王者', rankScore: 9405, oddsDisplay: 7.5 }
  ]
}

/**
 * 计算文件的真实 SHA-256 存证哈希
 */
export async function computeFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 客户端图片解析：先计算真实的 SHA-256 存证哈希
 * 只有严格匹配已知存证指纹时才返回核验对局，绝不按文件名猜测 (F06)
 */
export async function detectMatchFromImage(file: File): Promise<ExtractedLobbyResult> {
  const sha256 = await computeFileSha256(file)

  // 严格比对完整 SHA-256 哈希，彻底删除文件名包含判断！
  if (sha256 === KNOWN_EVIDENCE_18824_SHA256) {
    return {
      ...FIXTURE_MATCH_18824,
      sha256
    }
  }

  if (sha256 === KNOWN_EVIDENCE_11768_SHA256) {
    return {
      ...FIXTURE_MATCH_11768,
      sha256
    }
  }

  // 真实未知图片：绝不伪造数据，返回待人工核验状态 (F06)
  return {
    recognitionStatus: 'NEED_MANUAL_REVIEW',
    matchKey: `upload-${sha256.slice(0, 8)}`,
    matchTitle: `新上传截图材料 [${sha256.slice(0, 8)}]`,
    countdown: '--:--',
    userDiamondBalance: 0,
    spectatorCount: 0,
    sha256,
    evidenceNote: '未匹配到预置核验材料，需要进入人工审核台校对或等待OCR服务',
    participants: [] // 真实空名单，阻止求解器默认推荐
  }
}
