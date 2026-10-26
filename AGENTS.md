# 行政租赁合同管理系统 · 飞书妙搭云端版

<!-- 本文件预算 200 行。只写平台地基、流程、跨表不变式与指针；页面功能细节写 docs/features.md。本文件不写数量词（表数/页数/模块数/接口数/点位数）——数量由代码统计得出，写下来必然过期。 -->

合同全生命周期管理（录入→审核→台账→收款→终止），部署在飞书妙搭（Spark）低代码平台。前端 React + 后端 NestJS 单仓库，`shared/` 放前后端共享类型。

## 平台会咬人的地方

平台提供托管 DB、统一认证、RBAC 点位、插件与自动化引擎。以下都是配置里读不出来的约定与坑：

- **`server/database/schema.ts` 是平台生成物**（`fullstack-cli gen-db-schema`）。手改会被覆盖。新增表/字段的动作在数据库侧，不在这个文件。
- **表与列描述要双写**：代码注释（供人读）+ `data/<表>.sql` 末尾的 `COMMENT ON TABLE/COLUMN`（供 `pg_description`）。drizzle-orm 不支持 `.comment()`，只写注释则数据表管理界面空白。
- **DB 句柄由平台注入**：`@Inject('DRIZZLE_DATABASE')`。自建连接池是本地部署版的做法。
- **系统字段平台填充**：`_created_at` / `_created_by` / `_updated_at` / `_updated_by` 不要在业务代码里赋值。`user_profile` 在 TS 侧就是 `string`；`customTimestamptz` 是 `Date`，出 API 变 ISO string。
- **新表必须同步 RLS 策略**，否则非 `service_role` 调用方读不到数据。平台默认给四条（service_role 旁路 + 修改全部 / 查看全部 / 修改本人）。
- **online 禁止 DDL/DCL**（`forbid ddl/dcl operation in online env`）。表结构靠 `+db-env-migrate` 从 dev 同步；online 只允许 DML（`+db-execute --environment online`）。
- **发布默认进 dev，不是线上**。要线上须显式再发一次。
- **分支语义**：`sprint/default` 是日常开发线；`main` 是发布归档线，不是线上代码的来源。别拿 `main` 当现状读。
- **门禁脚本是模板托管文件**：`scripts/lint.js` 与 `scripts/hooks/run-precommit.js` 会被 `chore(upgrade): auto-upgrade` 整文件覆盖，Windows 上覆盖后 `spawn EINVAL`。**提交门禁不受此影响**——`.githooks/pre-commit` 走的是非托管的 `scripts/gate.js`；受影响的只有手动 `npm run lint`，失效时改跑 `node scripts/gate.js`，细节见知识库 `平台自动修改记录/`。
- **本项目无 CI 二次拦截**：绕过 pre-commit 的提交没有下游兜底。
- **受控 UI 一律 `CanPoint` / `usePointPermission`**（`client/src/components/PermissionGate.tsx`）。平台 `<Can>` / `useCan` 的点位来自平台侧，不受本系统权限配置页影响，且应用协作者/开发者身份会被平台赋全点位——用它做受控 UI 会出现「配置勾了没反应」。平台 `ability` 在本项目只有一个用途：`ability.can(role, ROLE_SUBJECT)` 识别角色。
- **HTTP 一律 `axiosForBackend`**（`@lark-apaas/client-toolkit`）。
- **表格双轨**：台账 / 水电费登记记录 / 收款报表 / Dashboard / 合同详情 / 财务审核 / 逾期提醒 / 房产信息 / 合同统计这 9 页用 `@lark-apaas/client-toolkit/antd-table`（可拖拽列宽、共用 `ResizableTitle`），其余页用 shadcn Table。列显示/隐藏配置只有台账页提供。
- **`ViewModule` 在 `app.module.ts` 最后注册**，业务模块排在它之前。
- **妙搭平台会自己改代码**：云端出现不是你再提交的 commit、或构建行为异常时，先 pull 再对比根因，并在知识库 `平台自动修改记录/` 追加一条。
- **本地部署版另有自己的 `agents.md`**（`../行政租赁合同管理系统_本地部署/`）：其权限体系与表清单已停留在旧版，读它只为拿 V3.1 差异，别引用其中的权限点或表结构。
- **插件与自动化都靠字符串 ID 对接平台侧**：插件调用形态是 `CapabilityService.load(<实例 ID>).call(<方法>, input)`，实例 ID 即 `server/capabilities/*.json` 的文件名；自动化是 `@Automation()` + `@BindTrigger('<触发器 ID>')`。触发器 ID 必须先在妙搭平台注册，代码里改了 ID 而平台没有对应触发器就静默不执行。

## 流程

### P1 加表

1. 写 `data/<表>.sql`，dev 执行：`lark-cli apps +db-execute --app-id <id> --environment dev --file ./data/<表>.sql --yes`
2. 脚本末尾写完 `COMMENT ON TABLE` / `COMMENT ON COLUMN`（描述双写），并带四条 `pgPolicy`（确认要无策略例外的另说）
3. `fullstack-cli gen-db-schema` 重生成 `schema.ts`
4. online 侧走 `+db-env-migrate` 同步表结构，不在 online 跑 DDL
5. 新脚本登记进 `data/README.md`（作用 / 幂等性 / 能否在 online 执行）

