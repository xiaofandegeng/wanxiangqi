-- 王者万象棋王牌对决数据站 - 枚举类型定义 (Enums)
-- 字符集编码: UTF-8
-- 适用数据库: PostgreSQL 14+

-- 1. 场次模式枚举 (首期固定为钻石狂潮 DIAMOND)
CREATE TYPE event_mode_enum AS ENUM (
    'DIAMOND',      -- 钻石狂潮 (每日 12:00-15:00 4场)
    'ALL_STAR',     -- 万象大赛 (每日 16:00-23:00 8场，后续扩展)
    'STANDARD'      -- 标准高段位常规赛
);

-- 2. 场次状态机流转枚举
CREATE TYPE event_status_enum AS ENUM (
    'PENDING_COLLECTION',   -- 待收集：赛前准备阶段，等待截图原图采集
    'PENDING_VERIFY',       -- 待校验：已上传原图，OCR 提取与人工比对校验中
    'PREDICTABLE',          -- 可预测：赛前六人席位与段位已确认，发布模型预测
    'BET_CLOSED',           -- 比赛中：已封盘，对局进行中
    'SETTLED',              -- 已结算：赛后简报公布，六人名次已录入
    'AUDITED'               -- 已复核：预测与结算结果经复核归档，进入回测样本池
);

-- 3. 证据类型枚举
CREATE TYPE evidence_type_enum AS ENUM (
    'PRE_MATCH_LOBBY',      -- 赛前备战房间截图 (可见 6 人昵称、段位)
    'SUPPORT_STAGE',        -- 支持阶段截图 (可见支持对比进度条、观战人数)
    'POST_MATCH_SUMMARY',   -- 赛后简报截图 (公布最终六人名次)
    'POST_MATCH_DETAIL',    -- 赛后详情战报 (包含最终成型阵容、棋手等级)
    'SETTLEMENT_RECORD'     -- 真实支持与结算明细截图 (用于硬门槛 B 复算)
);

-- 4. 证据审核状态枚举
CREATE TYPE evidence_status_enum AS ENUM (
    'UNVERIFIED',   -- 待审核
    'CONFIRMED',    -- 审核通过已核验
    'REJECTED'      -- 审核打回 (原图模糊/信息不全/重复伪造)
);

-- 5. 数据源类型枚举
CREATE TYPE source_type_enum AS ENUM (
    'MANUAL_SCREENSHOT',    -- 人工截屏录入
    'OCR_EXTRACTED',        -- 经过 OCR 辅助提取
    'OFFICIAL_ASSISTANT',   -- 官方战绩助手获授权个人数据
    'MANUAL_REPAIR',        -- 管理员人工补正
    'MOCK_SIMULATION'       -- 模拟基准数据
);

-- 6. 预测模型状态枚举
CREATE TYPE forecast_status_enum AS ENUM (
    'ACTIVE',       -- 正常有效
    'SUSPENDED',    -- 异常暂停 (样本不足或覆盖率过低)
    'UNCONFIRMED'   -- 未经校准实验版
);
