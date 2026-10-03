-- ============================================================
-- 0006 · v6 内容底座：教学/资料/阵容/课程/版本 内容模型 (任务书 §7.1)
-- ============================================================
-- 单一事实源原则：
--   - 稳定 ID（不以可变名称做主键）；同名实体按种类区别；
--   - 相同阵容可有多个历史教学版本与多个来源快照，但只有一个公开阵容实体；
--   - 版本化事实存 *_revisions；发布/回滚生成新版本，不覆盖历史；
--   - 规则数字/统计/版本状态不经 AI 自动生成（服务层校验，迁移只建结构）。
-- 发布生命周期（服务层强制）：DRAFT → PENDING_REVIEW → PUBLISHED（superseded_at
--   标记被更新版本取代的历史发布）；实体级 status 另有 RETIRED。
-- 待版本复核不改变发布状态，由 content_impacts(resolved_at IS NULL) 承载（A09）。
-- lineup_snapshots 补齐真实必要字段（§7.1）：统计模式口径 + 原始指标留档
--   （归一化必须可审计：raw_metrics 保存来源原文数值，禁止只存换算结果）。

-- ------------------------------------------------------------
-- 1. 游戏版本（版本日期与抓取日期分离：生效时刻=官方，抓取时刻在 raw_materials）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_versions (
    version_id      VARCHAR(32) PRIMARY KEY,
    official_basis  TEXT NOT NULL,
    effective_at    TIMESTAMP WITH TIME ZONE,
    status          VARCHAR(16) NOT NULL DEFAULT 'HISTORICAL',
    note            TEXT,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_game_versions_status CHECK (status IN ('CURRENT', 'HISTORICAL'))
);

-- 同一时刻至多一个 CURRENT 版本
CREATE UNIQUE INDEX IF NOT EXISTS uq_game_versions_single_current
    ON game_versions(version_id) WHERE status = 'CURRENT';

COMMENT ON TABLE game_versions IS '游戏版本登记：official_basis 必填（官方依据）；CURRENT 唯一；版本生效时刻与本站抓取时刻分离（抓取现场在 raw_materials）';

-- ------------------------------------------------------------
-- 2. 资料实体（英雄/棋手/装备/效果牌/天赋/阵营）+ 版本化事实
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog_entities (
    id            VARCHAR(64) PRIMARY KEY,
    slug          VARCHAR(96) NOT NULL UNIQUE,
    kind          VARCHAR(32) NOT NULL,
    display_name  VARCHAR(128) NOT NULL,
    status        VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_catalog_entities_kind CHECK (kind IN
        ('HERO', 'COMMANDER', 'EQUIPMENT', 'EFFECT_CARD', 'TALENT', 'CAMP')),
    CONSTRAINT ck_catalog_entities_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED'))
);

CREATE INDEX IF NOT EXISTS idx_catalog_entities_kind
    ON catalog_entities(kind, status);

-- 同名实体按种类区别：同 kind 同名至多一个非退役实体（棋手/英雄同名不冲突）
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_entities_kind_name
    ON catalog_entities(kind, display_name) WHERE status <> 'RETIRED';

CREATE TABLE IF NOT EXISTS catalog_entity_revisions (
    id              BIGSERIAL PRIMARY KEY,
    entity_id       VARCHAR(64) NOT NULL REFERENCES catalog_entities(id) ON DELETE CASCADE,
    revision        INTEGER NOT NULL CHECK (revision > 0),
    game_version_id VARCHAR(32) REFERENCES game_versions(version_id),
    facts           JSONB NOT NULL DEFAULT '{}'::jsonb,
    review_status   VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    created_by      VARCHAR(64),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at    TIMESTAMP WITH TIME ZONE,
    superseded_at   TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_catalog_entity_revisions UNIQUE (entity_id, revision),
    CONSTRAINT ck_catalog_entity_revisions_status CHECK (review_status IN
        ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'RETIRED'))
);

-- 每实体至多一个“当前发布”修订（历史发布保留，superseded_at 非空）
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_entity_published_current
    ON catalog_entity_revisions(entity_id)
    WHERE review_status = 'PUBLISHED' AND superseded_at IS NULL;

