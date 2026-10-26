# API 路由索引（行政租赁合同管理系统 · 云端版）

> 本文件由 `AGENTS.md` 披露而来：新增或改动接口、核对权限点时查阅。权威来源是 controller 装饰器；本文件与代码不一致时以代码为准，并回来修正本文件。所有接口以 `/api` 为前缀。

## API 路由索引

所有后端接口以 `/api` 为前缀。所有接口均需 `@NeedLogin()`，写接口额外需要 `@Can(action, subject)`。权限列格式为 `action:subject`。

### 房产模块 `/api/properties` `/api/companies`

| 方法 | 路径 | 用途 | 权限 |
|------|------|------|------|
| GET | `/properties` | 房产列表 | read:Property |
| GET | `/properties/:id` | 房产详情 | read:Property |
| POST | `/properties` | 新增房产 | create:Property |
| PUT | `/properties/:id` | 更新房产 | update:Property |
| DELETE | `/properties/:id` | 删除房产 | delete:Property |
| GET | `/companies` | 公司主体列表 | read:Property |
| GET | `/companies/:id` | 公司主体详情 | read:Property |
| POST | `/companies` | 新增公司主体 | create:Property |
| PUT | `/companies/:id` | 更新公司主体 | update:Property |
| DELETE | `/companies/:id` | 删除公司主体 | delete:Property |

### 客户模块 `/api/customers`

| 方法 | 路径 | 用途 | 权限 |
|------|------|------|------|
| GET | `/customers` | 客户列表（分页） | read:Customer |
| GET | `/customers/search` | 搜索活跃客户 | read:Customer |
| GET | `/customers/:id` | 客户详情 | read:Customer |
| POST | `/customers` | 新建客户 | edit:Customer |
| PUT | `/customers/:id` | 更新客户 | edit:Customer |
| PATCH | `/customers/:id/freeze` | 冻结/解冻客户 | edit:Customer |

### 合同模块 `/api/contracts`

| 方法 | 路径 | 用途 | 权限 |
|------|------|------|------|
| GET | `/contracts` | 合同列表（分页+筛选） | read:Contract |
| GET | `/contracts/:id` | 合同详情 | read:Contract |
| GET | `/contracts/:id/amendments` | 变更记录列表 | read:Contract |
| GET | `/contracts/:id/last-paid-period` | 最后已付款所属期 | read:Contract |
| GET | `/contracts/:id/amendment-periods` | 变更分段明细 | read:Contract |
| POST | `/contracts` | 新建合同 | create:Contract |
| PUT | `/contracts/:id` | 更新合同 | update:Contract |
| DELETE | `/contracts/:id` | 删除合同 | delete:Contract |
| PATCH | `/contracts/:id/submit` | 提交审核 | submit:Contract |
| PATCH | `/contracts/:id/review` | 审核合同（通过/驳回） | review:Finance |
| PATCH | `/contracts/amendments/:amendmentId/review` | 审核变更 | review:Finance |
| POST | `/contracts/amend` | 创建合同变更 | amend:Contract |
| POST | `/contracts/:id/regenerate-ledger` | 重新生成台账 | config:Sync |

### 财务审核（通过合同模块实现）

审核逻辑在 Contract Controller 中：`PATCH /contracts/:id/review` 和 `PATCH /contracts/amendments/:amendmentId/review`。审核通过自动触发台账生成/更新。

### 台账模块 `/api/ledger`

| 方法 | 路径 | 用途 | 权限 |
|------|------|------|------|
| GET | `/ledger` | 台账列表（分页+筛选） | read:Ledger |
| GET | `/ledger/unpaid-periods` | 该合同未收齐期间列表（期级应收/已收，收款弹窗所属期下拉与余额） | read:Ledger |
| GET | `/ledger/column-config` | 获取列显示配置 | read:Ledger |
| PUT | `/ledger/column-config` | 保存列显示配置 | edit:Ledger |

### 收款模块 `/api/receipts`

| 方法 | 路径 | 用途 | 权限 |
|------|------|------|------|
| GET | `/receipts` | 收款报表列表（分页+筛选，`contractId`+`period` 取该期全部流水） | read:Receipt |
| POST | `/receipts` | 创建收款（台账/水电费多行，写入报表并回写） | edit:Receipt |
| PATCH | `/receipts/:id/invoice` | 更新发票编号 | edit:Receipt |
| DELETE | `/receipts/:id` | 删除收款行（删除后按合同+所属期回写） | edit:Receipt |

### 水电费模块 `/api/utilities`

| 方法 | 路径 | 用途 | 权限 |
|------|------|------|------|
| GET | `/utilities/tenants` | 需收水电费的租户列表 | read:Utility |
| GET | `/utilities` | 水电费列表（分页） | read:Utility |
| POST | `/utilities` | 登记水电费 | edit:Utility |
| PUT | `/utilities/:id` | 更新水电费 | edit:Utility |
| DELETE | `/utilities/:id` | 删除水电费（存在关联收款时 409 拒绝，需先删收款） | edit:Utility |

### 终止申请模块 `/api/terminations`

| 方法 | 路径 | 用途 | 权限 |
|------|------|------|------|
| GET | `/terminations` | 终止申请列表 | read:Termination |
| GET | `/terminations/check-period` | 校验终止日期（已收款检查） | read:Termination |
| POST | `/terminations` | 提交终止申请 | create:Termination |
| POST | `/terminations/:id/review` | 审核终止申请 | review:Finance |
| POST | `/terminations/:id/withdraw` | 撤回申请 | create:Termination |

### 逾期模块 `/api/overdue`

| 方法 | 路径 | 用途 | 权限 |
|------|------|------|------|
| GET | `/overdue/config` | 逾期配置 | read:Overdue |
| PUT | `/overdue/config/:type` | 更新配置 | config:Overdue |
| GET | `/overdue/rent-overdue` | 租金物业费逾期数据 | read:Overdue |
| GET | `/overdue/utility-overdue` | 水电费逾期数据 | read:Overdue |
| GET | `/overdue/utility-unregistered` | 水电费未登记汇总 | read:Overdue |
| POST | `/overdue/send-reminder` | 发送单条提醒 | send:Overdue |
| POST | `/overdue/send-all-reminder` | 一键发送全部提醒 | send:Overdue |

### 数据看板模块 `/api/dashboard`

| 方法 | 路径 | 用途 | 权限 |
|------|------|------|------|
| GET | `/dashboard/property-rent-summary` | 房产出租概况汇总 | read:Dashboard |
### 权限模块 `/api/permissions`

| 方法 | 路径 | 用途 | 权限 |
|------|------|------|------|
| GET | `/permissions` | 获取全部权限配置 | NeedLogin（无 `@Can`） |
| GET | `/permissions/role-mappings` | 角色↔点位映射，前端 `roleStore` 启动时加载 | NeedLogin（无 `@Can`） |
| POST | `/permissions/role-mappings/batch` | 批量更新角色权限映射 | `manage:Permission` + NeedLogin |

> 旧版这里的 `GET /permissions/by-role/:roleId` 与 `PUT /permissions` 已不存在，改动接口后请回来核对本表（`grep -nE "@(Get|Post|Put|Patch|Delete)\(" server/modules/*/*.controller.ts`）。


