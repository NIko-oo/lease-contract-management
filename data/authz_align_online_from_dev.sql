-- ============================================================
-- online 库角色-权限映射补齐（只做新增，不删除任何现有点位）
-- 背景：dev 与 online 是两套独立数据库，权限配置页只写当前环境。
--       本轮权限体系修复后前端统一读 authz_role_permissions，online 缺的点位会导致
--       总账会计角色在线上打开任何页面都被拦（该角色 online 为 0 行）。
-- 内容：
--   1) 总账会计 role_99xxcvu983p ← 全部 read:* 点位
--   2) administrative ← read:Property（online 原有 create/update/delete:Property
--      却无 read:Property，行政人员能改房产却看不到列表，属明显漏配）
-- 幂等：均按 NOT EXISTS 去重，可重复执行
-- 执行：
--   lark-cli apps +db-execute --app-id &lt;YOUR_APP_ID&gt; --environment online --file ./data/authz_align_online_from_dev.sql --yes
-- 未包含（需另行裁定，见开发记录）：
--   - administrative|manage:Permission（dev 有、online 无；会把权限配置页开给行政角色）
--   - online 独有 10 个点位是否删除（logistics 的 read:Contract/Receipt/Statistics、
--     finance 的 create/update/delete:Property、administrative 的 delete:Contract/
--     edit:Customer/read:Dashboard）
-- ============================================================

INSERT INTO authz_role_permissions (role_key, permission_id)
SELECT 'role_99xxcvu983p', p.id
FROM authz_permissions p
WHERE p.action = 'read'
  AND NOT EXISTS (
    SELECT 1 FROM authz_role_permissions rp
    WHERE rp.role_key = 'role_99xxcvu983p' AND rp.permission_id = p.id
  );

INSERT INTO authz_role_permissions (role_key, permission_id)
SELECT 'administrative', p.id
FROM authz_permissions p
WHERE p.action = 'read' AND p.subject = 'Property'
  AND NOT EXISTS (
    SELECT 1 FROM authz_role_permissions rp
    WHERE rp.role_key = 'administrative' AND rp.permission_id = p.id
  );
