// v6 · 运行环境解析（手写 .env 加载，零新依赖）
// 红线：仓库与日志不落任何真实密钥；ADMIN_TOKEN 一律走环境。
// PostgreSQL 为唯一权威存储；关键变量无默认值，缺失即拒绝启动。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ENV_FILE = path.join(__dirname, '..', '.env')

/**
 * 加载 backend/.env（KEY=VALUE 行）；已存在的环境变量不覆盖。
 * 文件不存在时静默跳过（正式部署可用真实环境变量注入）。
 */
export function loadEnvFile(file = ENV_FILE) {
  if (!fs.existsSync(file)) return {}
  const loaded = {}
  for (const rawLine of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
    loaded[key] = value
  }
  return loaded
}

export function getEnv() {
  return {
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT) || 8080,
    pg: {
      host: process.env.PGHOST || '127.0.0.1',
      port: Number(process.env.PGPORT) || 5432,
      database: process.env.PGDATABASE || null, // 必须显式
      user: process.env.PGUSER || process.env.USER || null,
      password: process.env.PGPASSWORD || null
    },
    adminToken: process.env.ADMIN_TOKEN || null // 必须显式，无默认值
  }
}

/**
 * 启动前置断言：缺关键变量直接抛错退出（禁止带默认值静默降级）
 */
export function assertFormalEnv(env = getEnv()) {
  const missing = []
  if (!env.pg.database) missing.push('PGDATABASE')
  if (!env.pg.user) missing.push('PGUSER')
  if (!env.adminToken) missing.push('ADMIN_TOKEN')
  if (missing.length > 0) {
    throw new Error(
      `缺少必填环境变量: ${missing.join(', ')}。` +
      '请在 backend/.env（参考 .env.example）或进程环境中显式提供；不提供默认值。'
    )
  }
  return env
}
