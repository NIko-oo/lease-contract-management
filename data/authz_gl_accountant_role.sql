-- ============================================================
-- 总账会计（平台角色 role_99xxcvu983p）权限点绑定
-- 定位：只读角色 —— 授予全部 read:* 权限点，不授予任何写操作权限点
--       （create/update/delete/submit/amend/review/edit/receive/config/send/manage）
-- 生效范围：11 个查看类页面（房产/客户/合同/终止/台账/收款报表/水电费/统计/看板/对账单/逾期）；
--          财务审核（review:Finance）、系统配置（config:Sync）、权限配置（manage:Permission）不显示
-- 幂等：按 (role_key, permission_id) NOT EXISTS 去重，可重复执行
-- 执行（dev 与 online 为两套库，须各跑一次）：
--   lark-cli apps +db-execute --app-id &lt;YOUR_APP_ID&gt; --environment dev    --file ./data/authz_gl_accountant_role.sql --yes
--   lark-cli apps +db-execute --app-id &lt;YOUR_APP_ID&gt; --environment online --file ./data/authz_gl_accountant_role.sql --yes
-- 前置：平台角色须已存在（lark-cli apps +role-list），成员分配用 +role-member-add
-- ============================================================

INSERT INTO authz_role_permissions (role_key, permission_id)
SELECT 'role_99xxcvu983p', p.id
FROM authz_permissions p
WHERE p.action = 'read'
  AND NOT EXISTS (
    SELECT 1
    FROM authz_role_permissions rp
    WHERE rp.role_key = 'role_99xxcvu983p'
      AND rp.permission_id = p.id
  );
