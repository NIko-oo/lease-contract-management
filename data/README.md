# `data/` 数据库脚本

本项目运行在飞书妙搭（Spark）平台，数据库由平台托管。脚本通过 `lark-cli` 执行：

```bash
lark-cli apps +db-execute --app-id <YOUR_APP_ID> --environment dev --file ./data/<脚本>.sql --yes
```

- `dev` 与 `online` 是两套独立数据库，数据与权限配置各一份。
- `online` 禁止执行 DDL / DCL（`forbid ddl/dcl operation in online env`）。含 `CREATE TABLE` / `POLICY` / `ALTER` 的脚本只能在 `dev` 执行；线上表结构使用 `lark-cli apps +db-env-migrate` 同步。
- 纯 DML（`INSERT` / `UPDATE` / `DELETE`）可直接在 `online` 执行。

## 表结构 / DDL（仅 dev）

| 文件 | 作用 |
|---|---|
| `receive_reports_table.sql` | 建 `receive_records`（收款报表主数据）+ 索引 + 外键 + RLS 策略 |

RLS 策略中的 `workspace_demo` 为占位符。部署到你自己的妙搭应用后，平台生成的表策略会带上真实 workspace 标识，以 `fullstack-cli gen-db-schema` 的产物为准。

## 演示数据

| 文件 | 作用 |
|---|---|
| `seed/demo_data.sql` | 虚构的公司主体、房产、客户、合同、台账、收款流水、水电费，用于首次启动后立即看到完整页面效果 |

`seed/demo_data.sql` 全部使用 `ON CONFLICT (id) DO NOTHING`，可重复执行。其中公司名、统一社会信用代码、银行账号均为虚构，仅用于演示。

## 权限点位（authz，DML，dev / online 各执行一次）

| 文件 | 作用 | 幂等 |
|---|---|---|
| `authz_read_permissions.sql` | 补 7 个 `read` 点位 + 角色绑定 | 是（`NOT EXISTS`） |
| `authz_receipt_permissions.sql` | 收款报表 `read` / `edit` 点位 + 角色绑定 | 否（硬编码 UUID） |
| `authz_gl_accountant_role.sql` | 总账会计角色映射 | 是（`NOT EXISTS`） |
| `authz_align_online_from_dev.sql` | 补齐线上总账会计点位 | 是 |

## 其他

| 文件 | 作用 |
|---|---|
| `overdue_configs.sql` | 三种逾期提醒类型的演示配置，`follower_ids` 为占位用户 ID |

> 本目录不包含生产数据导出与一次性修正脚本。生产数据只存在于对应环境的数据库中。
