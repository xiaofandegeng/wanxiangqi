// 王者万象棋数据站 - 客户端图片存证哈希工具 (v3 真实数据整改版)
// 遵循任务书 §P2-C / A11 / V16:
// 1. 客户端只负责计算上传材料的真实 SHA-256 存证哈希，不做任何视觉识别
// 2. 不在客户端内置"已知材料名单"或核验结论——材料是否已核验/隔离以服务端 PG 为唯一权威
// 3. 任何上传材料一律返回 NEED_MANUAL_REVIEW（待人工核验），绝不回填选手名单

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
 * 客户端材料入口：计算真实 SHA-256 存证哈希。
 * v3 起不再内置任何"已核验材料指纹"客户端名单——材料的核验/隔离状态
 * 由服务端 PostgreSQL evidences 表唯一裁决，客户端一律返回待人工核验。
 */
export async function detectMatchFromImage(file: File): Promise<ExtractedLobbyResult> {
  const sha256 = await computeFileSha256(file)

  // 真实材料：只回执哈希，席位以人工核验工作台录入为准
  return {
    recognitionStatus: 'NEED_MANUAL_REVIEW',
    matchKey: `upload-${sha256.slice(0, 8)}`,
    matchTitle: `新上传截图材料 [${sha256.slice(0, 8)}]`,
    countdown: '--:--',
    userDiamondBalance: 0,
    spectatorCount: 0,
    sha256,
    evidenceNote: '本站不做自动识别与名单推测；请携带该哈希在人工核验工作台逐席位录入，核验通过后统计才生效',
    participants: [] // 真实空名单，不回填任何选手
  }
}
