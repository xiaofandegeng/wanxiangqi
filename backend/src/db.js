// 王者万象棋数据站 - 数据库接入与迁移管理层 (Database & Migration Layer)
// 支持 PostgreSQL 原生连接与本地安全持久化引擎的平滑切换与双向同步

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getBusinessStorage } from '../../tools/emulator-watcher/storage.mjs'

// v3 P0-A 测试隔离：单例 import 已移除，改用惰性业务实例
// （本文件将在 S3 重构中整体退役，由 repositories/pg-repository.mjs 取代）
const storage = getBusinessStorage()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA_FILE = path.join(__dirname, 'schema.sql')

export class DatabaseManager {
  constructor() {
    this.isConnected = false
    this.engineType = 'POSTGRESQL_COMPATIBLE_LOCAL'
    this.connectionError = null
    this.pool = null
  }

  /**
   * 初始化数据库并执行迁移
   */
  async initialize() {
    const pgHost = process.env.PGHOST || '127.0.0.1'
    const pgPort = Number(process.env.PGPORT) || 5432
    const pgDatabase = process.env.PGDATABASE || 'wanxiangqi'
    const pgUser = process.env.PGUSER || 'lhw'

    try {
      let pg = null
      try {
        pg = await import('pg')
      } catch (e) {
        // 无全局或本地 pg 模块
      }

      if (pg && (pg.Pool || (pg.default && pg.default.Pool))) {
        const PoolClass = pg.Pool || pg.default.Pool
        this.pool = new PoolClass({
          host: pgHost,
          port: pgPort,
          database: pgDatabase,
          user: pgUser,
          connectionTimeoutMillis: 3000
        })

        const client = await this.pool.connect()
        // 执行 schema.sql 迁移
        if (fs.existsSync(SCHEMA_FILE)) {
          const sql = fs.readFileSync(SCHEMA_FILE, 'utf-8')
          await client.query(sql)
          console.log('[DatabaseManager] PostgreSQL 表结构迁移校验已完成')
        }
        client.release()

        this.isConnected = true
        this.engineType = 'POSTGRESQL_LIVE'
        console.log(`[DatabaseManager] 已成功接通 PostgreSQL: ${pgHost}:${pgPort}/${pgDatabase}`)

        // 从 PostgreSQL 恢复/加载数据至内存状态
        await this.hydrateFromPostgres()

        // v3 F07 修复：storage.mjs 已移除 triggerSync/setSyncHandler（fire-and-forget
        // 且吞掉 async 异步拒绝）。自此 JSON→PG 自动同步停用；
        // S3 重构后写路径统一走 PgRepository 单事务，不再存在双写漂移。

        return { isConnected: true, engine: this.engineType }
      }
    } catch (err) {
      this.connectionError = err.message
      console.warn(`[DatabaseManager] PostgreSQL 连接不可用 (${err.message})，激活兼容本地持久化引擎`)
    }

    this.isConnected = false
    this.engineType = 'LOCAL_FILE_PERSISTENT'
    return { isConnected: false, engine: this.engineType, error: this.connectionError }
  }