**判据**：`grep -c 'pgTable(' server/database/schema.ts` 与 `docs/database.md` 的表小节数相等；`data/<表>.sql` 里 `COMMENT ON` 与 `pgPolicy` 同时存在；`docs/database.md` 已加该表小节。

一次性数据修正脚本放 `data/fixes/`（纯 DML，dev / online 各跑一次），头部写明目的 / 环境 / 幂等 / 执行日期。

### P2 加点位

1. controller 方法加 `@Can(action, subject)`，写接口再叠 `@NeedLogin()`
2. `authz_permissions` 插点位（`action × subject` 一行）
3. `authz_role_permissions` 配角色映射——**dev 与 online 各跑一次**
4. 前端受控 UI 用 `<CanPoint action subject>`、导航用 `Layout.tsx` 的 `navItems` 权限字段，action/subject 与接口字面相同

**判据**：该 subject 名下每个 controller 方法都带 `@Can` 或 `@NeedLogin`；前端至少存在一处引用且 action/subject 拼写与接口完全一致；两库权限配置页都能看到新点位。

注意：`data/authz_*_permissions.sql` 那类硬编码 UUID 的脚本非幂等，重跑会主键冲突（幂等性逐脚本看 `data/README.md`）。

### P3 过门禁提交

`git commit` → `.githooks/pre-commit` → `node scripts/gate.js` → **eslint / type:check(server+client) / stylelint** → **jest**。任一步红即阻断提交。

**门禁真身在 `scripts/gate.js`**：它不是模板托管文件，且用 `node` 直跑 `npm-cli.js`（不经 `.cmd`、不开 shell），所以 `chore(upgrade)` 覆盖 `scripts/lint.js` / `scripts/hooks/run-precommit.js` 之后提交门禁照样生效。`npm run lint` / `npm run precommit` 保留为手动入口，但前者的实现文件会被覆盖回 `shell:false`（Windows 报 `spawn EINVAL`）——失效时改跑 `node scripts/gate.js`，不必取回文件。

**rebase 引入 `chore(upgrade)` 后仍要单独补一个 `fix(gate)` 提交再 push**，把被覆盖的两个脚本一并取回，否则后续有人在本地手动跑 `npm run lint` 会撞到静默失效的脚本。

**判据**：pre-commit 各步均 PASS；本次 diff 命中合同 / 台账 / 金额计算 / 状态流转路径的，有对应 spec 新增或修改。

旁路（`SKIP_GIT_HOOKS=1` 或 `--no-verify`）只用于紧急修复，且必须在下一个提交前补跑 `node scripts/gate.js` 并修复全部失败。门禁自身故障时修门禁脚本，不绕过。

### P4 代码后同步文档

改动落在哪一类，就写进那一类的权威文件（doc-as-cache：一处写、一处改）：

| 改动 | 写入 |
|---|---|
| 表 / 字段 / 迁移 / 脚本 | `docs/database.md` + `data/README.md` |
| 接口 / 权限点 | `docs/api-routes.md` |
| 页面功能、字段、筛选、弹窗交互、导出 | `docs/features.md` |
| 视觉与组件行为 | `docs/ui-design.md`，组件 API 与图标规范进 `docs/ui-components.md` |
| 平台自动修改、报错根因 | 知识库 `平台自动修改记录/` |

**本文件只在这三种情况才改**：出现新的分支、新的硬约束、新的跨表不变式。超预算时先压缩或披露，不得追加。

## 跨表不变式

改任何一侧都得同时核对另一侧的规则。按页的字段清单与弹窗交互在 `docs/features.md`，这里只留跨页共享的口径。

