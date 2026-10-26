import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Eye, Edit, Send, Trash2, FileEdit, ChevronRight, ChevronDown, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { toast } from 'sonner';
import { contractApi } from '@/api';
import type { ContractResponse, CreateContractAmendmentDto, ContractAmendmentResponse, AmendmentPeriodItem, AmendmentStageInput } from '@shared/api.interface';
import { CanPoint } from '@/components/PermissionGate';

interface IContract {
  id: string;
  contractNo: string;
  contractType?: 'new_contract' | 'supplement';
  parentContractId?: string;
  landlord: string;
  tenant: string;
  startDate: string;
  endDate: string;
  hasUtilities: boolean;
  paymentMethod: 'monthly' | 'quarterly';
  stages: Array<{
    id?: string;
    startDate: string;
    endDate: string;
    monthlyRent: number;
    monthlyPropertyFee: number;
  }>;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'terminated';
  terminationDate?: string;
  signDate?: string;
  createdAt?: string;
  _createdAt?: string;
  _updatedAt?: string;
  amendments?: ContractAmendmentResponse[];
}

const getStatusBadge = (status: IContract['status']) => {
  if (status === 'terminated') {
    return { label: '已通过', variant: 'outline' as const, className: 'border-success text-success bg-success/10' };
  }
  const config = {
    draft: { label: '草稿', variant: 'outline' as const, className: 'border-muted-foreground text-muted-foreground bg-muted/30' },
    pending: { label: '待审核', variant: 'outline' as const, className: 'border-warning text-warning bg-warning/10' },
    approved: { label: '已通过', variant: 'outline' as const, className: 'border-success text-success bg-success/10' },
    rejected: { label: '已驳回', variant: 'destructive' as const, className: '' },
  };
  return config[status] || { label: '未知', variant: 'outline' as const, className: '' };
};

const getContractStatus = (contract: IContract) => {
  if (contract.status === 'draft') {
    return { label: '草稿', variant: 'outline' as const, className: 'border-muted-foreground text-muted-foreground bg-muted/30' };
  }
  if (contract.status === 'pending') {
    return { label: '待审核', variant: 'outline' as const, className: 'border-warning text-warning bg-warning/10' };
  }
  if (contract.status === 'rejected') {
    return { label: '已驳回', variant: 'destructive' as const, className: '' };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(contract.endDate);
  if (contract.status === 'terminated') {
    if (contract.terminationDate && new Date(contract.terminationDate) < endDate) {
      return { label: '提前终止', variant: 'destructive' as const, className: 'border-destructive/50 text-destructive bg-destructive/10' };
    }
    return { label: '到期终止', variant: 'outline' as const, className: 'border-warning text-warning bg-warning/10' };
  }
  if (today > endDate) {
    return { label: '到期终止', variant: 'outline' as const, className: 'border-warning text-warning bg-warning/10' };
  }
  return { label: '正常履行', variant: 'outline' as const, className: 'border-success text-success bg-success/10' };
};

const getAmendmentStatusBadge = (status: string) => {
  const config: Record<string, { label: string; variant: 'outline' | 'destructive' | 'secondary' | 'default'; className: string }> = {
    pending: { label: '待审核', variant: 'outline', className: 'border-warning text-warning bg-warning/10' },
    approved: { label: '已通过', variant: 'outline', className: 'border-success text-success bg-success/10' },
    rejected: { label: '已驳回', variant: 'destructive', className: '' },
  };
  return config[status] || { label: '未知', variant: 'outline' as const, className: '' };
};

const getChangeTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    rent_reduce: '减免租金',
    rent_increase: '增加租金',
    fee_reduce: '减免物业费',
    fee_increase: '增加物业费',
    utility_enable: '收取水电费',
    utility_disable: '不收取水电费',
  };
  return map[type] || type;
};

const isUtilityChangeType = (type: string) => type === 'utility_enable' || type === 'utility_disable';

const getMonthOptions = (startDate: string | undefined, endDate: string | undefined) => {
  const options: { value: string; label: string }[] = [];
  if (!startDate || !endDate) return options;
  const [sy, sm] = startDate.split('-').map(Number);
  const [ey, em] = endDate.split('-').map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const val = `${y}-${String(m).padStart(2, '0')}`;
    options.push({ value: val, label: val });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return options;
};

