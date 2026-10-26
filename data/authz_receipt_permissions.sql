-- ============================================================
-- 收款报表（Receipt）权限点配置（authz 权限体系）— 线上修复
-- 现象：线上收款报表空白（导航隐藏/页面被权限拦截）
-- 根因：+db-env-migrate 只同步表结构，authz_permissions / authz_role_permissions
--       为数据表，dev 已含 Receipt 权限点但线上缺失，前端 ability.can('read','Receipt') 为 false
-- 修复：镜像 dev 的 Receipt 权限点（同一套 id）导入线上
-- 角色绑定：super_admin（read+edit）、finance（read+edit），与 dev 完全一致
-- 执行：lark-cli apps +db-execute --app-id &lt;YOUR_APP_ID&gt; --environment online --file ./data/authz_receipt_permissions.sql --yes
-- 注意：执行前已确认线上 authz_permissions 中无 (action, subject) 为 ('read'/'edit', 'Receipt') 的记录
-- ============================================================

INSERT INTO authz_permissions (id, action, subject, description) VALUES
('8a1e2f3b-4c5d-4e6f-8a7b-9c0d1e2f3a01', 'read', 'Receipt', '查看收款报表'),
('8a1e2f3b-4c5d-4e6f-8a7b-9c0d1e2f3a02', 'edit', 'Receipt', '收款录入/删除/发票编辑');

INSERT INTO authz_role_permissions (id, role_key, permission_id) VALUES
('8a1e2f3b-4c5d-4e6f-8a7b-9c0d1e2f3a11', 'super_admin', '8a1e2f3b-4c5d-4e6f-8a7b-9c0d1e2f3a01'),
('8a1e2f3b-4c5d-4e6f-8a7b-9c0d1e2f3a12', 'super_admin', '8a1e2f3b-4c5d-4e6f-8a7b-9c0d1e2f3a02'),
('8a1e2f3b-4c5d-4e6f-8a7b-9c0d1e2f3a13', 'finance', '8a1e2f3b-4c5d-4e6f-8a7b-9c0d1e2f3a01'),
('8a1e2f3b-4c5d-4e6f-8a7b-9c0d1e2f3a14', 'finance', '8a1e2f3b-4c5d-4e6f-8a7b-9c0d1e2f3a02');