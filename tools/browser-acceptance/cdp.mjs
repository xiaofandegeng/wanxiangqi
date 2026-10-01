// W5 · 零安装浏览器验收 —— 手写 CDP 直连客户端（纯 Node stdlib，无任何 npm 依赖）
//
// 设计边界（任务书 v4 W5 / 用户已选零安装方案）：
// - 只用 Node ≥22 全局 WebSocket + child_process；不引 playwright/puppeteer
// - 只覆盖本验收用到的 CDP 小面：Target/Page/Runtime/Emulation/Input/DOM
// - 启动缓存的 Chromium（ms-playwright chromium-1234 → 1208 备选），绝不下载
// - 浏览器实例与 user-data-dir 全部放临时目录，用后清理，不碰开发者浏览器配置
//
// 失败语义：任何一步超时/异常都显式抛错，由 harness 逐场景捕获降级，不静默吞。

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CHROME_CANDIDATES = [
  process.env.WXQ_CHROME_BIN,
  'chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  'chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
].filter(Boolean)

/** 探测可用的 Chromium 可执行文件；找不到返回 null（harness 走手工清单降级） */
export function findChromeBinary() {
  const roots = [path.join(os.homedir(), 'Library/Caches/ms-playwright')]
  for (const rel of CHROME_CANDIDATES) {
    if (path.isAbsolute(rel)) {
      if (fs.existsSync(rel)) return rel
      continue
    }
    for (const root of roots) {
      const p = path.join(root, rel)
      if (fs.existsSync(p)) return p
    }
  }
  return null
}

/** 启动 headless Chromium 并等待 DevTools WebSocket 就绪 */
export async function launchChrome({ binary = null, headless = true } = {}) {
  const exe = binary ?? findChromeBinary()
  if (!exe) throw new Error('未找到可用 Chromium（WXQ_CHROME_BIN 或 ms-playwright 缓存）')
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxq-cdp-profile-'))
  const child = spawn(exe, [
    '--headless=new',
    '--remote-debugging-port=0', // 随机端口，实际地址从 stderr 读取
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    '--hide-scrollbars',
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] })

  const wsEndpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待 DevTools 端口超时（15s）')), 15_000)
    let buf = ''
    const onData = chunk => {
      buf += chunk.toString('utf8')
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) {
        clearTimeout(timer)
        child.stderr.off('data', onData)
        resolve(m[1])
      }
    }
    child.stderr.on('data', onData)
    child.once('exit', code => {
      clearTimeout(timer)
      reject(new Error(`Chromium 提前退出（code=${code}）：${buf.slice(-300)}`))
    })
  })

  return { child, wsEndpoint, userDataDir, exe }
}

/**
 * 浏览器级 CDP 会话：JSON-RPC over WebSocket + 事件订阅。
 * Node ≥22 自带全局 WebSocket；低版本需 --experimental-websocket（harness 启动时校验）。
 */
export class CdpBrowser {
  constructor(wsEndpoint, { child, userDataDir } = {}) {
    if (typeof WebSocket !== 'function') {
      throw new Error(`当前 Node ${process.version} 无全局 WebSocket，请用 node --experimental-websocket 运行`)
    }
    this.wsEndpoint = wsEndpoint
    this.child = child ?? null
    this.userDataDir = userDataDir ?? null
    this.nextId = 1
    this.pending = new Map()
    this.eventHandlers = new Map() // method -> Set<fn>
    this.ws = null
    this.closed = false
  }

  async connect() {
    this.ws = await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsEndpoint)
      ws.addEventListener('open', () => resolve(ws))
      ws.addEventListener('error', () => reject(new Error(`CDP WebSocket 连接失败: ${this.wsEndpoint}`)))
    })
    this.ws.addEventListener('message', ev => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'))
      if (msg.id !== undefined) {
        const entry = this.pending.get(msg.id)
        if (entry) {
          this.pending.delete(msg.id)
          if (msg.error) entry.reject(new Error(`CDP ${msg.error.message} (${msg.error.code})`))
          else entry.resolve(msg.result)
        }
        return
      }
      for (const fn of this.eventHandlers.get(msg.method) ?? []) fn(msg.params, msg.sessionId)
    })
    return this
  }

  on(method, fn) {
    if (!this.eventHandlers.has(method)) this.eventHandlers.set(method, new Set())
    this.eventHandlers.get(method).add(fn)
  }

  /** 发送命令；sessionId 指定则路由到对应页面会话（flatten 模式） */
  send(method, params = {}, sessionId = undefined) {
    if (this.closed) return Promise.reject(new Error('CDP 会话已关闭'))
    const id = this.nextId++
    const message = { id, method, params }
    if (sessionId) message.sessionId = sessionId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify(message))
    })
  }

  async close() {
    this.closed = true
    try { this.ws?.close() } catch { /* 忽略 */ }
    if (this.child) {
      this.child.kill('SIGTERM')
      await new Promise(resolve => {
        const t = setTimeout(() => { this.child.kill('SIGKILL'); resolve() }, 3000)
        this.child.once('exit', () => { clearTimeout(t); resolve() })
      })
    }
    if (this.userDataDir) fs.rmSync(this.userDataDir, { recursive: true, force: true })
  }
}

/** 单页面会话：导航/求值/截图/视口/文件注入/键盘/控制台捕获 */
export class CdpPage {
  constructor(browser, targetId, sessionId) {
    this.browser = browser
    this.targetId = targetId
    this.sessionId = sessionId
    this.consoleLog = [] // { kind: 'console'|'exception', type, text, ts, location }
    this.navId = 0
    this.navWaiters = []
    browser.on('Page.loadEventFired', (_p, sid) => {
      if (sid !== this.sessionId) return
      const waiters = this.navWaiters
      this.navWaiters = []
      for (const w of waiters) w()
    })
    browser.on('Runtime.consoleAPICalled', (p, sid) => {
      if (sid !== this.sessionId) return
      const text = (p.args ?? []).map(a => a.value ?? a.description ?? '').join(' ')
      this.consoleLog.push({ kind: 'console', type: p.type, text, ts: p.timestamp })
    })
    browser.on('Runtime.exceptionThrown', (p, sid) => {
      if (sid !== this.sessionId) return
      const d = p.exceptionDetails ?? {}
      this.consoleLog.push({
        kind: 'exception',
        type: 'exception',
        text: `${d.text ?? ''} ${d.exception?.description ?? ''}`.trim(),
        ts: p.timestamp,
        location: d.url ? `${d.url}:${d.lineNumber}` : undefined
      })
    })
  }