  /**
   * 从 PostgreSQL 加载所有实体并填充 storage 事实库
   */
  async hydrateFromPostgres() {
    if (!this.isConnected || !this.pool) return

    try {
      // 1. 读取选手表
      const playersRes = await this.pool.query('SELECT * FROM players ORDER BY rank_score DESC')
      if (playersRes.rows.length > 0) {
        storage.state.players = playersRes.rows.map(r => ({
          id: r.id,
          nickname: r.nickname,
          platform: r.platform,
          serverZone: r.server_zone,
          rankScore: r.rank_score,
          rankText: r.rank_text,
          title: r.title,
          commander: r.commander,
          style: r.style
        }))
      }

      // 2. 读取证据表
      const evidencesRes = await this.pool.query('SELECT * FROM evidences ORDER BY captured_at DESC')
      if (evidencesRes.rows.length > 0) {
        storage.state.evidences = evidencesRes.rows.map(r => ({
          id: r.id,
          sha256: r.sha256,
          sourceId: r.source_id,
          capturedAt: r.captured_at?.toISOString?.() || r.captured_at,
          verifiedAt: r.verified_at?.toISOString?.() || r.verified_at,
          verifiedBy: r.verified_by,
          status: r.status,
          note: r.note
        }))
      }

      // 3. 读取赛事与席位
      const eventsRes = await this.pool.query('SELECT * FROM events ORDER BY scheduled_at DESC')
      const participantsRes = await this.pool.query('SELECT * FROM event_participants ORDER BY event_id, slot')
      if (eventsRes.rows.length > 0) {
        storage.state.events = eventsRes.rows.map(evt => {
          const parts = participantsRes.rows
            .filter(p => p.event_id === evt.id)
            .map(p => ({
              slot: p.slot,
              playerId: p.player_id,
              nickname: p.nickname,
              rankScore: p.rank_score,
              odds: Number(p.odds),
              supportCount: p.support_count,
              finalRank: p.final_rank,
              commander: p.commander,
              lineup: p.lineup
            }))
          return {
            id: evt.id,
            mode: evt.mode,
            scheduledAt: evt.scheduled_at?.toISOString?.() || evt.scheduled_at,
            title: evt.title,
            status: evt.status,
            evidenceId: evt.evidence_id,
            verifiedAt: evt.verified_at?.toISOString?.() || evt.verified_at,
            verifiedBy: evt.verified_by,
            participants: parts
          }
        })
      }

      // 4. 读取对局流水表
      const matchesRes = await this.pool.query('SELECT * FROM matches ORDER BY match_time DESC')
      if (matchesRes.rows.length > 0) {
        storage.state.matches = matchesRes.rows.map(m => ({
          id: m.id,
          playerId: m.player_id,
          matchTime: m.match_time?.toISOString?.() || m.match_time,
          availableAt: m.available_at?.toISOString?.() || m.available_at,
          mode: m.mode,
          finalRank: m.final_rank,
          commander: m.commander,
          lineup: m.lineup,
          roundsSurvived: m.rounds_survived,
          threeStars: Array.isArray(m.three_stars) ? m.three_stars : (typeof m.three_stars === 'string' ? JSON.parse(m.three_stars) : []),
          verified: m.verified,
          evidenceId: m.evidence_id,
          batchId: m.batch_id,
          revision: m.revision,
          sourceRecordKey: m.source_record_key
        }))
      }

      // 5. 读取阵容聚合快照表
      const snapsRes = await this.pool.query('SELECT * FROM lineup_snapshots ORDER BY updated_at DESC')
      if (snapsRes.rows.length > 0) {
        storage.state.lineupSnapshots = snapsRes.rows.map(s => ({
          id: s.id,
          sourceId: s.source_id,
          lineupName: s.lineup_name,
          tier: s.tier,
          commander: s.commander,
          coreHeroes: Array.isArray(s.core_heroes) ? s.core_heroes : (typeof s.core_heroes === 'string' ? JSON.parse(s.core_heroes) : []),
          sampleCount: s.sample_count,
          winRate: Number(s.win_rate),
          top3Rate: Number(s.top3_rate),
          avgRank: Number(s.avg_rank),
          snapshotVersion: s.snapshot_version,
          windowText: s.window_text,
          scope: s.scope
        }))
      }

      // 6. 读取批次记录
      const batchesRes = await this.pool.query('SELECT * FROM import_batches ORDER BY created_at DESC')
      if (batchesRes.rows.length > 0) {
        storage.state.importBatches = batchesRes.rows.map(b => ({
          batchId: b.batch_id,
          source: b.source,
          totalRecords: b.total_records,
          inserted: b.inserted,
          updated: b.updated,
          duplicates: b.duplicates,
          createdAt: b.created_at?.toISOString?.() || b.created_at
        }))
      }

      storage.state.meta.engine = 'PostgreSQL_Live_Production'
      storage.state.meta.storageMode = 'POSTGRESQL_CONNECTED'
      console.log(`[DatabaseManager] PostgreSQL 数据集已同步至内存 (选手: ${storage.state.players.length}, 对局: ${storage.state.matches.length}, 赛事: ${storage.state.events.length})`)
    } catch (err) {
      console.error('[DatabaseManager] 从 PostgreSQL 加载数据失败:', err)
    }
  }

