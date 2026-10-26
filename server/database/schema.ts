/* eslint-disable */
/** auto generated, do not edit */
import { pgTable, index, foreignKey, uuid, varchar, doublePrecision, text, pgPolicy, boolean, uniqueIndex, integer, customType } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const userProfile = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return 'user_profile';
  },
  toDriver(value: string) {
    return sql`ROW(${value})::user_profile`;
  },
  fromDriver(value: string) {
    const [userId] = value.slice(1, -1).split(',');
    return userId.trim();
  },
});

export type FileAttachment = {
  bucket_id: string;
  file_path: string;
};

export const fileAttachment = customType<{
  data: FileAttachment;
  driverData: string;
}>({
  dataType() {
    return 'file_attachment';
  },
  toDriver(value: FileAttachment) {
    return sql`ROW(${value.bucket_id},${value.file_path})::file_attachment`;
  },
  fromDriver(value: string): FileAttachment {
    const [bucketId, filePath] = value.slice(1, -1).split(',');
    return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
  },
});

/** Escape single quotes in SQL string literals */
function escapeLiteral(str: string): string {
  return `'${str.replace(/'/g, "''")}'`;
}

export const userProfileArray = customType<{
  data: string[];
  driverData: string;
}>({
  dataType() {
    return 'user_profile[]';
  },
  toDriver(value: string[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::user_profile[]`;
    }
    const elements = value.map(id => `ROW(${escapeLiteral(id)})::user_profile`).join(',');
    return sql.raw(`ARRAY[${elements}]::user_profile[]`);
  },
  fromDriver(value: string): string[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => m.slice(1, -1).split(',')[0].trim());
  },
});

export const fileAttachmentArray = customType<{
  data: FileAttachment[];
  driverData: string;
}>({
  dataType() {
    return 'file_attachment[]';
  },
  toDriver(value: FileAttachment[]) {
    if (!value || value.length === 0) {
      return sql`'{}'::file_attachment[]`;
    }
    const elements = value.map(f =>
      `ROW(${escapeLiteral(f.bucket_id)},${escapeLiteral(f.file_path)})::file_attachment`
    ).join(',');
    return sql.raw(`ARRAY[${elements}]::file_attachment[]`);
  },
  fromDriver(value: string): FileAttachment[] {
    if (!value || value === '{}') return [];
    const inner = value.slice(1, -1);
    const matches = inner.match(/\([^)]*\)/g) || [];
    return matches.map(m => {
      const [bucketId, filePath] = m.slice(1, -1).split(',');
      return { bucket_id: bucketId.trim(), file_path: filePath.trim() };
    });
  },
});

export const customTimestamptz = customType<{
  data: Date;
  driverData: string;
  config: { precision?: number};
}>({
  dataType(config) {
    const precision = typeof config?.precision !== 'undefined'
      ? ` (${config.precision})`
      : '';
    return `timestamptz${precision}`;
  },
  toDriver(value: Date | string | number){
    if(value == null) return value as any;
    if (typeof value === 'number') {
      return new Date(value).toISOString();
    }
    if(typeof value === 'string') {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    throw new Error('Invalid timestamp value');
  },
  fromDriver(value: string | Date): Date {
    if(value instanceof Date) return value;
    return new Date(value);
  },
});

export const ledgerItems = pgTable("ledger_items", {
  id: uuid().defaultRandom().notNull(),
  contractId: uuid("contract_id").notNull(),
  contractNo: varchar("contract_no", { length: 255 }).notNull(),
  tenant: varchar({ length: 255 }).notNull(),
  period: varchar({ length: 7 }).notNull(),
  stageStartDate: varchar("stage_start_date", { length: 10 }).notNull(),
  stageEndDate: varchar("stage_end_date", { length: 10 }).notNull(),
  monthlyRent: doublePrecision("monthly_rent").default(0).notNull(),
  monthlyPropertyFee: doublePrecision("monthly_property_fee").default(0).notNull(),
  paymentMethod: varchar("payment_method", { length: 20 }).notNull(),
  dueDate: varchar("due_date", { length: 10 }).notNull(),
  rentReceived: doublePrecision("rent_received").default(0).notNull(),
  propertyFeeReceived: doublePrecision("property_fee_received").default(0).notNull(),
  receiveDate: varchar("receive_date", { length: 10 }),
  status: varchar({ length: 20 }).default('unpaid').notNull(),
  hasUtilities: boolean("has_utilities").default(false).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
  quarter: varchar({ length: 7 }),
  propertyName: varchar("property_name", { length: 255 }),
  landlord: varchar({ length: 255 }),
  amendmentNo: varchar("amendment_no", { length: 255 }),
  amendmentRent: doublePrecision("amendment_rent"),
  amendmentPropertyFee: doublePrecision("amendment_property_fee"),
}, (table) => [
  index("idx_ledger_contract_id").using("btree", table.contractId.asc().nullsLast().op("uuid_ops")),
  index("idx_ledger_period").using("btree", table.period.asc().nullsLast().op("text_ops")),
  index("idx_ledger_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
  foreignKey({
    columns: [table.contractId],
    foreignColumns: [contracts.id],
    name: "ledger_items_contract_id_fkey"
  }).onDelete("cascade"),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const utilityTenants = pgTable("utility_tenants", {
  id: uuid().defaultRandom().notNull(),
  tenant: varchar({ length: 255 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
  propertyName: varchar("property_name", { length: 255 }),
}, (table) => [
  uniqueIndex("idx_utility_tenants_tenant_property").using("btree", table.tenant.asc().nullsLast().op("text_ops"), table.propertyName.asc().nullsLast().op("text_ops")),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const authzPermissions = pgTable("authz_permissions", {
  id: uuid().defaultRandom().notNull(),
  action: varchar({ length: 100 }).notNull(),
  subject: varchar({ length: 100 }).notNull(),
  description: text().default(''),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const customers = pgTable("customers", {
  id: uuid().defaultRandom().notNull(),
  customerCode: varchar("customer_code", { length: 50 }).notNull(),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  creditCode: varchar("credit_code", { length: 18 }),
  bankAccount: varchar("bank_account", { length: 50 }),
  isFrozen: boolean("is_frozen").default(false).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
  tenantType: varchar("tenant_type", { length: 50 }),
  bankName: varchar("bank_name", { length: 255 }),
}, (table) => [
  uniqueIndex("idx_customers_code").using("btree", table.customerCode.asc().nullsLast().op("text_ops")),
  index("idx_customers_frozen").using("btree", table.isFrozen.asc().nullsLast().op("bool_ops")),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const contractStages = pgTable("contract_stages", {
  id: uuid().defaultRandom().notNull(),
  contractId: uuid("contract_id").notNull(),
  startDate: varchar("start_date", { length: 10 }).notNull(),
  endDate: varchar("end_date", { length: 10 }).notNull(),
  monthlyRent: doublePrecision("monthly_rent").default(0).notNull(),
  monthlyPropertyFee: doublePrecision("monthly_property_fee").default(0).notNull(),
  stageOrder: integer("stage_order").default(0).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
  stageType: varchar("stage_type", { length: 20 }),
}, (table) => [
  index("idx_stages_contract_id").using("btree", table.contractId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.contractId],
    foreignColumns: [contracts.id],
    name: "contract_stages_contract_id_fkey"
  }).onDelete("cascade"),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const contracts = pgTable("contracts", {
  id: uuid().defaultRandom().notNull(),
  contractNo: varchar("contract_no", { length: 255 }).notNull(),
  landlord: varchar({ length: 255 }).notNull(),
  tenant: varchar({ length: 255 }).notNull(),
  startDate: varchar("start_date", { length: 10 }).notNull(),
  endDate: varchar("end_date", { length: 10 }).notNull(),
  hasUtilities: boolean("has_utilities").default(false).notNull(),
  paymentMethod: varchar("payment_method", { length: 20 }).notNull(),
  status: varchar({ length: 20 }).default('draft').notNull(),
  terminationDate: varchar("termination_date", { length: 10 }),
  signDate: varchar("sign_date", { length: 10 }),
  leaseAddress: text("lease_address"),
  reviewRemark: text("review_remark"),
  creator: varchar({ length: 255 }),
  reviewer: varchar({ length: 255 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
  advancePaymentDays: integer("advance_payment_days").default(5).notNull(),
  propertyId: uuid("property_id"),
  contractType: varchar("contract_type", { length: 20 }).default('new_contract'),
  parentContractId: uuid("parent_contract_id"),
  leaseArea: doublePrecision("lease_area"),
}, (table) => [
  index("idx_contracts_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
  index("idx_contracts_tenant").using("btree", table.tenant.asc().nullsLast().op("text_ops")),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const utilityRecords = pgTable("utility_records", {
  id: uuid().defaultRandom().notNull(),
  contractId: uuid("contract_id").notNull(),
  contractNo: varchar("contract_no", { length: 255 }).notNull(),
  tenant: varchar({ length: 255 }).notNull(),
  period: varchar({ length: 7 }).notNull(),
  electricityUsage: doublePrecision("electricity_usage").default(0).notNull(),
  electricityPrice: doublePrecision("electricity_price").default(0).notNull(),
  waterUsage: doublePrecision("water_usage").default(0).notNull(),
  waterPrice: doublePrecision("water_price").default(0).notNull(),
  totalElectricityFee: doublePrecision("total_electricity_fee").default(0).notNull(),
  totalWaterFee: doublePrecision("total_water_fee").default(0).notNull(),
  electricityReceived: doublePrecision("electricity_received").default(0).notNull(),
  waterReceived: doublePrecision("water_received").default(0).notNull(),
  recordDate: varchar("record_date", { length: 10 }).notNull(),
  recordedBy: varchar("recorded_by", { length: 255 }).notNull(),
  receiveDate: varchar("receive_date", { length: 10 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_utilities_contract_id").using("btree", table.contractId.asc().nullsLast().op("uuid_ops")),
  index("idx_utilities_period").using("btree", table.period.asc().nullsLast().op("text_ops")),
  foreignKey({
    columns: [table.contractId],
    foreignColumns: [contracts.id],
    name: "utility_records_contract_id_fkey"
  }).onDelete("cascade"),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const contractAmendmentStages = pgTable("contract_amendment_stages", {
  id: uuid().defaultRandom().notNull(),
  amendmentId: uuid("amendment_id").notNull(),
  startDate: varchar("start_date", { length: 10 }).notNull(),
  endDate: varchar("end_date", { length: 10 }).notNull(),
  monthlyRent: doublePrecision("monthly_rent").default(0).notNull(),
  monthlyPropertyFee: doublePrecision("monthly_property_fee").default(0).notNull(),
  stageOrder: integer("stage_order").default(0).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
  stageType: varchar("stage_type", { length: 20 }),
  period: varchar({ length: 7 }),
}, (table) => [
  index("idx_amendment_stages_amendment_id").using("btree", table.amendmentId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.amendmentId],
    foreignColumns: [contractAmendments.id],
    name: "contract_amendment_stages_amendment_id_fkey"
  }).onDelete("cascade"),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const contractAmendments = pgTable("contract_amendments", {
  id: uuid().defaultRandom().notNull(),
  contractId: uuid("contract_id").notNull(),
  amendmentNo: varchar("amendment_no", { length: 255 }),
  changeStartDate: varchar("change_start_date", { length: 10 }).notNull(),
  changeEndDate: varchar("change_end_date", { length: 10 }).notNull(),
  changeType: varchar("change_type", { length: 255 }).notNull(),
  status: varchar({ length: 20 }).default('active'),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
  reviewRemark: text("review_remark"),
  reviewer: varchar({ length: 255 }),
  signDate: varchar("sign_date", { length: 10 }),
}, (table) => [
  index("idx_amendments_contract_id").using("btree", table.contractId.asc().nullsLast().op("uuid_ops")),
  foreignKey({
    columns: [table.contractId],
    foreignColumns: [contracts.id],
    name: "contract_amendments_contract_id_fkey"
  }).onDelete("cascade"),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const terminationRequests = pgTable("termination_requests", {
  id: uuid().defaultRandom().notNull(),
  contractId: uuid("contract_id").notNull(),
  contractNo: varchar("contract_no", { length: 255 }).notNull(),
  tenant: varchar({ length: 255 }).notNull(),
  terminationDate: varchar("termination_date", { length: 10 }).notNull(),
  status: varchar({ length: 20 }).default('pending').notNull(),
  rejectReason: text("reject_reason"),
  reviewRemark: text("review_remark"),
  reviewedBy: varchar("reviewed_by", { length: 255 }),
  creator: varchar({ length: 255 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
  amendmentNo: varchar("amendment_no", { length: 255 }),
}, (table) => [
  index("idx_terminations_contract_id").using("btree", table.contractId.asc().nullsLast().op("uuid_ops")),
  index("idx_terminations_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
  foreignKey({
    columns: [table.contractId],
    foreignColumns: [contracts.id],
    name: "termination_requests_contract_id_fkey"
  }).onDelete("cascade"),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const receiveRecords = pgTable("receive_records", {
  id: uuid().defaultRandom().notNull(),
  propertyName: varchar("property_name", { length: 255 }),
  contractId: uuid("contract_id").notNull(),
  contractNo: varchar("contract_no", { length: 255 }).notNull(),
  tenant: varchar({ length: 255 }).notNull(),
  customerCode: varchar("customer_code", { length: 50 }),
  receiveType: varchar("receive_type", { length: 20 }).notNull(),
  receiveDate: varchar("receive_date", { length: 10 }).notNull(),
  period: varchar({ length: 7 }).notNull(),
  unit: varchar({ length: 20 }).notNull(),
  unitQty: doublePrecision("unit_qty").default(0).notNull(),
  amount: doublePrecision().default(0).notNull(),
  invoiceNo: varchar("invoice_no", { length: 100 }),
  refId: uuid("ref_id"),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  index("idx_receipts_contract").using("btree", table.contractId.asc().nullsLast().op("uuid_ops")),
  index("idx_receipts_period").using("btree", table.period.asc().nullsLast().op("text_ops")),
  index("idx_receipts_receive_date").using("btree", table.receiveDate.asc().nullsLast().op("text_ops")),
  index("idx_receipts_type").using("btree", table.receiveType.asc().nullsLast().op("text_ops")),
  foreignKey({
    columns: [table.contractId],
    foreignColumns: [contracts.id],
    name: "receive_records_contract_id_fkey"
  }).onDelete("cascade"),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const authzRolePermissions = pgTable("authz_role_permissions", {
  id: uuid().defaultRandom().notNull(),
  roleKey: varchar("role_key", { length: 100 }).notNull(),
  permissionId: uuid("permission_id").notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  foreignKey({
    columns: [table.permissionId],
    foreignColumns: [authzPermissions.id],
    name: "authz_role_permissions_permission_id_fkey"
  }).onDelete("cascade"),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"], using: sql`true` }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"] }),
]);

export const rolePermissions = pgTable("role_permissions", {
  id: uuid().defaultRandom().notNull(),
  roleId: varchar("role_id", { length: 50 }).notNull(),
  permissions: text().array().default([""]).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const userColumnConfigs = pgTable("user_column_configs", {
  id: uuid().defaultRandom().notNull(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  pageName: varchar("page_name", { length: 50 }).notNull(),
  hiddenColumns: text("hidden_columns").array().default([""]).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
}, (table) => [
  uniqueIndex("uk_user_column_configs_user_page").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.pageName.asc().nullsLast().op("text_ops")),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const overdueConfigs = pgTable("overdue_configs", {
  id: uuid().defaultRandom().notNull(),
  configType: varchar("config_type", { length: 20 }).notNull(),
  followerIds: text("follower_ids").array().default([""]).notNull(),
  reminderEnabled: boolean("reminder_enabled").default(false).notNull(),
  reminderCron: varchar("reminder_cron", { length: 50 }).default('0 9 * * 1-5').notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
  reminderDay: integer("reminder_day").default(20),
}, (table) => [
  uniqueIndex("idx_overdue_configs_type").using("btree", table.configType.asc().nullsLast().op("text_ops")),
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const companyEntities = pgTable("company_entities", {
  id: uuid().defaultRandom().notNull(),
  name: varchar({ length: 255 }).notNull(),
  creditCode: varchar("credit_code", { length: 18 }),
  bankAccountName: varchar("bank_account_name", { length: 255 }),
  bankAccountNo: varchar("bank_account_no", { length: 50 }),
  bankName: varchar("bank_name", { length: 255 }),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
  rentInvoiceTaxRate: varchar("rent_invoice_tax_rate", { length: 20 }),
  propertyFeeInvoiceTaxRate: varchar("property_fee_invoice_tax_rate", { length: 20 }),
}, (table) => [
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

export const properties = pgTable("properties", {
  id: uuid().defaultRandom().notNull(),
  name: varchar({ length: 255 }).notNull(),
  companyEntity: varchar("company_entity", { length: 255 }).notNull(),
  validFrom: varchar("valid_from", { length: 10 }).notNull(),
  validTo: varchar("valid_to", { length: 10 }).notNull(),
  // System field: Creation time (auto-filled, do not modify)
  createdAt: customTimestamptz('_created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Creator (auto-filled, do not modify)
  createdBy: userProfile("_created_by"),
  // System field: Update time (auto-filled, do not modify)
  updatedAt: customTimestamptz('_updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  // System field: Updater (auto-filled, do not modify)
  updatedBy: userProfile("_updated_by"),
  companyId: uuid("company_id"),
  totalArea: doublePrecision("total_area"),
  rentableArea: doublePrecision("rentable_area"),
}, (table) => [
  pgPolicy("service_role_bypass_policy", { as: "permissive", for: "all", to: ["service_role_workspace_demo"], using: sql`true` }),
  pgPolicy("修改全部数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
  pgPolicy("查看全部数据", { as: "permissive", for: "select", to: ["anon_workspace_demo", "authenticated_workspace_demo"] }),
  pgPolicy("修改本人数据", { as: "permissive", for: "all", to: ["authenticated_workspace_demo"] }),
]);

// table aliases
export const authzPermissionsTable = authzPermissions;
export const authzRolePermissionsTable = authzRolePermissions;
export const companyEntitiesTable = companyEntities;
export const contractAmendmentStagesTable = contractAmendmentStages;
export const contractAmendmentsTable = contractAmendments;
export const contractStagesTable = contractStages;
export const contractsTable = contracts;
export const customersTable = customers;
export const ledgerItemsTable = ledgerItems;
export const overdueConfigsTable = overdueConfigs;
export const propertiesTable = properties;
export const receiveRecordsTable = receiveRecords;
export const rolePermissionsTable = rolePermissions;
export const terminationRequestsTable = terminationRequests;
export const userColumnConfigsTable = userColumnConfigs;
export const utilityRecordsTable = utilityRecords;
export const utilityTenantsTable = utilityTenants;
