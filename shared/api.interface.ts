/* 前后端共享的类型写在这里 */
import {
  IsString,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsIn,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

// ========== 公司主体 ==========

export interface CompanyEntityResponse {
  id: string;
  name: string;
  creditCode?: string;
  bankAccountName?: string;
  bankAccountNo?: string;
  bankName?: string;
  rentInvoiceTaxRate?: string;
  propertyFeeInvoiceTaxRate?: string;
  _createdAt?: string;
}

export class CreateCompanyDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  creditCode?: string;

  @IsOptional()
  @IsString()
  bankAccountName?: string;

  @IsOptional()
  @IsString()
  bankAccountNo?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  rentInvoiceTaxRate?: string;

  @IsOptional()
  @IsString()
  propertyFeeInvoiceTaxRate?: string;
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  creditCode?: string;

  @IsOptional()
  @IsString()
  bankAccountName?: string;

  @IsOptional()
  @IsString()
  bankAccountNo?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  rentInvoiceTaxRate?: string;

  @IsOptional()
  @IsString()
  propertyFeeInvoiceTaxRate?: string;
}

// ========== 房产信息 ==========

export class CreatePropertyDto {
  @IsString()
  name: string;

  @IsString()
  companyEntity: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsString()
  validFrom: string;

  @IsString()
  validTo: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalArea?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rentableArea?: number;
}

export class UpdatePropertyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  companyEntity?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  validFrom?: string;

  @IsOptional()
  @IsString()
  validTo?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalArea?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rentableArea?: number;
}

export interface PropertyResponse {
  id: string;
  name: string;
  companyEntity: string;
  companyId?: string;
  validFrom: string;
  validTo: string;
  totalArea?: number;
  rentableArea?: number;
  isActive: boolean;
  _createdAt?: string;
}

// ========== 合同阶段 ==========

export class ContractStage {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  startDate: string;

  @IsString()
  endDate: string;

  @IsNumber()
  @Min(0)
  monthlyRent: number;

  @IsNumber()
  @Min(0)
  monthlyPropertyFee: number;

  @IsOptional()
  @IsNumber()
  stageOrder?: number;

  @IsOptional()
  @IsString()
  stageType?: string;
}

// ========== 创建合同 DTO ==========

export class CreateContractDto {
  @IsString()
  @IsNotEmpty()
  contractNo: string;

  @IsIn(['new_contract', 'supplement'])
  contractType: 'new_contract' | 'supplement';

  @IsOptional()
  @IsString()
  parentContractId?: string;

  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsString()
  @IsNotEmpty()
  landlord: string;

  @IsString()
  @IsNotEmpty()
  tenant: string;

  @IsString()
  startDate: string;

  @IsString()
  endDate: string;

  @IsBoolean()
  hasUtilities: boolean;

  @IsIn(['monthly', 'quarterly'])
  paymentMethod: 'monthly' | 'quarterly';

  @IsNumber()
  @Min(0)
  advancePaymentDays: number;

  @IsOptional()
  @IsString()
  signDate?: string;

  @IsOptional()
  @IsString()
  leaseAddress?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leaseArea?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractStage)
  stages: ContractStage[];
}

// ========== 更新合同 DTO ==========

export class UpdateContractDto {
  @IsOptional()
  @IsString()
  contractNo?: string;

  @IsOptional()
  @IsIn(['new_contract', 'supplement'])
  contractType?: 'new_contract' | 'supplement';

  @IsOptional()
  @IsString()
  parentContractId?: string;

  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsOptional()
  @IsString()
  landlord?: string;

  @IsOptional()
  @IsString()
  tenant?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  hasUtilities?: boolean;

  @IsOptional()
  @IsIn(['monthly', 'quarterly'])
  paymentMethod?: 'monthly' | 'quarterly';

  @IsOptional()
  @IsNumber()
  @Min(0)
  advancePaymentDays?: number;

  @IsOptional()
  @IsString()
  signDate?: string;

