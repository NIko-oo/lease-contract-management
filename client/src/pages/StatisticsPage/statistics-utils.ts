export interface IContractSummary {
  id: string;
  contractNo: string;
  tenant: string;
  startDate: string;
  endDate: string;
  totalRent: number;
  totalPropertyFee: number;
  totalAmount: number;
  status: 'active' | 'terminated' | 'expiring' | 'expired';
  monthCount: number;
}

export const statusLabelMap: Record<IContractSummary['status'], string> = {
  active: '正常履行',
  terminated: '已终止',
  expiring: '即将到期',
  expired: '已到期',
};

export const getMonthDiff = (startDate: string, endDate: string): number => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
};

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const exportCsv = (data: IContractSummary[]) => {
  const headers = ['合同编号', '承租方', '合同开始日期', '合同结束日期', '租期月数', '租金总金额', '物业费总金额', '合同总金额', '状态'];
  const rows = data.map(item => [
    item.contractNo,
    item.tenant,
    formatDate(item.startDate),
    formatDate(item.endDate),
    item.monthCount,
    item.totalRent.toFixed(2),
    item.totalPropertyFee.toFixed(2),
    item.totalAmount.toFixed(2),
    statusLabelMap[item.status],
  ]);
  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `合同汇总统计_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

import * as XLSX from 'xlsx';

export const exportExcel = (data: IContractSummary[]) => {
  const headers = ['合同编号', '承租方', '合同开始日期', '合同结束日期', '租期月数', '租金总金额', '物业费总金额', '合同总金额', '状态'];
  const rows = data.map(item => [
    item.contractNo,
    item.tenant,
    formatDate(item.startDate),
    formatDate(item.endDate),
    item.monthCount,
    item.totalRent.toFixed(2),
    item.totalPropertyFee.toFixed(2),
    item.totalAmount.toFixed(2),
    statusLabelMap[item.status],
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '合同汇总统计');
  XLSX.writeFile(wb, `合同汇总统计_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportImpactExcel = (data: Array<Record<string, unknown>>) => {
  const statusMap: Record<string, string> = {
    unpaid: '未收',
    partial: '部分收款',
    paid: '已收齐',
    no_payment_required: '无需收款',
    terminated: '已终止',
  };
  const headers = [
    '合同编号', '房产名称', '出租方', '承租方', '所属期',
    '阶段开始日期', '阶段结束日期',
    '合同租金', '合同物业费',
    '变更合同编号', '变更合同租金', '变更合同物业费',
    '收款状态', '应收租金', '应收物业费',
    '合同类型', '租金对利润的影响', '物业费对利润的影响',
    '对利润影响金额', '合同签署日期',
  ];
  const rows = data.map((item) => [
    item.contractNo || '',
    item.propertyName || '',
    item.landlord || '',
    item.tenant || '',
    item.period || '',
    item.stageStartDate || '',
    item.stageEndDate || '',
    (Number(item.monthlyRent) || 0).toFixed(2),
    (Number(item.monthlyPropertyFee) || 0).toFixed(2),
    item.amendmentNo || '',
    item.amendmentRent ? (Number(item.amendmentRent) || 0).toFixed(2) : '',
    item.amendmentPropertyFee ? (Number(item.amendmentPropertyFee) || 0).toFixed(2) : '',
    statusMap[String(item.status)] || String(item.status) || '',
    (Number(item.receivableRent) || 0).toFixed(2),
    (Number(item.receivableFee) || 0).toFixed(2),
    item.contractTypeLabel || '',
    (Number(item.rentProfitImpact) || 0).toFixed(2),
    (Number(item.feeProfitImpact) || 0).toFixed(2),
    (Number(item.profitImpact) || 0).toFixed(2),
    item.signDate || '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 10 },
    { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 },
    { wch: 16 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '新增合同对年收入影响');
  XLSX.writeFile(wb, `新增合同对年收入影响_${new Date().toISOString().split('T')[0]}.xlsx`);
};

