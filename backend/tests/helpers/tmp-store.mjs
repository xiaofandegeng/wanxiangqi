// v3 P0-A 测试隔离 · 临时存储目录工厂
// 测试一律通过本文件创建 StorageEngine 实例：mkdtemp 独立临时目录 + 用后清理，
// 从构造上杜绝测试写业务 storage.json 的可能。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createStorageEngine } from '../../../tools/emulator-watcher/storage.mjs'

export function makeTempDataDir(prefix = 'wxq-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

/**
 * 创建绑定临时目录的 StorageEngine（空库冷启动）
 * @returns {{ engine: import('../../../tools/emulator-watcher/storage.mjs').StorageEngine, dataDir: string, cleanup: () => void }}
 */
export function makeTmpStore() {
  const dataDir = makeTempDataDir()
  const engine = createStorageEngine({ dataDir })
  return {
    engine,
    dataDir,
    cleanup: () => {
      try {
        fs.rmSync(dataDir, { recursive: true, force: true })
      } catch {
        /* 临时目录清理失败不影响测试结论 */
      }
    }
  }
}
