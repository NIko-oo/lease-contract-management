# 行政租赁合同管理系统

基于飞书妙搭（Spark）的租赁合同全生命周期管理系统：房产与客户建档 → 合同录入与分段 → 财务审核 → 台账生成 → 收款登记 → 变更 / 终止，并附带水电费、对账单、逾期提醒与权限配置。

> **运行前提**：这是一个面向飞书妙搭平台的参考实现。数据库、统一认证、RBAC 点位、插件与自动化触发器均由平台提供，脱离妙搭应用无法独立部署。

## 功能

- **房产与公司主体**：房产档案、可租面积、所属公司主体与开票税率
- **客户管理**：客户编码、信用代码、银行账户、冻结 / 解冻
- **合同管理**：多阶段租期、变更（补充协议）、终止申请、状态流转
- **财务审核**：合同 / 变更 / 终止三类审核，通过后自动生成或更新台账
- **台账与收款**：按自然月拆分，收款流水驱动回写，支持部分收款与免租期
- **水电费**：后勤登记用量与单价，财务登记收款
- **对账单**：按租户汇总历史未收款，导出 PDF
- **逾期提醒**：租金物业费、水电费、水电费未登记三类，可配置跟进人
- **统计与看板**：合同汇总、金额统计、到期提醒
- **权限**：`action × subject` 点位 + 角色映射，前后端一致校验

## 技术栈

| 层 | 技术 |
|---|---|
| 后端 | NestJS 10、Drizzle ORM、PostgreSQL（平台托管）、class-validator |
| 前端 | React 19、Vite、TypeScript、TanStack Query、Zustand |
| UI | shadcn/ui、Tailwind CSS v4、lucide-react、antd-table toolkit |
| 图表 / 导出 | echarts、xlsx、jspdf + html2canvas |
| 测试 | Jest（56 个单元测试） |

## 目录结构

```
server/
  modules/          业务模块：contract / ledger / receipt / termination /
                    utility / property / customer / overdue / dashboard /
                    permission
  database/         schema.ts（平台生成，勿手改）
  capabilities/     妙搭插件实例配置
client/src/
  pages/            16 个页面目录
  components/       shadcn/ui 与业务组件（PermissionGate 等）
  config/           组织名称等可配置项
shared/             前后端共享类型
data/               建表、权限点位、演示数据脚本
docs/               数据库、接口、功能、视觉与组件规范
test/               单元测试
```

## 快速开始

### 前置条件

- Node.js 20+、npm 10+
- 一个飞书妙搭应用（用于托管数据库、认证与平台能力）
- `lark-cli`（通过 `npx` 调用，无需全局安装）

### 启动

```bash
git clone <your-repo-url>
cd lease-contract-management
npm install

# 同步平台脚本，并生成含你 app_id 的 .spark/meta.json（该文件不入库）
npx -y @lark-apaas/miaoda-cli@latest app sync

npm run dev
```

`.spark/meta.json` 由平台生成，包含环境专属 `app_id`，已在 `.gitignore` 中排除。若没有该文件，先确认妙搭应用已创建并与本地目录关联。

### 初始化数据库

按以下顺序在 **dev** 环境执行（`<YOUR_APP_ID>` 替换为你的应用 ID）：

```bash
# 1. 表结构（仅 dev；线上用 +db-env-migrate 同步）
lark-cli apps +db-execute --app-id <YOUR_APP_ID> --environment dev --file ./data/receive_reports_table.sql --yes

# 2. 权限点位（dev / online 各一次）
lark-cli apps +db-execute --app-id <YOUR_APP_ID> --environment dev --file ./data/authz_read_permissions.sql --yes
lark-cli apps +db-execute --app-id <YOUR_APP_ID> --environment dev --file ./data/authz_receipt_permissions.sql --yes
lark-cli apps +db-execute --app-id <YOUR_APP_ID> --environment dev --file ./data/authz_gl_accountant_role.sql --yes

# 3. 演示数据（全部虚构，可重复执行）
lark-cli apps +db-execute --app-id <YOUR_APP_ID> --environment dev --file ./data/seed/demo_data.sql --yes
lark-cli apps +db-execute --app-id <YOUR_APP_ID> --environment dev --file ./data/overdue_configs.sql --yes
```

线上环境禁止执行 DDL / DCL，表结构通过 `+db-env-migrate` 同步。脚本细则见 [`data/README.md`](data/README.md)。

### 环境变量

复制 `.env.example` 为 `.env`。使用平台托管数据库时 `SUDA_DATABASE_URL` 留空，由平台注入。`.env` 与 `.env.local` 均已被忽略。

## 关键业务口径

- **合同状态机**：`draft → pending → approved / rejected`，`approved → terminated`
- **应收金额**：`COALESCE(amendment_rent, monthly_rent)`，是 `??` 语义——变更为 0 时应收就是 0，不能回退到原合同金额
- **收款事实**：只以 `receive_records` 为准；`ledger_items.rent_received` 是期级已收按行 FIFO 分摊后的汇总
- **免租期**：应收双 0 的期间置 `no_payment_required`，不进逾期与对账单

更完整的跨表不变式见 [`AGENTS.md`](AGENTS.md)。

## 测试与检查

```bash
npm test            # 56 个单元测试
npm run type:check  # server + client 类型检查
npm run build:prod  # 生产构建（跨平台，不依赖妙搭 CLI）
node scripts/gate.js  # 提交门禁（eslint / type check / stylelint / jest）
```

> `npm run build` 是妙搭沙箱内的构建入口，依赖平台提供的 `fullstack-cli`；本地与 CI 请用 `npm run build:prod`。

## 数据与隐私

本仓库不包含任何生产数据。`data/seed/demo_data.sql` 中的公司、客户、信用代码、银行账号与合同均为虚构。部署到自己的环境后，请将 `client/src/config/organization.ts` 中的组织名称改为实际主体。

## 已知限制

- 依赖飞书妙搭平台：数据库句柄、认证、RBAC 与插件/自动化触发器均由平台注入，无法脱离平台运行
- `AGENTS.md` 中部分指针指向本项目内部的私有知识库，未随仓库发布

## 第三方组件

`@lark-apaas/*` 系列 SDK 与飞书妙搭生成的模板代码版权归飞书所有，其使用受平台条款约束。本仓库的 MIT 许可仅覆盖本项目自有代码。

## License

[MIT](LICENSE)
