# 数据库结构（行政租赁合同管理系统 · 云端版）

> 本文件由 `AGENTS.md` 披露而来：读/改表结构、写迁移脚本、核对字段语义时查阅。权威来源为 `server/database/schema.ts`（自动生成、无中文注释）、`data/*.sql`（建表 / 索引 / `COMMENT ON`，索引见 [`../data/README.md`](../data/README.md)）、数据库字典 `pg_description`。本文件与库中实际结构不一致时以实际为准，并回来修正本文件。
> 云端仓库**没有** `data/init-schema.sql`；该文件属本地部署版（`../行政租赁合同管理系统_本地部署/data/init-schema.sql`），只在读 V3.1 差异时参考。

## 数据库完整结构定义

> 数据库类型：PostgreSQL，主键均为 UUID（`gen_random_uuid()`），日期字段均使用 `VARCHAR` 存储（格式 `YYYY-MM-DD` 或 `YYYY-MM`）。
> 表数量不写在此处：`grep -c 'pgTable(' server/database/schema.ts`。

### 1. company_entities（公司主体表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 主键 |
| name | VARCHAR(255) | NOT NULL | 公司名称 |
| credit_code | VARCHAR(18) | | 统一社会信用代码 |
| bank_account_name | VARCHAR(255) | | 银行账户名 |
| bank_account_no | VARCHAR(50) | | 银行账号 |
| bank_name | VARCHAR(255) | | 开户银行 |
| rent_invoice_tax_rate | VARCHAR(20) | | 租金发票税率 |
| property_fee_invoice_tax_rate | VARCHAR(20) | | 物业费发票税率 |
| _created_at | TIMESTAMPTZ | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

### 2. properties（房产信息表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK | 主键 |
| name | VARCHAR(255) | NOT NULL | 房产名称 |
| company_entity | VARCHAR(255) | NOT NULL | 所属公司主体名称 |
| valid_from | VARCHAR(10) | NOT NULL | 有效期开始（YYYY-MM-DD） |
| valid_to | VARCHAR(10) | NOT NULL | 有效期结束（YYYY-MM-DD） |
| company_id | UUID | | 关联 company_entities.id（可选） |
| total_area | DOUBLE PRECISION | | 总面积（平方米） |
| rentable_area | DOUBLE PRECISION | | 可租赁面积（平方米） |
| _created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

### 3. customers（客户表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK | 主键 |
| customer_code | VARCHAR(50) | NOT NULL, UNIQUE | 客户编码（唯一索引 idx_customers_code） |
| company_name | VARCHAR(255) | NOT NULL | 公司名称 |
| credit_code | VARCHAR(18) | | 统一社会信用代码 |
| bank_account | VARCHAR(50) | | 银行账户 |
| is_frozen | BOOLEAN | NOT NULL, DEFAULT false | 是否冻结（索引 idx_customers_frozen） |
| tenant_type | VARCHAR(50) | | 租户类型 |
| bank_name | VARCHAR(255) | | 开户银行 |
| _created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

### 4. contracts（合同主表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK | 主键 |
| contract_no | VARCHAR(255) | NOT NULL | 合同编号 |
| landlord | VARCHAR(255) | NOT NULL | 出租方 |
| tenant | VARCHAR(255) | NOT NULL | 承租方（索引 idx_contracts_tenant） |
| start_date | VARCHAR(10) | NOT NULL | 合同开始日期 |
| end_date | VARCHAR(10) | NOT NULL | 合同结束日期 |
| has_utilities | BOOLEAN | NOT NULL, DEFAULT false | 是否收取水电费 |
| payment_method | VARCHAR(20) | NOT NULL | 支付方式（monthly/quarterly） |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'draft' | 状态（索引 idx_contracts_status） |
| termination_date | VARCHAR(10) | | 终止日期 |
| sign_date | VARCHAR(10) | | 签约日期 |
| lease_address | TEXT | | 租赁地址 |
| review_remark | TEXT | | 审核意见 |
| creator | VARCHAR(255) | | 创建人 |
| reviewer | VARCHAR(255) | | 审核人 |
| advance_payment_days | INTEGER | NOT NULL, DEFAULT 5 | 提前缴费天数 |
| property_id | UUID | | 关联房产 ID |
| contract_type | VARCHAR(20) | DEFAULT 'new_contract' | 合同类型（new_contract/supplement） |
| parent_contract_id | UUID | | 父合同 ID（补充合同时关联） |
| lease_area | DOUBLE PRECISION | | 租赁面积 |
| _created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