- **合同状态机**：`draft → pending → approved / rejected`，`approved → terminated`。仅 `pending` / `rejected` 可编辑；`approved` 后要走变更流程（`POST /contracts/amend`）再经审核。
- **应收口径**：应收租金 = `COALESCE(amendment_rent, monthly_rent)`，物业费同理。是 `??` 语义——变更减免为 0 时应收就是 0，写成 `||` 会错误回退到原合同金额。
- **收款状态**：`unpaid` / `partial` / `paid` 由「应收口径 vs 已收金额」算出，在台账生成、变更审核应用（`applyAmendmentToLedger`）、收款回写三处按同一口径计算。
- **免租期**：应收租金与物业费均为 0 的期间置 `no_payment_required`，该行无收款按钮、不进逾期提醒、不进对账单，台账「逾期天数」固定显示未逾期。优先级仅次于 `terminated`，已终止行不被它覆盖。
- **入账即回写**：收款先写 `receive_records`，再由 `ReceiptService.syncBack` 按 `(contractId, period)` 汇总回写 `ledger_items` / `utility_records`。收款的应收/已收与超收校验都取**期聚合**（应收 = 该期未终止行之和），同月多行时不能按行取数，否则分母单行、分子整期，「一键收齐」必然被判超收；`ledger_items.rentReceived` 是期级已收按 `stage_start_date` 升序 FIFO 分摊到行的结果，不是该行的收款事实——事实只在 `receive_records`。发票编号只在收款报表页补录，收款时不填。
- **剔除已终止**：`status='terminated'` 的台账行不参与取数与计算；对账单还要额外排除 `period` 晚于终止年月的行。合同映射用请求内的局部 Map——用全局 state 会因尚未更新而让终止过滤失效。
- **自适应列宽**：4 个 antd 表格页进入 / 数据加载完成后自动适配一次，不随筛选重测（测量抖动会让列宽偏窄重叠）；表头可拖拽，双击表头重适。超长单元格列按全量记录测量兜底，因为分页只渲染当前页。
- **两库独立**：`authz_*` 与业务数据在 dev / online 各一份，权限配置页改了哪个环境就只有哪个环境生效。正式权限口径以 online 为准，需要时由用户在 online 权限配置页维护，不做两库强制对齐。
- **点位↔接口一致**：受控 UI 的 `action`/`subject` 必须与目标接口 controller 上的 `@Can` 完全相同，否则「按钮看得到、点了被拒」。
- **fail-closed**：`roleStore.permissionsLoaded` 之前一律判为无权限（避免按钮先出现再消失）；加载失败保持空映射＝全部隐藏。`canAccess` 的口径是当前所选**单角色**，比后端 `@Can` 的全角色并集更严格，只会少显示按钮不会越权；`super_admin` 恒为 true。
- **角色**：`super_admin` / `finance` / `administrative` / `logistics` / `role_99xxcvu983p`（总账会计，平台生成的角色标识，创建后不可改）。默认选中优先级 `super_admin > finance > administrative > logistics > role_99xxcvu983p`——总账会计是纯只读，同时持有其他角色时不会被默认选中。
- **事务边界**：多步核心写路径（合同审核通过 + 生成台账、台账重生成、合同新建 / 编辑 / 变更的主表+分段写入、终止审核通过的合同状态 + 台账批量改写）必须包在 `db.transaction` 里且回调内只用 `tx` 句柄，任一步失败整体回滚（合同保持 `pending`、台账零写入 / 旧台账保留、不出现「主表已改而分段被删空」）。飞书通知、消息通知、租户初始化等外部副作用放在事务提交之后，它们失败不回滚审核结果。
- **面积是合同级单值**：`lease_area` 无期间维度（分段表 / 变更分段表 / 台账表都没有面积列）。分期交付或缩租导致同一合同各月实际面积不同时，拆同族补充合同修正（编号加后缀，`-0` 标记面积不足的早期月份拆分件），不改代码加期间级面积字段——台账的月租折算只按天数折算、不含面积因子。
- **重生成台账是破坏性操作**：`POST /contracts/:id/regenerate-ledger` 删表重建，会丢掉已收款。数据修正一律走 `data/fixes/` 的纯 DML 脚本、逐条写守卫做到幂等，dev 验证通过后经用户确认再执行 online。
- **视觉三硬约束**：内容区全站统一 `max-w-[1400px] mx-auto px-6 py-8`；圆角 ≤ 4px；无渐变、无彩色阴影、无彩色图标。其余视觉规范见 `docs/ui-design.md`。

## 指针索引

- **页面功能与取数细节** → [`docs/features.md`](docs/features.md)：改动或新建任何一个页面前查（字段、筛选项、弹窗交互、导出文件名）；新功能点写这里。
- **表字段与迁移** → [`docs/database.md`](docs/database.md)：读表结构、加字段、写建表脚本时查（逐字段类型/约束/业务说明、按业务域分组速查、ER 图、部署与初始化）。
- **接口与权限对表** → [`docs/api-routes.md`](docs/api-routes.md)：加接口、核对某接口要什么点位、盘点缺守卫的接口时查。权威是 controller 装饰器。
- **SQL 脚本能不能跑** → [`data/README.md`](data/README.md)：逐脚本的作用 / 幂等性 / 能否在 online 执行。
- **视觉与组件规范** → [`docs/ui-design.md`](docs/ui-design.md)（色彩、字体栈、布局骨架、状态标签、签名与禁区）；shadcn 组件用法与图标 / elevate 遮罩规范 → [`docs/ui-components.md`](docs/ui-components.md)。
- **云端出现非你提交的 commit / 平台报错根因**：先 pull 再对比根因。平台自动修改记录属内部知识库，未随仓库发布。
- **lark-cli apps 命令与妙搭发布流程** → 见技能 `feishu-miaoda-dev`；`apps` 命令的参数与能力以 `lark-cli apps <命令> --help` 为准。

## 未收口

无。已知缺口已全部收口：

- ~~数据 GET 普遍缺点位~~ → `data/authz_read_permissions.sql` 已补 7 个 read 点位，所有 controller 方法均带 `@Can` + `@NeedLogin`
- ~~旧自研 RBAC 残留~~ → `shared/permission-config.ts`、`role_permissions.json` 已删除
- ~~二级页无路由守卫~~ → `ProtectedRoute.tsx` 已实现权限检查，`app.tsx` 全部 18 个页面路由均经 `ProtectedRoute` 包裹，无权限直连 URL 重定向首页
