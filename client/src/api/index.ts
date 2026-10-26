import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  CreateContractDto,
  UpdateContractDto,
  ReviewContractDto,
  ContractResponse,
  ContractListResponse,
  ContractListParams,
  TerminationRequest,
  CreateTerminationDto,
  ReviewTerminationDto,
  TerminationListParams,
  TerminationCheckPeriodResponse,
  LedgerListQuery,
  LedgerListResp,
  ColumnConfigResp,
  SaveColumnConfigDto,
  UtilityRecord,
  CreateUtilityDto,
  UpdateUtilityDto,
  UtilityListQuery,
  UtilityListResp,
  UtilityTenant,
  CreatePropertyDto,
  UpdatePropertyDto,
  PropertyResponse,
  CompanyEntityResponse,
  CreateCompanyDto,
  UpdateCompanyDto,
  CreateContractAmendmentDto,
  ContractAmendmentResponse,
  ReviewAmendmentDto,
  OverdueConfig,
  UpdateOverdueConfigDto,
  RentOverdueResp,
  UtilityOverdueResp,
  UtilityUnregisteredResp,
  SendReminderDto,
  SendReminderResponse,
  AmendmentPeriodItem,
  CreateCustomerDto,
  UpdateCustomerDto,
  CustomerResponse,
  PropertyRentSummaryResp,
  LedgerUnpaidPeriodItem,
  ReceiveRecord,
  CreateReceiveDto,
  ReceiveListQuery,
  ReceiveListResp,
  UpdateReceiveInvoiceDto,
} from '@shared/api.interface';

// ========== Contracts ==========

export const contractApi = {
  getList: (params?: ContractListParams) =>
    axiosForBackend.get<ContractListResponse>(
      '/api/contracts',
      { params }
    ),
  getDetail: (id: string) =>
    axiosForBackend.get<ContractResponse>(
      `/api/contracts/${id}`
    ),
  create: (data: CreateContractDto) =>
    axiosForBackend.post<ContractResponse>(
      '/api/contracts',
      data
    ),
  update: (id: string, data: UpdateContractDto) =>
    axiosForBackend.put<ContractResponse>(
      `/api/contracts/${id}`,
      data
    ),
  delete: (id: string) =>
    axiosForBackend.delete(`/api/contracts/${id}`),
  submit: (id: string) =>
    axiosForBackend.patch<ContractResponse>(
      `/api/contracts/${id}/submit`
    ),
  review: (id: string, data: ReviewContractDto) =>
    axiosForBackend.patch<ContractResponse>(
      `/api/contracts/${id}/review`,
      data
    ),
  amend: (data: CreateContractAmendmentDto) =>
    axiosForBackend.post<{ id: string }>('/api/contracts/amend', data),
  getLastPaidPeriod: (id: string) =>
    axiosForBackend.get<{ period: string | null }>(`/api/contracts/${id}/last-paid-period`),
  getAmendmentPeriods: (id: string, startDate: string, endDate: string) =>
    axiosForBackend.get<AmendmentPeriodItem[]>(
      `/api/contracts/${id}/amendment-periods`,
      { params: { startDate, endDate } },
    ),
  getAmendments: (id: string) =>
    axiosForBackend.get<ContractAmendmentResponse[]>(`/api/contracts/${id}/amendments`),
  reviewAmendment: (amendmentId: string, data: ReviewAmendmentDto) =>
    axiosForBackend.patch<{ success: boolean }>(
      `/api/contracts/amendments/${amendmentId}/review`,
      data,
    ),
};

// ========== Ledger ==========

export const ledgerApi = {
  getList: (params?: LedgerListQuery) =>
    axiosForBackend.get<LedgerListResp>(
      '/api/ledger',
      { params }
    ),
  getColumnConfig: () =>
    axiosForBackend.get<ColumnConfigResp>('/api/ledger/column-config'),
  saveColumnConfig: (data: SaveColumnConfigDto) =>
    axiosForBackend.put<ColumnConfigResp>('/api/ledger/column-config', data),
  getUnpaidPeriods: (contractId?: string) =>
    axiosForBackend.get<LedgerUnpaidPeriodItem[]>('/api/ledger/unpaid-periods', {
      params: contractId ? { contractId } : undefined,
    }),
};

// ========== Receipts（收款报表） ==========

export const receiptApi = {
  getList: (params?: ReceiveListQuery) =>
    axiosForBackend.get<ReceiveListResp>(
      '/api/receipts',
      { params }
    ),
  create: (data: CreateReceiveDto) =>
    axiosForBackend.post<ReceiveRecord[]>(
      '/api/receipts',
      data
    ),
  remove: (id: string) =>
    axiosForBackend.delete<{ success: boolean }>(
      `/api/receipts/${id}`
    ),
  updateInvoice: (id: string, data: UpdateReceiveInvoiceDto) =>
    axiosForBackend.patch<ReceiveRecord>(
      `/api/receipts/${id}/invoice`,
      data
    ),
};

// ========== Utilities ==========

export const utilityApi = {
  getList: (params?: UtilityListQuery) =>
    axiosForBackend.get<UtilityListResp>(
      '/api/utilities',
      { params }
    ),
  create: (data: CreateUtilityDto) =>
    axiosForBackend.post<UtilityRecord>(
      '/api/utilities',
      data
    ),
  update: (id: string, data: UpdateUtilityDto) =>
    axiosForBackend.put<UtilityRecord>(
      `/api/utilities/${id}`,
      data
    ),
  delete: (id: string) =>
    axiosForBackend.delete<{ success: boolean }>(
      `/api/utilities/${id}`
    ),
  getTenants: () =>
    axiosForBackend.get<UtilityTenant[]>(
      '/api/utilities/tenants'
    ),
};

