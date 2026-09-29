// v3 P0-A 测试隔离 · 前端测试全局护栏 (vitest globalSetup)
// 整轮测试前后断言业务 storage.json 哈希不变；并把 WXQ_DATA_DIR 指向临时目录，
// 使任何残留的隐式业务存储访问被重定向出业务路径。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const BUSINESS_STORAGE_FILE = new URL('../../../tools/emulator-watcher/data/storage.json', import.meta.url).pathname

function sha256Of(file: string): string | null {
  if (!fs.existsSync(file)) return null
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

export default function setup(): (() => void) | Promise<(() => void)> {
  const before = sha256Of(BUSINESS_STORAGE_FILE)

  // 测试期间的一切存储访问重定向到临时目录
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wxq-frontend-test-'))
  process.env.WXQ_DATA_DIR = sandboxDir
  console.log('[business-assets-guard] WXQ_DATA_DIR ->', sandboxDir)
  console.log('[business-assets-guard] 基线 sha256 =', before ? before.slice(0, 16) + '…' : '(业务文件不存在)')

  return function teardown(): void {
    if (sha256Of(BUSINESS_STORAGE_FILE) !== before) {
      throw new Error(
        `[business-assets-guard] V01 违规：业务 storage.json 在前端测试期间被修改\n` +
        `  before: ${before}\n` +
        `  after:  ${sha256Of(BUSINESS_STORAGE_FILE)}\n` +
        '前端测试不得触碰业务文件；StorageEngine 一律注入临时目录。'
      )
    }
    fs.rmSync(sandboxDir, { recursive: true, force: true })
    console.log('[business-assets-guard] ✔ 业务 storage.json 在整轮前端测试中未被触碰')
  }
}