**status 状态枚举**：`draft` → `pending` → `approved` / `rejected` → `terminated`

### 5. contract_stages（合同租期分段表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK | 主键 |
| contract_id | UUID | NOT NULL, FK → contracts.id CASCADE | 关联合同 |
| start_date | VARCHAR(10) | NOT NULL | 阶段开始日期 |
| end_date | VARCHAR(10) | NOT NULL | 阶段结束日期 |
| monthly_rent | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 月租金 |
| monthly_property_fee | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 月物业费 |
| stage_order | INTEGER | NOT NULL, DEFAULT 0 | 阶段顺序 |
| stage_type | VARCHAR(20) | | 阶段类型 |
| _created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

索引：`idx_stages_contract_id` (contract_id)

### 6. contract_amendments（合同变更/补充协议表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK | 主键 |
| contract_id | UUID | NOT NULL, FK → contracts.id CASCADE | 关联合同 |
| amendment_no | VARCHAR(255) | | 补充协议编号 |
| change_start_date | VARCHAR(10) | NOT NULL | 变更开始日期 |
| change_end_date | VARCHAR(10) | NOT NULL | 变更结束日期 |
| change_type | VARCHAR(255) | NOT NULL | 变更方式（减免/增加租金或物业费） |
| status | VARCHAR(20) | DEFAULT 'active' | 状态（active=生效） |
| review_remark | TEXT | | 审核意见 |
| reviewer | VARCHAR(255) | | 审核人 |
| sign_date | VARCHAR(10) | | 签约日期 |
| _created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

索引：`idx_amendments_contract_id` (contract_id)

### 7. contract_amendment_stages（合同变更分段表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK | 主键 |
| amendment_id | UUID | NOT NULL, FK → contract_amendments.id CASCADE | 关联变更记录 |
| start_date | VARCHAR(10) | NOT NULL | 分段开始日期 |
| end_date | VARCHAR(10) | NOT NULL | 分段结束日期 |
| monthly_rent | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 变更后月租金 |
| monthly_property_fee | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 变更后月物业费 |
| stage_order | INTEGER | NOT NULL, DEFAULT 0 | 分段顺序 |
| stage_type | VARCHAR(20) | | 分段类型 |
| period | VARCHAR(7) | | 所属期（YYYY-MM） |
| _created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

索引：`idx_amendment_stages_amendment_id` (amendment_id)

### 8. ledger_items（台账明细表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK | 主键 |
| contract_id | UUID | NOT NULL, FK → contracts.id CASCADE | 关联合同 |
| contract_no | VARCHAR(255) | NOT NULL | 合同编号（冗余） |
| tenant | VARCHAR(255) | NOT NULL | 承租方（冗余） |
| period | VARCHAR(7) | NOT NULL | 所属期（YYYY-MM） |
| stage_start_date | VARCHAR(10) | NOT NULL | 阶段开始日期 |
| stage_end_date | VARCHAR(10) | NOT NULL | 阶段结束日期 |
| monthly_rent | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 合同月租金 |
| monthly_property_fee | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 合同月物业费 |
| payment_method | VARCHAR(20) | NOT NULL | 支付方式 |
| due_date | VARCHAR(10) | NOT NULL | 最后缴纳期限 |
| rent_received | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 实收租金 |
| property_fee_received | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 实收物业费 |
| receive_date | VARCHAR(10) | | 收款日期 |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'unpaid' | 收款状态（unpaid/partial/paid/no_payment_required/terminated；应收双 0 的免租期为 no_payment_required） |
| has_utilities | BOOLEAN | NOT NULL, DEFAULT false | 是否含水电费 |
| quarter | VARCHAR(7) | | 季度标识 |
| property_name | VARCHAR(255) | | 房产名称 |
| landlord | VARCHAR(255) | | 出租方 |
| amendment_no | VARCHAR(255) | | 变更协议编号 |
| amendment_rent | DOUBLE PRECISION | | 变更后租金 |
| amendment_property_fee | DOUBLE PRECISION | | 变更后物业费 |
| _created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