  @IsOptional()
  @IsString()
  leaseAddress?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  leaseArea?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractStage)
  stages?: ContractStage[];

  @IsOptional()
  @IsIn(['draft', 'rejected'])
  status?: 'draft' | 'rejected';
}

// ========== 审核合同 DTO ==========

export class ReviewContractDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  remark?: string;
}

// ========== 合同响应 ==========

export interface ContractResponse {
  id: string;
  contractNo: string;
  contractType: 'new_contract' | 'supplement';
  parentContractId?: string;
  propertyId?: string;
  propertyName?: string;
  landlord: string;
  tenant: string;
  startDate: string;
  endDate: string;
  hasUtilities: boolean;
  paymentMethod: 'monthly' | 'quarterly';
  advancePaymentDays: number;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'terminated';
  terminationDate?: string;
  signDate?: string;
  leaseAddress?: string;
  leaseArea?: number;
  reviewRemark?: string;
  reviewer?: string;
  creator?: string;
  stages: ContractStage[];
  amendments?: ContractAmendmentResponse[];
  _createdAt?: string;
  _updatedAt?: string;
}

// ========== 合同列表查询参数 ==========

export interface ContractListParams {
  status?: string;
  tenant?: string;
  page?: number;
  pageSize?: number;
}

// ========== 合同列表响应 ==========

export interface ContractListResponse {
  items: ContractResponse[];
  total: number;
  page: number;
  pageSize: number;
}

// ========== 合同变更分段阶段 ==========

export interface ContractAmendmentStage {
  id?: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  monthlyPropertyFee: number;
  stageOrder: number;
  stageType?: string;
  period?: string;
}

// ========== 变更期间明细（前端展示用） ==========

export interface AmendmentPeriodItem {
  period: string;
  stageStartDate: string;
  stageEndDate: string;
  originalRent: number;
  originalPropertyFee: number;
}

// ========== 变更分段按期间输入 ==========

export class AmendmentStageInput {
  @IsString()
  period: string;

  @IsString()
  stageStartDate: string;

  @IsString()
  stageEndDate: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyRent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyPropertyFee?: number;
}

// ========== 创建合同变更 DTO ==========

export class CreateContractAmendmentDto {
  @IsString()
  @IsNotEmpty()
  contractId: string;

  @IsOptional()
  @IsString()
  amendmentNo?: string;

  @IsString()
  changeStartDate: string;

  @IsString()
  changeEndDate: string;

  @IsString()
  @IsNotEmpty()
  changeType: string;

  @IsOptional()
  @IsString()
  signDate?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AmendmentStageInput)
  stages: AmendmentStageInput[];
}

// ========== 合同变更响应 ==========

export interface ContractAmendmentResponse {
  id: string;
  contractId: string;
  amendmentNo?: string;
  changeStartDate: string;
  changeEndDate: string;
  changeType: string;
  status: 'pending' | 'approved' | 'rejected';
  signDate?: string;
  stages: ContractAmendmentStage[];
  reviewRemark?: string;
  reviewer?: string;
  _createdAt?: string;
}

export class ReviewAmendmentDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  remark?: string;
}

// ========== 终止申请 ==========

export interface TerminationRequest {
  id: string;
  contractId: string;
  contractNo: string;
  tenant: string;
  terminationDate: string;
  amendmentNo?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectReason?: string;
  reviewRemark?: string;
  reviewedBy?: string;
  creator?: string;
  _createdAt?: string;
}

export class CreateTerminationDto {
  @IsString()
  @IsNotEmpty()
  contractId: string;

  @IsString()
  terminationDate: string;

  @IsString()
  @IsNotEmpty()
  amendmentNo: string;
}