const getPaymentMethodLabel = (method: IContract['paymentMethod']) => {
  const config = {
    monthly: '月付',
    quarterly: '季付',
  };
  return config[method];
};

// 平台返回的是 UTC ISO 串，按本地时区取日期，保证单元格显示与区间筛选比的是同一个值
const toLocalDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
};

const inDateRange = (date: string, start: string, end: string) => {
  if (!start && !end) return true;
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
};

const AmendmentExpandRow: React.FC<{ amendments: ContractAmendmentResponse[] }> = ({ amendments }) => {
  if (amendments.length === 0) return null;

  return (
    <div className="bg-muted/30 px-6 py-4 space-y-3">
      <div className="text-sm font-medium text-muted-foreground">变更记录（{amendments.length}条）</div>
      {amendments.map((amendment) => {
        const statusBadge = getAmendmentStatusBadge(amendment.status);
        return (
          <div key={amendment.id} className="bg-card border border-border rounded-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <span className="font-mono font-medium">{amendment.amendmentNo || getChangeTypeLabel(amendment.changeType)}</span>
                <Badge
                  variant={statusBadge.variant}
                  className={`rounded-full text-xs px-2.5 py-0.5 ${statusBadge.className}`}
                >
                  {statusBadge.label}
                </Badge>
                <span className="text-muted-foreground">{getChangeTypeLabel(amendment.changeType)}</span>
                {amendment.signDate && (
                  <span className="text-muted-foreground">签署日期: {amendment.signDate}</span>
                )}
                <span className="text-muted-foreground">
                  {amendment.changeStartDate} ~ {amendment.changeEndDate}
                </span>
              </div>
            </div>

            {amendment.stages.length > 0 && (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left text-xs font-medium text-muted-foreground py-2 pr-4">阶段</th>
                    {amendment.stages.some(s => s.period) ? (
                      <>
                        <th className="text-left text-xs font-medium text-muted-foreground py-2 pr-4">所属期</th>
                        <th className="text-right text-xs font-medium text-muted-foreground py-2 pr-4">月租金</th>
                        <th className="text-right text-xs font-medium text-muted-foreground py-2">月物业费</th>
                      </>
                    ) : (
                      <>
                        <th className="text-left text-xs font-medium text-muted-foreground py-2 pr-4">起止日期</th>
                        <th className="text-right text-xs font-medium text-muted-foreground py-2 pr-4">月租金</th>
                        <th className="text-right text-xs font-medium text-muted-foreground py-2">月物业费</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {amendment.stages.map((stage, idx) => (
                    <tr key={stage.id || idx} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4 text-sm">阶段 {idx + 1}</td>
                      {stage.period ? (
                        <>
                          <td className="py-2 pr-4 text-sm font-mono">{stage.period}</td>
                          <td className="py-2 pr-4 text-sm text-right font-mono">¥{stage.monthlyRent.toLocaleString()}</td>
                          <td className="py-2 text-sm text-right font-mono">¥{stage.monthlyPropertyFee.toLocaleString()}</td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-4 text-sm">{stage.startDate} ~ {stage.endDate}</td>
                          <td className="py-2 pr-4 text-sm text-right font-mono">¥{stage.monthlyRent.toLocaleString()}</td>
                          <td className="py-2 text-sm text-right font-mono">¥{stage.monthlyPropertyFee.toLocaleString()}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {amendment.reviewRemark && (
              <div className="text-sm">
                <span className="text-muted-foreground">审核意见：</span>
                <span className={amendment.status === 'rejected' ? 'text-destructive' : ''}>{amendment.reviewRemark}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const ContractPage: React.FC = () => {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<IContract[]>([]);
  const [filteredContracts, setFilteredContracts] = useState<IContract[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateField, setDateField] = useState<'signDate' | 'createdAt' | 'updatedAt'>('signDate');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<IContract | null>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [amendDialogOpen, setAmendDialogOpen] = useState(false);
  const [amendForm, setAmendForm] = useState<{
    contractId: string;
    amendmentNo: string;
    changeStartDate: string;
    changeEndDate: string;
    changeType: string;
    signDate: string;
    stages: AmendmentStageInput[];
  }>({
    contractId: '',
    amendmentNo: '',
    changeStartDate: '',
    changeEndDate: '',
    changeType: '',
    signDate: '',
    stages: [],
  });
  const [amendmentPeriods, setAmendmentPeriods] = useState<AmendmentPeriodItem[]>([]);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [lastPaidPeriod, setLastPaidPeriod] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadContracts = async () => {
    setLoading(true);
    try {
      const res = await contractApi.getList();
      const items = res.data.items || [];
      setContracts(items as IContract[]);
      setFilteredContracts(items as IContract[]);
    } catch (error) {
      toast.error('加载合同列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContracts();
  }, []);

  useEffect(() => {
    let result = contracts;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.contractNo.toLowerCase().includes(query) ||
          c.tenant.toLowerCase().includes(query) ||
          c.landlord.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((c) => getContractStatus(c).label === statusFilter);
    }

    if (dateStart || dateEnd) {
      result = result.filter((c) => {
        const date =
          dateField === 'signDate'
            ? c.signDate || ''
            : dateField === 'createdAt'
              ? toLocalDate(c._createdAt)
              : toLocalDate(c._updatedAt);
        return inDateRange(date, dateStart, dateEnd);
      });
    }

    setFilteredContracts(result);
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateField, dateStart, dateEnd, contracts]);

  const toggleExpand = (contractId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(contractId)) {
        next.delete(contractId);
      } else {
        next.add(contractId);
      }
      return next;
    });
  };

  const handleDelete = (contract: IContract) => {
    setSelectedContract(contract);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!selectedContract) return;
    try {
      await contractApi.delete(selectedContract.id);
      toast.success('合同已删除');
      await loadContracts();
    } catch (error) {
      toast.error('删除合同失败');
    }
    setDeleteDialogOpen(false);
    setSelectedContract(null);
  };

  const handleSubmitForReview = (contract: IContract) => {
    setSelectedContract(contract);
    setSubmitDialogOpen(true);
  };

  const confirmSubmit = async () => {
    if (!selectedContract) return;
    try {
      await contractApi.submit(selectedContract.id);
      toast.success('合同已提交审核');
      await loadContracts();
    } catch (error) {
      toast.error('提交审核失败');
    }
    setSubmitDialogOpen(false);
    setSelectedContract(null);
  };


  const fetchAmendmentPeriods = async (contractId: string, startDate: string, endDate: string) => {
    if (!startDate || !endDate) {
      setAmendmentPeriods([]);
      setAmendForm(prev => ({ ...prev, stages: [] }));
      return;
    }
    setPeriodsLoading(true);
    try {
      const res = await contractApi.getAmendmentPeriods(contractId, startDate, endDate);
      const periods = res.data;
      setAmendmentPeriods(periods);
      setAmendForm(prev => ({
        ...prev,
        stages: periods.map((p: AmendmentPeriodItem) => ({
          period: p.period,
          stageStartDate: p.stageStartDate,
          stageEndDate: p.stageEndDate,
          monthlyRent: undefined,
          monthlyPropertyFee: undefined,
        })),
      }));
    } catch {
      setAmendmentPeriods([]);
      setAmendForm(prev => ({ ...prev, stages: [] }));
      toast.error('获取变更期间信息失败');
    } finally {
      setPeriodsLoading(false);
    }
  };

  const handleAmend = async (contract: IContract) => {
    setSelectedContract(contract);
    try {
      const res = await contractApi.getLastPaidPeriod(contract.id);
      setLastPaidPeriod(res.data.period);
    } catch {
      setLastPaidPeriod(null);
    }
    setAmendForm({
      contractId: contract.id,
      amendmentNo: '',
      changeStartDate: '',
      changeEndDate: '',
      changeType: '',
      signDate: '',
      stages: [],
    });
    setAmendmentPeriods([]);
    setAmendDialogOpen(true);
  };

  const handleAmendDateChange = (field: 'changeStartDate' | 'changeEndDate', value: string) => {
    const newForm = { ...amendForm, [field]: value };
    setAmendForm(newForm);
    if (newForm.changeStartDate && newForm.changeEndDate && newForm.changeStartDate <= newForm.changeEndDate) {
      fetchAmendmentPeriods(newForm.contractId, newForm.changeStartDate, newForm.changeEndDate);
    } else {
      setAmendmentPeriods([]);
      setAmendForm(prev => ({ ...prev, stages: [] }));
    }
  };

  const handleAmendStageValueChange = (index: number, field: 'monthlyRent' | 'monthlyPropertyFee', value: string) => {
    const newStages = [...amendForm.stages];
    const numValue = value === '' ? undefined : parseFloat(value);
    newStages[index] = { ...newStages[index], [field]: numValue };
    setAmendForm({ ...amendForm, stages: newStages });
  };

  const handleCopyFromPrevious = (index: number) => {
    if (index === 0) return;
    const prev = amendForm.stages[index - 1];
    const newStages = [...amendForm.stages];
    newStages[index] = {
      ...newStages[index],
      monthlyRent: prev.monthlyRent,
      monthlyPropertyFee: prev.monthlyPropertyFee,
    };
    setAmendForm({ ...amendForm, stages: newStages });
  };

  const confirmAmend = async () => {
    const isUtility = isUtilityChangeType(amendForm.changeType);
    if (!isUtility && !amendForm.amendmentNo) {
      toast.error('请填写补充协议合同编号');
      return;
    }
    if (!amendForm.changeStartDate || !amendForm.changeEndDate || !amendForm.changeType) {
      toast.error('请填写完整的变更信息');
      return;
    }
    if (!isUtility && selectedContract && amendForm.changeEndDate === selectedContract.endDate) {
      toast.error('该功能仅用于合同期内部分期间租金、物业费变更，若需要变更合同剩余所有期间请先终止该合同再重新录入一份新合同');
      return;
    }
    if (!isUtility && amendForm.stages.length === 0) {
      toast.error('未获取到变更期间数据，请检查变更日期');
      return;
    }
    const filledStages = isUtility ? [] : amendForm.stages.map((s, idx) => ({
      ...s,
      monthlyRent: s.monthlyRent ?? amendmentPeriods[idx]?.originalRent ?? 0,
      monthlyPropertyFee: s.monthlyPropertyFee ?? amendmentPeriods[idx]?.originalPropertyFee ?? 0,
    }));
    try {
      await contractApi.amend({ ...amendForm, stages: filledStages } as CreateContractAmendmentDto);
      toast.success('合同变更已提交，等待审核');
      setAmendDialogOpen(false);
      await loadContracts();
    } catch (error: any) {
      const msg = error?.response?.data?.message || '合同变更失败';
      toast.error(msg);
    }
  };

  const canEdit = (status: IContract['status']) => {
    return status === 'draft' || status === 'rejected';
  };

  const canSubmit = (status: IContract['status']) => {
    return status === 'rejected';
  };

  const canDelete = (status: IContract['status']) => {
    return status === 'pending' || status === 'rejected';
  };

  return (
    <section className="w-full max-w-[1400px] mx-auto space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-xl font-semibold">合同管理</CardTitle>
            <CanPoint action="create" subject="Contract">
              <Button onClick={() => navigate('/contracts/create')}>
                <Plus className="mr-2 h-4 w-4" />
                新建合同
              </Button>
            </CanPoint>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="relative w-full sm:w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索合同编号、承租方、出租方..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="筛选状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="草稿">草稿</SelectItem>
                  <SelectItem value="待审核">待审核</SelectItem>
                  <SelectItem value="已驳回">已驳回</SelectItem>
                  <SelectItem value="正常履行">正常履行</SelectItem>
                  <SelectItem value="提前终止">提前终止</SelectItem>
                  <SelectItem value="到期终止">到期终止</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Select
              value={dateField}
              onValueChange={(value) => setDateField(value as typeof dateField)}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="选择日期字段" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="signDate">合同签署日期</SelectItem>
                <SelectItem value="createdAt">创建日期</SelectItem>
                <SelectItem value="updatedAt">修改日期</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-[150px]"
            />
            <span className="text-sm text-muted-foreground">至</span>
            <Input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-[150px]"
            />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              加载中...
            </div>
          ) : filteredContracts.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>暂无合同数据</EmptyTitle>
                <EmptyDescription>
                  {searchQuery || statusFilter !== 'all' || dateStart || dateEnd
                    ? '当前筛选条件下没有符合条件的合同'
                    : '点击右上角"新建合同"按钮创建第一条合同记录'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
            <div className="border rounded-sm overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-medium w-10" />
                    <TableHead className="font-medium">合同编号</TableHead>
                    <TableHead className="font-medium">承租方</TableHead>
                    <TableHead className="font-medium">出租方</TableHead>
                    <TableHead className="font-medium">合同起止日期</TableHead>
                    <TableHead className="font-medium">合同签署日期</TableHead>
                    <TableHead className="font-medium">创建日期</TableHead>
                    <TableHead className="font-medium">修改日期</TableHead>
                    <TableHead className="font-medium">支付方式</TableHead>
                    <TableHead className="font-medium">审核状态</TableHead>
                    <TableHead className="font-medium">合同状态</TableHead>
                    <TableHead className="font-medium text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContracts
                    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                    .map((contract) => {
                    const statusBadge = getStatusBadge(contract.status);
                    const hasAmendments = contract.amendments && contract.amendments.length > 0;
                    const isExpanded = expandedRows.has(contract.id);
                    return (
                      <React.Fragment key={contract.id}>
                        <TableRow className="hover:bg-accent/50">
                          <TableCell className="w-10">
                            {hasAmendments && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => toggleExpand(contract.id)}
                              >
                                {isExpanded
                                  ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            <div className="flex items-center gap-2">
                              {contract.contractNo}
                              {hasAmendments && (
                                <Badge variant="outline" className="rounded-full text-xs px-1.5 py-0 border-primary/30 text-primary">
                                  {contract.amendments!.length}次变更
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{contract.tenant}</TableCell>
                          <TableCell>{contract.landlord}</TableCell>
                          <TableCell className="text-sm">
                            {contract.startDate} ~ {contract.endDate}
                          </TableCell>
                          <TableCell className="text-sm font-mono whitespace-nowrap">
                            {contract.signDate || '-'}
                          </TableCell>
                          <TableCell className="text-sm font-mono whitespace-nowrap text-muted-foreground">
                            {toLocalDate(contract._createdAt) || '-'}
                          </TableCell>
                          <TableCell className="text-sm font-mono whitespace-nowrap text-muted-foreground">
                            {toLocalDate(contract._updatedAt) || '-'}
                          </TableCell>
                          <TableCell>{getPaymentMethodLabel(contract.paymentMethod)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={statusBadge.variant}
                              className={`rounded-full text-xs px-2.5 py-0.5 ${statusBadge.className || ''}`}
                            >
                              {statusBadge.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={getContractStatus(contract).variant}
                              className={`rounded-full text-xs px-2.5 py-0.5 ${getContractStatus(contract).className || ''}`}
                            >
                              {getContractStatus(contract).label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => navigate(`/contracts/${contract.id}`)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <CanPoint action="amend" subject="Contract">
                                {contract.status === 'approved' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleAmend(contract)}
                                  >
                                    <FileEdit className="h-4 w-4" />
                                  </Button>
                                )}
                              </CanPoint>
                              <CanPoint action="update" subject="Contract">
                                {canEdit(contract.status) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => navigate(`/contracts/edit/${contract.id}`)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                )}
                              </CanPoint>
                              <CanPoint action="submit" subject="Contract">
                                {canSubmit(contract.status) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleSubmitForReview(contract)}
                                  >
                                    <Send className="h-4 w-4" />
                                  </Button>
                                )}
                              </CanPoint>
                              <CanPoint action="delete" subject="Contract">
                                {canDelete(contract.status) && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => handleDelete(contract)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </CanPoint>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && hasAmendments && (
                          <TableRow>
                            <TableCell colSpan={11} className="p-0 border-0">
                              <AmendmentExpandRow amendments={contract.amendments!} />
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {filteredContracts.length > 0 && (
              <div className="flex items-center justify-between px-2 py-4">
                <div className="text-sm text-muted-foreground">
                  共 {filteredContracts.length} 条记录
                </div>
                <div className="flex items-center gap-4">
                  <Select
                    value={String(itemsPerPage)}
                    onValueChange={(value) => {
                      setItemsPerPage(Number(value));
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[70px] h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from(
                      { length: Math.ceil(filteredContracts.length / itemsPerPage) },
                      (_, i) => i + 1
                    ).filter((p) => {
                      const totalPages = Math.ceil(filteredContracts.length / itemsPerPage);
                      return p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1;
                    }).reduce<(number | string)[]>((acc, p, idx, arr) => {
                      if (idx > 0 && (p as number) - (acc[acc.length - 1] as number) > 1) {
                        acc.push('...');
                      }
                      acc.push(p);
                      return acc;
                    }, []).map((p, i) =>
                      p === '...' ? (
                        <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground text-sm">...</span>
                      ) : (
                        <Button
                          key={p as number}
                          variant={currentPage === p ? 'default' : 'outline'}
                          size="icon"
                          className="h-8 w-8 text-sm"
                          onClick={() => setCurrentPage(p as number)}
                        >
                          {p}
                        </Button>
                      )
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setCurrentPage((p) => Math.min(Math.ceil(filteredContracts.length / itemsPerPage), p + 1))}
                      disabled={currentPage >= Math.ceil(filteredContracts.length / itemsPerPage)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除合同"{selectedContract?.contractNo}"吗？此操作无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>提交审核</DialogTitle>
            <DialogDescription>
              确定要提交合同"{selectedContract?.contractNo}"进行财务审核吗？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={confirmSubmit}>
              确认提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={amendDialogOpen} onOpenChange={setAmendDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>合同变更 - {selectedContract?.contractNo}</DialogTitle>
            <p className="text-xs text-muted-foreground leading-relaxed">
              合同变更仅用于合同期内某个时间段内的租金/物业费发生变化时使用。如果需要变更合同剩余期间内所有期间的租金/物业费，请先终止该合同后新增一份合同，注意该种情况需要选择补充协议并关联原合同。
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-sm text-muted-foreground">变更方式</Label>
                <Select value={amendForm.changeType} onValueChange={(v) => {
                  setAmendForm({ ...amendForm, changeType: v, amendmentNo: isUtilityChangeType(v) ? '' : amendForm.amendmentNo });
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择变更方式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rent_reduce">减免租金</SelectItem>
                    <SelectItem value="rent_increase">增加租金</SelectItem>
                    <SelectItem value="fee_reduce">减免物业费</SelectItem>
                    <SelectItem value="fee_increase">增加物业费</SelectItem>
                    <SelectItem value="utility_enable">收取水电费</SelectItem>
                    <SelectItem value="utility_disable">不收取水电费</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">合同签署日期</Label>
                <Input
                  type="date"
                  value={amendForm.signDate}
                  onChange={(e) => setAmendForm({ ...amendForm, signDate: e.target.value })}
                />
              </div>
              {!isUtilityChangeType(amendForm.changeType) && (
                <div>
                  <Label className="text-sm text-muted-foreground">补充协议合同编号</Label>
                  <Input
                    placeholder="请输入补充协议合同编号"
                    value={amendForm.amendmentNo}
                    onChange={(e) => setAmendForm({ ...amendForm, amendmentNo: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {isUtilityChangeType(amendForm.changeType) ? (
                <div>
                  <Label className="text-sm text-muted-foreground">变更开始期间</Label>
                  <Select
                    value={amendForm.changeStartDate ? amendForm.changeStartDate.substring(0, 7) : ''}
                    onValueChange={(v) => setAmendForm({ ...amendForm, changeStartDate: `${v}-01` })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择开始期间" />
                    </SelectTrigger>
                    <SelectContent>
                      {getMonthOptions(selectedContract?.startDate, selectedContract?.endDate).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label className="text-sm text-muted-foreground">
                    变更开始日期
                    {lastPaidPeriod && <span className="text-warning ml-1">（最近收款期: {lastPaidPeriod}）</span>}
                  </Label>
                  <Input
                    type="date"
                    value={amendForm.changeStartDate}
                    onChange={(e) => handleAmendDateChange('changeStartDate', e.target.value)}
                  />
                </div>
              )}
              {isUtilityChangeType(amendForm.changeType) ? (
                <div>
                  <Label className="text-sm text-muted-foreground">变更结束期间</Label>
                  <Select
                    value={amendForm.changeEndDate ? amendForm.changeEndDate.substring(0, 7) : ''}
                    onValueChange={(v) => setAmendForm({ ...amendForm, changeEndDate: `${v}-01` })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择结束期间" />
                    </SelectTrigger>
                    <SelectContent>
                      {getMonthOptions(selectedContract?.startDate, selectedContract?.endDate).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label className="text-sm text-muted-foreground">
                    变更结束日期
                    {selectedContract && <span className="text-muted-foreground ml-1">（原合同结束: {selectedContract.endDate}）</span>}
                  </Label>
                  <Input
                    type="date"
                    value={amendForm.changeEndDate}
                    onChange={(e) => handleAmendDateChange('changeEndDate', e.target.value)}
                  />
                </div>
              )}
            </div>

            {!isUtilityChangeType(amendForm.changeType) && selectedContract && amendForm.changeEndDate === selectedContract.endDate && (
              <div className="bg-warning/10 border border-warning/30 rounded-sm px-4 py-3 text-sm text-warning">
                该功能仅用于合同期内部分期间租金、物业费变更，若需要变更合同剩余所有期间请先终止该合同再重新录入一份新合同
              </div>
            )}

            {periodsLoading && (
              <div className="text-center py-6 text-muted-foreground text-sm">加载变更期间数据...</div>
            )}

            {!isUtilityChangeType(amendForm.changeType) && amendmentPeriods.length > 0 && !periodsLoading && (
              <div className="border-t border-border pt-4">
                <Label className="text-sm font-medium mb-3 block">变更期间明细</Label>
                <div className="border border-border rounded-sm overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left font-medium text-muted-foreground py-2.5 px-3 whitespace-nowrap">所属期</th>
                        <th className="text-left font-medium text-muted-foreground py-2.5 px-3 whitespace-nowrap">阶段起止日期</th>
                        <th className="text-right font-medium text-muted-foreground py-2.5 px-3 whitespace-nowrap">原合同月租金</th>
                        <th className="text-right font-medium text-muted-foreground py-2.5 px-3 whitespace-nowrap">原合同月物业费</th>
                        <th className="text-center font-medium text-muted-foreground py-2.5 px-3 whitespace-nowrap">新合同月租金</th>
                        <th className="text-center font-medium text-muted-foreground py-2.5 px-3 whitespace-nowrap">新合同月物业费</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amendmentPeriods.map((p, idx) => (
                        <tr key={`${p.period}-${p.stageStartDate}`} className="border-b border-border/50 last:border-0">
                          <td className="py-2.5 px-3 font-mono">{p.period}</td>
                          <td className="py-2.5 px-3 text-muted-foreground">{p.stageStartDate} ~ {p.stageEndDate}</td>
                          <td className="py-2.5 px-3 text-right font-mono">¥{p.originalRent.toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-right font-mono">¥{p.originalPropertyFee.toLocaleString()}</td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="不变"
                                className="w-24 text-right h-8 text-sm"
                                value={amendForm.stages[idx]?.monthlyRent ?? ''}
                                onChange={(e) => handleAmendStageValueChange(idx, 'monthlyRent', e.target.value)}
                              />
                              {idx > 0 ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs shrink-0"
                                  onClick={() => handleCopyFromPrevious(idx)}
                                  title="复制上期金额"
                                >
                                  复制
                                </Button>
                              ) : (
                                <span className="h-8 px-2 text-xs shrink-0 w-[40px]" />
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="不变"
                                className="w-24 text-right h-8 text-sm"
                                value={amendForm.stages[idx]?.monthlyPropertyFee ?? ''}
                                onChange={(e) => handleAmendStageValueChange(idx, 'monthlyPropertyFee', e.target.value)}
                              />
                              {idx > 0 ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs shrink-0"
                                  onClick={() => handleCopyFromPrevious(idx)}
                                  title="复制上期金额"
                                >
                                  复制
                                </Button>
                              ) : (
                                <span className="h-8 px-2 text-xs shrink-0 w-[40px]" />
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAmendDialogOpen(false)}>取消</Button>
            <Button onClick={confirmAmend}>提交变更审核</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default ContractPage;