// ========== Terminations ==========

export const terminationApi = {
  getList: (params?: TerminationListParams) =>
    axiosForBackend.get<{ items: TerminationRequest[]; total: number }>(
      '/api/terminations',
      { params }
    ),
  create: (data: CreateTerminationDto) =>
    axiosForBackend.post<TerminationRequest>(
      '/api/terminations',
      data
    ),
  review: (id: string, data: ReviewTerminationDto) =>
    axiosForBackend.post<TerminationRequest>(
      `/api/terminations/${id}/review`,
      data
    ),
  withdraw: (id: string) =>
    axiosForBackend.post<TerminationRequest>(
      `/api/terminations/${id}/withdraw`
    ),
  checkPeriod: (contractId: string, terminationDate: string) =>
    axiosForBackend.get<TerminationCheckPeriodResponse>(
      '/api/terminations/check-period',
      { params: { contractId, terminationDate } }
    ),
};

// ========== Properties ==========

export const propertyApi = {
  getList: (activeOnly = false) =>
    axiosForBackend.get<PropertyResponse[]>('/api/properties', {
      params: activeOnly ? { activeOnly: 'true' } : undefined,
    }),
  getDetail: (id: string) =>
    axiosForBackend.get<PropertyResponse>(`/api/properties/${id}`),
  create: (data: CreatePropertyDto) =>
    axiosForBackend.post<{ id: string }>('/api/properties', data),
  update: (id: string, data: UpdatePropertyDto) =>
    axiosForBackend.put<{ id: string }>(`/api/properties/${id}`, data),
  delete: (id: string) =>
    axiosForBackend.delete(`/api/properties/${id}`),
};

// ========== Companies ==========

export const companyApi = {
  getList: () =>
    axiosForBackend.get<CompanyEntityResponse[]>('/api/companies'),
  getDetail: (id: string) =>
    axiosForBackend.get<CompanyEntityResponse>(`/api/companies/${id}`),
  create: (data: CreateCompanyDto) =>
    axiosForBackend.post<{ id: string }>('/api/companies', data),
  update: (id: string, data: UpdateCompanyDto) =>
    axiosForBackend.put<{ id: string }>(`/api/companies/${id}`, data),
  delete: (id: string) =>
    axiosForBackend.delete(`/api/companies/${id}`),
};

// ========== Overdue ==========

export const overdueApi = {
  getConfig: () =>
    axiosForBackend.get<OverdueConfig[]>('/api/overdue/config'),
  updateConfig: (type: string, data: UpdateOverdueConfigDto) =>
    axiosForBackend.put<OverdueConfig>(`/api/overdue/config/${type}`, data),
  getRentOverdue: () =>
    axiosForBackend.get<RentOverdueResp>('/api/overdue/rent-overdue'),
  getUtilityOverdue: () =>
    axiosForBackend.get<UtilityOverdueResp>('/api/overdue/utility-overdue'),
  getUtilityUnregistered: () =>
    axiosForBackend.get<UtilityUnregisteredResp>('/api/overdue/utility-unregistered'),
  sendReminder: (data: SendReminderDto) =>
    axiosForBackend.post<SendReminderResponse>('/api/overdue/send-reminder', data),
  sendAllReminder: () =>
    axiosForBackend.post<SendReminderResponse>('/api/overdue/send-all-reminder'),
};

// ========== Permissions ==========

export interface AuthzPermission {
  id: string;
  action: string;
  subject: string;
  description: string;
}

export interface AuthzRolePermission {
  id: string;
  roleKey: string;
  permissionId: string;
}

export interface BatchUpdateRoleMappingsDto {
  roleKey: string;
  add: string[];
  remove: string[];
}

export const permissionApi = {
  listPermissions: () =>
    axiosForBackend.get<AuthzPermission[]>('/api/permissions'),
  listRoleMappings: () =>
    axiosForBackend.get<AuthzRolePermission[]>('/api/permissions/role-mappings'),
  batchUpdateRoleMappings: (data: BatchUpdateRoleMappingsDto) =>
    axiosForBackend.post<{ success: boolean }>(
      '/api/permissions/role-mappings/batch',
      data,
    ),
};

// ========== Customers ==========

export const customerApi = {
  getList: (params?: { search?: string; frozen?: string }) =>
    axiosForBackend<CustomerResponse[]>(
      '/api/customers',
      { params },
    ),
  getDetail: (id: string) =>
    axiosForBackend<CustomerResponse>(`/api/customers/${id}`),
  create: (dto: CreateCustomerDto) =>
    axiosForBackend<{ id: string }>(
      '/api/customers',
      { method: 'POST', data: dto },
    ),
  update: (id: string, dto: UpdateCustomerDto) =>
    axiosForBackend<CustomerResponse>(
      `/api/customers/${id}`,
      { method: 'PUT', data: dto },
    ),
  freeze: (id: string, isFrozen: boolean) =>
    axiosForBackend<CustomerResponse>(
      `/api/customers/${id}/freeze`,
      { method: 'PATCH', data: { isFrozen } },
    ),
  search: (q?: string) =>
    axiosForBackend<CustomerResponse[]>(
      '/api/customers/search',
      { params: { q } },
    ),
};

// ========== Dashboard（数据看板） ==========

export const dashboardApi = {
  getPropertyRentSummary: (year: number, month: number) =>
    axiosForBackend.get<PropertyRentSummaryResp>(
      '/api/dashboard/property-rent-summary',
      { params: { year, month } },
    ),
};

