import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table } from '@lark-apaas/client-toolkit/antd-table';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { SearchIcon, FileDownIcon, RotateCcwIcon, PencilIcon } from 'lucide-react';
import { CanPoint } from '@/components/PermissionGate';
import ResizableTitle from '@/components/ResizableTitle';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { receiptApi } from '@/api';
import type { ReceiveRecord, ReceiveType } from '@shared/api.interface';

const RECEIVE_TYPE_OPTIONS: Array<{ value: ReceiveType; label: string }> = [
  { value: 'rent', label: '租金' },
  { value: 'property_fee', label: '物业费' },
  { value: 'water', label: '水费' },
  { value: 'electricity', label: '电费' },
];

const RECEIVE_TYPE_LABEL: Record<ReceiveType, string> = {
  rent: '租金',
  property_fee: '物业费',
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

const DEFAULT_WIDTHS: Record<string, number> = {
  propertyName: 160,
  contractNo: 140,
  customerCode: 130,
  tenant: 200,
  receiveType: 90,
  receiveDate: 120,
  period: 100,
  unit: 90,
  unitQty: 100,
  amount: 130,
  invoiceNo: 170,
};

const COLUMN_KEYS = [
  'propertyName', 'contractNo', 'customerCode', 'tenant', 'receiveType',
  'receiveDate', 'period', 'unit', 'unitQty', 'amount', 'invoiceNo',
];

const ReceiptPage: React.FC = () => {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [searchPropertyName, setSearchPropertyName] = useState('');
  const [searchContractNo, setSearchContractNo] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchReceiveType, setSearchReceiveType] = useState<ReceiveType | 'all'>('all');
  const [searchReceiveStart, setSearchReceiveStart] = useState('');
  const [searchReceiveEnd, setSearchReceiveEnd] = useState('');
  const [searchPeriod, setSearchPeriod] = useState('');
  const [receiptData, setReceiptData] = useState<ReceiveRecord[]>([]);
  const [total, setTotal] = useState(0);
  /** 服务端全量聚合合计（按当前筛选条件统计） */
  const [totals, setTotals] = useState<{ amount: number; unitQty: number } | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editingInvoice, setEditingInvoice] = useState<{ id: string; value: string } | null>(null);

  const getColumnWidth = useCallback((key: string) => {
    return columnWidths[key] ?? DEFAULT_WIDTHS[key] ?? 120;
  }, [columnWidths]);

  const handleResize = useCallback((key: string) => (_: React.SyntheticEvent, data: { size: { width: number } }) => {
    setColumnWidths((prev) => ({ ...prev, [key]: data.size.width }));
  }, []);

  const calcAutoFitWidth = useCallback((colKey: string) => {
    const colIndex = COLUMN_KEYS.indexOf(colKey);
    if (colIndex === -1) return;
    const rootEl = document.querySelector('.receipt-table');
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
    // 纳入列头文字，避免列宽不足导致列头被截断
    const headerCells = bodyEl.parentElement?.querySelectorAll('.ant-table-thead th');
    const headerText = headerCells && headerCells[colIndex] ? (headerCells[colIndex] as HTMLElement).innerText : '';
    if (headerText) {
      maxWidth = Math.max(maxWidth, ctx.measureText(headerText).width);
    }
    const newWidth = Math.max(60, Math.ceil(maxWidth) + 36);
    setColumnWidths((prev) => ({ ...prev, [colKey]: newWidth }));
  }, []);

  const loadData = useCallback(async (params?: Record<string, string | number | undefined>) => {
    setLoading(true);
    try {
      const res = await receiptApi.getList(params);
      setReceiptData(res.data.items || []);
      setTotal(res.data.total || 0);
      setTotals(res.data.totals);
    } catch (error) {
      logger.error('加载收款报表失败:', error);
      toast.error('加载收款报表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData({ page: 1, pageSize });
  }, [loadData, pageSize]);

  // 数据加载完成后自动适配列宽
  useEffect(() => {
    if (receiptData.length === 0) return;
    const timer = setTimeout(() => {
      COLUMN_KEYS.forEach((key) => calcAutoFitWidth(key));
    }, 60);
    return () => clearTimeout(timer);
  }, [receiptData, calcAutoFitWidth]);

  const buildQueryParams = useCallback(() => {
    const params: Record<string, string | number | undefined> = {
      page: currentPage,
      pageSize,
    };
    if (searchPropertyName) params.propertyName = searchPropertyName;
    if (searchContractNo) params.contractNo = searchContractNo;
    if (searchKeyword) params.keyword = searchKeyword;
    if (searchReceiveType !== 'all') params.receiveType = searchReceiveType;
    if (searchReceiveStart) params.receiveStart = searchReceiveStart;
    if (searchReceiveEnd) params.receiveEnd = searchReceiveEnd;
    if (searchPeriod) params.period = searchPeriod;
    return params;
  }, [
    currentPage, pageSize, searchPropertyName, searchContractNo, searchKeyword,
    searchReceiveType, searchReceiveStart, searchReceiveEnd, searchPeriod,
  ]);

  useEffect(() => {
    loadData(buildQueryParams());
  }, [buildQueryParams, loadData]);

  const handleResetFilters = () => {
    setSearchPropertyName('');
    setSearchContractNo('');
    setSearchKeyword('');
    setSearchReceiveType('all');
    setSearchReceiveStart('');
    setSearchReceiveEnd('');
    setSearchPeriod('');
    setEditingInvoice(null);
    setCurrentPage(1);
  };

  const handleInvoiceSave = async (record: ReceiveRecord) => {
    if (!editingInvoice || editingInvoice.id !== record.id) return;
    const value = editingInvoice.value.trim();
    setEditingInvoice(null);
    try {
      await receiptApi.updateInvoice(record.id, { invoiceNo: value || undefined });
      toast.success('发票编号已更新');
      loadData(buildQueryParams());
    } catch (error) {
      logger.error('更新发票编号失败:', error);
      toast.error('保存发票编号失败');
    }
  };

  const handleExport = async () => {
    try {
      const exportParams: Record<string, string | number | undefined> = { page: 1, pageSize: 9999 };
      if (searchPropertyName) exportParams.propertyName = searchPropertyName;
      if (searchContractNo) exportParams.contractNo = searchContractNo;
      if (searchKeyword) exportParams.keyword = searchKeyword;
      if (searchReceiveType !== 'all') exportParams.receiveType = searchReceiveType;
      if (searchReceiveStart) exportParams.receiveStart = searchReceiveStart;
      if (searchReceiveEnd) exportParams.receiveEnd = searchReceiveEnd;
      if (searchPeriod) exportParams.period = searchPeriod;
      const res = await receiptApi.getList(exportParams);
      const exportData = res.data.items || [];

      const headers = ['房产名称', '合同编号', '租户编码', '租户名称', '收款类型', '收款日期', '款项所属期', '单位', '单位数量', '收款金额', '发票编号'];
      const rows = exportData.map((item) => [
        item.propertyName || '-',
        item.receiveType === 'water' || item.receiveType === 'electricity' ? '' : item.contractNo,
        item.customerCode || '-',
        item.tenant,
        RECEIVE_TYPE_LABEL[item.receiveType],
        item.receiveDate || '-',
        item.period || '-',
        item.unit || '-',
        item.unitQty != null ? Number(item.unitQty) : '-',
        item.amount,
        item.invoiceNo || '-',
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [
        { wch: 22 }, { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 10 },
        { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 18 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '收款报表');
      XLSX.writeFile(wb, `收款报表_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('导出成功');
    } catch {
      toast.error('导出失败');
    }
  };

  const columns = useMemo(() => [
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
      title: '合同编号',
      dataIndex: 'contractNo',
      key: 'contractNo',
      width: getColumnWidth('contractNo'),
      // 水电费收款该列留空（数据层仍存，用于回写定位）
      render: (value: string, record: ReceiveRecord) =>
        record.receiveType === 'water' || record.receiveType === 'electricity' ? '' : value,
      onHeaderCell: () => ({
        width: getColumnWidth('contractNo'),
        onResize: handleResize('contractNo'),
        onDoubleClickResize: () => calcAutoFitWidth('contractNo'),
      }),
    },
    {
      title: '租户编码',
      dataIndex: 'customerCode',
      key: 'customerCode',
      width: getColumnWidth('customerCode'),
      render: (value: string) => value || '-',
      onHeaderCell: () => ({
        width: getColumnWidth('customerCode'),
        onResize: handleResize('customerCode'),
        onDoubleClickResize: () => calcAutoFitWidth('customerCode'),
      }),
    },
    {
      title: '租户名称',
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
      title: '收款类型',
      dataIndex: 'receiveType',
      key: 'receiveType',
      width: getColumnWidth('receiveType'),
      render: (value: ReceiveType) => (
        <Badge variant={value === 'rent' ? 'default' : 'outline'}>
          {RECEIVE_TYPE_LABEL[value]}
        </Badge>
      ),
      onHeaderCell: () => ({
        width: getColumnWidth('receiveType'),
        onResize: handleResize('receiveType'),
        onDoubleClickResize: () => calcAutoFitWidth('receiveType'),
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
      title: '款项所属期',
      dataIndex: 'period',
      key: 'period',
      width: getColumnWidth('period'),
      render: (value: string) => value || '-',
      onHeaderCell: () => ({
        width: getColumnWidth('period'),
        onResize: handleResize('period'),
        onDoubleClickResize: () => calcAutoFitWidth('period'),
      }),
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: getColumnWidth('unit'),
      render: (value: string) => value || '-',
      onHeaderCell: () => ({
        width: getColumnWidth('unit'),
        onResize: handleResize('unit'),
        onDoubleClickResize: () => calcAutoFitWidth('unit'),
      }),
    },
    {
      title: '单位数量',
      dataIndex: 'unitQty',
      key: 'unitQty',
      width: getColumnWidth('unitQty'),
      align: 'right' as const,
      render: (value: number) => value != null ? Number(value) : '-',
      onHeaderCell: () => ({
        width: getColumnWidth('unitQty'),
        onResize: handleResize('unitQty'),
        onDoubleClickResize: () => calcAutoFitWidth('unitQty'),
      }),
    },
    {
      title: '收款金额',
      dataIndex: 'amount',
      key: 'amount',
      width: getColumnWidth('amount'),
      align: 'right' as const,
      render: (value: number) => formatCurrency(value),
      onHeaderCell: () => ({
        width: getColumnWidth('amount'),
        onResize: handleResize('amount'),
        onDoubleClickResize: () => calcAutoFitWidth('amount'),
      }),
    },
    {
      title: '发票编号',
      dataIndex: 'invoiceNo',
      key: 'invoiceNo',
      width: getColumnWidth('invoiceNo'),
      render: (value: string, record: ReceiveRecord) =>
        editingInvoice?.id === record.id ? (
          <Input
            autoFocus
            className="h-8"
            placeholder="输入发票编号"
            value={editingInvoice.value}
            onChange={(e) => setEditingInvoice({ id: record.id, value: e.target.value })}
            onBlur={() => handleInvoiceSave(record)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        ) : (
          <CanPoint
            action="edit"
            subject="Receipt"
            fallback={<span className={value ? '' : 'text-muted-foreground'}>{value || '-'}</span>}
          >
            <button
              type="button"
              className="inline-flex items-center gap-1 cursor-pointer hover:text-primary group"
              onClick={() => setEditingInvoice({ id: record.id, value: value || '' })}
              title="点击编辑"
            >
              <span className={value ? '' : 'text-muted-foreground'}>{value || '点击填写'}</span>
              <PencilIcon className="w-3 h-3 opacity-40 group-hover:opacity-100" />
            </button>
          </CanPoint>
        ),
      onHeaderCell: () => ({
        width: getColumnWidth('invoiceNo'),
        onResize: handleResize('invoiceNo'),
        onDoubleClickResize: () => calcAutoFitWidth('invoiceNo'),
      }),
    },
  ], [getColumnWidth, handleResize, calcAutoFitWidth, editingInvoice, handleInvoiceSave]);

  const scrollX = useMemo(() => {
    return columns.reduce((sum: number, col) => {
      return sum + (typeof col.width === 'number' ? col.width : 120);
    }, 0);
  }, [columns]);

  const tableScroll = useMemo(() => ({ x: scrollX }), [scrollX]);

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">收款报表</h1>
          <p className="text-sm text-muted-foreground mt-1">
            汇总台账与水电费的全部收款记录，支持筛选与导出
          </p>
        </div>
        <Button onClick={handleExport} variant="outline">
          <FileDownIcon className="w-4 h-4 mr-2" />
          导出报表
        </Button>
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
              <Label className="text-xs text-muted-foreground mb-2 block">房产名称</Label>
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索房产名称"
                  value={searchPropertyName}
                  onChange={(e) => {
                    setSearchPropertyName(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-2 block">合同编号</Label>
              <Input
                placeholder="搜索合同编号"
                value={searchContractNo}
                onChange={(e) => {
                  setSearchContractNo(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-2 block">租户编码/租户名称</Label>
              <Input
                placeholder="搜索租户"
                value={searchKeyword}
                onChange={(e) => {
                  setSearchKeyword(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-2 block">收款类型</Label>
              <Select
                value={searchReceiveType}
                onValueChange={(v) => {
                  setSearchReceiveType(v as ReceiveType | 'all');
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="全部类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {RECEIVE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <Label className="text-xs text-muted-foreground mb-2 block">收款日期起</Label>
              <Input
                type="date"
                value={searchReceiveStart}
                onChange={(e) => {
                  setSearchReceiveStart(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <Label className="text-xs text-muted-foreground mb-2 block">收款日期止</Label>
              <Input
                type="date"
                value={searchReceiveEnd}
                onChange={(e) => {
                  setSearchReceiveEnd(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>
            <div className="flex-1 min-w-[160px]">
              <Label className="text-xs text-muted-foreground mb-2 block">款项所属期</Label>
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
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0 [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <div className="receipt-table">
            <Table
              columns={columns}
              dataSource={receiptData}
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
                    <p className="text-muted-foreground">暂无收款记录</p>
                    <p className="text-sm text-muted-foreground/60 mt-1">
                      台账/水电费页面登记收款后将在此汇总展示
                    </p>
                  </div>
                ),
              }}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={8}>
                      <span className="font-semibold">合计</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} align="right">
                      <span className="font-semibold">{totals?.unitQty ?? 0}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={9} align="right">
                      <span className="font-semibold">{formatCurrency(totals?.amount ?? 0)}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={10} />
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReceiptPage;