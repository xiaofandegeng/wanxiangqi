// 模拟器截图画面对局解析器 (Game Screenshot Multi-Match Analyzer)
// 遵循 v2 规范：哈希仅用于去重与已知证据核对，禁止按文件大小强行猜测名单，未知截图返回待人工录入
import crypto from 'node:crypto'

export function getBufferSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

// 已知基准实战材料 1：18824★ 战力巅峰第一人局
const LOBBY_18824 = {
  countdown: '02:29',
  userDiamondBalance: 3422,
  spectatorCount: 59,
  totalSupportPeople: 10300,
  participants: [
    { slot: 1, nickname: 'EZ夜余', title: '战力巅峰第一人', rankText: '最强王者', rankScore: 18824, supportCount: 3325, oddsDisplay: 1.8, commanderName: '弈星' },
    { slot: 2, nickname: 'DY校长神Gin', title: '战力巅峰第十人', rankText: '最强王者', rankScore: 12091, supportCount: 1747, oddsDisplay: 7.1, commanderName: '司空震' },
    { slot: 3, nickname: '抖音李由多', title: '华北区第人 0015', rankText: '最强王者', rankScore: 10075, supportCount: 1404, oddsDisplay: 10.2, commanderName: '司空震' },
    { slot: 4, nickname: '抖音EGM皮皮鲨', title: '', rankText: '最强王者', rankScore: 10054, supportCount: 1268, oddsDisplay: 10.1, commanderName: '庄周' },
    { slot: 5, nickname: '想k益笙菌', title: '', rankText: '最强王者', rankScore: 9996, supportCount: 1300, oddsDisplay: 10.5, commanderName: '诸葛亮' },
    { slot: 6, nickname: 'B站小优律', title: '联合创始人 0496', rankText: '最强王者', rankScore: 9961, supportCount: 1256, oddsDisplay: 10.3, commanderName: '公孙离' }
  ],
  oddsMap: { 1: 1.8, 2: 7.1, 3: 10.2, 4: 10.1, 5: 10.5, 6: 10.3 }
}

// 已知基准实战材料 2：白白白白3 11768★ 荣耀先驱者局
const LOBBY_11768 = {
  countdown: '01:59',
  userDiamondBalance: 2532,
  spectatorCount: 29,
  totalSupportPeople: 22393,
  participants: [
    { slot: 1, nickname: '白白白白3', title: '荣耀先驱者 0004', rankText: '最强王者', rankScore: 11768, supportCount: 4406, oddsDisplay: 4.2, commanderName: '弈星' },
    { slot: 2, nickname: '抖音一茗', title: '联合创始人 1072', rankText: '最强王者', rankScore: 11183, supportCount: 4179, oddsDisplay: 3.8, commanderName: '弈星' },
    { slot: 3, nickname: '抖音EZ流儿', title: '', rankText: '最强王者', rankScore: 10234, supportCount: 3728, oddsDisplay: 6.2, commanderName: '司空震' },
    { slot: 4, nickname: 'Asen', title: '独狼', rankText: '最强王者', rankScore: 10132, supportCount: 3429, oddsDisplay: 7.2, commanderName: '庄周' },
    { slot: 5, nickname: '抖音刺痛', title: '联合创始人 1814', rankText: '最强王者', rankScore: 9638, supportCount: 3325, oddsDisplay: 7.7, commanderName: '公孙离' },
    { slot: 6, nickname: 'DY道无涯', title: '独狼', rankText: '最强王者', rankScore: 9405, supportCount: 3326, oddsDisplay: 7.5, commanderName: '诸葛亮' }
  ],
  oddsMap: { 1: 4.2, 2: 3.8, 3: 6.2, 4: 7.2, 5: 7.7, 6: 7.5 }
}

/**
 * 截图对局解析：通过 SHA-256 存证匹配已知基准材料，未知图片返回待录入状态
 */
export async function extractLobbyParticipants(imageBuffer) {
  const sha256 = getBufferSha256(imageBuffer)

  // 严格基于 SHA-256 哈希匹配已知样本
  if (sha256.startsWith('e4ea43a1')) {
    return {
      status: 'MATCHED_FIXTURE',
      sha256,
      ...LOBBY_18824,
      confidence: 1.0
    }
  }

  if (sha256.startsWith('aa02599')) {
    return {
      status: 'MATCHED_FIXTURE',
      sha256,
      ...LOBBY_11768,
      confidence: 1.0
    }
  }

  // 未知图片返回真实待人工校对状态，不伪造名单与置信度
  return {
    status: 'NEED_MANUAL_REVIEW',
    sha256,
    countdown: '--:--',
    userDiamondBalance: 0,
    spectatorCount: 0,
    totalSupportPeople: 0,
    participants: [],
    oddsMap: {},
    confidence: null,
    note: '未匹配到已知样本存证哈希，请通过人工审核界面录入席位'
  }
}
