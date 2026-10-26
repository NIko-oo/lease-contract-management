import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Table } from '@lark-apaas/client-toolkit/antd-table';
import { SearchIcon, FileDownIcon, DollarSignIcon, ZapIcon, ChevronDownIcon, CheckIcon, SettingsIcon, RotateCcwIcon, XIcon, Trash2Icon } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { contractApi, ledgerApi, receiptApi } from '@/api';
import { showConfirm } from '@lark-apaas/client-toolkit';
import { CanPoint } from '@/components/PermissionGate';
import ResizableTitle from '@/components/ResizableTitle';
import type { LedgerUnpaidPeriodItem, ReceiveRecord } from '@shared/api.interface';

const STATUS_OPTIONS = [
  { value: 'unpaid', label: '未收款' },
  { value: 'partial', label: '部分收款' },
  { value: 'paid', label: '已收齐' },
  { value: 'no_payment_required', label: '无需收款' },
  { value: 'terminated', label: '已终止' },
] as const;

const OVERDUE_OPTIONS = [
  { value: 'true', label: '逾期' },
  { value: 'false', label: '未逾期' },
] as const;

interface ReceiveRow {
  key: string;
  receiveType: 'rent' | 'property_fee';
  amount: string;
  receiveDate: string;
  period: string;
}

const RECEIVE_TYPE_LABEL: Record<ReceiveRow['receiveType'], string> = {
  rent: '租金',
  property_fee: '物业费',
};

interface ILedgerItem {
  id: string;
  contractId: string;
  contractNo: string;
  propertyName?: string;
  landlord?: string;
  tenant: string;
  customerCode?: string;
  leaseArea?: number;
  period: string; // 年月格式 2026-05
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
  hasUtilities?: boolean;
  quarter?: string;
  amendmentNo?: string;
  amendmentRent?: number;
  amendmentPropertyFee?: number;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'paid':
      return <Badge className="bg-success/10 text-success border border-success/20">已收齐</Badge>;
    case 'partial':
      return <Badge className="bg-warning/10 text-warning border border-warning/20">部分收款</Badge>;
    case 'terminated':
      return <Badge className="bg-destructive/10 text-destructive border border-destructive/20">已终止</Badge>;
    case 'no_payment_required':
      return <Badge className="bg-accent text-accent-foreground border border-border">无需收款</Badge>;
    default:
      return <Badge className="bg-muted text-muted-foreground">未收款</Badge>;
  }
};

const getPaymentMethodText = (method: string) => {
  const methods: Record<string, string> = {
    monthly: '月付',
    quarterly: '季付',
  };
  return methods[method] || method;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/** 金额按分舍入：应收−已收直接用浮点减法会漏出 14.539999999999964 这类尾差 */
const round2 = (value: number): number => Math.round(value * 100) / 100;

const DEFAULT_WIDTHS: Record<string, number> = {
  contractNo: 120,
  propertyName: 160,
  landlord: 220,
  tenant: 260,
  leaseArea: 100,
  period: 90,
  quarter: 90,
  periodRange: 220,
  monthlyRent: 130,
  monthlyPropertyFee: 130,
  amendmentNo: 140,
  amendmentRent: 140,
  amendmentPropertyFee: 140,
  receivableRent: 130,
  receivablePropertyFee: 130,
  paymentMethod: 80,
  dueDate: 120,
  overdueDays: 90,
  rentReceived: 130,
  propertyFeeReceived: 130,
  receiveDate: 120,
  status: 100,
  action: 160,
};

const COLUMN_KEYS = [
  'contractNo', 'propertyName', 'landlord', 'tenant', 'leaseArea', 'period', 'quarter',
  'periodRange', 'monthlyRent', 'monthlyPropertyFee', 'amendmentNo',
  'amendmentRent', 'amendmentPropertyFee', 'receivableRent', 'receivablePropertyFee',
  'paymentMethod', 'dueDate', 'overdueDays', 'rentReceived', 'propertyFeeReceived',
  'receiveDate', 'status', 'action',
];

const COLUMN_CONFIGS = [
  { key: 'contractNo', title: '合同编号' },
  { key: 'propertyName', title: '房产名称' },
  { key: 'landlord', title: '出租方' },
  { key: 'tenant', title: '承租方' },
  { key: 'leaseArea', title: '租赁面积' },
  { key: 'period', title: '所属期' },
  { key: 'quarter', title: '季度' },
  { key: 'periodRange', title: '阶段起止日期' },
  { key: 'monthlyRent', title: '合同租金' },
  { key: 'monthlyPropertyFee', title: '合同物业费' },
  { key: 'amendmentNo', title: '变更合同编号' },
  { key: 'amendmentRent', title: '变更合同租金' },
  { key: 'amendmentPropertyFee', title: '变更合同物业费' },
  { key: 'receivableRent', title: '应收租金' },
  { key: 'receivablePropertyFee', title: '应收物业费' },
  { key: 'paymentMethod', title: '支付方式' },
  { key: 'dueDate', title: '最后缴纳期限' },
  { key: 'overdueDays', title: '逾期天数' },
  { key: 'rentReceived', title: '已收租金' },
  { key: 'propertyFeeReceived', title: '已收物业费' },
  { key: 'receiveDate', title: '收款日期' },
  { key: 'status', title: '收款状态' },
  { key: 'action', title: '操作' },
];

const LedgerPage: React.FC = () => {
  const navigate = useNavigate();
  const currentProfile = useCurrentUserProfile();

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [isColumnSettingsOpen, setIsColumnSettingsOpen] = useState(false);
  const [pendingHiddenColumns, setPendingHiddenColumns] = useState<string[]>([]);

  const getColumnWidth = useCallback((key: string) => {
    return columnWidths[key] ?? DEFAULT_WIDTHS[key] ?? 120;
  }, [columnWidths]);

  const handleResize = useCallback((key: string) => (_: React.SyntheticEvent, data: { size: { width: number } }) => {
    setColumnWidths((prev) => ({ ...prev, [key]: data.size.width }));
  }, []);

  const calcAutoFitWidth = useCallback((colKey: string) => {
    const colIndex = COLUMN_KEYS.indexOf(colKey);
    if (colIndex === -1) return;
    const tableEl = document.querySelector('.ant-table-body');
    if (!tableEl) return;
    const cells = tableEl.querySelectorAll(`tr td:nth-child(${colIndex + 1})`);
    if (cells.length === 0) return;
    let maxWidth = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = '14px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    cells.forEach((cell) => {
      const text = (cell as HTMLElement).innerText || '';
      const metrics = ctx.measureText(text);
      maxWidth = Math.max(maxWidth, metrics.width);
    });
    canvas.remove();
    // 纳入列头文字，避免列宽不足导致列头被截断
    const headerCells = document.querySelectorAll('.ant-table-thead th');
    const headerText = headerCells[colIndex] ? (headerCells[colIndex] as HTMLElement).innerText : '';
    if (headerText) {
      maxWidth = Math.max(maxWidth, ctx.measureText(headerText).width);
    }
    const newWidth = Math.max(60, Math.ceil(maxWidth) + 36);
    setColumnWidths((prev) => ({ ...prev, [colKey]: newWidth }));
  }, []);


  const [searchContractNo, setSearchContractNo] = useState('');
  const [searchTenant, setSearchTenant] = useState('');
  const [searchPropertyName, setSearchPropertyName] = useState('');
  const [searchPeriod, setSearchPeriod] = useState('');
  const [searchStatus, setSearchStatus] = useState<string[]>([]);
  const [searchOverdue, setSearchOverdue] = useState<string[]>([]);
  const [ledgerData, setLedgerData] = useState<ILedgerItem[]>([]);
  const [total, setTotal] = useState(0);
  /** 服务端全量聚合合计（按当前筛选条件统计） */
  const [totals, setTotals] = useState<{
    monthlyRent: number;
    monthlyPropertyFee: number;
    amendmentRent: number;
    amendmentPropertyFee: number;
    receivableRent: number;
    receivablePropertyFee: number;
    rentReceived: number;
    propertyFeeReceived: number;
  } | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRecord, setSelectedRecord] = useState<ILedgerItem | null>(null);
  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false);
  const [receiveRows, setReceiveRows] = useState<ReceiveRow[]>([]);
  const [unpaidPeriods, setUnpaidPeriods] = useState<LedgerUnpaidPeriodItem[]>([]);
  const [leaseArea, setLeaseArea] = useState<number | null>(null);
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  /** 当前台账行的已收款记录（已收齐时只读展示，可删除） */
  const [existingReceipts, setExistingReceipts] = useState<ReceiveRecord[]>([]);

  const loadData = useCallback(async (
    params?: { page?: number; pageSize?: number; contractId?: string; period?: string; status?: string[]; tenant?: string; overdue?: boolean },
  ) => {
    setLoading(true);
    try {
      const res = await ledgerApi.getList(params);
      setLedgerData((res.data.items || []) as ILedgerItem[]);
      setTotal(res.data.total || 0);
      setTotals(res.data.totals);
    } catch (error) {
      toast.error('加载台账数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 数据加载完成后自动适配列宽，避免进入页面时列宽不足导致内容重叠
  React.useEffect(() => {
    if (ledgerData.length === 0) return;
    const timer = setTimeout(() => {
      COLUMN_KEYS.forEach((key) => {
        if (!hiddenColumns.includes(key)) calcAutoFitWidth(key);
      });
    }, 60);
    return () => clearTimeout(timer);
  }, [ledgerData, hiddenColumns, calcAutoFitWidth]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const buildQueryParams = useCallback(() => {
    const params: Record<string, string | number | undefined> = {
      page: currentPage,
      pageSize,
    };
    if (searchContractNo) params.contractNo = searchContractNo;
    if (searchPeriod) params.period = searchPeriod;
    if (searchStatus.length > 0) params.status = searchStatus.join(',');
    if (searchTenant) params.tenant = searchTenant;
    if (searchPropertyName) params.propertyName = searchPropertyName;
    if (searchOverdue.length === 1) params.overdue = searchOverdue[0] === 'true' ? 'true' : 'false';
    return params;
  }, [currentPage, pageSize, searchContractNo, searchPeriod, searchStatus, searchTenant, searchPropertyName, searchOverdue]);

  React.useEffect(() => {
    loadData(buildQueryParams());
  }, [buildQueryParams, loadData]);

  const handleResetFilters = () => {
    setSearchContractNo('');
    setSearchTenant('');
    setSearchPropertyName('');
    setSearchPeriod('');
    setSearchStatus([]);
    setSearchOverdue([]);
    setCurrentPage(1);
  };

  const handleReceiveClick = async (record: ILedgerItem) => {
    setSelectedRecord(record);
    setIsReceiveDialogOpen(true);
    setReceiveSubmitting(false);
    setReceiveRows([]);
    setExistingReceipts([]);
    setLeaseArea(null);

    // 该期全部收款记录（期级口径：同月多行台账共用一份流水，不按 refId 拆）
    try {
      const receiptsRes = await receiptApi.getList({
        contractId: record.contractId,
        period: record.period,
        pageSize: 200,
      });
      setExistingReceipts(receiptsRes.data?.items || []);
    } catch {
      setExistingReceipts([]);
    }

    // 该合同全部未收齐台账期间（所属期下拉 + 期级余额）
    let periodList: LedgerUnpaidPeriodItem[] = [];
    try {
      const res = await ledgerApi.getUnpaidPeriods(record.contractId);
      periodList = res.data || [];
      setUnpaidPeriods(periodList);
    } catch {
      setUnpaidPeriods([]);
    }

    // 合同已出租面积（租金单位数量）
    try {
      const detail = await contractApi.getDetail(record.contractId);
      setLeaseArea(
        detail.data?.leaseArea != null ? Number(detail.data.leaseArea) : null,
      );
    } catch {
      setLeaseArea(null);
    }

    // 期级余额：该期未收齐才有待收行（同月多行时应收是各行之和，非所点单行）
    const periodInfo = periodList.find((p) => p.period === record.period);
    const remainingRent = periodInfo
      ? round2(Math.max(0, periodInfo.receivableRent - periodInfo.rentReceived))
      : 0;
    const remainingFee = periodInfo
      ? round2(
          Math.max(
            0,
            periodInfo.receivablePropertyFee - periodInfo.propertyFeeReceived,
          ),
        )
      : 0;
    const today = new Date().toISOString().split('T')[0];

    // 仅初始化仍有待收余额的项目行（已收齐时不初始化，仅展示历史收款记录）
    const initRows: ReceiveRow[] = [];
    if (remainingRent > 0) {
      initRows.push({
        key: `row-${Date.now()}-rent`,
        receiveType: 'rent',
        amount: String(remainingRent),
        receiveDate: today,
        period: record.period,
      });
    }
    if (remainingFee > 0) {
      initRows.push({
        key: `row-${Date.now()}-fee`,
        receiveType: 'property_fee',
        amount: String(remainingFee),
        receiveDate: today,
        period: record.period,
      });
    }
    setReceiveRows(initRows);
  };

  const handleUtilitiesClick = (record: ILedgerItem) => {
    navigate('/utilities', { state: { contractId: record.contractId, period: record.period } });
  };

  const calculateStatus = (
    record: ILedgerItem,
    rentReceived: number,
    propertyFeeReceived: number
  ): 'unpaid' | 'partial' | 'paid' | 'no_payment_required' => {
    const receivableRent = record.amendmentRent != null ? record.amendmentRent : record.monthlyRent;
    const receivablePropertyFee = record.amendmentPropertyFee != null ? record.amendmentPropertyFee : record.monthlyPropertyFee;
    const total = receivableRent + receivablePropertyFee;
    const received = rentReceived + propertyFeeReceived;
    if (total === 0) return 'no_payment_required';
    if (received >= total) return 'paid';
    if (received > 0) return 'partial';
    return 'unpaid';
  };

  const todayStr = () => new Date().toISOString().split('T')[0];

  /** 期级余额（该期应收/已收），用于行内校验与一键收齐；一个所属期只有一条 */
  const periodInfoMap = useMemo(() => {
    const map = new Map<
      string,
      {
        rent: { receivable: number; received: number };
        property_fee: { receivable: number; received: number };
      }
    >();
    for (const p of unpaidPeriods) {
      map.set(p.period, {
        rent: { receivable: p.receivableRent, received: p.rentReceived },
        property_fee: {
          receivable: p.receivablePropertyFee,
          received: p.propertyFeeReceived,
        },
      });
    }
    // 该期已收齐（不在未收齐列表）时补零余额，fail-closed：手动加行也只能填 0
    if (selectedRecord && !map.has(selectedRecord.period)) {
      map.set(selectedRecord.period, {
        rent: { receivable: 0, received: 0 },
        property_fee: { receivable: 0, received: 0 },
      });
    }
    return map;
  }, [unpaidPeriods, selectedRecord]);

  /** 该行同类型同所属期的本次合计 */
  const sumForRow = (row: ReceiveRow): number =>
    receiveRows
      .filter(
        (r) => r.period === row.period && r.receiveType === row.receiveType,
      )
      .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  /** 一键收齐：将该期该类型剩余应收填入当前行金额 */
  const handleFillRemaining = (row: ReceiveRow) => {
    const info = periodInfoMap.get(row.period);
    if (!info) return;
    const remaining = round2(
      Math.max(
        0,
        info[row.receiveType].receivable - info[row.receiveType].received,
      ),
    );
    const others = receiveRows
      .filter(
        (r) =>
          r.key !== row.key &&
          r.period === row.period &&
          r.receiveType === row.receiveType,
      )
      .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const fill = round2(Math.max(0, remaining - others));
    if (fill <= 0) {
      toast.error(
        `${row.period} ${RECEIVE_TYPE_LABEL[row.receiveType]}已收齐或已填满`,
      );
      return;
    }
    handleReceiveRowChange(row.key, { amount: String(fill) });
  };

  const handleAddReceiveRow = (receiveType: 'rent' | 'property_fee') => {
    setReceiveRows((prev) => [
      ...prev,
      {
        key: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        receiveType,
        amount: '',
        receiveDate: todayStr(),
        period: selectedRecord?.period ?? '',
      },
    ]);
  };

  const handleRemoveReceiveRow = (key: string) => {
    setReceiveRows((prev) => prev.filter((r) => r.key !== key));
  };

  const handleReceiveRowChange = (
    key: string,
    patch: Partial<Omit<ReceiveRow, 'key'>>,
  ) => {
    setReceiveRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  };

  const handleSaveReceive = async () => {
    if (!selectedRecord) return;

    for (const row of receiveRows) {
      const amount = parseFloat(row.amount);
      if (!amount || amount <= 0) {
        toast.error('收款金额必须大于 0');
        return;
      }
      if (!row.receiveDate) {
        toast.error('收款日期必填');
        return;
      }
      if (!row.period) {
        toast.error('款项所属期必填');
        return;
      }
      // 该行该期该类型已收 + 本次合计不得超过应收
      const info = periodInfoMap.get(row.period);
      if (info && sumForRow(row) > info[row.receiveType].receivable - info[row.receiveType].received) {
        const remaining = Math.max(
          0,
          info[row.receiveType].receivable - info[row.receiveType].received,
        );
        toast.error(
          `${row.period} 已收${RECEIVE_TYPE_LABEL[row.receiveType]}不能超过剩余应收 ${formatCurrency(remaining)}`,
        );
        return;
      }
    }

    // 二次提醒：最终仍为部分收款的期间
    const partialKeys = [
      ...new Set(receiveRows.map((r) => `${r.period}|${r.receiveType}`)),
    ].filter((key) => {
      const [period, type] = key.split('|');
      const info = periodInfoMap.get(period);
      if (!info) return false;
      const t = type as 'rent' | 'property_fee';
      const finalReceived =
        info[t].received +
        receiveRows
          .filter((r) => r.period === period && r.receiveType === t)
          .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
      return finalReceived < info[t].receivable && finalReceived > 0;
    });
    if (partialKeys.length > 0) {
      const confirmed = await showConfirm(
        '该合同仍有款项未收齐，本次将保存为部分收款。确定继续吗？',
      );
      if (!confirmed) return;
    }

    setReceiveSubmitting(true);
    try {
      await receiptApi.create({
        refType: 'ledger',
        refId: selectedRecord.id,
        items: receiveRows.map((r) => ({
          receiveType: r.receiveType,
          amount: parseFloat(r.amount),
          receiveDate: r.receiveDate,
          period: r.period,
        })),
      });
      toast.success('收款录入成功');
      setIsReceiveDialogOpen(false);
      loadData(buildQueryParams());
    } catch (error) {
      toast.error('收款录入失败');
    } finally {
      setReceiveSubmitting(false);
    }
  };

  const handleDeleteReceipt = async (rec: ReceiveRecord) => {
    const confirmed = await showConfirm(
      '确定删除该笔收款记录吗？删除后将同步回写台账收齐状态。',
    );
    if (!confirmed) return;
    try {
      await receiptApi.remove(rec.id);
      toast.success('删除成功，台账状态已回写');
      if (selectedRecord) {
        try {
          const res = await receiptApi.getList({
            contractId: selectedRecord.contractId,
            period: selectedRecord.period,
            pageSize: 200,
          });
          setExistingReceipts(res.data?.items || []);
        } catch {
          setExistingReceipts([]);
        }
        loadData(buildQueryParams());
      }
    } catch (error) {
      toast.error('删除失败');
    }
  };

  const handleExport = async () => {
    try {
      const exportParams: Record<string, string | number | undefined> = { page: 1, pageSize: 9999 };
      if (searchContractNo) exportParams.contractNo = searchContractNo;
      if (searchPeriod) exportParams.period = searchPeriod;
      if (searchStatus.length > 0) exportParams.status = searchStatus.join(',');
      if (searchTenant) exportParams.tenant = searchTenant;
      if (searchPropertyName) exportParams.propertyName = searchPropertyName;
      if (searchOverdue.length === 1) exportParams.overdue = searchOverdue[0] === 'true' ? 'true' : 'false';
      const res = await ledgerApi.getList(exportParams);
      const exportData = (res.data.items || []) as ILedgerItem[];

      const headers = ['合同编号', '房产名称', '出租方', '承租方', '租赁面积', '所属期', '季度', '阶段起止日期', '合同租金', '合同物业费', '变更合同编号', '变更合同租金', '变更合同物业费', '应收租金', '应收物业费', '支付方式', '最后缴纳期限', '逾期天数', '已收租金', '已收物业费', '收款日期', '收款状态'];
      const rows = exportData.map((item) => [
        item.contractNo,
        item.propertyName || '-',
        item.landlord || '-',
        item.tenant,
        item.leaseArea != null ? item.leaseArea : '-',
        item.period,
        item.quarter || '-',
        `${item.stageStartDate} 至 ${item.stageEndDate}`,
        item.monthlyRent,
        item.monthlyPropertyFee,
        item.amendmentNo || '-',
        item.amendmentRent != null ? item.amendmentRent : '-',
        item.amendmentPropertyFee != null ? item.amendmentPropertyFee : '-',
        item.amendmentRent != null ? item.amendmentRent : item.monthlyRent,
        item.amendmentPropertyFee != null ? item.amendmentPropertyFee : item.monthlyPropertyFee,
        getPaymentMethodText(item.paymentMethod),
        item.dueDate,
        (() => {
          if (item.status === 'no_payment_required') return '未逾期';
          const refDate = item.receiveDate ? new Date(item.receiveDate) : new Date();
          const due = new Date(item.dueDate);
          const diff = Math.ceil((refDate.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
          return diff < 0 ? '未逾期' : `${diff}天`;
        })(),
        item.rentReceived,
        item.propertyFeeReceived,
        item.receiveDate || '-',
        item.status === 'paid' ? '已收齐' : item.status === 'partial' ? '部分收款' : item.status === 'terminated' ? '已终止' : item.status === 'no_payment_required' ? '无需收款' : '未收款',
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [
        { wch: 20 }, { wch: 22 }, { wch: 22 }, { wch: 24 }, { wch: 12 },
        { wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 14 }, { wch: 14 },
        { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
        { wch: 12 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '台账明细');
      XLSX.writeFile(wb, `台账明细_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('导出成功');
    } catch {
      toast.error('导出失败');
    }
  };

  const columns = useMemo(() => [
    {
      title: '合同编号',
      dataIndex: 'contractNo',
      key: 'contractNo',
      width: getColumnWidth('contractNo'),
      onHeaderCell: () => ({
        width: getColumnWidth('contractNo'),
        onResize: handleResize('contractNo'),
        onDoubleClickResize: () => calcAutoFitWidth('contractNo'),
      }),
    },
    {
      title: '房产名称',
      dataIndex: 'propertyName',
      key: 'propertyName',
      width: getColumnWidth('propertyName'),
      render: (value: string) => value || '-',
      onHeaderCell: () => ({
        width: getColumnWidth('propertyName'),
        onResize: handleResize('propertyName'),
        onDoubleClickResize: () => calcAutoFitWidth('propertyName'),
      }),
    },
    {
      title: '出租方',
      dataIndex: 'landlord',
      key: 'landlord',
      width: getColumnWidth('landlord'),
      render: (value: string) => value || '-',
      onHeaderCell: () => ({
        width: getColumnWidth('landlord'),
        onResize: handleResize('landlord'),
        onDoubleClickResize: () => calcAutoFitWidth('landlord'),
      }),
    },
    {
      title: '承租方',
      dataIndex: 'tenant',
      key: 'tenant',
      width: getColumnWidth('tenant'),
      onHeaderCell: () => ({
        width: getColumnWidth('tenant'),
        onResize: handleResize('tenant'),
        onDoubleClickResize: () => calcAutoFitWidth('tenant'),
      }),
    },
    {
      title: '租赁面积',
      dataIndex: 'leaseArea',
      key: 'leaseArea',
      width: getColumnWidth('leaseArea'),
      render: (value: number) => value != null ? String(value) : '-',
      onHeaderCell: () => ({
        width: getColumnWidth('leaseArea'),
        onResize: handleResize('leaseArea'),
        onDoubleClickResize: () => calcAutoFitWidth('leaseArea'),
      }),
    },
    {
      title: '所属期',
      dataIndex: 'period',
      key: 'period',
      width: getColumnWidth('period'),
      render: (_: unknown, record: ILedgerItem) => record.period,
      onHeaderCell: () => ({
        width: getColumnWidth('period'),
        onResize: handleResize('period'),
        onDoubleClickResize: () => calcAutoFitWidth('period'),
      }),
    },
    {
      title: '季度',
      key: 'quarter',
      width: getColumnWidth('quarter'),
      render: (_: unknown, record: ILedgerItem) =>
        record.quarter || '-',
      onHeaderCell: () => ({
        width: getColumnWidth('quarter'),
        onResize: handleResize('quarter'),
        onDoubleClickResize: () => calcAutoFitWidth('quarter'),
      }),
    },
    {
      title: '阶段起止日期',
      key: 'periodRange',
      width: getColumnWidth('periodRange'),
      render: (_: unknown, record: ILedgerItem) => `${record.stageStartDate} 至 ${record.stageEndDate}`,
      onHeaderCell: () => ({
        width: getColumnWidth('periodRange'),
        onResize: handleResize('periodRange'),
        onDoubleClickResize: () => calcAutoFitWidth('periodRange'),
      }),
    },
    {
      title: '合同租金',
      dataIndex: 'monthlyRent',
      key: 'monthlyRent',
      width: getColumnWidth('monthlyRent'),
      align: 'right' as const,
      render: (value: number) => formatCurrency(value),
      onHeaderCell: () => ({
        width: getColumnWidth('monthlyRent'),
        onResize: handleResize('monthlyRent'),
        onDoubleClickResize: () => calcAutoFitWidth('monthlyRent'),
      }),
    },
    {
      title: '合同物业费',
      dataIndex: 'monthlyPropertyFee',
      key: 'monthlyPropertyFee',
      width: getColumnWidth('monthlyPropertyFee'),
      align: 'right' as const,
      render: (value: number) => formatCurrency(value),
      onHeaderCell: () => ({
        width: getColumnWidth('monthlyPropertyFee'),
        onResize: handleResize('monthlyPropertyFee'),
        onDoubleClickResize: () => calcAutoFitWidth('monthlyPropertyFee'),
      }),
    },
    {
      title: '变更合同编号',
      dataIndex: 'amendmentNo',
      key: 'amendmentNo',
      width: getColumnWidth('amendmentNo'),
      render: (value: string) => value || '-',
      onHeaderCell: () => ({
        width: getColumnWidth('amendmentNo'),
        onResize: handleResize('amendmentNo'),
        onDoubleClickResize: () => calcAutoFitWidth('amendmentNo'),
      }),
    },
    {
      title: '变更合同租金',
      dataIndex: 'amendmentRent',
      key: 'amendmentRent',
      width: getColumnWidth('amendmentRent'),
      align: 'right' as const,
      render: (value: number) => value != null ? formatCurrency(value) : '-',
      onHeaderCell: () => ({
        width: getColumnWidth('amendmentRent'),
        onResize: handleResize('amendmentRent'),
        onDoubleClickResize: () => calcAutoFitWidth('amendmentRent'),
      }),
    },
    {
      title: '变更合同物业费',
      dataIndex: 'amendmentPropertyFee',
      key: 'amendmentPropertyFee',
      width: getColumnWidth('amendmentPropertyFee'),
      align: 'right' as const,
      render: (value: number) => value != null ? formatCurrency(value) : '-',
      onHeaderCell: () => ({
        width: getColumnWidth('amendmentPropertyFee'),
        onResize: handleResize('amendmentPropertyFee'),
        onDoubleClickResize: () => calcAutoFitWidth('amendmentPropertyFee'),
      }),
    },
    {
      title: '应收租金',
      key: 'receivableRent',
      width: getColumnWidth('receivableRent'),
      align: 'right' as const,
      render: (_: unknown, record: ILedgerItem) => {
        const amount = record.amendmentRent != null ? record.amendmentRent : record.monthlyRent;
        return formatCurrency(amount);
      },
      onHeaderCell: () => ({
        width: getColumnWidth('receivableRent'),
        onResize: handleResize('receivableRent'),
        onDoubleClickResize: () => calcAutoFitWidth('receivableRent'),
      }),
    },
    {
      title: '应收物业费',
      key: 'receivablePropertyFee',
      width: getColumnWidth('receivablePropertyFee'),
      align: 'right' as const,
      render: (_: unknown, record: ILedgerItem) => {
        const amount = record.amendmentPropertyFee != null ? record.amendmentPropertyFee : record.monthlyPropertyFee;
        return formatCurrency(amount);
      },
      onHeaderCell: () => ({
        width: getColumnWidth('receivablePropertyFee'),
        onResize: handleResize('receivablePropertyFee'),
        onDoubleClickResize: () => calcAutoFitWidth('receivablePropertyFee'),
      }),
    },
    {
      title: '支付方式',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      width: getColumnWidth('paymentMethod'),
      render: (value: string) => getPaymentMethodText(value),
      onHeaderCell: () => ({
        width: getColumnWidth('paymentMethod'),
        onResize: handleResize('paymentMethod'),
        onDoubleClickResize: () => calcAutoFitWidth('paymentMethod'),
      }),
    },
    {
      title: '最后缴纳期限',
      dataIndex: 'dueDate',
      key: 'dueDate',
      width: getColumnWidth('dueDate'),
      onHeaderCell: () => ({
        width: getColumnWidth('dueDate'),
        onResize: handleResize('dueDate'),
        onDoubleClickResize: () => calcAutoFitWidth('dueDate'),
      }),
    },
    {
      title: '逾期天数',
      key: 'overdueDays',
      width: getColumnWidth('overdueDays'),
      align: 'center' as const,
      render: (_: unknown, record: ILedgerItem) => {
        if (record.status === 'no_payment_required') {
          return <span className="text-success">未逾期</span>;
        }
        const refDate = record.receiveDate
          ? new Date(record.receiveDate)
          : new Date();
        const dueDate = new Date(record.dueDate);
        const diffMs = refDate.getTime() - dueDate.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          return <span className="text-success">未逾期</span>;
        }
        return <span className="text-destructive font-mono">{diffDays}天</span>;
      },
      onHeaderCell: () => ({
        width: getColumnWidth('overdueDays'),
        onResize: handleResize('overdueDays'),
        onDoubleClickResize: () => calcAutoFitWidth('overdueDays'),
      }),
    },
    {
      title: '已收租金',
      dataIndex: 'rentReceived',
      key: 'rentReceived',
      width: getColumnWidth('rentReceived'),
      align: 'right' as const,
      render: (value: number) => formatCurrency(value),
      onHeaderCell: () => ({
        width: getColumnWidth('rentReceived'),
        onResize: handleResize('rentReceived'),
        onDoubleClickResize: () => calcAutoFitWidth('rentReceived'),
      }),
    },
    {
      title: '已收物业费',
      dataIndex: 'propertyFeeReceived',
      key: 'propertyFeeReceived',
      width: getColumnWidth('propertyFeeReceived'),
      align: 'right' as const,
      render: (value: number) => formatCurrency(value),
      onHeaderCell: () => ({
        width: getColumnWidth('propertyFeeReceived'),
        onResize: handleResize('propertyFeeReceived'),
        onDoubleClickResize: () => calcAutoFitWidth('propertyFeeReceived'),
      }),
    },
    {
      title: '收款日期',
      dataIndex: 'receiveDate',
      key: 'receiveDate',
      width: getColumnWidth('receiveDate'),
      render: (value: string) => value || '-',
      onHeaderCell: () => ({
        width: getColumnWidth('receiveDate'),
        onResize: handleResize('receiveDate'),
        onDoubleClickResize: () => calcAutoFitWidth('receiveDate'),
      }),
    },
    {
      title: '收款状态',
      dataIndex: 'status',
      key: 'status',
      width: getColumnWidth('status'),
      render: (value: string) => getStatusBadge(value),
      onHeaderCell: () => ({
        width: getColumnWidth('status'),
        onResize: handleResize('status'),
        onDoubleClickResize: () => calcAutoFitWidth('status'),
      }),
    },
    {
      title: '操作',
      key: 'action',
      width: getColumnWidth('action'),
      onHeaderCell: () => ({
        width: getColumnWidth('action'),
        onResize: handleResize('action'),
        onDoubleClickResize: () => calcAutoFitWidth('action'),
      }),
      render: (_: unknown, record: ILedgerItem) => (
        <div className="flex gap-2">
          <CanPoint action="edit" subject="Ledger">
            {record.status !== 'terminated' && record.status !== 'no_payment_required' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleReceiveClick(record)}
                className="h-8 px-2"
              >
                <DollarSignIcon className="w-4 h-4 mr-1" />
                收款
              </Button>
            )}
          </CanPoint>
          {record.hasUtilities && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleUtilitiesClick(record)}
              className="h-8 px-2"
            >
              <ZapIcon className="w-4 h-4 mr-1" />
              水电费
            </Button>
          )}
        </div>
      ),
    },
  ], [getColumnWidth, handleResize, calcAutoFitWidth, handleReceiveClick, handleUtilitiesClick]);

  const visibleColumns = useMemo(
    () => columns.filter((col) => !hiddenColumns.includes(col.key)),
    [columns, hiddenColumns]
  );

  const scrollX = useMemo(() => {
    return visibleColumns.reduce((sum: number, col) => {
      return sum + (typeof col.width === 'number' ? col.width : 120);
    }, 0);
  }, [visibleColumns]);

  const tableScroll = useMemo(() => ({ x: scrollX }), [scrollX]);

  const handleOpenColumnSettings = useCallback(() => {
    setPendingHiddenColumns([...hiddenColumns]);
    setIsColumnSettingsOpen(true);
  }, [hiddenColumns]);

  const handleResetColumnConfig = useCallback(async () => {
    try {
      await ledgerApi.saveColumnConfig({ hiddenColumns: [] });
      setHiddenColumns([]);
    } catch {
      toast.error('保存配置失败');
    }
  }, []);

  const handleApplyColumnSettings = useCallback(async () => {
    try {
      await ledgerApi.saveColumnConfig({ hiddenColumns: [...pendingHiddenColumns] });
      setHiddenColumns([...pendingHiddenColumns]);
      setIsColumnSettingsOpen(false);
    } catch {
      toast.error('保存配置失败');
    }
  }, [pendingHiddenColumns]);

  const togglePendingColumn = useCallback((key: string) => {
    setPendingHiddenColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }, []);

  React.useEffect(() => {
    ledgerApi.getColumnConfig().then((res) => {
      setHiddenColumns(res.data.hiddenColumns || []);
    }).catch(() => {});
  }, []);

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">台账管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            查看自动生成的台账明细，登记实际收款
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <SettingsIcon className="w-4 h-4" />
                <ChevronDownIcon className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleOpenColumnSettings}>
                设置
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleResetColumnConfig}>
                重置配置
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={handleExport} variant="outline">
            <FileDownIcon className="w-4 h-4 mr-2" />
            导出台账
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">筛选查询</CardTitle>
          <Button variant="outline" size="sm" onClick={handleResetFilters}>
            <RotateCcwIcon className="size-4 mr-2" />
            重置筛选
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-2 block">合同编号</Label>
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索合同编号"
                  value={searchContractNo}
                  onChange={(e) => {
                    setSearchContractNo(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-2 block">承租方</Label>
              <Input
                placeholder="搜索承租方"
                value={searchTenant}
                onChange={(e) => {
                  setSearchTenant(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-2 block">房产名称</Label>
              <Input
                placeholder="搜索房产名称"
                value={searchPropertyName}
                onChange={(e) => {
                  setSearchPropertyName(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-2 block">所属期</Label>
              <Input
                type="month"
                placeholder="选择月份"
                value={searchPeriod}
                onChange={(e) => {
                  setSearchPeriod(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-2 block">逾期状态</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-10 justify-between font-normal">
                    {searchOverdue.length === 0
                      ? '全部'
                      : OVERDUE_OPTIONS.filter((o) => searchOverdue.includes(o.value)).map((o) => o.label).join('、')}
                    <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-2" align="start">
                  {OVERDUE_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={searchOverdue.includes(opt.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSearchOverdue([...searchOverdue, opt.value]);
                          } else {
                            setSearchOverdue(searchOverdue.filter((v) => v !== opt.value));
                          }
                          setCurrentPage(1);
                        }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-2 block">收款状态</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-10 justify-between font-normal">
                    {searchStatus.length === 0
                      ? '全部'
                      : STATUS_OPTIONS.filter((s) => searchStatus.includes(s.value)).map((s) => s.label).join('、')}
                    <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-2" align="start">
                  {STATUS_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-accent cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={searchStatus.includes(opt.value)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSearchStatus([...searchStatus, opt.value]);
                          } else {
                            setSearchStatus(searchStatus.filter((v) => v !== opt.value));
                          }
                          setCurrentPage(1);
                        }}
                      />
                      {opt.label}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <Table
            columns={visibleColumns}
            dataSource={ledgerData}
            rowKey="id"
            components={{ header: { cell: ResizableTitle } }}
            scroll={tableScroll}
            loading={loading}
            pagination={{
              current: currentPage,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t: number) => `共 ${t} 条`,
              onChange: (page: number, size: number) => {
                setCurrentPage(page);
                setPageSize(size);
              },
            }}
            locale={{
              emptyText: (
                <div className="py-12 text-center">
                  <p className="text-muted-foreground">暂无台账数据</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">
                    审核通过的合同将自动生成台账明细
                  </p>
                </div>
              ),
            }}
            summary={() => {
              const keys = visibleColumns.map((c) => String(c.key));
              const moneyMap: Record<string, number> = {
                monthlyRent: totals?.monthlyRent ?? 0,
                monthlyPropertyFee: totals?.monthlyPropertyFee ?? 0,
                amendmentRent: totals?.amendmentRent ?? 0,
                amendmentPropertyFee: totals?.amendmentPropertyFee ?? 0,
                receivableRent: totals?.receivableRent ?? 0,
                receivablePropertyFee: totals?.receivablePropertyFee ?? 0,
                rentReceived: totals?.rentReceived ?? 0,
                propertyFeeReceived: totals?.propertyFeeReceived ?? 0,
              };
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    {keys.map((key, idx) => {
                      if (key in moneyMap) {
                        return (
                          <Table.Summary.Cell key={key} index={idx} align="right">
                            <span className="font-semibold">
                              {formatCurrency(moneyMap[key])}
                            </span>
                          </Table.Summary.Cell>
                        );
                      }
                      if (idx === 0) {
                        return (
                          <Table.Summary.Cell key={key} index={idx}>
                            <span className="font-semibold">合计</span>
                          </Table.Summary.Cell>
                        );
                      }
                      return <Table.Summary.Cell key={key} index={idx} />;
                    })}
                  </Table.Summary.Row>
                </Table.Summary>
              );
            }}
          />
        </CardContent>
      </Card>

      <Dialog open={isReceiveDialogOpen} onOpenChange={setIsReceiveDialogOpen}>
        <DialogContent className="sm:max-w-[880px]">
          <DialogHeader>
            <DialogTitle>
              {selectedRecord?.status === 'paid' ? '收款记录' : '收款录入'}
            </DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">合同编号：</span>
                  <span className="font-medium">{selectedRecord.contractNo}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">承租方：</span>
                  <span className="font-medium">{selectedRecord.tenant}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">租户编码：</span>
                  <span className="font-medium">{selectedRecord.customerCode || '-'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">默认所属期：</span>
                  <span className="font-medium">{selectedRecord.period}</span>
                </div>
              </div>

              {/* 已收款记录（已收齐时只读展示，可删除），与录入表格同列格式 */}
              {existingReceipts.length > 0 && (
                <div className="rounded-md border border-border overflow-hidden">
                  <div className="px-3 py-2 bg-muted/50 text-sm font-medium text-muted-foreground border-b border-border">
                    已收款记录
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left font-medium text-muted-foreground py-2 px-3 w-[80px]">类型</th>
                        <th className="text-left font-medium text-muted-foreground py-2 px-3 w-[280px]">金额</th>
                        <th className="text-left font-medium text-muted-foreground py-2 px-3 w-[160px]">收款日期</th>
                        <th className="text-left font-medium text-muted-foreground py-2 px-3 w-[130px]">单位数量</th>
                        <th className="text-center font-medium text-muted-foreground py-2 px-3 w-[60px]">删除</th>
                      </tr>
                    </thead>
                    <tbody>
                      {existingReceipts.map((rec) => (
                        <tr key={rec.id} className="border-b border-border/60">
                          <td className="py-2 px-3">
                            <Badge variant="outline">
                              {RECEIVE_TYPE_LABEL[rec.receiveType as 'rent' | 'property_fee'] ??
                                (rec.receiveType === 'water'
                                  ? '水费'
                                  : rec.receiveType === 'electricity'
                                    ? '电费'
                                    : rec.receiveType)}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 font-medium">
                            {formatCurrency(Number(rec.amount))}
                          </td>
                          <td className="py-2 px-3">{rec.receiveDate}</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {rec.unitQty != null
                              ? `${Number(rec.unitQty)} ${rec.unit || ''}`.trim()
                              : '-'}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive"
                              title="删除该笔收款记录"
                              onClick={() => handleDeleteReceipt(rec)}
                            >
                              <Trash2Icon className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedRecord.status !== 'paid' && (
                <>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left font-medium text-muted-foreground py-2 px-3 w-[80px]">类型</th>
                      <th className="text-left font-medium text-muted-foreground py-2 px-3 w-[280px]">金额</th>
                      <th className="text-left font-medium text-muted-foreground py-2 px-3 w-[160px]">收款日期</th>
                      <th className="text-left font-medium text-muted-foreground py-2 px-3 w-[130px]">单位数量</th>
                      <th className="text-center font-medium text-muted-foreground py-2 px-3 w-[36px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiveRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-muted-foreground">
                          暂无收款行，点击下方按钮新增
                        </td>
                      </tr>
                    )}
                    {receiveRows.map((row) => {
                      const amount = parseFloat(row.amount) || 0;
                      const info = periodInfoMap.get(row.period);
                      let excess = false;
                      let partial = false;
                      if (info) {
                        const remaining = Math.max(
                          0,
                          info[row.receiveType].receivable -
                            info[row.receiveType].received,
                        );
                        const total = sumForRow(row);
                        excess = total > remaining;
                        partial = !excess && total > 0 && total < remaining;
                      }
                      // 单位数量：租金=合同已出租面积；物业费=金额÷应收月物业费
                      let unitText = '-';
                      if (row.receiveType === 'rent') {
                        unitText = leaseArea != null ? `${leaseArea} ㎡` : '-';
                      } else if (info && amount > 0) {
                        const monthlyFee = info.property_fee.receivable || 1;
                        unitText = `${Math.round((amount / monthlyFee) * 100) / 100} 月`;
                      }
                      return (
                        <tr key={row.key} className="border-b border-border/60">
                          <td className="py-3 px-3 align-top">
                            <Badge variant="outline" className="mt-1.5">
                              {RECEIVE_TYPE_LABEL[row.receiveType]}
                            </Badge>
                          </td>
                          <td className="py-3 px-3 align-top">
                            <div className="flex items-center gap-1.5">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="收款金额"
                                value={row.amount}
                                onChange={(e) =>
                                  handleReceiveRowChange(row.key, { amount: e.target.value })
                                }
                                className={`flex-1 ${excess ? 'border-destructive' : ''}`}
                              />
                              {info &&
                                Math.max(0, info[row.receiveType].receivable - info[row.receiveType].received) > 0 && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9 shrink-0 px-2 text-xs whitespace-nowrap"
                                    onClick={() => handleFillRemaining(row)}
                                  >
                                    一键收齐
                                  </Button>
                                )}
                            </div>
                            {info && (
                              <p className="text-xs text-muted-foreground mt-1">
                                应收 {formatCurrency(info[row.receiveType].receivable)} · 已收{' '}
                                {formatCurrency(info[row.receiveType].received)} · 剩余应收{' '}
                                {formatCurrency(
                                  Math.max(
                                    0,
                                    info[row.receiveType].receivable -
                                      info[row.receiveType].received,
                                  ),
                                )}
                              </p>
                            )}
                            {excess && (
                              <p className="text-xs text-destructive mt-1">
                                超过该期该类型剩余应收
                              </p>
                            )}
                            {partial && (
                              <p className="text-xs text-warning mt-1">
                                部分收款（该期该类型尚未收齐）
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-3 align-top">
                            <Input
                              type="date"
                              value={row.receiveDate}
                              onChange={(e) =>
                                handleReceiveRowChange(row.key, {
                                  receiveDate: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td className="py-3 px-3 align-top text-muted-foreground">
                            <span className="block mt-2">{unitText}</span>
                          </td>
                          <td className="py-3 px-3 align-top text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-9 w-9 p-0"
                              onClick={() => handleRemoveReceiveRow(row.key)}
                            >
                              <XIcon className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <span className="text-muted-foreground">本次收款合计</span>
                <span className="font-semibold">
                  {formatCurrency(
                    receiveRows.reduce(
                      (sum, r) => sum + (parseFloat(r.amount) || 0),
                      0,
                    ),
                  )}
                </span>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddReceiveRow('rent')}
                >
                  + 新增租金行
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddReceiveRow('property_fee')}
                >
                  + 新增物业费行
                </Button>
              </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            {selectedRecord?.status === 'paid' ? (
              <Button variant="outline" onClick={() => setIsReceiveDialogOpen(false)}>
                关闭
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsReceiveDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleSaveReceive} disabled={receiveSubmitting}>
                  {receiveSubmitting ? '保存中...' : '确认录入'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isColumnSettingsOpen} onOpenChange={setIsColumnSettingsOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>自定义列显示</DialogTitle>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground w-12">序号</th>
                  <th className="py-2 px-3 text-left font-medium text-muted-foreground">列名</th>
                  <th className="py-2 px-3 text-center font-medium text-muted-foreground w-20">隐藏</th>
                </tr>
              </thead>
              <tbody>
                {COLUMN_CONFIGS.map((col, index) => (
                  <tr key={col.key} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="py-2.5 px-3 text-muted-foreground">{index + 1}</td>
                    <td className="py-2.5 px-3">{col.title}</td>
                    <td className="py-2.5 px-3 text-center">
                      <Checkbox
                        checked={pendingHiddenColumns.includes(col.key)}
                        onCheckedChange={() => togglePendingColumn(col.key)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsColumnSettingsOpen(false)}>
              取消
            </Button>
            <Button onClick={handleApplyColumnSettings}>提交</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LedgerPage;