COMMENT ON TABLE catalog_entities IS '资料实体稳定档案：id/slug 稳定（不以可变名称做主键）；同名实体按 kind 区别（如同一角色同时为英雄与棋手）';
COMMENT ON COLUMN catalog_entity_revisions.facts IS '版本化事实（技能/数值/羁绊等结构化 JSON）；引用来源走 content_references；事实缺失存 null 不补默认值';

-- ------------------------------------------------------------
-- 3. 规则条目（唯一规则事实 + 结构化参数 + 原始说明）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mechanics (
    id         VARCHAR(64) PRIMARY KEY,
    slug       VARCHAR(96) NOT NULL UNIQUE,
    title      VARCHAR(256) NOT NULL,
    status     VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_mechanics_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED'))
);

CREATE TABLE IF NOT EXISTS mechanic_revisions (
    id              BIGSERIAL PRIMARY KEY,
    mechanic_id     VARCHAR(64) NOT NULL REFERENCES mechanics(id) ON DELETE CASCADE,
    revision        INTEGER NOT NULL CHECK (revision > 0),
    game_version_id VARCHAR(32) REFERENCES game_versions(version_id),
    statement_raw   TEXT NOT NULL,
    params          JSONB NOT NULL DEFAULT '{}'::jsonb,
    applies_to      JSONB NOT NULL DEFAULT '{}'::jsonb,
    review_status   VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    created_by      VARCHAR(64),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at    TIMESTAMP WITH TIME ZONE,
    superseded_at   TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_mechanic_revisions UNIQUE (mechanic_id, revision),
    CONSTRAINT ck_mechanic_revisions_status CHECK (review_status IN
        ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'RETIRED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mechanic_published_current
    ON mechanic_revisions(mechanic_id)
    WHERE review_status = 'PUBLISHED' AND superseded_at IS NULL;

COMMENT ON COLUMN mechanic_revisions.statement_raw IS '来源原始说明（保留原文，不改写）；与编辑解读分开';
COMMENT ON COLUMN mechanic_revisions.params IS '结构化参数（如收入/概率/回合规则的数值结构）；未经当前版本第一方核对不得录入数值（服务层校验）';

-- ------------------------------------------------------------
-- 4. 阵容教学（稳定阵容实体 + 版本化手册 + 构成 + 快照映射）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lineups (
    id                VARCHAR(64) PRIMARY KEY,
    slug              VARCHAR(96) NOT NULL UNIQUE,
    display_name      VARCHAR(128) NOT NULL,
    one_line_summary  VARCHAR(256),
    status            VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_lineups_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED'))
);

CREATE INDEX IF NOT EXISTS idx_lineups_status ON lineups(status);

CREATE TABLE IF NOT EXISTS lineup_revisions (
    id                   BIGSERIAL PRIMARY KEY,
    lineup_id            VARCHAR(64) NOT NULL REFERENCES lineups(id) ON DELETE CASCADE,
    revision             INTEGER NOT NULL CHECK (revision > 0),
    game_version_id      VARCHAR(32) REFERENCES game_versions(version_id),
    commander_entity_id  VARCHAR(64) REFERENCES catalog_entities(id),
    difficulty           VARCHAR(8),
    newbie_fit_rationale TEXT,
    play_conditions      JSONB,
    structure_levels     JSONB,
    stages               JSONB,
    stabilization        JSONB,
    skill_chains         JSONB,
    positioning          JSONB,
    substitutes          JSONB,
    practice_cases       JSONB,
    review_status        VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    created_by           VARCHAR(64),
    created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at         TIMESTAMP WITH TIME ZONE,
    superseded_at        TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_lineup_revisions UNIQUE (lineup_id, revision),
    CONSTRAINT ck_lineup_revisions_status CHECK (review_status IN
        ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'RETIRED')),
    CONSTRAINT ck_lineup_revisions_difficulty CHECK (difficulty IS NULL OR difficulty IN ('LOW', 'MEDIUM', 'HIGH'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lineup_published_current
    ON lineup_revisions(lineup_id)
    WHERE review_status = 'PUBLISHED' AND superseded_at IS NULL;

COMMENT ON TABLE lineups IS '稳定阵容教学实体：一个公开阵容实体；教学版本历史在 lineup_revisions；来源统计经 lineup_snapshot_links 关联展示，不自动编成攻略';
COMMENT ON COLUMN lineup_revisions.difficulty IS '低/中/高，附具体操作要求（写入 newbie_fit_rationale/stages）；高热度不等于适合新手';
COMMENT ON COLUMN lineup_revisions.newbie_fit_rationale IS '新手适合度：编辑依据操作复杂度/依赖性/替补弹性说明理由；不是胜率，不做无来源数值评分';
COMMENT ON COLUMN lineup_revisions.play_conditions IS '§5.1 定阵条件：可以考虑玩/优先玩/应放弃、禁用阵营处理、对特定天赋/装备/英雄的依赖程度';
COMMENT ON COLUMN lineup_revisions.structure_levels IS '§5.1 结构分层：最小可用结构/常规成型/理想上限；低概率完整神装不作为新手必须目标';
COMMENT ON COLUMN lineup_revisions.stages IS '§5.2 条件化阶段操作数组：阶段触发/当前目标/买留上回手卖/操作顺序/资源预算/急需与可替代/分支/成功失败信号；规则数字与经验建议分列';
COMMENT ON COLUMN lineup_revisions.stabilization IS '§5.3 稳血与快速成型：至少覆盖缺核心/缺前排保护/关键装备不来三种止损分支；不输出无依据血量阈值';
COMMENT ON COLUMN lineup_revisions.skill_chains IS '§5.4 技能操作链：触发前提→动作→效果→收益→中断条件；未验证循环不作为事实';
COMMENT ON COLUMN lineup_revisions.positioning IS '§5.5 站位：默认站位+至少一种针对站位与变化原因；格子关系由真实机制支持';
COMMENT ON COLUMN lineup_revisions.substitutes IS '§5.5 替补叙述：替谁/损失哪条联动/要补什么/何时卖旧牌/是否转装备（结构化角色在 lineup_components）';
COMMENT ON COLUMN lineup_revisions.practice_cases IS '§5.6 实战案例引用：有出处的案例/scenario id 列表；成功与失败都要覆盖（首批判量）';

CREATE TABLE IF NOT EXISTS lineup_components (
    id                 BIGSERIAL PRIMARY KEY,
    lineup_revision_id BIGINT NOT NULL REFERENCES lineup_revisions(id) ON DELETE CASCADE,
    entity_id          VARCHAR(64) NOT NULL REFERENCES catalog_entities(id),
    role               VARCHAR(24) NOT NULL,
    necessity          VARCHAR(12) NOT NULL DEFAULT 'REQUIRED',
    substitute_for     BIGINT REFERENCES lineup_components(id),
    notes              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_lineup_components_role CHECK (role IN
        ('CORE_OUTPUT', 'FRONTLINE', 'GROWTH_ENGINE', 'RESOURCE_ENGINE',
         'PROTECTION', 'CONTROL', 'TRANSITION', 'SUBSTITUTE', 'LATE_CEILING')),
    CONSTRAINT ck_lineup_components_necessity CHECK (necessity IN ('REQUIRED', 'PREFERRED', 'OPTIONAL'))
);

CREATE INDEX IF NOT EXISTS idx_lineup_components_revision
    ON lineup_components(lineup_revision_id);

COMMENT ON TABLE lineup_components IS '阵容版本的实体构成：每张卡明确角色（核心输出/前排/成长引擎/资源引擎/保护/控制/过渡牌/功能替补/后期上限）与必需性；替补关系 substitute_for 显式指向';

CREATE TABLE IF NOT EXISTS lineup_snapshot_links (
    id            BIGSERIAL PRIMARY KEY,
    lineup_id     VARCHAR(64) NOT NULL REFERENCES lineups(id) ON DELETE CASCADE,
    source_id     VARCHAR(64) NOT NULL REFERENCES data_sources(source_id),
    structure_key VARCHAR(128) NOT NULL,
    note          TEXT,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_lineup_snapshot_links UNIQUE (lineup_id, source_id, structure_key)
);

COMMENT ON TABLE lineup_snapshot_links IS '稳定阵容 ↔ 来源快照结构键显式映射：人工确认后建立；未匹配的快照不自动编成攻略';

-- ------------------------------------------------------------
-- 5. 课程 + 先修依赖 + 情境练习
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lessons (
    id          VARCHAR(64) PRIMARY KEY,
    slug        VARCHAR(96) NOT NULL UNIQUE,
    title       VARCHAR(256) NOT NULL,
    stage       CHAR(1) NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    status      VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_lessons_stage CHECK (stage IN ('A', 'B', 'C', 'D', 'E', 'F')),
    CONSTRAINT ck_lessons_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED'))
);

CREATE INDEX IF NOT EXISTS idx_lessons_stage ON lessons(stage, sort_order);

CREATE TABLE IF NOT EXISTS lesson_revisions (
    id              BIGSERIAL PRIMARY KEY,
    lesson_id       VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    revision        INTEGER NOT NULL CHECK (revision > 0),
    game_version_id VARCHAR(32) REFERENCES game_versions(version_id),
    objectives      JSONB,
    sections        JSONB,
    practice        JSONB,
    review_status   VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    created_by      VARCHAR(64),
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at    TIMESTAMP WITH TIME ZONE,
    superseded_at   TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_lesson_revisions UNIQUE (lesson_id, revision),
    CONSTRAINT ck_lesson_revisions_status CHECK (review_status IN
        ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'RETIRED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_published_current
    ON lesson_revisions(lesson_id)
    WHERE review_status = 'PUBLISHED' AND superseded_at IS NULL;

COMMENT ON COLUMN lesson_revisions.objectives IS '学习目标（学完能做什么）；先修图在 lesson_dependencies（环拒绝在服务层）';
COMMENT ON COLUMN lesson_revisions.sections IS '课程正文分节（规则图解/操作顺序/案例等结构化 JSON）；引用实体/规则用稳定 ID 走 content_references';
COMMENT ON COLUMN lesson_revisions.practice IS '版本化练习（随课程修订版本化，不单独漂移）';

CREATE TABLE IF NOT EXISTS lesson_dependencies (
    lesson_id            VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    depends_on_lesson_id VARCHAR(64) NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lesson_id, depends_on_lesson_id),
    CONSTRAINT ck_lesson_dependencies_no_self CHECK (lesson_id <> depends_on_lesson_id)
);

COMMENT ON TABLE lesson_dependencies IS '课程先修图（有向）：自环拒绝于约束，成环拒绝于服务层发布校验';

CREATE TABLE IF NOT EXISTS scenarios (
    id           VARCHAR(64) PRIMARY KEY,
    slug         VARCHAR(96) NOT NULL UNIQUE,
    title        VARCHAR(256) NOT NULL,
    kind         VARCHAR(24) NOT NULL,
    initial_state JSONB,
    branches     JSONB,
    feedback     JSONB,
    source_note  TEXT,
    lineup_id    VARCHAR(64) REFERENCES lineups(id) ON DELETE SET NULL,
    lesson_id    VARCHAR(64) REFERENCES lessons(id) ON DELETE SET NULL,
    status       VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_scenarios_kind CHECK (kind IN ('LINEUP_SCENARIO', 'REVIEW_CASE')),
    CONSTRAINT ck_scenarios_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED'))
);

COMMENT ON TABLE scenarios IS '教学情境/复盘案例：已知状态+条件分支+反馈+来源；与实战样本（archive_legacy.matches）完全隔离，不冒充真实对局';

-- ------------------------------------------------------------
-- 6. 内容引用与审核台账
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_references (
    id            BIGSERIAL PRIMARY KEY,
    content_type  VARCHAR(24) NOT NULL,
    content_id    VARCHAR(64) NOT NULL,
    ref_kind      VARCHAR(16) NOT NULL,
    ref_locator   TEXT NOT NULL,
    usage_scope   VARCHAR(16) NOT NULL DEFAULT 'INTERNAL_ONLY',
    license_note  TEXT,
    created_by    VARCHAR(64),
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_content_references_type CHECK (content_type IN
        ('CATALOG_ENTITY', 'CATALOG_ENTITY_REVISION', 'MECHANIC', 'MECHANIC_REVISION',
         'LINEUP', 'LINEUP_REVISION', 'LESSON', 'LESSON_REVISION', 'SCENARIO', 'PATCH_NOTE')),
    CONSTRAINT ck_content_references_kind CHECK (ref_kind IN ('URL', 'RAW_MATERIAL', 'EVIDENCE', 'OFFICIAL_PAGE')),
    CONSTRAINT ck_content_references_scope CHECK (usage_scope IN ('INTERNAL_ONLY', 'PUBLIC'))
);

CREATE INDEX IF NOT EXISTS idx_content_references_content
    ON content_references(content_type, content_id);

COMMENT ON TABLE content_references IS '每项内容引用的来源登记：URL/raw_material 存证/evidence 原件/官方页面；EVIDENCE 引用必须指向 VERIFIED 且有原件的证据（服务层校验）；usage_scope=PUBLIC 才可出现在公开内容面';

CREATE TABLE IF NOT EXISTS content_review_log (
    id           BIGSERIAL PRIMARY KEY,
    content_type VARCHAR(24) NOT NULL,
    content_id   VARCHAR(64) NOT NULL,
    revision_id  BIGINT,
    action       VARCHAR(24) NOT NULL,
    operator     VARCHAR(64) NOT NULL,
    reason       TEXT,
    details      JSONB,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_content_review_log_action CHECK (action IN
        ('SAVE_DRAFT', 'SUBMIT_REVIEW', 'PUBLISH', 'RETRACT', 'ROLLBACK',
         'MARK_RECHECK', 'RESOLVE_RECHECK'))
);

CREATE INDEX IF NOT EXISTS idx_content_review_log_content
    ON content_review_log(content_type, content_id, created_at DESC);

COMMENT ON TABLE content_review_log IS '内容生命周期审核台账：发布/回滚与日志同事务写入（服务层）；回滚生成可追踪新版本，不覆盖历史';

-- ------------------------------------------------------------
-- 7. 版本动态：官方更新 + 受影响内容清单
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patch_notes (
    id                     VARCHAR(64) PRIMARY KEY,
    version_id             VARCHAR(32) NOT NULL REFERENCES game_versions(version_id),
    slug                   VARCHAR(96) NOT NULL UNIQUE,
    title                  VARCHAR(256) NOT NULL,
    official_url           TEXT,
    official_published_at  TIMESTAMP WITH TIME ZONE,
    fetched_at             TIMESTAMP WITH TIME ZONE,
    summary                TEXT,
    status                 VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    created_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_patch_notes_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED'))
);

COMMENT ON TABLE patch_notes IS '官方版本调整：官方发布时刻与本站抓取时刻分列；条目以官方公告为唯一来源，不做推测性改动汇总';

CREATE TABLE IF NOT EXISTS content_impacts (
    id            BIGSERIAL PRIMARY KEY,
    patch_note_id VARCHAR(64) NOT NULL REFERENCES patch_notes(id) ON DELETE CASCADE,
    content_type  VARCHAR(24) NOT NULL,
    content_id    VARCHAR(64) NOT NULL,
    impact        VARCHAR(16) NOT NULL,
    note          TEXT,
    resolved_at   TIMESTAMP WITH TIME ZONE,
    resolved_by   VARCHAR(64),
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_content_impacts_type CHECK (content_type IN
        ('CATALOG_ENTITY', 'MECHANIC', 'LINEUP', 'LESSON', 'SCENARIO')),
    CONSTRAINT ck_content_impacts_impact CHECK (impact IN ('NEEDS_RECHECK', 'UPDATED', 'UNAFFECTED'))
);

CREATE INDEX IF NOT EXISTS idx_content_impacts_open
    ON content_impacts(patch_note_id) WHERE resolved_at IS NULL;

COMMENT ON TABLE content_impacts IS '官方更新受影响内容清单：resolved_at IS NULL = 待复核（A09 清单）；旧指南不自动改为新版本，默认列表不混排历史推荐';

-- ------------------------------------------------------------
-- 8. lineup_snapshots 补齐真实必要字段（§7.1 / M2-9 结构部分）
-- ------------------------------------------------------------
ALTER TABLE lineup_snapshots ADD COLUMN IF NOT EXISTS mode VARCHAR(64);
ALTER TABLE lineup_snapshots ADD COLUMN IF NOT EXISTS raw_metrics JSONB;

COMMENT ON COLUMN lineup_snapshots.mode IS '统计模式口径（如四人制/六人制、排位/匹配）；来源未公布为 NULL，不得假设';
COMMENT ON COLUMN lineup_snapshots.raw_metrics IS '来源原文指标留档（归一化审计用）：未换算的原始数值/文本；本站不跨来源平均、不拼接不同窗口';