  /**
   * 监听 Storage 引擎动作，实时增量写入 PostgreSQL
   */
  async handleStorageSync(action, payload) {
    if (!this.isConnected || !this.pool) return

    try {
      if (action === 'CONFIRM_AUDIT') {
        await this.syncAuditToPg(payload)
      } else if (action === 'IMPORT_BATCH') {
        await this.syncImportBatchToPg(payload)
      } else if (action === 'LINEUP_SYNCED') {
        await this.syncLineupSnapshotsToPg(payload)
      } else if (action === 'SYNC_PLAYERS') {
        await this.syncPlayersToPg(payload)
      }
    } catch (err) {
      console.error(`[DatabaseManager] 同步动作 ${action} 至 PostgreSQL 失败:`, err.message)
    }
  }

  /**
   * 批量将选手写入 PostgreSQL
   */
  async syncPlayersToPg(players) {
    if (!Array.isArray(players) || players.length === 0) return
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      for (const p of players) {
        await client.query(
          `INSERT INTO players (id, nickname, platform, server_zone, rank_score, rank_text, title, commander, style, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             nickname = EXCLUDED.nickname,
             rank_score = EXCLUDED.rank_score,
             rank_text = EXCLUDED.rank_text,
             title = EXCLUDED.title,
             commander = EXCLUDED.commander,
             style = EXCLUDED.style,
             updated_at = CURRENT_TIMESTAMP`,
          [
            p.id,
            p.nickname,
            p.platform || 'DEFAULT',
            p.serverZone || '官方赛事统一服',
            p.rankScore || 10000,
            p.rankText || '最强王者',
            p.title || '',
            p.commander || '通用',
            p.style || '实战运营'
          ]
        )
      }
      await client.query('COMMIT')
      console.log(`[DatabaseManager] ${players.length} 位真实选手已成功写入 PostgreSQL`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * 人工核验对决及选手对局写入 PostgreSQL
   */
  async syncAuditToPg({ eventRecord, evidenceRecord, players, matches }) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      // 1. 确保在插入 event 之前证据在 evidences 表中存在
      const targetEvidenceId = eventRecord.evidenceId || (evidenceRecord && evidenceRecord.id)
      if (targetEvidenceId) {
        const evSha = (evidenceRecord && evidenceRecord.sha256) || `sha-${targetEvidenceId}`
        const evSource = (evidenceRecord && evidenceRecord.sourceId) || 'src-manual-review'
        const evCaptured = (evidenceRecord && evidenceRecord.capturedAt) || eventRecord.scheduledAt
        const evVerified = (evidenceRecord && evidenceRecord.verifiedAt) || eventRecord.verifiedAt || new Date().toISOString()
        const evBy = (evidenceRecord && evidenceRecord.verifiedBy) || eventRecord.verifiedBy || 'AUDIT_STAFF'
        const evNote = (evidenceRecord && evidenceRecord.note) || eventRecord.title || '校对存证'

        await client.query(
          `INSERT INTO evidences (id, sha256, source_id, captured_at, verified_at, verified_by, status, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             verified_at = EXCLUDED.verified_at,
             verified_by = EXCLUDED.verified_by,
             status = EXCLUDED.status,
             note = EXCLUDED.note`,
          [
            targetEvidenceId,
            evSha,
            evSource,
            evCaptured,
            evVerified,
            evBy,
            'VERIFIED',
            evNote
          ]
        )
      }

      // 2. 确保所有席位选手在 players 表中存在
      for (const pt of eventRecord.participants) {
        const pObj = (players || []).find(p => p.id === pt.playerId) || {}
        await client.query(
          `INSERT INTO players (id, nickname, platform, server_zone, rank_score, rank_text, title, commander, style, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             nickname = EXCLUDED.nickname,
             rank_score = EXCLUDED.rank_score,
             rank_text = EXCLUDED.rank_text,
             title = EXCLUDED.title,
             commander = EXCLUDED.commander,
             style = EXCLUDED.style,
             updated_at = CURRENT_TIMESTAMP`,
          [
            pt.playerId,
            pt.nickname,
            pObj.platform || 'DEFAULT',
            pObj.serverZone || '手Q1区',
            pt.rankScore || 10000,
            pObj.rankText || '最强王者',
            pObj.title || '',
            pt.commander || '通用',
            pt.lineup || '常规'
          ]
        )
      }

      // 3. 对决场次表
      await client.query(
        `INSERT INTO events (id, mode, scheduled_at, title, status, evidence_id, verified_at, verified_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           status = EXCLUDED.status,
           verified_at = EXCLUDED.verified_at,
           verified_by = EXCLUDED.verified_by`,
        [
          eventRecord.id,
          eventRecord.mode || 'RANKED_DIAMOND',
          eventRecord.scheduledAt,
          eventRecord.title,
          eventRecord.status || 'AUDITED',
          eventRecord.evidenceId,
          eventRecord.verifiedAt,
          eventRecord.verifiedBy
        ]
      )

      // 4. 席位表
      for (const pt of eventRecord.participants) {
        await client.query(
          `INSERT INTO event_participants (event_id, slot, player_id, nickname, rank_score, odds, support_count, final_rank, commander, lineup)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (event_id, slot) DO UPDATE SET
             player_id = EXCLUDED.player_id,
             nickname = EXCLUDED.nickname,
             rank_score = EXCLUDED.rank_score,
             odds = EXCLUDED.odds,
             support_count = EXCLUDED.support_count,
             final_rank = EXCLUDED.final_rank,
             commander = EXCLUDED.commander,
             lineup = EXCLUDED.lineup`,
          [
            eventRecord.id,
            pt.slot,
            pt.playerId,
            pt.nickname,
            pt.rankScore || 10000,
            pt.odds || 5.0,
            pt.supportCount || 0,
            pt.finalRank,
            pt.commander || '通用',
            pt.lineup || '常规'
          ]
        )
      }

      // 5. 对局事实表
      for (const m of matches) {
        if (m.evidenceId) {
          await client.query(
            `INSERT INTO evidences (id, sha256, source_id, captured_at, verified_at, verified_by, status, note)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO NOTHING`,
            [
              m.evidenceId,
              `sha-${m.evidenceId}`,
              'src-manual-review',
              m.matchTime,
              m.availableAt,
              'AUDIT_STAFF',
              'VERIFIED',
              '关联证据'
            ]
          )
        }

        await client.query(
          `INSERT INTO players (id, nickname, rank_score)
           VALUES ($1, $2, 10000)
           ON CONFLICT (id) DO NOTHING`,
          [m.playerId, m.playerId]
        )

        await client.query(
          `INSERT INTO matches (id, player_id, match_time, available_at, mode, final_rank, commander, lineup, rounds_survived, three_stars, verified, evidence_id, batch_id, revision, source_record_key, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             final_rank = EXCLUDED.final_rank,
             commander = EXCLUDED.commander,
             lineup = EXCLUDED.lineup,
             rounds_survived = EXCLUDED.rounds_survived,
             three_stars = EXCLUDED.three_stars,
             verified = EXCLUDED.verified,
             revision = EXCLUDED.revision,
             updated_at = CURRENT_TIMESTAMP`,
          [
            m.id,
            m.playerId,
            m.matchTime,
            m.availableAt,
            m.mode || 'RANKED_DIAMOND',
            m.finalRank,
            m.commander || '通用',
            m.lineup || '常规',
            m.roundsSurvived || 30,
            JSON.stringify(m.threeStars || []),
            m.verified !== false,
            m.evidenceId,
            m.batchId,
            m.revision || 1,
            m.sourceRecordKey || null
          ]
        )
      }

      await client.query('COMMIT')
      console.log(`[DatabaseManager] 人工核验对决 ${eventRecord.id} 已成功写入 PostgreSQL 数据库`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * 批次导入数据写入 PostgreSQL
   */
  async syncImportBatchToPg({ batchRecord, matchRecords }) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')

      // 1. 批次记录
      await client.query(
        `INSERT INTO import_batches (batch_id, source, total_records, inserted, updated, duplicates, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (batch_id) DO NOTHING`,
        [
          batchRecord.batchId,
          batchRecord.source,
          batchRecord.totalRecords,
          batchRecord.inserted,
          batchRecord.updated,
          batchRecord.duplicates,
          batchRecord.createdAt
        ]
      )

      // 2. 逐局流水
      for (const m of matchRecords) {
        // 先确保选手表有占位
        await client.query(
          `INSERT INTO players (id, nickname, rank_score)
           VALUES ($1, $2, 10000)
           ON CONFLICT (id) DO NOTHING`,
          [m.playerId, m.playerId]
        )

        await client.query(
          `INSERT INTO matches (id, player_id, match_time, available_at, mode, final_rank, commander, lineup, rounds_survived, three_stars, verified, batch_id, revision, source_record_key, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             final_rank = EXCLUDED.final_rank,
             commander = EXCLUDED.commander,
             lineup = EXCLUDED.lineup,
             rounds_survived = EXCLUDED.rounds_survived,
             three_stars = EXCLUDED.three_stars,
             verified = EXCLUDED.verified,
             revision = EXCLUDED.revision,
             updated_at = CURRENT_TIMESTAMP`,
          [
            m.id,
            m.playerId,
            m.matchTime,
            m.availableAt,
            m.mode || 'RANKED_DIAMOND',
            m.finalRank,
            m.commander || '通用',
            m.lineup || '未识别',
            m.roundsSurvived || 20,
            JSON.stringify(m.threeStars || []),
            m.verified === true,
            m.batchId,
            m.revision || 1,
            m.sourceRecordKey || null
          ]
        )
      }

      await client.query('COMMIT')
      console.log(`[DatabaseManager] 批次导入 ${batchRecord.batchId} 共 ${matchRecords.length} 条流水已成功写入 PostgreSQL`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  /**
   * 第三方阵容快照写入 PostgreSQL
   */
  async syncLineupSnapshotsToPg(snapshots) {
    if (!Array.isArray(snapshots) || snapshots.length === 0) return
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      for (const s of snapshots) {
        await client.query(
          `INSERT INTO lineup_snapshots (id, source_id, lineup_name, tier, commander, core_heroes, sample_count, win_rate, top3_rate, avg_rank, snapshot_version, window_text, scope, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             sample_count = EXCLUDED.sample_count,
             win_rate = EXCLUDED.win_rate,
             top3_rate = EXCLUDED.top3_rate,
             avg_rank = EXCLUDED.avg_rank,
             snapshot_version = EXCLUDED.snapshot_version,
             window_text = EXCLUDED.window_text,
             scope = EXCLUDED.scope,
             updated_at = CURRENT_TIMESTAMP`,
          [
            s.id,
            s.sourceId || 'src-hokace-wiki',
            s.lineupName,
            s.tier || 'T1',
            s.commander || '通用',
            JSON.stringify(s.coreHeroes || []),
            s.sampleCount || 0,
            s.winRate || 0,
            s.top3Rate || 0,
            s.avgRank || 3.5,
            s.snapshotVersion || 'v2609',
            s.windowText || '近 7 日实战聚合',
            s.scope || '全服王者段位'
          ]
        )
      }
      await client.query('COMMIT')
      console.log(`[DatabaseManager] ${snapshots.length} 条阵容快照已成功写入 PostgreSQL`)
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }

  getStorage() {
    return storage
  }
}

export const dbManager = new DatabaseManager()

