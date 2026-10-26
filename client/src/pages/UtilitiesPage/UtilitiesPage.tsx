import React, { useState, useEffect, useMemo, useCallback } from 'react';
import dayjs from 'dayjs';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table } from '@lark-apaas/client-toolkit/antd-table';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { PlusIcon, EyeIcon, ZapIcon, DropletsIcon, SearchIcon, PencilIcon, Trash2Icon, FileDownIcon, XIcon } from 'lucide-react';
import ResizableTitle from '@/components/ResizableTitle';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { showConfirm } from '@lark-apaas/client-toolkit';
import { CanPoint } from '@/components/PermissionGate';
import { contractApi, utilityApi, receiptApi } from '@/api';
import type { ContractResponse, UtilityRecord, UtilityTenant, ReceiveRecord } from '@shared/api.interface';

interface ReceiveRow {
  key: string;
  receiveType: 'water' | 'electricity';
  amount: string;
  receiveDate: string;
}

const RECEIVE_TYPE_LABEL: Record<'water' | 'electricity', string> = {
  water: '水费',
  electricity: '电费',
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

interface ITenantPeriod {
  period: string;
  contractId: string;
  contractNo: string;
  isRegistered: boolean;
  recordId?: string;
}

interface ITenantGroup {
  tenant: string;
  propertyName?: string;
  contracts: ContractResponse[];
  contractCount: number;
  id: string;
  periods: ITenantPeriod[];
}

const RECORD_DEFAULT_WIDTHS: Record<string, number> = {
  recordPropertyName: 160,
  tenant: 180,
  period: 110,
  electricityFee: 130,
  waterFee: 130,
  totalFee: 130,
  received: 130,
  status: 110,
  dueDate: 140,
  overdueDays: 120,
  recordDate: 130,
  receiveDate: 130,
  action: 180,
};

const RECORD_COLUMN_KEYS = [
  'recordPropertyName', 'tenant', 'period', 'electricityFee', 'waterFee',
  'totalFee', 'received', 'status', 'dueDate', 'overdueDays',
  'recordDate', 'receiveDate',
];

// 与 calcAutoFitWidth 使用相同字体的文本宽度测量（canvas）
function measureTextWidth(text: string): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.font = '14px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const width = ctx.measureText(text).width;
  canvas.remove();
  return width;
}

const UtilitiesPage: React.FC = () => {
  const currentProfile = useCurrentUserProfile();

  const [contracts, setContracts] = useState<ContractResponse[]>([]);
  const [allContracts, setAllContracts] = useState<ContractResponse[]>([]);
  const [utilityRecords, setUtilityRecords] = useState<UtilityRecord[]>([]);
  const [utilityTenants, setUtilityTenants] = useState<UtilityTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('all');
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState('all');
  const [selectedProperty, setSelectedProperty] = useState('all');
  const [selectedReceivePeriod, setSelectedReceivePeriod] = useState('all');

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const [isRecordDialogOpen, setIsRecordDialogOpen] = useState(false);
  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<ContractResponse | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<UtilityRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<UtilityRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [recordForm, setRecordForm] = useState({
    period: '',
    electricityTotal: '',
    electricityPrice: '',
    waterTotal: '',
    waterPrice: '',
  });
  const [presetPeriodLocked, setPresetPeriodLocked] = useState(false);
  const [receiveRows, setReceiveRows] = useState<ReceiveRow[]>([]);
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  /** 当前水电费记录的已收款记录（已收齐时只读展示，可删除） */
  const [existingReceipts, setExistingReceipts] = useState<ReceiveRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contractsRes, allContractsRes, utilitiesRes, tenantsRes] = await Promise.all([
        contractApi.getList({ status: 'approved', pageSize: 200 }),
        contractApi.getList({ pageSize: 500 }),
        utilityApi.getList({ pageSize: 200 }),
        utilityApi.getTenants(),
      ]);
      const contractItems = contractsRes?.data?.items;
      const approvedContracts = (Array.isArray(contractItems) ? contractItems : []).filter(
        (c: ContractResponse) => c.hasUtilities,
      );
      setContracts(approvedContracts);
      const allContractItems = allContractsRes?.data?.items;
      setAllContracts(Array.isArray(allContractItems) ? allContractItems : []);
      const utilityItems = utilitiesRes?.data?.items;
      setUtilityRecords(Array.isArray(utilityItems) ? utilityItems : []);
      const tenantData = tenantsRes?.data;
      setUtilityTenants(Array.isArray(tenantData) ? tenantData : []);
    } catch (error) {
      logger.error('加载数据失败:', error);
      toast.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const utilityContracts = useMemo(() => {
    // 按 租户+房产 分组（同租户跨房产时各房产独立生成期间、独立登记）
    const tenantContractMap = new Map<string, ContractResponse[]>();
    contracts.forEach((c) => {
      const key = `${c.tenant}::${c.propertyName || ''}`;
      const existing = tenantContractMap.get(key) || [];
      existing.push(c);
      tenantContractMap.set(key, existing);
    });

    // 已登记集合：tenant::propertyName::period（合同登记记录经 contractId 映射房产名）
    // 映射源为全量合同（含已终止），保证已终止合同的历史登记记录仍能匹配房产名
    const contractPropertyNameMap = new Map<string, string>();
    allContracts.forEach((c) => {
      contractPropertyNameMap.set(c.id, c.propertyName || '');
    });
    const registeredSet = new Set<string>();
    utilityRecords.forEach((r) => {
      const propName = contractPropertyNameMap.get(r.contractId) || '';
      registeredSet.add(`${r.tenant}::${propName}::${r.period}`);
    });

    return utilityTenants
      .filter((ut) => ut.isActive)
      .map((ut) => {
        const key = `${ut.tenant}::${ut.propertyName || ''}`;
        const ctts = tenantContractMap.get(key) || [];
        if (ctts.length === 0) {
          return {
            tenant: ut.tenant,
            propertyName: ut.propertyName,
            contracts: ctts,
            contractCount: 0,
            id: `tenant-${ut.tenant}-${ut.propertyName || ''}`,
            periods: [],
          };
        }

        let earliest: Date | null = null;
        let latest: Date | null = null;
        ctts.forEach((c) => {
          const s = new Date(c.startDate);
          const e = new Date(c.endDate);
          if (!earliest || s < earliest) earliest = s;
          if (!latest || e > latest) latest = e;
        });

        const periods: ITenantPeriod[] = [];
        const latestContract = ctts.sort(
          (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
        )[0];

        let current = new Date(
          earliest!.getFullYear(),
          earliest!.getMonth(),
          1,
        );
        const end = new Date(
          latest!.getFullYear(),
          latest!.getMonth(),
          1,
        );

        while (current <= end) {
          const yearMonth = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
          const periodKey = `${ut.tenant}::${ut.propertyName || ''}::${yearMonth}`;
          // 优先匹配该组所属合同，避免同租户跨房产时登记记录串组
          const existingRecord = utilityRecords.find(
            (r) =>
              r.contractId === latestContract.id &&
              r.tenant === ut.tenant &&
              r.period === yearMonth,
          );
          periods.push({
            period: yearMonth,
            contractId: latestContract.id,
            contractNo: latestContract.contractNo,
            isRegistered: registeredSet.has(periodKey) || !!existingRecord,
            recordId: existingRecord?.id,
          });
          current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        }

        periods.sort((a, b) => b.period.localeCompare(a.period));

        return {
          tenant: ut.tenant,
          propertyName: ut.propertyName,
          contracts: ctts,
          contractCount: ctts.length,
          id: `tenant-${ut.tenant}-${ut.propertyName || ''}`,
          periods,
        };
      });
  }, [utilityTenants, contracts, allContracts, utilityRecords]);

  const availablePeriods = useMemo(() => {
    const periods = new Set(utilityRecords.map((r) => r.period));
    return Array.from(periods).sort().reverse();
  }, [utilityRecords]);

  const getRecordPropertyName = useCallback(
    (record: UtilityRecord) =>
      allContracts.find((c) => c.id === record.contractId)?.propertyName || '',
    [allContracts],
  );

  // 房产名称筛选选项：仅取有登记记录的房产
  const availableProperties = useMemo(() => {
    const props = new Set(utilityRecords.map((r) => getRecordPropertyName(r)).filter(Boolean));
    return Array.from(props);
  }, [utilityRecords, getRecordPropertyName]);

  // 收款期间筛选选项：按收款日期所在月份去重
  const availableReceivePeriods = useMemo(() => {
    const periods = new Set(
      utilityRecords.filter((r) => r.receiveDate).map((r) => r.receiveDate!.slice(0, 7)),
    );
    return Array.from(periods).sort().reverse();
  }, [utilityRecords]);

  // 当前租户可登记的期间：合同期间内、未登记、且早于当前月（排除未来月份）
  const availablePeriodsForTenant = useMemo(() => {
    if (!selectedContract) return [];
    const today = new Date();
    const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const group = utilityContracts.find(
      (g) =>
        g.tenant === selectedContract.tenant &&
        g.propertyName === selectedContract.propertyName,
    );
    if (!group) return [];
    return group.periods
      .filter((p) => {
        const periodDate = new Date(p.period + '-01');
        return periodDate < currentMonth && !p.isRegistered;
      })
      .map((p) => p.period)
      .sort((a, b) => b.localeCompare(a));
  }, [selectedContract, utilityContracts]);

  const handleOpenRecordDialog = (contract: ContractResponse, presetPeriod?: string) => {
    setSelectedContract(contract);
    setEditingRecord(null);
    setPresetPeriodLocked(!!presetPeriod);
    setRecordForm({
      period: presetPeriod || '',
      electricityTotal: '',
      electricityPrice: '',
      waterTotal: '',
      waterPrice: '',
    });
    setIsRecordDialogOpen(true);
  };

  const handleOpenEditDialog = (record: UtilityRecord) => {
    setEditingRecord(record);
    const contract = allContracts.find((c) => c.id === record.contractId);
    if (contract) {
      setSelectedContract(contract);
    }
    setRecordForm({
      period: record.period,
      electricityTotal: String(record.totalElectricityFee),
      electricityPrice: String(record.electricityPrice),
      waterTotal: String(record.totalWaterFee),
      waterPrice: String(record.waterPrice),
    });
    setIsRecordDialogOpen(true);
  };

  const handleOpenReceiveDialog = async (record: UtilityRecord) => {
    setSelectedRecord(record);
    setReceiveSubmitting(false);
    setExistingReceipts([]);
    const today = new Date().toISOString().slice(0, 10);
    // 该水电费记录已录入的收款记录（已收齐时仅只读展示，可删除）
    try {
      const receiptsRes = await receiptApi.getList({
        refId: record.id,
        pageSize: 200,
      });
      setExistingReceipts(receiptsRes.data?.items || []);
    } catch {
      setExistingReceipts([]);
    }
    const elecRemaining = Math.max(
      0,
      record.totalElectricityFee - (record.electricityReceived ?? 0),
    );
    const waterRemaining = Math.max(
      0,
      record.totalWaterFee - (record.waterReceived ?? 0),
    );
    setReceiveRows([
      {
        key: `row-${Date.now()}-electricity`,
        receiveType: 'electricity',
        amount: elecRemaining > 0 ? String(elecRemaining) : '',
        receiveDate: record.receiveDate || today,
      },
      {
        key: `row-${Date.now()}-water`,
        receiveType: 'water',
        amount: waterRemaining > 0 ? String(waterRemaining) : '',
        receiveDate: record.receiveDate || today,
      },
    ]);
    setIsReceiveDialogOpen(true);
  };

  const handleReceiveRowChange = (
    key: string,
    patch: Partial<Omit<ReceiveRow, 'key'>>,
  ) => {
    setReceiveRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  };

  const handleRemoveReceiveRow = (key: string) => {
    setReceiveRows((prev) => prev.filter((r) => r.key !== key));
  };

  /** 新增收款行：水电费同类型可多行收款 */
  const handleAddReceiveRow = (receiveType: 'water' | 'electricity') => {
    setReceiveRows((prev) => [
      ...prev,
      {
        key: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        receiveType,
        amount: '',
        receiveDate:
          selectedRecord?.receiveDate ||
          new Date().toISOString().slice(0, 10),
      },
    ]);
  };

  /** 一键收齐：将该类型剩余应收填入当前行金额 */
  const handleFillRemaining = (row: ReceiveRow) => {
    const info = receiveRowInfo(row);
    if (!info) return;
    const others = receiveRows
      .filter((r) => r.key !== row.key && r.receiveType === row.receiveType)
      .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const fill = Math.max(0, info.remaining - others);
    if (fill <= 0) {
      toast.error(`${RECEIVE_TYPE_LABEL[row.receiveType]}已收齐或已填满`);
      return;
    }
    handleReceiveRowChange(row.key, { amount: String(fill) });
  };

  /** 该类型本次合计与剩余应收 */
  const receiveRowInfo = (row: ReceiveRow) => {
    if (!selectedRecord) return null;
    const total = receiveRows
      .filter((r) => r.receiveType === row.receiveType)
      .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const isElec = row.receiveType === 'electricity';
    const receivable = isElec
      ? selectedRecord.totalElectricityFee
      : selectedRecord.totalWaterFee;
    const received = isElec
      ? selectedRecord.electricityReceived ?? 0
      : selectedRecord.waterReceived ?? 0;
    return { total, receivable, received, remaining: Math.max(0, receivable - received) };
  };

  /** 单位数量 = 金额 ÷ 单价（电=度、水=吨） */
  const calcUnitQty = (row: ReceiveRow): number | null => {
    if (!selectedRecord) return null;
    const amount = parseFloat(row.amount) || 0;
    const price = row.receiveType === 'electricity'
      ? selectedRecord.electricityPrice
      : selectedRecord.waterPrice;
    if (amount <= 0 || !price || price <= 0) return null;
    return Math.round((amount / price) * 100) / 100;
  };

  /** 用量 = 费用总额 ÷ 单价 倒算（保留两位小数；总额或单价≤0 时返回空） */
  const calcUsage = (total: string, price: string): string => {
    const t = parseFloat(total);
    const p = parseFloat(price);
    if (!t || t <= 0 || !p || p <= 0) return '';
    return (Math.round((t / p) * 100) / 100).toFixed(2);
  };

  const handleOpenDetailDialog = (record: UtilityRecord) => {
    setSelectedRecord(record);
    setIsDetailDialogOpen(true);
  };

  const handleDeleteRecord = async (record: UtilityRecord) => {
    if (!(await showConfirm('确定要删除这条水电费记录吗？此操作不可恢复。'))) return;
    try {
      await utilityApi.delete(record.id);
      toast.success('删除成功');
      loadData();
    } catch (error) {
      logger.error('删除水电费失败:', error);
      toast.error('删除失败');
    }
  };

  const handleRecordSubmit = async () => {
    if (!selectedContract) return;

    const electricityTotal = parseFloat(recordForm.electricityTotal) || 0;
    const electricityPrice = parseFloat(recordForm.electricityPrice) || 0;
    const waterTotal = parseFloat(recordForm.waterTotal) || 0;
    const waterPrice = parseFloat(recordForm.waterPrice) || 0;

    if (!recordForm.period) {
      toast.error('请选择所属期');
      return;
    }
    if (electricityTotal > 0 && electricityPrice <= 0) {
      toast.error('电费总额填写后需同时填写电费单价');
      return;
    }
    if (waterTotal > 0 && waterPrice <= 0) {
      toast.error('水费总额填写后需同时填写水费单价');
      return;
    }

    // 用量 = 费用总额 ÷ 单价 倒算（保留两位小数）
    const electricityUsage = electricityPrice > 0
      ? Math.round((electricityTotal / electricityPrice) * 100) / 100
      : 0;
    const waterUsage = waterPrice > 0
      ? Math.round((waterTotal / waterPrice) * 100) / 100
      : 0;

    setSubmitting(true);
    try {
      if (editingRecord) {
        await utilityApi.update(editingRecord.id, {
          electricityUsage,
          electricityPrice,
          waterUsage,
          waterPrice,
          totalElectricityFee: electricityTotal,
          totalWaterFee: waterTotal,
        });
        toast.success('水电费修改成功');
      } else {
        await utilityApi.create({
          contractId: selectedContract.id,
          period: recordForm.period,
          electricityUsage,
          electricityPrice,
          waterUsage,
          waterPrice,
          totalElectricityFee: electricityTotal,
          totalWaterFee: waterTotal,
          recordDate: new Date().toISOString().slice(0, 10),
        });
        toast.success('水电费登记成功');
      }
      setIsRecordDialogOpen(false);
      setEditingRecord(null);
      loadData();
    } catch (error) {
      logger.error('保存水电费失败:', error);
      toast.error('保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReceiveSubmit = async () => {
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
      // 该类型已收 + 本次合计不得超过应收
      const info = receiveRowInfo(row);
      if (info && info.total > info.remaining) {
        toast.error(
          `${RECEIVE_TYPE_LABEL[row.receiveType]}不能超过剩余应收 ${formatCurrency(info.remaining)}`,
        );
        return;
      }
    }

    // 二次提醒：最终仍为部分收款的类型
    const partialTypes = ['electricity', 'water'].filter((t) => {
      const rows = receiveRows.filter((r) => r.receiveType === t);
      if (rows.length === 0) return false;
      const info = receiveRowInfo(rows[0]);
      if (!info) return false;
      const finalReceived = info.received + info.total;
      return finalReceived < info.receivable && finalReceived > 0;
    });
    if (partialTypes.length > 0) {
      const confirmed = await showConfirm(
        '该期水电费仍有款项未收齐，本次将保存为部分收款。确定继续吗？',
      );
      if (!confirmed) return;
    }

    setReceiveSubmitting(true);
    try {
      await receiptApi.create({
        refType: 'utility',
        refId: selectedRecord.id,
        items: receiveRows.map((r) => ({
          receiveType: r.receiveType,
          amount: parseFloat(r.amount),
          receiveDate: r.receiveDate,
          period: selectedRecord.period,
        })),
      });
      toast.success('收款登记成功');
      setIsReceiveDialogOpen(false);
      loadData();
    } catch (error) {
      logger.error('收款登记失败:', error);
      toast.error('收款登记失败');
    } finally {
      setReceiveSubmitting(false);
    }
  };

  /** 删除已收款记录：删除后同步回写水电费已收金额 */
  const handleDeleteReceipt = async (rec: ReceiveRecord) => {
    const confirmed = await showConfirm(
      '确定删除该笔收款记录吗？删除后将同步回写水电费已收金额。',
    );
    if (!confirmed) return;
    try {
      await receiptApi.remove(rec.id);
      toast.success('删除成功，水电费已收金额已回写');
      if (selectedRecord) {
        try {
          const res = await receiptApi.getList({
            refId: selectedRecord.id,
            pageSize: 200,
          });
          setExistingReceipts(res.data?.items || []);
        } catch {
          setExistingReceipts([]);
        }
        loadData();
      }
    } catch (error) {
      logger.error('删除收款记录失败:', error);
      toast.error('删除失败');
    }
  };

  const getPaymentStatus = (record: UtilityRecord) => {
    const elecReceived = record.electricityReceived ?? 0;
    const waterAmt = record.waterReceived ?? 0;
    const totalReceived = elecReceived + waterAmt;
    const totalFee = record.totalElectricityFee + record.totalWaterFee;
    if (totalReceived >= totalFee) return '已收齐';
    if (totalReceived > 0) return '部分收款';
    return '未收款';
  };

  const filteredRecords = useMemo(() => {
    let records = utilityRecords;
    if (searchText) {
      records = records.filter((r) =>
        r.tenant.toLowerCase().includes(searchText.toLowerCase()),
      );
    }
    if (selectedPeriod && selectedPeriod !== 'all') {
      records = records.filter((r) => r.period === selectedPeriod);
    }
    if (selectedPaymentStatus && selectedPaymentStatus !== 'all') {
      records = records.filter((r) => getPaymentStatus(r) === selectedPaymentStatus);
    }
    if (selectedProperty && selectedProperty !== 'all') {
      records = records.filter((r) => getRecordPropertyName(r) === selectedProperty);
    }
    if (selectedReceivePeriod && selectedReceivePeriod !== 'all') {
      records = records.filter((r) => (r.receiveDate || '').startsWith(selectedReceivePeriod));
    }
    return records.sort(
      (a, b) => new Date(b.recordDate).getTime() - new Date(a.recordDate).getTime(),
    );
  }, [
    utilityRecords,
    searchText,
    selectedPeriod,
    selectedPaymentStatus,
    selectedProperty,
    selectedReceivePeriod,
  ]);

  const getColumnWidth = useCallback((key: string) => {
    return columnWidths[key] ?? RECORD_DEFAULT_WIDTHS[key] ?? 120;
  }, [columnWidths]);

  const handleResize = useCallback((key: string) => (_: React.SyntheticEvent, data: { size: { width: number } }) => {
    setColumnWidths((prev) => ({ ...prev, [key]: data.size.width }));
  }, []);

  const calcAutoFitWidth = useCallback((colKey: string) => {
    const colIndex = RECORD_COLUMN_KEYS.indexOf(colKey);
    if (colIndex === -1) return;
    const rootEl = document.querySelector('.utility-record-table');
    if (!rootEl) return;
    const bodyEl = rootEl.querySelector('.ant-table-body');
    if (!bodyEl) return;
    const cells = bodyEl.querySelectorAll(`tr td:nth-child(${colIndex + 1})`);
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
    const headerCells = rootEl.querySelectorAll('.ant-table-thead th');
    const headerText = headerCells[colIndex] ? (headerCells[colIndex] as HTMLElement).innerText : '';
    if (headerText) {
      maxWidth = Math.max(maxWidth, ctx.measureText(headerText).width);
    }
    const newWidth = Math.max(60, Math.ceil(maxWidth) + 36);
    setColumnWidths((prev) => ({ ...prev, [colKey]: newWidth }));
  }, []);

  // 数据加载完成后自动适配列宽一次（避免筛选变化反复重测导致测量抖动/列宽偏窄重叠）
  useEffect(() => {
    if (utilityRecords.length === 0) return;
    const timer = setTimeout(() => {
      RECORD_COLUMN_KEYS.forEach((key) => calcAutoFitWidth(key));
      // 分页只渲染当前页，DOM 测量不到其他页的超长文本（如超长公司全称）：
      // 承租方列按全部记录全量测量校准，避免翻页后长文本溢出遮挡相邻列
      const maxTenantWidth = utilityRecords.reduce(
        (max, r) => Math.max(max, measureTextWidth(r.tenant || '')),
        0,
      );
      const headerWidth = measureTextWidth('承租方');
      const tenantWidth = Math.max(60, Math.ceil(Math.max(maxTenantWidth, headerWidth)) + 36);
      setColumnWidths((prev) => ({ ...prev, tenant: Math.max(prev.tenant ?? 0, tenantWidth) }));
    }, 60);
    return () => clearTimeout(timer);
  }, [utilityRecords, calcAutoFitWidth]);

  const handleExport = () => {
    try {
      const headers = [
        '房产名称', '承租方', '合同编号', '所属期',
        '用电量(度)', '电费单价(元/度)', '电费总额(元)',
        '用水量(吨)', '水费单价(元/吨)', '水费总额(元)',
        '费用合计(元)', '已收金额(元)', '收款状态',
        '最后缴纳期限', '逾期天数', '登记日期', '收款日期',
      ];
      const rows = filteredRecords.map((record) => [
        getRecordPropertyName(record) || '-',
        record.tenant,
        record.contractNo,
        record.period,
        record.electricityUsage,
        record.electricityPrice,
        +(record.totalElectricityFee).toFixed(2),
        record.waterUsage,
        record.waterPrice,
        +(record.totalWaterFee).toFixed(2),
        +((record.totalElectricityFee + record.totalWaterFee)).toFixed(2),
        +((record.electricityReceived ?? 0) + (record.waterReceived ?? 0)).toFixed(2),
        getPaymentStatus(record),
        getDueDate(record.period),
        (() => {
          const dueDate = new Date(getDueDate(record.period));
          const refDate = record.receiveDate ? new Date(record.receiveDate) : new Date();
          const diffDays = Math.ceil(
            (refDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          return diffDays < 0 ? '未逾期' : `${diffDays}天`;
        })(),
        record.recordDate,
        record.receiveDate || '-',
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [
        { wch: 22 }, { wch: 24 }, { wch: 20 }, { wch: 10 },
        { wch: 12 }, { wch: 14 }, { wch: 12 },
        { wch: 12 }, { wch: 14 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 10 },
        { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '水电费登记记录');
      XLSX.writeFile(wb, `水电费登记记录_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('导出成功');
    } catch {
      toast.error('导出失败');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case '已收齐':
        return <Badge className="bg-success/10 text-success border border-success/20">已收齐</Badge>;
      case '部分收款':
        return <Badge className="bg-warning/10 text-warning border border-warning/20">部分收款</Badge>;
      default:
        return <Badge className="bg-destructive/10 text-destructive border border-destructive/20">未收款</Badge>;
    }
  };

  const getDueDate = (period: string): string => {
    const [year, month] = period.split('-').map(Number);
    const nextMonth = new Date(year, month, 1);
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
    const dueDay = lastDay - 1;
    return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
  };

  const recordColumns = [
    {
      title: '房产名称',
      key: 'recordPropertyName',
      width: getColumnWidth('recordPropertyName'),
      onHeaderCell: () => ({
        width: getColumnWidth('recordPropertyName'),
        onResize: handleResize('recordPropertyName'),
        onDoubleClickResize: () => calcAutoFitWidth('recordPropertyName'),
      }),
      render: (_: unknown, record: UtilityRecord) => {
        const propertyName = getRecordPropertyName(record);
        return propertyName ? (
          <span>{propertyName}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
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
      title: '所属期',
      dataIndex: 'period',
      key: 'period',
      width: getColumnWidth('period'),
      onHeaderCell: () => ({
        width: getColumnWidth('period'),
        onResize: handleResize('period'),
        onDoubleClickResize: () => calcAutoFitWidth('period'),
      }),
    },
    {
      title: '电费总额',
      key: 'electricityFee',
      width: getColumnWidth('electricityFee'),
      onHeaderCell: () => ({
        width: getColumnWidth('electricityFee'),
        onResize: handleResize('electricityFee'),
        onDoubleClickResize: () => calcAutoFitWidth('electricityFee'),
      }),
      render: (_: unknown, record: UtilityRecord) => (
        <span className="font-mono">¥{record.totalElectricityFee.toFixed(2)}</span>
      ),
    },
    {
      title: '水费总额',
      key: 'waterFee',
      width: getColumnWidth('waterFee'),
      onHeaderCell: () => ({
        width: getColumnWidth('waterFee'),
        onResize: handleResize('waterFee'),
        onDoubleClickResize: () => calcAutoFitWidth('waterFee'),
      }),
      render: (_: unknown, record: UtilityRecord) => (
        <span className="font-mono">¥{record.totalWaterFee.toFixed(2)}</span>
      ),
    },
    {
      title: '费用合计',
      key: 'totalFee',
      width: getColumnWidth('totalFee'),
      onHeaderCell: () => ({
        width: getColumnWidth('totalFee'),
        onResize: handleResize('totalFee'),
        onDoubleClickResize: () => calcAutoFitWidth('totalFee'),
      }),
      render: (_: unknown, record: UtilityRecord) => (
        <span className="font-mono font-medium">
          ¥{(record.totalElectricityFee + record.totalWaterFee).toFixed(2)}
        </span>
      ),
    },
    {
      title: '已收金额',
      key: 'received',
      width: getColumnWidth('received'),
      onHeaderCell: () => ({
        width: getColumnWidth('received'),
        onResize: handleResize('received'),
        onDoubleClickResize: () => calcAutoFitWidth('received'),
      }),
      render: (_: unknown, record: UtilityRecord) => {
        const totalReceived = (record.electricityReceived ?? 0) + (record.waterReceived ?? 0);
        return <span className="font-mono">¥{totalReceived.toFixed(2)}</span>;
      },
    },
    {
      title: '收款状态',
      key: 'status',
      width: getColumnWidth('status'),
      onHeaderCell: () => ({
        width: getColumnWidth('status'),
        onResize: handleResize('status'),
        onDoubleClickResize: () => calcAutoFitWidth('status'),
      }),
      render: (_: unknown, record: UtilityRecord) => getStatusBadge(getPaymentStatus(record)),
    },
    {
      title: '最后缴纳期限',
      key: 'dueDate',
      width: getColumnWidth('dueDate'),
      onHeaderCell: () => ({
        width: getColumnWidth('dueDate'),
        onResize: handleResize('dueDate'),
        onDoubleClickResize: () => calcAutoFitWidth('dueDate'),
      }),
      render: (_: unknown, record: UtilityRecord) => getDueDate(record.period),
    },
    {
      title: '逾期天数',
      key: 'overdueDays',
      width: getColumnWidth('overdueDays'),
      align: 'center' as const,
      onHeaderCell: () => ({
        width: getColumnWidth('overdueDays'),
        onResize: handleResize('overdueDays'),
        onDoubleClickResize: () => calcAutoFitWidth('overdueDays'),
      }),
      render: (_: unknown, record: UtilityRecord) => {
        const dueDate = new Date(getDueDate(record.period));
        const refDate = record.receiveDate
          ? new Date(record.receiveDate)
          : new Date();
        const diffDays = Math.ceil(
          (refDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (diffDays < 0) {
          return <span className="text-success">未逾期</span>;
        }
        return <span className="text-destructive font-mono">{diffDays}天</span>;
      },
    },
    {
      title: '登记日期',
      dataIndex: 'recordDate',
      key: 'recordDate',
      width: getColumnWidth('recordDate'),
      onHeaderCell: () => ({
        width: getColumnWidth('recordDate'),
        onResize: handleResize('recordDate'),
        onDoubleClickResize: () => calcAutoFitWidth('recordDate'),
      }),
    },
    {
      title: '收款日期',
      key: 'receiveDate',
      width: getColumnWidth('receiveDate'),
      onHeaderCell: () => ({
        width: getColumnWidth('receiveDate'),
        onResize: handleResize('receiveDate'),
        onDoubleClickResize: () => calcAutoFitWidth('receiveDate'),
      }),
      render: (_: unknown, record: UtilityRecord) => (
        record.receiveDate ? <span>{record.receiveDate}</span> : <span className="text-muted-foreground">-</span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: getColumnWidth('action'),
      fixed: 'right' as const,
      onHeaderCell: () => ({
        width: getColumnWidth('action'),
        onResize: handleResize('action'),
      }),
      render: (_: unknown, record: UtilityRecord) => {
        const totalReceived = (record.electricityReceived ?? 0) + (record.waterReceived ?? 0);
        const totalFee = record.totalElectricityFee + record.totalWaterFee;
        const isPaid = totalReceived >= totalFee;
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleOpenDetailDialog(record)}
              title="查看"
            >
              <EyeIcon className="w-4 h-4" />
            </Button>
            <CanPoint action="edit" subject="Utility">
              {!isPaid && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleOpenEditDialog(record)}
                  title="修改"
                >
                  <PencilIcon className="w-4 h-4" />
                </Button>
              )}
            </CanPoint>
            <CanPoint action="receive" subject="Utility">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleOpenReceiveDialog(record)}
                title={isPaid ? '修改收款' : '收款'}
              >
                <span className="font-medium text-base">¥</span>
              </Button>
            </CanPoint>
            <CanPoint action="edit" subject="Utility">
              {!isPaid && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDeleteRecord(record)}
                  title="删除"
                >
                  <Trash2Icon className="w-4 h-4" />
                </Button>
              )}
            </CanPoint>
          </div>
        );
      },
    },
  ];

  const recordScrollX = recordColumns.reduce(
    (sum: number, col) => sum + (typeof col.width === 'number' ? col.width : 120),
    0,
  );

  // 需收水电费租户列表的承租方列宽：按全部租户最长名称全量测量，避免超长公司全称溢出遮挡
  const contractTenantWidth = useMemo(() => {
    const maxWidth = utilityContracts.reduce(
      (max, g) => Math.max(max, measureTextWidth(g.tenant || '')),
      0,
    );
    return Math.max(160, Math.ceil(maxWidth) + 36);
  }, [utilityContracts]);

  const contractColumns = [
    {
      title: '承租方',
      dataIndex: 'tenant',
      key: 'tenant',
      width: contractTenantWidth,
    },
    {
      title: '房产',
      key: 'propertyName',
      width: 140,
      render: (_: unknown, record: ITenantGroup) =>
        record.propertyName ? (
          <Badge variant="outline">{record.propertyName}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      title: '关联合同数量',
      key: 'contractCount',
      width: 130,
      render: (_: unknown, record: ITenantGroup) => (
        <Badge variant="secondary">{record.contractCount} 个合同</Badge>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: () => (
        <Badge className="bg-success/10 text-success border border-success/20">
          履行中
        </Badge>
      ),
    },
  ];

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">水电费管理</h1>
          <p className="text-muted-foreground mt-1">
            后勤人员登记水电费，财务人员查看和录入收款
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ZapIcon className="w-5 h-5 text-warning" />
            需要收取水电费的租户
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table
            columns={contractColumns}
            dataSource={utilityContracts}
            rowKey="id"
            loading={loading}
            scroll={{ x: 600 }}
            pagination={{ pageSize: 5 }}
            locale={{ emptyText: '暂无需要收取水电费的合同' }}
            expandable={{
              expandedRowRender: (record: ITenantGroup) => {
                const today = new Date();
                const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                const filteredPeriods = record.periods.filter((period) => {
                  const periodDate = new Date(period.period + '-01');
                  return periodDate < currentMonth && !period.isRegistered;
                });

                return (
                  <div className="bg-muted/30 p-4 rounded-sm">
                    <div className="text-sm font-medium mb-3">所属期明细</div>
                    {filteredPeriods.length === 0 ? (
                      <div className="text-center text-muted-foreground py-6">
                        暂无待登记的所属期
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {filteredPeriods.map((period) => (
                          <div
                            key={`${period.contractId}-${period.period}`}
                            className="flex items-center justify-between bg-card border border-border rounded-sm p-3"
                          >
                            <div>
                              <div className="font-mono font-medium">{period.period}</div>
                              <div className="text-xs text-muted-foreground">{period.contractNo}</div>
                            </div>
                            <CanPoint action="edit" subject="Utility">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const contract = contracts.find((c) => c.id === period.contractId);
                                  if (contract) {
                                    handleOpenRecordDialog(contract, period.period);
                                  }
                                }}
                              >
                                登记
                              </Button>
                            </CanPoint>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              },
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <DropletsIcon className="w-5 h-5 text-info" />
              水电费登记记录
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleExport} title="导出当前筛选条件下的记录">
                <FileDownIcon className="w-4 h-4 mr-1.5" />
                导出 Excel
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <span className="block text-xs text-muted-foreground">房产名称</span>
              <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="房产名称" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部房产</SelectItem>
                  {availableProperties.map((propertyName) => (
                    <SelectItem key={propertyName} value={propertyName}>{propertyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="block text-xs text-muted-foreground">承租方</span>
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索承租方"
                  className="pl-9 w-64"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <span className="block text-xs text-muted-foreground">费用所属期</span>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="费用所属期" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部费用所属期</SelectItem>
                  {availablePeriods.map((period) => (
                    <SelectItem key={period} value={period}>{period}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="block text-xs text-muted-foreground">收款所属期</span>
              <Select value={selectedReceivePeriod} onValueChange={setSelectedReceivePeriod}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="收款所属期" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部收款所属期</SelectItem>
                  {availableReceivePeriods.map((period) => (
                    <SelectItem key={period} value={period}>{period}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="block text-xs text-muted-foreground">收款状态</span>
              <Select value={selectedPaymentStatus} onValueChange={setSelectedPaymentStatus}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="收款状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部收款状态</SelectItem>
                  <SelectItem value="未收款">未收款</SelectItem>
                  <SelectItem value="部分收款">部分收款</SelectItem>
                  <SelectItem value="已收齐">已收齐</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="utility-record-table p-0 [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <Table
            columns={recordColumns}
            dataSource={filteredRecords}
            rowKey="id"
            components={{ header: { cell: ResizableTitle } }}
            scroll={{ x: recordScrollX }}
            loading={loading}
            pagination={{ pageSize: 10 }}
            locale={{ emptyText: '暂无水电费登记记录' }}
            summary={() => {
              const keys = recordColumns.map((c) => String(c.key));
              const moneyMap: Record<string, number> = {
                electricityFee: filteredRecords.reduce((sum, r) => sum + r.totalElectricityFee, 0),
                waterFee: filteredRecords.reduce((sum, r) => sum + r.totalWaterFee, 0),
                totalFee: filteredRecords.reduce((sum, r) => sum + r.totalElectricityFee + r.totalWaterFee, 0),
                received: filteredRecords.reduce((sum, r) => sum + (r.electricityReceived ?? 0) + (r.waterReceived ?? 0), 0),
              };
              return (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    {keys.map((key, idx) => {
                      if (key in moneyMap) {
                        return (
                          <Table.Summary.Cell key={key} index={idx} align="right">
                            <span className="font-semibold">
                              ¥{moneyMap[key].toFixed(2)}
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

      <Dialog open={isRecordDialogOpen} onOpenChange={setIsRecordDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRecord ? '修改水电费' : '登记水电费'}</DialogTitle>
          </DialogHeader>
          {(() => {
            const hasReceived = editingRecord && (
              ((editingRecord.electricityReceived ?? 0) > 0) ||
              ((editingRecord.waterReceived ?? 0) > 0)
            );
            return (
              <div className="space-y-4 py-4">
                {selectedContract && (
                  <div className="bg-muted/50 p-3 rounded-sm text-sm space-y-1">
                    <div><span className="text-muted-foreground">合同编号：</span>{selectedContract.contractNo}</div>
                    <div><span className="text-muted-foreground">承租方：</span>{selectedContract.tenant}</div>
                    {selectedContract.propertyName && (
                      <div><span className="text-muted-foreground">房产名称：</span>{selectedContract.propertyName}</div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="period">所属期 <span className="text-destructive">*</span></Label>
                  {presetPeriodLocked || !!editingRecord ? (
                    <Input
                      id="period"
                      type="month"
                      value={recordForm.period}
                      disabled
                    />
                  ) : (
                    <Select
                      value={recordForm.period}
                      onValueChange={(v) => setRecordForm({ ...recordForm, period: v })}
                    >
                      <SelectTrigger id="period" className="w-full">
                        <SelectValue placeholder="选择所属期" />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePeriodsForTenant.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            暂无可用期间
                          </div>
                        ) : (
                          availablePeriodsForTenant.map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="electricityTotal">电费总额 (元)</Label>
                    <Input
                      id="electricityTotal"
                      type="number"
                      placeholder="0.00"
                      value={recordForm.electricityTotal}
                      disabled={!!editingRecord && !!hasReceived}
                      onChange={(e) => setRecordForm({ ...recordForm, electricityTotal: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="electricityPrice">电费单价 (元/度)</Label>
                    <Input
                      id="electricityPrice"
                      type="number"
                      placeholder="0.00"
                      value={recordForm.electricityPrice}
                      disabled={!!editingRecord && !!hasReceived}
                      onChange={(e) => setRecordForm({ ...recordForm, electricityPrice: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="electricityUsage">用电量 (度)</Label>
                  <Input
                    id="electricityUsage"
                    type="number"
                    placeholder="0.00"
                    value={calcUsage(recordForm.electricityTotal, recordForm.electricityPrice)}
                    readOnly
                    className="bg-muted/50"
                  />
                  <p className="text-xs text-muted-foreground">用电量 = 电费总额 ÷ 电费单价，自动计算</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="waterTotal">水费总额 (元)</Label>
                    <Input
                      id="waterTotal"
                      type="number"
                      placeholder="0.00"
                      value={recordForm.waterTotal}
                      disabled={!!editingRecord && !!hasReceived}
                      onChange={(e) => setRecordForm({ ...recordForm, waterTotal: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="waterPrice">水费单价 (元/吨)</Label>
                    <Input
                      id="waterPrice"
                      type="number"
                      placeholder="0.00"
                      value={recordForm.waterPrice}
                      disabled={!!editingRecord && !!hasReceived}
                      onChange={(e) => setRecordForm({ ...recordForm, waterPrice: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="waterUsage">用水量 (吨)</Label>
                  <Input
                    id="waterUsage"
                    type="number"
                    placeholder="0.00"
                    value={calcUsage(recordForm.waterTotal, recordForm.waterPrice)}
                    readOnly
                    className="bg-muted/50"
                  />
                  <p className="text-xs text-muted-foreground">用水量 = 水费总额 ÷ 水费单价，自动计算</p>
                </div>
                <div className="bg-muted/50 p-3 rounded-sm">
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">电费总额：</span>
                      <span className="font-mono">
                        ¥{(parseFloat(recordForm.electricityTotal) || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">水费总额：</span>
                      <span className="font-mono">
                        ¥{(parseFloat(recordForm.waterTotal) || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between font-medium pt-1 border-t">
                      <span>费用合计：</span>
                      <span className="font-mono">
                        ¥{(
                          (parseFloat(recordForm.electricityTotal) || 0) +
                          (parseFloat(recordForm.waterTotal) || 0)
                        ).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRecordDialogOpen(false)}>取消</Button>
            <Button onClick={handleRecordSubmit} disabled={submitting}>保存登记</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isReceiveDialogOpen} onOpenChange={setIsReceiveDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>登记水电费收款</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedRecord && (
              <>
                <div className="bg-muted/50 p-3 rounded-sm text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-muted-foreground">房产名称：</span>
                      <span className="font-medium">{contracts.find((c) => c.id === selectedRecord.contractId)?.propertyName || '-'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span><span className="text-muted-foreground">所属期：</span><span className="font-medium">{selectedRecord.period}</span></span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const date = dayjs(selectedRecord.period + '-01').endOf('month').subtract(2, 'day').format('YYYY-MM-DD');
                          setReceiveRows((prev) => prev.map((r) => ({ ...r, receiveDate: date })));
                        }}
                      >
                        未逾期收款
                      </Button>
                    </div>
                    <div>
                      <span className="text-muted-foreground">租户编码：</span>
                      <span className="font-medium">{selectedRecord.customerCode || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">承租方：</span>
                      <span className="font-medium">{selectedRecord.tenant}</span>
                    </div>
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
                                {RECEIVE_TYPE_LABEL[rec.receiveType as 'water' | 'electricity'] ??
                                  rec.receiveType}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 font-medium">
                              {formatCurrency(Number(rec.amount))}
                            </td>
                            <td className="py-2 px-3">{rec.receiveDate}</td>
                            <td className="py-2 px-3 text-muted-foreground">
                              {rec.unitQty != null
                                ? `${Number(rec.unitQty)} ${rec.receiveType === 'electricity' ? '度' : '吨'}`
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

                {getPaymentStatus(selectedRecord) !== '已收齐' && (
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
                        const info = receiveRowInfo(row);
                        let excess = false;
                        let partial = false;
                        if (info) {
                          excess = info.total > info.remaining;
                          partial = !excess && info.total > 0 && info.total < info.remaining;
                        }
                        const unitQty = calcUnitQty(row);
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
                                {info && info.remaining > 0 && (
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
                                  应收 {formatCurrency(info.receivable)} · 已收{' '}
                                  {formatCurrency(info.received)} · 剩余应收{' '}
                                  {formatCurrency(info.remaining)}
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
                              <span className="block mt-2">
                                {unitQty != null
                                  ? `${unitQty} ${row.receiveType === 'electricity' ? '度' : '吨'}`
                                  : '-'}
                              </span>
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
                    onClick={() => handleAddReceiveRow('electricity')}
                  >
                    + 新增电费行
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddReceiveRow('water')}
                  >
                    + 新增水费行
                  </Button>
                </div>
                </>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            {selectedRecord && getPaymentStatus(selectedRecord) === '已收齐' ? (
              <Button variant="outline" onClick={() => setIsReceiveDialogOpen(false)}>关闭</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsReceiveDialogOpen(false)}>取消</Button>
                <Button onClick={handleReceiveSubmit} disabled={receiveSubmitting}>确认收款</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>水电费明细</DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">合同编号：</span>
                  <span className="font-medium ml-1">{selectedRecord.contractNo}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">所属期：</span>
                  <span className="font-medium ml-1">{selectedRecord.period}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">承租方：</span>
                  <span className="font-medium ml-1">{selectedRecord.tenant}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">房产名称：</span>
                  <span className="font-medium ml-1">
                    {contracts.find((c) => c.id === selectedRecord.contractId)?.propertyName || '-'}
                  </span>
                </div>
              </div>

              <div className="border rounded-sm">
                <div className="bg-muted/50 px-4 py-2 text-sm font-medium border-b">电费明细</div>
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">用电量：</span>
                    <span>{selectedRecord.electricityUsage} 度</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">单价：</span>
                    <span>¥{selectedRecord.electricityPrice.toFixed(2)}/度</span>
                  </div>
                  <div className="flex justify-between font-medium pt-1 border-t">
                    <span>电费总额：</span>
                    <span className="font-mono">¥{selectedRecord.totalElectricityFee.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="border rounded-sm">
                <div className="bg-muted/50 px-4 py-2 text-sm font-medium border-b">水费明细</div>
                <div className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">用水量：</span>
                    <span>{selectedRecord.waterUsage} 吨</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">单价：</span>
                    <span>¥{selectedRecord.waterPrice.toFixed(2)}/吨</span>
                  </div>
                  <div className="flex justify-between font-medium pt-1 border-t">
                    <span>水费总额：</span>
                    <span className="font-mono">¥{selectedRecord.totalWaterFee.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-primary/5 p-4 rounded-sm">
                <div className="flex justify-between items-center">
                  <span className="font-medium">费用合计</span>
                  <span className="font-mono text-lg font-semibold">
                    ¥{(selectedRecord.totalElectricityFee + selectedRecord.totalWaterFee).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t">
                <div>
                  <span className="text-muted-foreground">登记日期：</span>
                  <span>{selectedRecord.recordDate}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">登记人：</span>
                  <span>{selectedRecord.recordedBy}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">已收金额：</span>
                  <span className="font-mono">¥{((selectedRecord.electricityReceived ?? 0) + (selectedRecord.waterReceived ?? 0)).toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">收款状态：</span>
                  {getStatusBadge(getPaymentStatus(selectedRecord))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsDetailDialogOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UtilitiesPage;
