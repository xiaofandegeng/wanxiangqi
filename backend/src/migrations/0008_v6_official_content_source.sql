-- ============================================================
-- 0008 · v6 第一方内容来源登记：官网公开页只读抓取存证（M3-1）
-- ============================================================
-- 用途：为「阵容研习站」教学内容提供第一方依据链——
--   官网首页 / 专题站 / 新手指引页 / 官方资讯接口的只读 GET 抓取，
--   原文（raw_materials.content）+ SHA-256 + 采集时间入库可复核，
--   内容条目（术语/规则/阵容手册/课程）经 content_references
--   (ref_kind='RAW_MATERIAL') 引用这些存证后才能发布（A04）。
--
-- 来源与能力（2026-10-02 research/official-channel-probe-2026-10-02.json 实测）：
--   - https://wxq.qq.com/                     官网首页（107,484 B 实测）
--   - https://wxq.qq.com/cp/a20260707sfgw/    官方专题站（126,338 B 实测）
--   - https://wxq.qq.com/cp/a202609xszy/      官方新手指引（基础规则/入门阵容/
--                                             棋手推荐/关键词词典，实测 79.4 KB）
--   - apps.game.qq.com/wmp/.../searchNews.php 官方资讯接口（JSONP，status=0 实测）
--
-- 状态语义：种子登记为 UNCONFIGURED；首次成功抓取（sync 动作）才置 READY
--   —— 与既有铁律一致：状态只能由真实接入动作改变，登记 ≠ 已采集。
-- 本迁移纯 INSERT（ON CONFLICT DO NOTHING），不修改既有来源行。

INSERT INTO data_sources (source_id, name, type, url, capabilities, license_note, status, note) VALUES
    ('src-wxq-official',
     '王者万象棋官网公开页（第一方内容依据）',
     'OFFICIAL_CONTENT', 'https://wxq.qq.com/',
     '["official_pages","official_news"]'::jsonb,
     '官网公开页面只读抓取存证；原文入库供内容引用复核',
     'UNCONFIGURED',
     'M3-1 第一方资料来源：首页/专题站/新手指引页只读抓取 → raw_materials 存证；首次成功采集后置 READY')
ON CONFLICT (source_id) DO NOTHING;