索引：`idx_ledger_contract_id`, `idx_ledger_period`, `idx_ledger_status`

**业务规则**：应收租金 = amendment_rent ?? monthly_rent，应收物业费 = amendment_property_fee ?? monthly_property_fee

### 9. utility_records（水电费记录表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK | 主键 |
| contract_id | UUID | NOT NULL, FK → contracts.id CASCADE | 关联合同 |
| contract_no | VARCHAR(255) | NOT NULL | 合同编号（冗余） |
| tenant | VARCHAR(255) | NOT NULL | 承租方（冗余） |
| period | VARCHAR(7) | NOT NULL | 所属期（YYYY-MM） |
| electricity_usage | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 实际用电量 |
| electricity_price | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 电费单价 |
| water_usage | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 实际用水量 |
| water_price | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 水费单价 |
| total_electricity_fee | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 电费总额 |
| total_water_fee | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 水费总额 |
| electricity_received | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 实收电费 |
| water_received | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 实收水费 |
| record_date | VARCHAR(10) | NOT NULL | 登记日期 |
| recorded_by | VARCHAR(255) | NOT NULL | 登记人 |
| receive_date | VARCHAR(10) | | 收款日期 |
| _created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

索引：`idx_utilities_contract_id`, `idx_utilities_period`

### 10. termination_requests（终止申请表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK | 主键 |
| contract_id | UUID | NOT NULL, FK → contracts.id CASCADE | 关联合同 |
| contract_no | VARCHAR(255) | NOT NULL | 合同编号（冗余） |
| tenant | VARCHAR(255) | NOT NULL | 承租方（冗余） |
| termination_date | VARCHAR(10) | NOT NULL | 申请终止日期 |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | 状态（pending/approved/rejected/withdrawn） |
| reject_reason | TEXT | | 驳回原因 |
| review_remark | TEXT | | 审核意见 |
| reviewed_by | VARCHAR(255) | | 审核人 |
| creator | VARCHAR(255) | | 申请人 |
| amendment_no | VARCHAR(255) | | 关联变更协议编号 |
| _created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

索引：`idx_terminations_contract_id`, `idx_terminations_status`

### 11. overdue_configs（逾期提醒配置表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK | 主键 |
| config_type | VARCHAR(20) | NOT NULL, UNIQUE | 配置类型（rent_overdue/utility_overdue/utility_unregistered） |
| follower_ids | TEXT[] | NOT NULL, DEFAULT '{}' | 跟进人员用户 ID 列表 |
| reminder_enabled | BOOLEAN | NOT NULL, DEFAULT false | 是否启用定时提醒 |
| reminder_cron | VARCHAR(50) | NOT NULL, DEFAULT '0 9 * * 1-5' | 提醒 cron 表达式 |
| reminder_day | INTEGER | DEFAULT 20 | 每月提醒日（几号） |
| _created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

唯一索引：`idx_overdue_configs_type` (config_type)

### 12. role_permissions（角色权限表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK | 主键 |
| role_id | VARCHAR(50) | NOT NULL | 角色 ID（super_admin/administrative/finance/logistics） |
| permissions | TEXT[] | NOT NULL, DEFAULT '{}' | 权限 ID 数组 |
| _created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

### 13. user_column_configs（用户列配置表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK | 主键 |
| user_id | VARCHAR(255) | NOT NULL | 用户 ID |
| page_name | VARCHAR(50) | NOT NULL | 页面名称 |
| hidden_columns | TEXT[] | NOT NULL, DEFAULT '{}' | 隐藏的列名数组 |
| _created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

唯一索引：`uk_user_column_configs_user_page` (user_id, page_name)

### 14. utility_tenants（水电费租户表）—— 仅 V3.0 云端版

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK | 主键 |
| tenant | VARCHAR(255) | NOT NULL | 租户名称 |
| property_name | VARCHAR(255) | | 房产名称（由合同 property_id 实时查询 properties 表所得；存量 NULL 行待发布后补全脚本回填） |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | 是否活跃 |
| _created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

