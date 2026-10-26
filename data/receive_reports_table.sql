-- ============================================================
-- 收款报表 - 数据库变更
-- 目标：新建 receive_records（收款报表主数据表）
-- 环境：dev（online 禁止 DDL，需通过 +db-env-migrate 同步）
-- 执行：lark-cli apps +db-execute --app-id &lt;YOUR_APP_ID&gt; --environment dev --file ./receive_reports_table.sql --yes
-- ============================================================

-- ---------- 1. receive_records（收款报表主数据） ----------
CREATE TABLE IF NOT EXISTS receive_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_name varchar(255),
  contract_id uuid NOT NULL,
  contract_no varchar(255) NOT NULL,
  tenant varchar(255) NOT NULL,
  customer_code varchar(50),
  receive_type varchar(20) NOT NULL,
  receive_date varchar(10) NOT NULL,
  period varchar(7) NOT NULL,
  unit varchar(20) NOT NULL,
  unit_qty double precision DEFAULT 0 NOT NULL,
  amount double precision DEFAULT 0 NOT NULL,
  invoice_no varchar(100),
  ref_id uuid,
  _created_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  _created_by user_profile,
  _updated_at timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  _updated_by user_profile
);
CREATE INDEX IF NOT EXISTS idx_receipts_period ON receive_records (period);
CREATE INDEX IF NOT EXISTS idx_receipts_contract ON receive_records (contract_id);
CREATE INDEX IF NOT EXISTS idx_receipts_receive_date ON receive_records (receive_date);
CREATE INDEX IF NOT EXISTS idx_receipts_type ON receive_records (receive_type);
ALTER TABLE receive_records
  ADD CONSTRAINT receive_records_contract_id_fkey
  FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE;

-- ---------- 2. RLS 策略（对齐 gen-db-schema 四件套） ----------
-- 注意：3 条登录角色策略必须带 USING 表达式（平台标准为 USING (true)），
-- 否则策略表达式为空（NULL）会将登录角色查询过滤为 0 行，导致前端页面空白（2026-08-15 线上事故）
ALTER TABLE receive_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_bypass_policy ON receive_records
  FOR ALL TO service_role_workspace_demo USING (true);

CREATE POLICY "修改全部数据" ON receive_records
  FOR ALL TO authenticated_workspace_demo USING (true);

CREATE POLICY "查看全部数据" ON receive_records
  FOR SELECT TO anon_workspace_demo, authenticated_workspace_demo USING (true);

CREATE POLICY "修改本人数据" ON receive_records
  FOR ALL TO authenticated_workspace_demo
  USING ((current_setting('app.user_id'::text) = ANY (ARRAY[]::text[])) AND (current_setting('app.user_id'::text) = (_created_by)::text));

-- ---------- 3. 表/列描述（COMMENT，写入数据库字典） ----------
COMMENT ON TABLE receive_records IS '收款报表：台账/水电费收款的统一主数据，按合同+所属期汇总回写 ledger_items / utility_records';
COMMENT ON COLUMN receive_records.property_name IS '房产名称（收款时快照）';
COMMENT ON COLUMN receive_records.contract_id IS '关联合同 ID';
COMMENT ON COLUMN receive_records.contract_no IS '合同编号';
COMMENT ON COLUMN receive_records.tenant IS '租户名称';
COMMENT ON COLUMN receive_records.customer_code IS '租户编码（按租户名称匹配 customers.companyName 自动带出，匹配不到留空）';
COMMENT ON COLUMN receive_records.receive_type IS '收款类型：rent 租金 / property_fee 物业费 / water 水费 / electricity 电费';
COMMENT ON COLUMN receive_records.receive_date IS '收款日期（YYYY-MM-DD）';
COMMENT ON COLUMN receive_records.period IS '款项所属期（YYYY-MM）';
COMMENT ON COLUMN receive_records.unit IS '单位：租金=面积(m²) / 物业费=月 / 水费=吨 / 电费=度';
COMMENT ON COLUMN receive_records.unit_qty IS '单位数量：租金=合同已出租面积 leaseArea；物业费=金额÷应收月物业费；水费=金额÷水单价；电费=金额÷电单价';
COMMENT ON COLUMN receive_records.amount IS '收款金额';
COMMENT ON COLUMN receive_records.invoice_no IS '发票编号（手工录入）';
COMMENT ON COLUMN receive_records.ref_id IS '来源记录 ID（台账 ledger_items.id 或水电 utility_records.id，追溯用）';