export interface TerminationCheckPeriodResponse {
  rentPaid: boolean;
  rentPaidError: boolean;
  isPeriodEnd: boolean;
  ledgerStatus: string;
  proratedRent: number;
  proratedPropertyFee: number;
  period: string;
  daysInMonth: number;
  daysToCharge: number;
  ledgerRecordCount: number;
  targetLedgerId?: string;
  originalRent: number;
  originalPropertyFee: number;
  isStageEnd?: boolean;
  rentReceived: number;
  propertyFeeReceived: number;
  amountError?: boolean;
  amountErrorMessage?: string;
}

export class ReviewTerminationDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  remark?: string;
}

export interface TerminationListParams {
  status?: string;
}

export interface TerminationListResponse {
  items: TerminationRequest[];
  total: number;
}

export interface TerminationProratedPreview {
  rentPaid: boolean;
  proratedRent: number;
  proratedPropertyFee: number;
  period: string;
  daysInMonth: number;
  daysToCharge: number;
  originalRent: number;
  originalPropertyFee: number;
}

// ========== 台账 ==========

export interface LedgerItem {
  id: string;
  contractId: string;
  contractNo: string;
  propertyName?: string;
  landlord?: string;
  tenant: string;
  /** 租户编码（按租户名称匹配 customers 表带出，匹配不到为空） */
  customerCode?: string;
  /** 租赁面积（按 contractId 从合同表带出，合同未填写时为空） */
  leaseArea?: number;
  period: string;
  stageStartDate: string;
  stageEndDate: string;
  monthlyRent: number;
  monthlyPropertyFee: number;
  paymentMethod: string;
  dueDate: string;
  rentReceived: number;
  propertyFeeReceived: number;
  receiveDate?: string;
  status: 'unpaid' | 'partial' | 'paid' | 'no_payment_required' | 'terminated';
  hasUtilities: boolean;
  amendmentNo?: string;
  amendmentRent?: number;
  amendmentPropertyFee?: number;
  quarter?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LedgerListQuery {
  contractId?: string;
  contractNo?: string;
  period?: string;
  status?: string[];
  tenant?: string;
  propertyName?: string;
  overdue?: boolean;
  page?: number;
  pageSize?: number;
}

export interface LedgerListResp {
  items: LedgerItem[];
  total: number;
  page: number;
  pageSize: number;
  /** 服务端全量聚合合计（按当前筛选条件统计） */
  totals?: {
    monthlyRent: number;
    monthlyPropertyFee: number;
    amendmentRent: number;
    amendmentPropertyFee: number;
    receivableRent: number;
    receivablePropertyFee: number;
    rentReceived: number;
    propertyFeeReceived: number;
  };
}

// ========== 列配置 ==========

export interface ColumnConfigResp {
  hiddenColumns: string[];
}

export class SaveColumnConfigDto {
  @IsArray()
  @IsString({ each: true })
  hiddenColumns: string[];
}

// ========== 水电费 ==========

export interface UtilityRecord {
  id: string;
  contractId: string;
  contractNo: string;
  tenant: string;
  /** 租户编码（按租户名称匹配 customers 表带出，匹配不到为空） */
  customerCode?: string;
  period: string;
  electricityUsage: number;
  electricityPrice: number;
  waterUsage: number;
  waterPrice: number;
  totalElectricityFee: number;
  totalWaterFee: number;
  electricityReceived: number;
  waterReceived: number;
  recordDate: string;
  recordedBy: string;
  receiveDate?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class CreateUtilityDto {
  @IsString()
  @IsNotEmpty()
  contractId: string;

  @IsString()
  @IsNotEmpty()
  period: string;

  @IsNumber()
  @Min(0)
  electricityUsage: number;

  @IsNumber()
  @Min(0)
  electricityPrice: number;

  @IsNumber()
  @Min(0)
  waterUsage: number;

  @IsNumber()
  @Min(0)
  waterPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalElectricityFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalWaterFee?: number;

  @IsString()
  recordDate: string;
}

export class UpdateUtilityDto {
  @IsNumber()
  @Min(0)
  electricityUsage: number;

  @IsNumber()
  @Min(0)
  electricityPrice: number;

  @IsNumber()
  @Min(0)
  waterUsage: number;