  /** 新建页面并挂载会话（flatten 模式，事件带 sessionId 路由） */
  static async create(browser, { viewport = null } = {}) {
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
    const page = new CdpPage(browser, targetId, sessionId)
    await browser.send('Page.enable', {}, sessionId)
    await browser.send('Runtime.enable', {}, sessionId)
    await browser.send('DOM.enable', {}, sessionId)
    await browser.send('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId)
    if (viewport) await page.setViewport(viewport)
    return page
  }

  async close() {
    await this.browser.send('Target.closeTarget', { targetId: this.targetId }).catch(() => {})
  }

  /** 视口：桌面 1440×900 / 移动 390×844（含 touch 覆盖），deviceScaleFactor 保持 1 便于截图比对 */
  async setViewport({ width, height, mobile = false, touch = false }) {
    await this.browser.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile
    }, this.sessionId)
    await this.browser.send('Emulation.setTouchEmulationEnabled', {
      enabled: touch, maxTouchPoints: touch ? 5 : 1
    }, this.sessionId)
    await this.browser.send('Emulation.setEmitTouchEventsForMouse', { enabled: touch }, this.sessionId)
  }

  /** 导航并等 load 事件（+ 额外静默帧，等 Vue 渲染与数据请求落地） */
  async goto(url, { settleMs = 700, timeoutMs = 20_000 } = {}) {
    const navPromise = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`页面加载超时: ${url}`)), timeoutMs)
      this.navWaiters.push(() => { clearTimeout(t); resolve() })
    })
    await this.browser.send('Page.navigate', { url }, this.sessionId)
    await navPromise
    await sleep(settleMs)
  }

  /** 在页面内求值（awaitPromise，返回值走 JSON） */
  async eval(expression) {
    const res = await this.browser.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    }, this.sessionId)
    if (res.exceptionDetails) {
      throw new Error(`页面求值异常: ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description ?? ''}`)
    }
    return res.result?.value
  }

  /** 截图（PNG）写入磁盘；fullPage 用于长页留档 */
  async screenshot(filePath, { fullPage = false } = {}) {
    const params = { format: 'png' }
    if (fullPage) {
      const metrics = await this.browser.send('Page.getLayoutMetrics', {}, this.sessionId)
      const { width, height } = metrics.contentSize
      await this.browser.send('Emulation.setDeviceMetricsOverride', {
        width: Math.ceil(width), height: Math.ceil(height), deviceScaleFactor: 1, mobile: false
      }, this.sessionId)
      await sleep(120)
      params.captureBeyondViewport = true
    }
    const { data } = await this.browser.send('Page.captureScreenshot', params, this.sessionId)
    fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
    if (fullPage) {
      // 恢复原视口由调用方自行设置（全页截图会覆盖视口覆盖项）
    }
    return filePath
  }

  /**
   * 向 <input type=file> 注入真实文件路径（UI 上传的唯一真实途径）。
   * selector 必须命中一个 file input；注入后派发 change 事件驱动组件 handleFileChange。
   */
  async setFileInputFiles(selector, files) {
    const { root } = await this.browser.send('DOM.getDocument', {}, this.sessionId)
    const { nodeId } = await this.browser.send('DOM.querySelector', {
      nodeId: root.nodeId, selector
    }, this.sessionId)
    if (!nodeId) throw new Error(`file input 未找到: ${selector}`)
    await this.browser.send('DOM.setFileInputFiles', { nodeId, files }, this.sessionId)
    // 组件监听 change；CDP 注入不自动触发 DOM 事件，需手动派发
    await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return el.files.length
    })()`)
  }

  /** 键盘走查：按 Tab N 次并收集焦点轨迹（元素标签/文本/可聚焦性） */
  async tabWalk(times) {
    const trace = []
    for (let i = 0; i < times; i++) {
      await this.browser.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9
      }, this.sessionId)
      await this.browser.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9
      }, this.sessionId)
      await sleep(60)
      trace.push(await this.eval(`(() => {
        const el = document.activeElement
        if (!el || el === document.body) return { tag: 'BODY(无焦点)' }
        return {
          tag: el.tagName,
          text: (el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 30),
          disabled: el.disabled === true
        }
      })()`))
    }
    return trace
  }

  /** 取回自导航以来累计的控制台记录（不清理，累计留档） */
  takeConsole() {
    return this.consoleLog.slice()
  }

  resetConsole() {
    this.consoleLog = []
  }

  /**
   * 向 v-model 输入框写值：原生 value setter + input 事件（真实浏览器内与键入等价）。
   * selectorExpr 是返回 input 元素的表达式（非字符串选择器），便于 :nth/复合查找。
   */
  async typeIn(selectorExpr, value) {
    return this.eval(`(() => {
      const el = eval(${JSON.stringify(selectorExpr)})
      if (!el) return false
      const setter = Object.getOwnPropertyDescriptor(
        el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value').set
      setter.call(el, ${JSON.stringify(value)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`)
  }

  /** 向 v-model 下拉选择写值（select：value 赋值 + change 事件） */
  async chooseSelect(selectorExpr, value) {
    return this.eval(`(() => {
      const el = eval(${JSON.stringify(selectorExpr)})
      if (!el || el.tagName !== 'SELECT') return false
      el.value = ${JSON.stringify(value)}
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    })()`)
  }

  /** 按可见文本点击按钮（真实 click，触发完整事件链） */
  async clickText(needle, { settleMs = 350 } = {}) {
    const ok = await this.eval(`(() => {
      const el = Array.from(document.querySelectorAll('button, a'))
        .find(b => (b.textContent || '').includes(${JSON.stringify(needle)}))
      if (!el || el.disabled) return false
      el.click()
      return true
    })()`)
    await sleep(settleMs)
    return ok
  }
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
