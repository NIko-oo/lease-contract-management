-- ============================================================
-- 数据 GET 接口权限点补全（authz 权限体系）
-- 背景：代码审查发现 24 个数据 GET 无 @Can 守卫，已补装饰器
-- 本脚本为新增的 read 点位插入 authz_permissions 并配置角色映射
-- 幂等：所有 INSERT 带 NOT EXISTS 守卫，可重复执行
-- 执行：
--   dev:    lark-cli apps +db-execute --app-id <id> --environment dev --file ./data/authz_read_permissions.sql --yes
--   online: lark-cli apps +db-execute --app-id <id> --environment online --file ./data/authz_read_permissions.sql --yes
-- ============================================================

-- ========== 1. 插入权限点 ==========

-- read:Contract
INSERT INTO authz_permissions (id, action, subject, description)
SELECT gen_random_uuid(), 'read', 'Contract', '查看合同'
WHERE NOT EXISTS (SELECT 1 FROM authz_permissions WHERE action = 'read' AND subject = 'Contract');

-- read:Customer
INSERT INTO authz_permissions (id, action, subject, description)
SELECT gen_random_uuid(), 'read', 'Customer', '查看客户'
WHERE NOT EXISTS (SELECT 1 FROM authz_permissions WHERE action = 'read' AND subject = 'Customer');

-- read:Overdue
INSERT INTO authz_permissions (id, action, subject, description)
SELECT gen_random_uuid(), 'read', 'Overdue', '查看逾期信息'
WHERE NOT EXISTS (SELECT 1 FROM authz_permissions WHERE action = 'read' AND subject = 'Overdue');

-- read:Property
INSERT INTO authz_permissions (id, action, subject, description)
SELECT gen_random_uuid(), 'read', 'Property', '查看房产信息'
WHERE NOT EXISTS (SELECT 1 FROM authz_permissions WHERE action = 'read' AND subject = 'Property');

-- read:Termination
INSERT INTO authz_permissions (id, action, subject, description)
SELECT gen_random_uuid(), 'read', 'Termination', '查看终止申请'
WHERE NOT EXISTS (SELECT 1 FROM authz_permissions WHERE action = 'read' AND subject = 'Termination');

-- read:Ledger
INSERT INTO authz_permissions (id, action, subject, description)
SELECT gen_random_uuid(), 'read', 'Ledger', '查看台账'
WHERE NOT EXISTS (SELECT 1 FROM authz_permissions WHERE action = 'read' AND subject = 'Ledger');

-- read:Utility
INSERT INTO authz_permissions (id, action, subject, description)
SELECT gen_random_uuid(), 'read', 'Utility', '查看水电费'
WHERE NOT EXISTS (SELECT 1 FROM authz_permissions WHERE action = 'read' AND subject = 'Utility');

-- ========== 2. 角色映射 ==========
-- 角色权限参考旧 RBAC 体系（local agents.md）：
-- super_admin: 全部
-- administrative: 合同/房产/客户/终止/逾期 查看
-- finance: 合同/客户/台账/水电费/终止/逾期 查看
-- logistics: 房产/水电费/逾期 查看

-- super_admin: 所有 read 点位
INSERT INTO authz_role_permissions (id, role_key, permission_id)
SELECT gen_random_uuid(), 'super_admin', p.id
FROM authz_permissions p
WHERE p.action = 'read' AND p.subject IN ('Contract', 'Customer', 'Overdue', 'Property', 'Termination', 'Ledger', 'Utility')
AND NOT EXISTS (SELECT 1 FROM authz_role_permissions rp WHERE rp.role_key = 'super_admin' AND rp.permission_id = p.id);

-- administrative: read Contract, Customer, Property, Termination, Overdue
INSERT INTO authz_role_permissions (id, role_key, permission_id)
SELECT gen_random_uuid(), 'administrative', p.id
FROM authz_permissions p
WHERE p.action = 'read' AND p.subject IN ('Contract', 'Customer', 'Property', 'Termination', 'Overdue')
AND NOT EXISTS (SELECT 1 FROM authz_role_permissions rp WHERE rp.role_key = 'administrative' AND rp.permission_id = p.id);

-- finance: read Contract, Customer, Ledger, Utility, Termination, Overdue
INSERT INTO authz_role_permissions (id, role_key, permission_id)
SELECT gen_random_uuid(), 'finance', p.id
FROM authz_permissions p
WHERE p.action = 'read' AND p.subject IN ('Contract', 'Customer', 'Ledger', 'Utility', 'Termination', 'Overdue')
AND NOT EXISTS (SELECT 1 FROM authz_role_permissions rp WHERE rp.role_key = 'finance' AND rp.permission_id = p.id);

-- logistics: read Property, Utility, Overdue
INSERT INTO authz_role_permissions (id, role_key, permission_id)
SELECT gen_random_uuid(), 'logistics', p.id
FROM authz_permissions p
WHERE p.action = 'read' AND p.subject IN ('Property', 'Utility', 'Overdue')
AND NOT EXISTS (SELECT 1 FROM authz_role_permissions rp WHERE rp.role_key = 'logistics' AND rp.permission_id = p.id);