  @IsNumber()
  @Min(0)
  waterPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalElectricityFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalWaterFee?: number;
}

export interface UtilityListQuery {
  contractId?: string;
  period?: string;
  page?: number;
  pageSize?: number;
}

export interface UtilityListResp {
  items: UtilityRecord[];
  total: number;
  page: number;
  pageSize: number;
}

// ========== 水电费租户 ==========

export interface UtilityTenant {
  id: string;
  tenant: string;
  propertyName?: string;
  isActive: boolean;
}

// ========== 逾期配置 ==========

export interface OverdueConfig {
  id: string;
  configType: 'rent' | 'utility' | 'utility_unregistered';
  followerIds: string[];
  reminderEnabled: boolean;
  reminderCron: string;
  reminderDay?: number;
  createdAt?: string;
  updatedAt?: string;
}

export class UpdateOverdueConfigDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  followerIds?: string[];

  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @IsOptional()
  @IsString()
  reminderCron?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  reminderDay?: number;
}

export interface RentOverdueItem {
  contractNo: string;
  period: string;
  receivableRent: number;
  receivablePropertyFee: number;
  unpaidRent: number;
  unpaidPropertyFee: number;
  dueDate: string;
  overdueDays: number;
  tenant: string;
  contractId: string;
}

export interface UtilityOverdueItem {
  contractNo: string;
  propertyName?: string;
  period: string;
  totalElectricityFee: number;
  totalWaterFee: number;
  unpaidElectricity: number;
  unpaidWater: number;
  dueDate: string;
  overdueDays: number;
  tenant: string;
  contractId: string;
}

export interface UtilityUnregisteredGroup {
  contractId?: string;
  tenant: string;
  propertyName?: string;
  unregisteredPeriods: string;
  unregisteredCount: number;
}

export interface RentOverdueResp {
  data: RentOverdueItem[];
  followerIds: string[];
}

export interface UtilityOverdueResp {
  data: UtilityOverdueItem[];
  followerIds: string[];
}

export interface UtilityUnregisteredResp {
  data: UtilityUnregisteredGroup[];
  followerIds: string[];
}

export class SendReminderDto {
  @IsIn(['rent', 'utility', 'utility_unregistered', 'all'])
  type: 'rent' | 'utility' | 'utility_unregistered' | 'all';
}

export interface SendReminderResponse {
  success: boolean;
  count: number;
}

// ========== 客户管理 ==========

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  customerCode: string;

  @IsString()
  @IsNotEmpty()
  companyName: string;

  @IsOptional()
  @IsString()
  creditCode?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  tenantType?: string;

  @IsOptional()
  @IsString()
  bankName?: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  customerCode?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  creditCode?: string;

  @IsOptional()
  @IsString()
  bankAccount?: string;

  @IsOptional()
  @IsString()
  tenantType?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsBoolean()
  isFrozen?: boolean;
}

export interface CustomerResponse {
  id: string;
  customerCode: string;
  companyName: string;
  creditCode?: string;
  bankAccount?: string;
  tenantType?: string;
  bankName?: string;
  isFrozen: boolean;
  _createdAt?: string;
}

export interface CustomerListResponse {
  items: CustomerResponse[];
  total: number;
}


// ========== ���ݿ��� ==========

/** ���ݿ��� - ��������ſ���ѯ��������� + �·ݣ� */
export interface PropertyRentSummaryQuery {
  year: number;
  month: number;
}