唯一索引：`idx_utility_tenants_tenant_property`（tenant, property_name）；PostgreSQL 唯一索引对 NULL 不约束，存量 property_name 为 NULL 的历史行保持每租户一行的原状，待补全脚本回填

### 15. receive_records（收款报表表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK | 主键 |
| property_name | VARCHAR(255) | | 房产名称快照 |
| contract_id | UUID | NOT NULL, FK → contracts.id CASCADE | 关联合同（索引 idx_receipts_contract） |
| contract_no | VARCHAR(255) | NOT NULL | 合同编号快照 |
| tenant | VARCHAR(255) | NOT NULL | 承租方快照 |
| customer_code | VARCHAR(50) | | 租户编码（按 tenants 匹配 customers.companyName） |
| receive_type | VARCHAR(20) | NOT NULL | 收款类型（rent/property_fee/water/electricity） |
| receive_date | VARCHAR(10) | NOT NULL | 收款日期（索引 idx_receipts_receive_date） |
| period | VARCHAR(7) | NOT NULL | 款项所属期 YYYY-MM（索引 idx_receipts_period） |
| unit | VARCHAR(20) | NOT NULL | 单位（平方米/月/吨/度） |
| unit_qty | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 单位数量（租金=leaseArea；物业费=金额÷应收月物业费；水=金额÷水单价；电=金额÷电单价） |
| amount | DOUBLE PRECISION | NOT NULL, DEFAULT 0 | 收款金额 |
| invoice_no | VARCHAR(100) | | 发票编号（行内编辑） |
| ref_id | UUID | | 来源记录 ID（台账/水电费，追溯用） |
| _created_at | TIMESTAMPTZ | NOT NULL | 创建时间 |
| _created_by | VARCHAR(255) | | 创建人 |
| _updated_at | TIMESTAMPTZ | NOT NULL | 更新时间 |
| _updated_by | VARCHAR(255) | | 更新人 |

索引：`idx_receipts_period` / `idx_receipts_contract` / `idx_receipts_receive_date` / `idx_receipts_type`
逻辑：台账/水电费页收款先写入本表，ReceiptService 按 (contractId, period) 汇总回写 ledger_items / utility_records；表也用 RLS 四策略（service_role 旁路 + 修改全部/查看全部/修改本人）

### 16. authz_permissions（平台权限点位表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 主键 |
| action | VARCHAR(100) | NOT NULL | 点位动作，如 `read` / `edit` / `review` / `submit` / `amend` |
| subject | VARCHAR(100) | NOT NULL | 点位对象，如 `Contract` / `Ledger` / `Receipt` |
| description | TEXT | DEFAULT '' | 中文说明 |
| _created_at / _created_by / _updated_at / _updated_by | — | 系统字段 | 平台自动填充 |

用途：`action × subject` 权限点注册表，是后端 `@Can(action, subject)` 与权限配置页的数据源。前端经 `GET /api/permissions` 加载。

### 17. authz_role_permissions（角色-点位映射表）

| 字段名 | 类型 | 约束 | 说明 |
|--------|------|------|------|
| id | UUID | PK, DEFAULT gen_random_uuid() | 主键 |
| role_key | VARCHAR(100) | NOT NULL | 应用角色标识：`super_admin` / `administrative` / `finance` / `logistics` / `role_99xxcvu983p`（总账会计，平台生成不可改） |
| permission_id | UUID | NOT NULL, FK → authz_permissions.id ON DELETE CASCADE | 指向权限点 |
| _created_at / _created_by / _updated_at / _updated_by | — | 系统字段 | 平台自动填充 |

用途：角色↔点位映射，`roleStore.canAccess(action, subject)` 的唯一判定依据。
**dev / online 两库各自独立一份数据**：权限配置页改了哪个环境就只有哪个环境生效，调整须明确目标环境、两边各跑一次。正式权限口径以 online 为准。
种子脚本：`data/authz_gl_accountant_role.sql`、`data/authz_align_online_from_dev.sql`（均带 `NOT EXISTS` 守卫，幂等）。

---

## 按业务域分组速查

