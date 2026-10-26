import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, RotateCcw, Eye, AlertCircle, CheckCircle2, ChevronsUpDown, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CanPoint } from '@/components/PermissionGate';
import { terminationApi, contractApi } from '@/api';
import type { TerminationRequest, ContractResponse, TerminationCheckPeriodResponse } from '@shared/api.interface';

const TerminationPage: React.FC = () => {
  const navigate = useNavigate();
  const [terminations, setTerminations] = useState<TerminationRequest[]>([]);
  const [contracts, setContracts] = useState<ContractResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<string>('');
  const [selectedContractObj, setSelectedContractObj] = useState<ContractResponse | null>(null);
  const [contractSearch, setContractSearch] = useState('');
  const [showContractPopover, setShowContractPopover] = useState(false);
  const [terminationDate, setTerminationDate] = useState<string>('');
  const [amendmentNo, setAmendmentNo] = useState<string>('');
  const [checkResult, setCheckResult] = useState<TerminationCheckPeriodResponse | null>(null);
  const [rentPaidError, setRentPaidError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [isWithdrawDialogOpen, setIsWithdrawDialogOpen] = useState(false);
  const [withdrawTerminationId, setWithdrawTerminationId] = useState<string>('');
  const [filterContractNo, setFilterContractNo] = useState('');
  const [filterTenant, setFilterTenant] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [termRes, contractRes] = await Promise.all([
        terminationApi.getList(),
        contractApi.getList({ pageSize: 9999 }),
      ]);
      setTerminations(termRes.data.items || []);
      setContracts(contractRes.data.items || []);
    } catch {
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const approvedContracts = useMemo(() => {
    return contracts.filter(c => c.status === 'approved');
  }, [contracts]);

  const filteredContracts = useMemo(() => {
    if (!contractSearch.trim()) return approvedContracts;
    const keyword = contractSearch.trim().toLowerCase();
    return approvedContracts.filter(
      (c) =>
        c.contractNo.toLowerCase().includes(keyword) ||
        c.tenant.toLowerCase().includes(keyword)
    );
  }, [approvedContracts, contractSearch]);

  const handleSelectContract = useCallback((contract: ContractResponse) => {
    setSelectedContract(contract.id);
    setSelectedContractObj(contract);
    setContractSearch('');
    setShowContractPopover(false);
    setCheckResult(null);
    setRentPaidError(false);
  }, []);

  useEffect(() => {
    if (!selectedContract || !terminationDate) {
      setCheckResult(null);
      setRentPaidError(false);
      return;
    }
    if (selectedContractObj && selectedContractObj.startDate && selectedContractObj.endDate) {
      if (terminationDate < selectedContractObj.startDate || terminationDate > selectedContractObj.endDate) {
        setCheckResult(null);
        setRentPaidError(false);
        toast.error(`终止日期必须在合同有效期内（${selectedContractObj.startDate} 至 ${selectedContractObj.endDate}）`);
        return;
      }
    }
    let cancelled = false;
    setChecking(true);
    setRentPaidError(false);
    terminationApi.checkPeriod(selectedContract, terminationDate)
      .then((res) => {
        if (cancelled) return;
        const data = res.data;
        setRentPaidError(!!data.rentPaidError || !!data.amountError);
        setCheckResult(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setCheckResult(null);
          setRentPaidError(false);
          const msg = err?.response?.data?.error?.message;
          if (msg) toast.error(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => { cancelled = true; };
  }, [selectedContract, terminationDate]);

  const handleSubmitTermination = async () => {
    if (!selectedContract || !terminationDate) {
      toast.error('请选择合同和终止日期');
      return;
    }
    if (!amendmentNo.trim()) {
      toast.error('请输入终止协议编号');
      return;
    }
    if (rentPaidError) {
      toast.error('该合同在终止日期后的期间已部分或全部收款，请先与财务沟通');
      return;
    }
    try {
      setSubmitting(true);
      await terminationApi.create({
        contractId: selectedContract,
        terminationDate,
        amendmentNo: amendmentNo.trim(),
      });
      setIsSubmitDialogOpen(false);
      setSelectedContract('');
      setSelectedContractObj(null);
      setContractSearch('');
      setTerminationDate('');
      setAmendmentNo('');
      setCheckResult(null);
      setRentPaidError(false);
      toast.success('终止申请已提交，等待财务审核');
      loadData();
    } catch {
      toast.error('提交终止申请失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    try {
      setWithdrawing(true);
      await terminationApi.withdraw(withdrawTerminationId);
      setIsWithdrawDialogOpen(false);
      setWithdrawTerminationId('');
      toast.success('申请已撤回');
      loadData();
    } catch {
      toast.error('撤回申请失败');
    } finally {
      setWithdrawing(false);
    }
  };

  const getStatusBadge = (status: TerminationRequest['status']) => {
    const config = {
      pending: { label: '待审核', className: 'bg-warning/10 text-warning border-warning/20' },
      approved: { label: '已通过', className: 'bg-success/10 text-success border-success/20' },
      rejected: { label: '已驳回', className: 'bg-destructive/10 text-destructive border-destructive/20' },
    };
    const { label, className } = config[status];
    return (
      <Badge variant="outline" className={`rounded-sm ${className}`}>
        {label}
      </Badge>
    );
  };

  const openWithdrawDialog = (id: string) => {
    setWithdrawTerminationId(id);
    setIsWithdrawDialogOpen(true);
  };

  const sortedTerminations = useMemo(
    () =>
      [...terminations].sort(
        (a, b) => new Date(b._createdAt || '').getTime() - new Date(a._createdAt || '').getTime()
      ),
    [terminations]
  );

  const filteredTerminations = useMemo(() => {
    const kwContract = filterContractNo.trim().toLowerCase();
    const kwTenant = filterTenant.trim().toLowerCase();
    if (!kwContract && !kwTenant) return sortedTerminations;
    return sortedTerminations.filter((t) => {
      if (kwContract && !(t.contractNo || '').toLowerCase().includes(kwContract)) return false;
      if (kwTenant && !(t.tenant || '').toLowerCase().includes(kwTenant)) return false;
      return true;
    });
  }, [sortedTerminations, filterContractNo, filterTenant]);

  return (
    <section className="w-full max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">合同终止</h1>
          <p className="text-muted-foreground mt-1">提交合同终止申请，查看审核状态</p>
        </div>
        <CanPoint action="create" subject="Termination">
          <Button onClick={() => setIsSubmitDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            提交终止申请
          </Button>
        </CanPoint>
      </div>

      <Card className="rounded-sm">
        <CardHeader>
          <CardTitle className="text-base">终止申请列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-2 block">合同编号</Label>
              <Input
                placeholder="搜索合同编号"
                value={filterContractNo}
                onChange={(e) => setFilterContractNo(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground mb-2 block">承租方</Label>
              <Input
                placeholder="搜索承租方"
                value={filterTenant}
                onChange={(e) => setFilterTenant(e.target.value)}
              />
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">加载中...</p>
            </div>
          ) : sortedTerminations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">暂无终止申请记录</p>
              <p className="text-sm text-muted-foreground mt-1">
                点击右上角按钮提交新的终止申请
              </p>
            </div>
          ) : filteredTerminations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">没有符合筛选条件的记录</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>合同编号</TableHead>
                  <TableHead>承租方</TableHead>
                  <TableHead>终止协议编号</TableHead>
                  <TableHead>申请终止日期</TableHead>
                  <TableHead>审核状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTerminations.map((termination) => (
                  <TableRow key={termination.id}>
                    <TableCell>{termination.contractNo}</TableCell>
                    <TableCell>{termination.tenant}</TableCell>
                    <TableCell>{termination.amendmentNo || '-'}</TableCell>
                    <TableCell>{termination.terminationDate}</TableCell>
                    <TableCell>{getStatusBadge(termination.status)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {termination.status === 'pending' && (
                            <CanPoint action="create" subject="Termination">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openWithdrawDialog(termination.id)}
                              >
                                <RotateCcw className="w-4 h-4 mr-1" />
                                撤回
                              </Button>
                            </CanPoint>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/contracts/${termination.contractId}`)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          查看合同
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isSubmitDialogOpen} onOpenChange={(open) => {
        setIsSubmitDialogOpen(open);
        if (!open) {
          setSelectedContract('');
          setSelectedContractObj(null);
          setContractSearch('');
          setTerminationDate('');
          setAmendmentNo('');
          setCheckResult(null);
          setRentPaidError(false);
        }
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>提交合同终止申请</DialogTitle>
            <DialogDescription>
              选择已通过审核的合同并填写终止日期，提交后等待财务审核
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>
                选择合同 <span className="text-destructive">*</span>
              </Label>
              <Popover open={showContractPopover} onOpenChange={setShowContractPopover}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      'w-full justify-between font-normal',
                      !selectedContractObj && 'text-muted-foreground'
                    )}
                  >
                    <span className="truncate">
                      {selectedContractObj
                        ? `${selectedContractObj.contractNo} - ${selectedContractObj.tenant}`
                        : '搜索合同编号或租户名称'}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[460px] p-0" align="start">
                  <div className="p-2">
                    <Input
                      placeholder="输入合同编号或租户名称搜索..."
                      value={contractSearch}
                      onChange={(e) => setContractSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {filteredContracts.length > 0 ? (
                      filteredContracts.map((contract) => (
                        <button
                          key={contract.id}
                          type="button"
                          className={cn(
                            'w-full text-left px-3 py-2 hover:bg-accent text-sm rounded-sm',
                            contract.id === selectedContract && 'bg-accent'
                          )}
                          onClick={() => handleSelectContract(contract)}
                        >
                          <div className="font-medium">{contract.contractNo} - {contract.tenant}</div>
                          {contract.leaseAddress && (
                            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {contract.leaseAddress}
                            </div>
                          )}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                        {contractSearch ? '未找到匹配的正常履行合同' : '请输入合同编号或租户名称'}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              {selectedContractObj?.leaseAddress && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground bg-accent/50 rounded-sm px-3 py-2">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>租赁地址：{selectedContractObj.leaseAddress}</span>
                </div>
              )}
              {approvedContracts.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  暂无可终止的合同，请先录入并审核通过合同
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>
                终止协议编号 <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="请输入终止协议编号"
                value={amendmentNo}
                onChange={(e) => setAmendmentNo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>
                终止日期 <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={terminationDate}
                min={selectedContractObj?.startDate}
                max={selectedContractObj?.endDate}
                onChange={(e) => setTerminationDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                终止月份起次月不再收取租金、终止当月按当月起始日起至终止日期计算收取租金。<br />
                例：<br />
                1. 终止日期为2026/04/30，2026年4月整月计算收取租金，2026年5月起不再收取租金；<br />
                2. 终止日期为2026/04/15，2026/04/01-2026/04/15计算收取租金，2026/04/16起不再收取租金。
              </p>
              {checking && (
                <p className="text-xs text-muted-foreground">检查中...</p>
              )}
              {rentPaidError && (
                <div className="flex items-start gap-2 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">
                    该合同在终止日期后的期间已部分或全部收款，请先与财务沟通
                  </p>
                </div>
              )}
              {checkResult && (
                <div className="rounded-sm border border-border bg-accent/30 px-3 py-2 space-y-1">
                  <div className="flex items-center gap-1.5">
                    {checkResult.isStageEnd && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                    )}
                    <p className="text-xs font-medium text-foreground">
                      {checkResult.isStageEnd ? '终止日期为阶段结束日期' : '终止月按比例计算预览'}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <p>所属期：{checkResult.period}（{checkResult.daysToCharge}/{checkResult.daysInMonth}天）</p>
                    <p>原应收租金：{checkResult.originalRent.toFixed(2)} → 按比例：<span className="font-medium text-foreground">{checkResult.proratedRent.toFixed(2)}</span></p>
                    <p>原应收物业费：{checkResult.originalPropertyFee.toFixed(2)} → 按比例：<span className="font-medium text-foreground">{checkResult.proratedPropertyFee.toFixed(2)}</span></p>
                    {(checkResult.rentReceived > 0 || checkResult.propertyFeeReceived > 0) && (
                      <p>已收租金/物业费：<span className="font-medium text-foreground">{checkResult.rentReceived.toFixed(2)} / {checkResult.propertyFeeReceived.toFixed(2)}</span></p>
                    )}
                  </div>
                </div>
              )}
              {checkResult?.amountError && (
                <div className="flex items-start gap-2 rounded-sm border border-destructive/30 bg-destructive/5 px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive">
                    {checkResult.amountErrorMessage}
                  </p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSubmitDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handleSubmitTermination}
              disabled={!selectedContract || !terminationDate || !amendmentNo.trim() || rentPaidError || checkResult?.amountError || submitting}
            >
              {submitting ? '提交中...' : '提交申请'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isWithdrawDialogOpen} onOpenChange={setIsWithdrawDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认撤回</DialogTitle>
            <DialogDescription>
              确定要撤回该终止申请吗？撤回后可以重新提交。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsWithdrawDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleWithdraw} disabled={withdrawing}>
              {withdrawing ? '撤回中...' : '确认撤回'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default TerminationPage;
