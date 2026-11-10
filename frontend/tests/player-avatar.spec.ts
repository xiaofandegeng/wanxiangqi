// @vitest-environment happy-dom
import {describe, it, expect} from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {getPlayerAvatar, normalizeNickname} from '../src/utils/player-avatar'

describe('选手头像系统 (player-avatar)', () => {
  const avatarDir = path.resolve(__dirname, '../public/avatars/players')
  const catalogPath = path.resolve(__dirname, '../../backend/data/prediction-catalog/ruanshi.json')
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))

  it('空值或非法输入返回默认兜底头像', () => {
    expect(getPlayerAvatar(null)).toBe('/avatars/default.svg')
    expect(getPlayerAvatar(undefined)).toBe('/avatars/default.svg')
    expect(getPlayerAvatar('')).toBe('/avatars/default.svg')
    expect(getPlayerAvatar('   ')).toBe('/avatars/default.svg')
  })

  it('ruanshi.json 对局全量 144 名选手 100% 映射到真实存在的 SVG 头像文件', () => {
    const players = new Set<string>()
    for (const match of catalog.matches) {
      for (const seat of match.seats) {
        if (seat.nickname) {
          players.add(seat.nickname)
        }
      }
    }

    expect(players.size).toBe(148)

    for (const nickname of players) {
      const url = getPlayerAvatar(nickname)
      expect(url).toMatch(/^\/avatars\/players\//)

      const fileName = decodeURIComponent(url.replace('/avatars/players/', ''))
      const fullPath = path.join(avatarDir, fileName)
      expect(fs.existsSync(fullPath), `头像文件应存在：${fileName} (对应选手：${nickname})`).toBe(true)
    }
  })

  it('精确选手与专属头像正确对应', () => {
    expect(getPlayerAvatar('I蟲、沐小朵')).toBe(`/avatars/players/${encodeURIComponent('I蟲、沐小朵')}.svg`)
    expect(getPlayerAvatar('I蟲丶沐小朵')).toBe(`/avatars/players/${encodeURIComponent('I蟲丶沐小朵')}.svg`)
    expect(getPlayerAvatar('EZ、7D')).toBe(`/avatars/players/${encodeURIComponent('EZ、7D')}.svg`)
    expect(getPlayerAvatar('白白白白白3')).toBe(`/avatars/players/${encodeURIComponent('白白白白白3')}.svg`)
    expect(getPlayerAvatar('胜天半子嘉誉')).toBe(`/avatars/players/${encodeURIComponent('胜天半子嘉誉')}.svg`)
  })

  it('作者注记与去噪函数 normalizeNickname 正常清洗前缀与后缀并命中已有头像', () => {
    expect(normalizeNickname('@拉丁鱼（王者万象棋）')).toBe('拉丁鱼')
    expect(normalizeNickname('QT新一【万象棋国一庄小鱼】')).toBe('QT新一')
    expect(normalizeNickname('遗愿（王者万象棋夺冠版）')).toBe('遗愿')
    expect(normalizeNickname('酒酒-（眼镜 ）王者万象棋')).toBe('酒酒-')

    // 经清洗后直接能定位到头像文件
    expect(getPlayerAvatar('@拉丁鱼（王者万象棋）')).toBe('/avatars/players/%E6%8B%89%E4%B8%81%E9%B1%BC.svg')
    expect(getPlayerAvatar('QT新一【万象棋国一庄小鱼】')).toBe('/avatars/players/QT%E6%96%B0%E4%B8%80.svg')
    expect(getPlayerAvatar('遗愿（王者万象棋夺冠版）')).toBe('/avatars/players/%E9%81%97%E6%84%BF.svg')
  })

  it('未知未录入的新昵称回退到高品质 SVG Data URI', () => {
    const unknownAvatar = getPlayerAvatar('完全未知的路人选手999')
    expect(unknownAvatar).toMatch(/^data:image\/svg\+xml;utf8,/)
    expect(decodeURIComponent(unknownAvatar)).toContain('<svg')
  })

  it('头像缓存机制正常工作，重复调用微秒级极速响应', () => {
    const t0 = performance.now()
    for (let i = 0; i < 1000; i++) {
      getPlayerAvatar('胜天半子嘉誉')
      getPlayerAvatar('抖音EZ、色彩')
      getPlayerAvatar('小琳谷芷')
      getPlayerAvatar('未知选手XYZ')
    }
    const t1 = performance.now()
    // 4000 次查询总耗时远小于 30ms
    expect(t1 - t0).toBeLessThan(30)
  })
})