| 业务域 | 表名 | 用途 |
|-------|------|------|
| 合同核心 | `contracts` | 合同主表（编号、出租方、承租方、状态、税率、租赁面积） |
| 合同核心 | `contract_stages` | 租期分段（每段起止日期、月租金、月物业费、stage_type） |
| 合同核心 | `contract_amendments` | 合同变更/补充协议记录 |
| 合同核心 | `contract_amendment_stages` | 变更后的租期分段明细 |
| 财务 | `ledger_items` | 台账明细（按自然月拆分，含变更金额与收款金额） |
| 财务 | `receive_records` | 收款报表主数据，汇总回写台账/水电费 |
| 财务 | `utility_records` | 水电费登记记录 |
| 财务 | `utility_tenants` | 需收水电费的「租户 + 房产」清单，`is_active` 控制水电费管理页显示 |
| 终止 | `termination_requests` | 终止申请（含审核状态与驳回原因） |
| 房产 | `properties` | 房产信息（名称、所属公司、可出租面积、有效期） |
| 房产 | `company_entities` | 公司主体（名称、信用代码、银行账户、开票税率） |
| 客户 | `customers` | 客户（编码唯一、公司名、信用代码、银行账户、冻结状态） |
| 系统 | `overdue_configs` | 逾期提醒配置（跟进人、提醒开关、提醒日） |
| 系统 | `user_column_configs` | 用户表格列显示偏好（按用户 + page_name 唯一） |
| 权限 | `authz_permissions` | 平台权限点位（当前口径，见 §16） |
| 权限 | `authz_role_permissions` | 角色↔点位映射（见 §17） |
| 权限 | `role_permissions` | **旧自研 RBAC 残留**，平台 authz 体系后不再使用，新环境不建议灌数据 |

---

## 数据库目录与部署架构

### 本地部署版数据库目录（V3.1）

```
V3.1本地部署/data/
  ├── init-schema.sql              # 数据库初始化脚本（建表 + 索引）
  ├── import-data.sql              # 数据导入主脚本
  ├── clean-data.js                # 数据清洗工具
  ├── company_entities.sql         # 公司主体初始数据
  ├── properties.sql               # 房产信息初始数据
  ├── customers.sql                # 客户初始数据
  ├── contracts.sql                # 合同主表初始数据
  ├── contract_stages.sql          # 合同租期分段数据
  ├── contract_amendments.sql      # 合同变更记录数据
  ├── contract_amendment_stages.sql # 合同变更分段数据
  ├── ledger_items_selected-1.sql  # 台账明细数据（第1部分）
  ├── ledger_items_selected-2.sql  # 台账明细数据（第2部分）
  ├── utility_records.sql          # 水电费记录数据
  ├── termination_requests.sql     # 终止申请数据
  ├── overdue_configs.sql          # 逾期配置数据
  ├── role_permissions.sql         # 角色权限数据
  └── user_column_configs.sql      # 用户列配置数据
```

### 数据库初始化流程（本地部署）

```bash
# 1. 创建数据库
psql -U postgres -c "CREATE DATABASE lease_management;"

# 2. 执行初始化脚本（建表 + 索引）
psql -U postgres -d lease_management -f data/init-schema.sql

# 3. 导入业务数据
psql -U postgres -d lease_management -f data/import-data.sql
```

### 数据库连接配置

| 版本 | 配置方式 | 连接字符串 |
|------|----------|------------|
| V3.0 云端 | 平台自动管理（`.env` 中 `SUDA_DATABASE_URL` 留空） | 平台内部注入 |
| V3.1 本地 | `.env` 中 `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/lease_management` |

### ER 关系图（完整）

```
company_entities (1) ──── (N) properties
       │
       │ company_id (FK, 可选)
       │
contracts (1) ──── (N) contract_stages
       │
       ├──── (N) contract_amendments (1) ──── (N) contract_amendment_stages
       │
       ├──── (N) ledger_items
       │
       ├──── (N) utility_records
       │
       ├──── (N) termination_requests

overdue_configs       (独立配置表，按 config_type 唯一)
role_permissions      (独立配置表，按 role_id 区分)
user_column_configs   (独立配置表，按 user_id + page_name 唯一)
utility_tenants       (独立表，仅 V3.0)
```

---

