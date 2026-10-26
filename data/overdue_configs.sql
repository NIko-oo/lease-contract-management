-- 逾期提醒配置（演示数据）
--
-- 三种提醒类型各一条，follower_ids 为占位用户 ID，接入自己的应用后请在
-- 「逾期提醒」页面替换为真实跟进人。ON CONFLICT 保证可重复执行。

INSERT INTO overdue_configs
  (id, config_type, follower_ids, reminder_enabled, reminder_cron, reminder_day)
VALUES
  ('4bda9f1b-a50d-4ffc-9c74-eaf10784a400', 'rent',                '{"demo_user_1","demo_user_2"}', true, '0 9 * * 1-5', 25),
  ('3ccbf6f5-2c60-4c1e-95ce-b8a9efc7629e', 'utility',             '{"demo_user_1","demo_user_2"}', true, '0 9 * * 1-5', 25),
  ('008746a1-f5ed-4120-85ed-6761b84d05d9', 'utility_unregistered', '{"demo_user_1","demo_user_2"}', true, '0 9 * * 1-5', 25)
ON CONFLICT (config_type) DO NOTHING;