/** ���ݿ��� - ��������ſ��������� */
export interface PropertyRentSummaryItem {
  propertyId: string;
  propertyName: string;
  /** �ɳ��������������Ϣ�� rentable_area�� */
  rentableArea: number | null;
  /** �ѳ����������ĩ�ھ����O�� */
  rentedArea: number;
  /** δ������� = �ɳ������ - �ѳ������ */
  vacantArea: number | null;
  /** ��Ȩƽ�������� = ���ۼƳ������ / ��ѡ�·��� / �ɳ��������0~1���ɳ������ȱʧʱΪ null�� */
  avgRentRate: number | null;
  /** ��ĩ������ = ��ĩ�ѳ������ / �ɳ��������0~1�� */
  endRentRate: number | null;
  /** ���ۼ���𣨵��� 1 �� ~ ��ѡ�·�Ӧ�����ϼƣ� */
  yearRent: number;
  /** ���ۼ���ҵ�ѣ����� 1 �� ~ ��ѡ�·�Ӧ����ҵ�Ѻϼƣ� */
  yearPropertyFee: number;
}

/** ���ݿ��� - ��������ſ���Ӧ */
export interface PropertyRentSummaryResp {
  items: PropertyRentSummaryItem[];
  year: number;
  month: number;
}

// ========== 收款报表 ==========

/** 收款类型：rent 租金 / property_fee 物业费 / water 水费 / electricity 电费 */
export type ReceiveType = 'rent' | 'property_fee' | 'water' | 'electricity';

/** 收款来源类型 */
export type ReceiveRefType = 'ledger' | 'utility';

/** 收款报表 - 行记录 */
export interface ReceiveRecord {
  id: string;
  propertyName?: string;
  contractId: string;
  contractNo: string;
  tenant: string;
  customerCode?: string;
  receiveType: ReceiveType;
  receiveDate: string;
  period: string;
  unit: string;
  unitQty: number;
  amount: number;
  invoiceNo?: string;
  refId?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 收款报表 - 单行入参（同源一次提交可含多行） */
export class CreateReceiveItemDto {
  @IsIn(['rent', 'property_fee', 'water', 'electricity'])
  @Type(() => String)
  receiveType: ReceiveType;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  receiveDate: string;

  @IsString()
  @IsNotEmpty()
  period: string;

  @IsOptional()
  @IsString()
  invoiceNo?: string;
}

/** 收款报表 - 创建入参 */
export class CreateReceiveDto {
  @IsIn(['ledger', 'utility'])
  @Type(() => String)
  refType: ReceiveRefType;

  @IsString()
  @IsNotEmpty()
  refId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateReceiveItemDto)
  items: CreateReceiveItemDto[];
}

/** 收款报表 - 列表查询参数 */
export interface ReceiveListQuery {
  propertyName?: string;
  /** 合同编号模糊关键词 */
  contractNo?: string;
  /** 租户编码/租户名称模糊关键词 */
  keyword?: string;
  receiveType?: ReceiveType;
  /** 收款日期起（含） */
  receiveStart?: string;
  /** 收款日期止（含） */
  receiveEnd?: string;
  /** 款项所属期（YYYY-MM） */
  period?: string;
  /** 合同 ID 精确匹配（与 period 组合即「期级」取数，收款弹窗用它列该期全部流水） */
  contractId?: string;
  /** 来源记录 ID（台账行/水电费记录） */
  refId?: string;
  page?: number;
  pageSize?: number;
}

/** 收款报表 - 列表响应 */
export interface ReceiveListResp {
  items: ReceiveRecord[];
  total: number;
  page: number;
  pageSize: number;
  /** 服务端全量聚合合计（按当前筛选条件统计） */
  totals?: {
    amount: number;
    unitQty: number;
  };
}

/** 收款报表 - 发票编号更新入参 */
export class UpdateReceiveInvoiceDto {
  @IsString()
  @IsNotEmpty()
  invoiceNo: string;
}

/**
 * 台账未收齐期间（收款弹窗所属期下拉 + 期级余额）
 * 口径为「合同 + 所属期」：应收 = 该期全部未终止台账行之和，已收 = receive_records 该期聚合。
 * 同月多行（月中阶段拆分 / 变更生效）时不能按行取数，否则分子分母不同维度。
 */
export interface LedgerUnpaidPeriodItem {
  period: string;
  receivableRent: number;
  receivablePropertyFee: number;
  rentReceived: number;
  propertyFeeReceived: number;
}
