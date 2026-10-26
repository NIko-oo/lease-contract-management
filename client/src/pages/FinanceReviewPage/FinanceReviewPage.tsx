import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table } from '@lark-apaas/client-toolkit/antd-table';
import { CheckCircleIcon, XCircleIcon, EyeIcon, CalendarIcon, AlertCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import { CanPoint } from '@/components/PermissionGate';
import type { AxiosError } from 'axios';
import { contractApi, terminationApi } from '@/api';

const getErrorMessage = (error: unknown, fallback: string): string => {
  const msg = (error as AxiosError<{ error?: { message?: string } }>)?.response?.data?.error?.message;
  return msg || fallback;
};
import type { ContractAmendmentResponse } from '@shared/api.interface';

interface IContractStage {
  id: string;
  stageType?: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  monthlyPropertyFee: number;
}

interface IContract {
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
  stages: IContractStage[];
  status: 'pending' | 'approved' | 'rejected' | 'terminated';
  terminationDate?: string;
  signDate?: string;
  leaseAddress?: string;
  leaseArea?: number;
  createdAt: string;
  reviewedAt?: string;
  reviewRemark?: string;
  reviewedBy?: string;
}

interface ITerminationRequest {
  id: string;
  contractId: string;
  contractNo: string;
  tenant: string;
  proposedTerminationDate: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  reviewRemark?: string;
  reviewedBy?: string;
}

const paymentMethodMap: Record<string, string> = {
  monthly: '月付',
  quarterly: '季付',
};

const statusBadgeMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' }> = {
  pending: { label: '待审核', variant: 'warning' },
  approved: { label: '已通过', variant: 'success' },
  rejected: { label: '已驳回', variant: 'destructive' },
  terminated: { label: '已终止', variant: 'secondary' },
};

interface IAmendment {
  id: string;
  contractId: string;
  amendmentNo: string;
  changeStartDate: string;
  changeEndDate: string;
  changeType: string;
  signDate?: string;
  status: 'pending' | 'approved' | 'rejected';
  stages: Array<{ id?: string; startDate: string; endDate: string; monthlyRent: number; monthlyPropertyFee: number; stageOrder: number; stageType?: string }>;
  reviewRemark?: string;
  reviewer?: string;
  _createdAt?: string;
}

const amendmentStatusBadgeMap: Record<string, { label: string; variant: 'outline' | 'destructive' | 'secondary' | 'default'; className: string }> = {
  pending: { label: '待审核', variant: 'outline', className: 'border-warning text-warning bg-warning/10' },
  approved: { label: '已通过', variant: 'outline', className: 'border-success text-success bg-success/10' },
  rejected: { label: '已驳回', variant: 'destructive', className: '' },
};

const changeTypeMap: Record<string, string> = {
  rent_reduce: '减免租金',
  rent_increase: '增加租金',
  fee_reduce: '减免物业费',
  fee_increase: '增加物业费',
  utility_enable: '收取水电费',
  utility_disable: '不收取水电费',
};

const stageTypeMap: Record<string, string> = {
  free: '免租期',
  phase_1: '第一期租金',
  phase_2: '第二期租金',
  phase_3: '第三期租金',
  phase_4: '第四期租金',
  phase_5: '第五期租金',
  phase_6: '第六期租金',
  phase_7: '第七期租金',
  phase_8: '第八期租金',
  phase_9: '第九期租金',
  phase_10: '第十期租金',
};

const FinanceReviewPageContent: React.FC = () => {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<IContract[]>([]);
  const [terminations, setTerminations] = useState<ITerminationRequest[]>([]);
  const [amendments, setAmendments] = useState<IAmendment[]>([]);
  const [activeTab, setActiveTab] = useState('pending-contracts');
  const [selectedContract, setSelectedContract] = useState<IContract | null>(null);
  const [parentContract, setParentContract] = useState<IContract | null>(null);
  const [selectedTermination, setSelectedTermination] = useState<ITerminationRequest | null>(null);
  const [selectedAmendment, setSelectedAmendment] = useState<IAmendment | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectTarget, setRejectTarget] = useState<{ type: 'contract' | 'termination' | 'amendment'; id: string } | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [contractsRes, terminationsRes] = await Promise.all([
        contractApi.getList(),
        terminationApi.getList(),
      ]);
      setContracts((contractsRes.data.items || []) as unknown as IContract[]);
      const terms = (terminationsRes.data.items || []) as any[];
      setTerminations(terms.map((t: any) => ({
        ...t,
        proposedTerminationDate: t.proposedTerminationDate || t.terminationDate,
        createdAt: t.createdAt || t._createdAt,
      })));

      const allAmendments: IAmendment[] = [];
      for (const contract of contractsRes.data.items || []) {
        const c = contract as any;
        if (c.amendments && c.amendments.length > 0) {
          allAmendments.push(...c.amendments);
        }
      }
      setAmendments(allAmendments);
    } catch (error) {
      toast.error('加载数据失败');
    }
  };

  const handleApproveContract = async (contractId: string) => {
    if (isReviewing) return;
    setIsReviewing(true);
    try {
      await contractApi.review(contractId, {
        action: 'approve',
      } as any);
      toast.success('合同审核通过');
      await loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, '审核操作失败'));
      await loadData();
    } finally {
      setIsReviewing(false);
    }
    setIsDetailOpen(false);
    setSelectedContract(null);
    setParentContract(null);
  };

  const handleRejectContract = async (contractId: string) => {
    if (!rejectReason.trim()) {
      toast.error('请输入驳回原因');
      return;
    }
    if (isReviewing) return;
    setIsReviewing(true);
    try {
      await contractApi.review(contractId, {
        action: 'reject',
        remark: rejectReason,
      } as any);
      toast.success('合同已驳回');
      await loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, '审核操作失败'));
      await loadData();
    } finally {
      setIsReviewing(false);
    }
    setIsRejectDialogOpen(false);
    setRejectReason('');
    setRejectTarget(null);
    setIsDetailOpen(false);
    setSelectedContract(null);
    setParentContract(null);
  };

  const handleApproveTermination = async (terminationId: string) => {
    if (isReviewing) return;
    setIsReviewing(true);
    try {
      await terminationApi.review(terminationId, {
        action: 'approve',
      } as any);
      toast.success('终止申请审核通过');
      await loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, '审核操作失败'));
      await loadData();
    } finally {
      setIsReviewing(false);
    }
    setIsDetailOpen(false);
    setSelectedTermination(null);
  };

  const handleRejectTermination = async (terminationId: string) => {
    if (!rejectReason.trim()) {
      toast.error('请输入驳回原因');
      return;
    }
    if (isReviewing) return;
    setIsReviewing(true);
    try {
      await terminationApi.review(terminationId, {
        action: 'reject',
        remark: rejectReason,
      } as any);
      toast.success('终止申请已驳回');
      await loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, '审核操作失败'));
      await loadData();
    } finally {
      setIsReviewing(false);
    }
    setIsRejectDialogOpen(false);
    setRejectReason('');
    setRejectTarget(null);
    setIsDetailOpen(false);
    setSelectedTermination(null);
  };

  const openRejectDialog = (type: 'contract' | 'termination' | 'amendment', id: string) => {
    setRejectTarget({ type, id });
    setRejectReason('');
    setIsRejectDialogOpen(true);
  };

  const confirmReject = () => {
    if (!rejectTarget) return;
    if (rejectTarget.type === 'contract') {
      handleRejectContract(rejectTarget.id);
    } else if (rejectTarget.type === 'termination') {
      handleRejectTermination(rejectTarget.id);
    } else if (rejectTarget.type === 'amendment') {
      handleRejectAmendment(rejectTarget.id);
    }
  };

  const viewContractDetail = async (contract: IContract) => {
    setSelectedContract(contract);
    setSelectedTermination(null);
    setIsDetailOpen(true);
    if (contract.contractType === 'supplement' && contract.parentContractId) {
      try {
        const res = await contractApi.getDetail(contract.parentContractId);
        setParentContract(res.data as IContract);
      } catch {
        setParentContract(null);
      }
    } else {
      setParentContract(null);
    }
  };

  const viewTerminationDetail = (termination: ITerminationRequest) => {
    setSelectedTermination(termination);
    setSelectedContract(null);
    setParentContract(null);
    setIsDetailOpen(true);
  };

  const pendingContracts = useMemo(() => contracts.filter((c) => c.status === 'pending'), [contracts]);
  const pendingTerminations = useMemo(() => terminations.filter((t) => t.status === 'pending'), [terminations]);
  const pendingAmendments = useMemo(() => amendments.filter((a) => a.status === 'pending'), [amendments]);
  const reviewedContracts = useMemo(() => contracts.filter((c) => c.status !== 'pending'), [contracts]);
  const reviewedTerminations = useMemo(() => terminations.filter((t) => t.status !== 'pending'), [terminations]);
  const reviewedAmendments = useMemo(() => amendments.filter((a) => a.status !== 'pending'), [amendments]);

  const handleApproveAmendment = async (amendmentId: string) => {
    if (isReviewing) return;
    setIsReviewing(true);
    try {
      await contractApi.reviewAmendment(amendmentId, { action: 'approve' });
      toast.success('变更审核通过');
      await loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, '审核操作失败'));
      await loadData();
    } finally {
      setIsReviewing(false);
    }
    setIsDetailOpen(false);
    setSelectedAmendment(null);
  };

  const handleRejectAmendment = async (amendmentId: string) => {
    if (!rejectReason.trim()) {
      toast.error('请输入驳回原因');
      return;
    }
    if (isReviewing) return;
    setIsReviewing(true);
    try {
      await contractApi.reviewAmendment(amendmentId, { action: 'reject', remark: rejectReason });
      toast.success('变更已驳回');
      await loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, '审核操作失败'));
      await loadData();
    } finally {
      setIsReviewing(false);
    }
    setIsRejectDialogOpen(false);
    setRejectReason('');
    setRejectTarget(null);
    setIsDetailOpen(false);
    setSelectedAmendment(null);
  };

  const viewAmendmentDetail = (amendment: IAmendment) => {
    setSelectedAmendment(amendment);
    setSelectedContract(null);
    setParentContract(null);
    setSelectedTermination(null);
    setIsDetailOpen(true);
  };

  const contractColumns = [
    { title: '合同编号', dataIndex: 'contractNo', key: 'contractNo' },
    { title: '承租方', dataIndex: 'tenant', key: 'tenant' },
    { title: '出租方', dataIndex: 'landlord', key: 'landlord' },
    {
      title: '合同起止日期',
      key: 'dateRange',
      render: (_: any, record: IContract) => `${record.startDate} 至 ${record.endDate}`,
    },
    {
      title: '支付方式',
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      render: (val: string) => paymentMethodMap[val] || val,
    },
    {
      title: '租期阶段数',
      key: 'stageCount',
      render: (_: any, record: IContract) => `${record.stages.length} 个阶段`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => {
        const config = statusBadgeMap[val];
        return <Badge variant={(config?.variant ?? 'outline') as any}>{config?.label || val}</Badge>;
      },
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      render: (_: any, record: IContract) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => viewContractDetail(record)}>
            <EyeIcon className="w-4 h-4" />
          </Button>
          {record.status === 'pending' && (
            <>
               <Button size="sm" variant="default" disabled={isReviewing} onClick={() => handleApproveContract(record.id)}>
                <CheckCircleIcon className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="destructive" disabled={isReviewing} onClick={() => openRejectDialog('contract', record.id)}>
                <XCircleIcon className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const amendmentColumns = [
    {
      title: '补充协议编号',
      dataIndex: 'amendmentNo',
      key: 'amendmentNo',
      render: (val: string, record: IAmendment) => val || changeTypeMap[record.changeType] || '-',
    },
    {
      title: '合同编号',
      key: 'contractNo',
      render: (_: any, record: IAmendment) => {
        const contract = contracts.find((c) => c.id === record.contractId);
        return contract?.contractNo || '-';
      },
    },
    {
      title: '承租方',
      key: 'tenant',
      render: (_: any, record: IAmendment) => {
        const contract = contracts.find((c) => c.id === record.contractId);
        return contract?.tenant || '-';
      },
    },
    {
      title: '变更方式',
      dataIndex: 'changeType',
      key: 'changeType',
      render: (val: string) => changeTypeMap[val] || val,
    },
    {
      title: '合同签署日期',
      dataIndex: 'signDate',
      key: 'signDate',
      render: (val: string) => val || '-',
    },
    {
      title: '变更起止日期',
      key: 'changeDateRange',
      render: (_: any, record: IAmendment) => `${record.changeStartDate} 至 ${record.changeEndDate}`,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => {
        const config = amendmentStatusBadgeMap[val];
        return <Badge variant={(config?.variant ?? 'outline') as any} className={config?.className}>{config?.label || val}</Badge>;
      },
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      render: (_: any, record: IAmendment) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => viewAmendmentDetail(record)}>
            <EyeIcon className="w-4 h-4" />
          </Button>
          {record.status === 'pending' && (
            <>
              <Button size="sm" variant="default" disabled={isReviewing} onClick={() => handleApproveAmendment(record.id)}>
                <CheckCircleIcon className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="destructive" disabled={isReviewing} onClick={() => openRejectDialog('amendment', record.id)}>
                <XCircleIcon className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const terminationColumns = [
    { title: '申请编号', dataIndex: 'id', key: 'id' },
    { title: '合同编号', dataIndex: 'contractNo', key: 'contractNo' },
    { title: '承租方', dataIndex: 'tenant', key: 'tenant' },
    {
      title: '申请终止日期',
      dataIndex: 'proposedTerminationDate',
      key: 'proposedTerminationDate',
    },
    {
      title: '申请时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (val: string) => new Date(val).toLocaleString(),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (val: string) => {
        const config = statusBadgeMap[val];
        return <Badge variant={(config?.variant ?? 'outline') as any}>{config?.label || val}</Badge>;
      },
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      render: (_: any, record: ITerminationRequest) => (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => viewTerminationDetail(record)}>
            <EyeIcon className="w-4 h-4" />
          </Button>
          {record.status === 'pending' && (
            <>
              <Button size="sm" variant="default" disabled={isReviewing} onClick={() => handleApproveTermination(record.id)}>
                <CheckCircleIcon className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="destructive" disabled={isReviewing} onClick={() => openRejectDialog('termination', record.id)}>
                <XCircleIcon className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <style jsx>{`
        .finance-review-page {
          max-width: 1400px;
          margin: 0 auto;
        }
      `}</style>

      <div className="finance-review-page space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-foreground">财务审核</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6 lg:w-[900px]">
            <TabsTrigger value="pending-contracts">
              待审核合同
              {pendingContracts.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {pendingContracts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pending-amendments">
              待审核变更
              {pendingAmendments.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {pendingAmendments.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pending-terminations">
              待审核终止
              {pendingTerminations.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {pendingTerminations.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history-contracts">合同审核历史</TabsTrigger>
            <TabsTrigger value="history-amendments">变更审核历史</TabsTrigger>
            <TabsTrigger value="history-terminations">终止审核历史</TabsTrigger>
          </TabsList>

          <TabsContent value="pending-contracts" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircleIcon className="w-5 h-5 text-warning" />
                  待审核合同列表
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pendingContracts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    暂无待审核合同
                  </div>
                ) : (
                  <Table
                    columns={contractColumns}
                    dataSource={pendingContracts}
                    rowKey="id"
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 条` }}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending-terminations" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircleIcon className="w-5 h-5 text-warning" />
                  待审核终止申请列表
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pendingTerminations.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    暂无待审核终止申请
                  </div>
                ) : (
                  <Table
                    columns={terminationColumns}
                    dataSource={pendingTerminations}
                    rowKey="id"
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 条` }}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pending-amendments" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircleIcon className="w-5 h-5 text-warning" />
                  待审核变更列表
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pendingAmendments.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    暂无待审核变更
                  </div>
                ) : (
                  <Table
                    columns={amendmentColumns}
                    dataSource={pendingAmendments}
                    rowKey="id"
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 条` }}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history-contracts" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">合同审核历史</CardTitle>
              </CardHeader>
              <CardContent>
                {reviewedContracts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    暂无审核记录
                  </div>
                ) : (
                  <Table
                    columns={contractColumns}
                    dataSource={reviewedContracts}
                    rowKey="id"
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 条` }}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history-terminations" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">终止审核历史</CardTitle>
              </CardHeader>
              <CardContent>
                {reviewedTerminations.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    暂无审核记录
                  </div>
                ) : (
                  <Table
                    columns={terminationColumns}
                    dataSource={reviewedTerminations}
                    rowKey="id"
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 条` }}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history-amendments" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">变更审核历史</CardTitle>
              </CardHeader>
              <CardContent>
                {reviewedAmendments.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    暂无审核记录
                  </div>
                ) : (
                  <Table
                    columns={amendmentColumns}
                    dataSource={reviewedAmendments}
                    rowKey="id"
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 条` }}
                  />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedContract ? '合同详情' : selectedTermination ? '终止申请详情' : selectedAmendment ? '变更详情' : ''}
              </DialogTitle>
            </DialogHeader>

            {selectedContract && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">合同编号</Label>
                    <p className="font-medium">{selectedContract.contractNo}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">合同类型</Label>
                    <p className="font-medium">{selectedContract.contractType === 'supplement' ? '补充协议' : '新签合同'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">承租方</Label>
                    <p className="font-medium">{selectedContract.tenant}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">出租方</Label>
                    <p className="font-medium">{selectedContract.landlord}</p>
                  </div>
                  {selectedContract.propertyName && (
                    <div>
                      <Label className="text-muted-foreground">房产名称</Label>
                      <p className="font-medium">{selectedContract.propertyName}</p>
                    </div>
                  )}
                  {selectedContract.signDate && (
                    <div>
                      <Label className="text-muted-foreground">签约日期</Label>
                      <p className={`font-medium ${parentContract && selectedContract.signDate !== parentContract.signDate ? 'text-destructive' : ''}`}>{selectedContract.signDate}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground">合同起止日期</Label>
                    <p className={`font-medium ${parentContract && (selectedContract.startDate !== parentContract.startDate || selectedContract.endDate !== parentContract.endDate) ? 'text-destructive' : ''}`}>{selectedContract.startDate} 至 {selectedContract.endDate}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">支付方式</Label>
                    <p className={`font-medium ${parentContract && selectedContract.paymentMethod !== parentContract.paymentMethod ? 'text-destructive' : ''}`}>{paymentMethodMap[selectedContract.paymentMethod]}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">提前付款天数</Label>
                    <p className={`font-medium ${parentContract && selectedContract.advancePaymentDays !== parentContract.advancePaymentDays ? 'text-destructive' : ''}`}>{selectedContract.advancePaymentDays} 天</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">是否收取水电费</Label>
                    <p className={`font-medium ${parentContract && selectedContract.hasUtilities !== parentContract.hasUtilities ? 'text-destructive' : ''}`}>{selectedContract.hasUtilities ? '是' : '否'}</p>
                  </div>
                  {selectedContract.leaseArea != null && (
                    <div>
                      <Label className="text-muted-foreground">租赁面积（㎡）</Label>
                      <p className="font-medium font-mono">{selectedContract.leaseArea}</p>
                    </div>
                  )}
                  {selectedContract.leaseAddress && (
                    <div>
                      <Label className="text-muted-foreground">租赁地址</Label>
                      <p className="font-medium">{selectedContract.leaseAddress}</p>
                    </div>
                  )}
                </div>

                {parentContract && (
                  <div>
                    <Label className="text-muted-foreground mb-3 block text-base font-semibold">原合同信息</Label>
                    <div className="grid grid-cols-2 gap-4 p-4 border border-border rounded-sm bg-muted/20">
                      <div>
                        <Label className="text-muted-foreground">合同编号</Label>
                        <p className="font-medium">{parentContract.contractNo}</p>
                      </div>
                      {parentContract.signDate && (
                        <div>
                          <Label className="text-muted-foreground">签约日期</Label>
                          <p className="font-medium">{parentContract.signDate}</p>
                        </div>
                      )}
                      <div>
                        <Label className="text-muted-foreground">合同起止日期</Label>
                        <p className="font-medium">{parentContract.startDate} 至 {parentContract.endDate}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">支付方式</Label>
                        <p className="font-medium">{paymentMethodMap[parentContract.paymentMethod]}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">提前付款天数</Label>
                        <p className="font-medium">{parentContract.advancePaymentDays} 天</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">是否收取水电费</Label>
                        <p className="font-medium">{parentContract.hasUtilities ? '是' : '否'}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-muted-foreground mb-2 block">租期阶段明细</Label>
                  <table className="w-full border-collapse border border-border">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="border border-border px-3 py-2 text-left text-sm font-medium">阶段类型</th>
                        <th className="border border-border px-3 py-2 text-left text-sm font-medium">起止日期</th>
                        <th className="border border-border px-3 py-2 text-right text-sm font-medium">月租金</th>
                        <th className="border border-border px-3 py-2 text-right text-sm font-medium">月物业费</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedContract.stages.map((stage, index) => (
                        <tr key={stage.id}>
                          <td className="border border-border px-3 py-2 text-sm">
                            {stage.stageType ? (stageTypeMap[stage.stageType] || stage.stageType) : `阶段 ${index + 1}`}
                          </td>
                          <td className="border border-border px-3 py-2 text-sm">{stage.startDate} 至 {stage.endDate}</td>
                          <td className="border border-border px-3 py-2 text-sm text-right font-mono">
                            ¥{stage.monthlyRent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="border border-border px-3 py-2 text-sm text-right font-mono">
                            ¥{stage.monthlyPropertyFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {selectedContract.reviewRemark && (
                  <div>
                    <Label className="text-muted-foreground">审核备注</Label>
                    <p className="text-destructive">{selectedContract.reviewRemark}</p>
                  </div>
                )}

                {selectedContract.status === 'pending' && (
                  <DialogFooter className="gap-2">
                    <Button variant="destructive" disabled={isReviewing} onClick={() => openRejectDialog('contract', selectedContract.id)}>
                      <XCircleIcon className="w-4 h-4 mr-1" />
                      驳回
                    </Button>
                    <Button disabled={isReviewing} onClick={() => handleApproveContract(selectedContract.id)}>
                      <CheckCircleIcon className="w-4 h-4 mr-1" />
                      通过
                    </Button>
                  </DialogFooter>
                )}
              </div>
            )}

            {selectedAmendment && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">补充协议编号</Label>
                    <p className="font-medium">{selectedAmendment.amendmentNo || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">关联合同</Label>
                    <p className="font-medium">{contracts.find((c) => c.id === selectedAmendment.contractId)?.contractNo || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">变更方式</Label>
                    <p className="font-medium">{changeTypeMap[selectedAmendment.changeType] || selectedAmendment.changeType}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">合同签署日期</Label>
                    <p className="font-medium">{selectedAmendment.signDate || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">变更起止日期</Label>
                    <p className="font-medium">{selectedAmendment.changeStartDate} 至 {selectedAmendment.changeEndDate}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">当前状态</Label>
                    <div className="mt-1">
                      <Badge
                        variant={amendmentStatusBadgeMap[selectedAmendment.status]?.variant || 'outline'}
                        className={amendmentStatusBadgeMap[selectedAmendment.status]?.className}
                      >
                        {amendmentStatusBadgeMap[selectedAmendment.status]?.label}
                      </Badge>
                    </div>
                  </div>
                </div>

                {selectedAmendment.stages.length > 0 && (
                  <div>
                    <Label className="text-muted-foreground mb-2 block">变更分段明细</Label>
                    <table className="w-full border-collapse border border-border">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="border border-border px-3 py-2 text-left text-sm font-medium">阶段类型</th>
                          <th className="border border-border px-3 py-2 text-left text-sm font-medium">起止日期</th>
                          <th className="border border-border px-3 py-2 text-right text-sm font-medium">月租金</th>
                          <th className="border border-border px-3 py-2 text-right text-sm font-medium">月物业费</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedAmendment.stages.map((stage, index) => (
                          <tr key={stage.id || index}>
                            <td className="border border-border px-3 py-2 text-sm">
                              {stage.stageType ? (stageTypeMap[stage.stageType] || stage.stageType) : `阶段 ${index + 1}`}
                            </td>
                            <td className="border border-border px-3 py-2 text-sm">{stage.startDate} 至 {stage.endDate}</td>
                            <td className="border border-border px-3 py-2 text-sm text-right font-mono">
                              ¥{stage.monthlyRent.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="border border-border px-3 py-2 text-sm text-right font-mono">
                              ¥{stage.monthlyPropertyFee.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {selectedAmendment.reviewRemark && (
                  <div>
                    <Label className="text-muted-foreground">审核备注</Label>
                    <p className={selectedAmendment.status === 'rejected' ? 'text-destructive' : ''}>{selectedAmendment.reviewRemark}</p>
                  </div>
                )}

                {selectedAmendment.status === 'pending' && (
                  <DialogFooter className="gap-2">
                    <Button variant="destructive" disabled={isReviewing} onClick={() => openRejectDialog('amendment', selectedAmendment.id)}>
                      <XCircleIcon className="w-4 h-4 mr-1" />
                      驳回
                    </Button>
                    <Button disabled={isReviewing} onClick={() => handleApproveAmendment(selectedAmendment.id)}>
                      <CheckCircleIcon className="w-4 h-4 mr-1" />
                      通过
                    </Button>
                  </DialogFooter>
                )}
              </div>
            )}

            {selectedTermination && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">申请编号</Label>
                    <p className="font-medium">{selectedTermination.id}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">合同编号</Label>
                    <p className="font-medium">{selectedTermination.contractNo}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">承租方</Label>
                    <p className="font-medium">{selectedTermination.tenant}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">申请终止日期</Label>
                    <p className="font-medium flex items-center gap-1">
                      <CalendarIcon className="w-4 h-4" />
                      {selectedTermination.proposedTerminationDate}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">申请时间</Label>
                    <p className="font-medium">{new Date(selectedTermination.createdAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">当前状态</Label>
                    <div className="mt-1">
                      <Badge variant={(statusBadgeMap[selectedTermination.status]?.variant ?? 'outline') as any}>
                        {statusBadgeMap[selectedTermination.status]?.label || selectedTermination.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                {selectedTermination.reviewRemark && (
                  <div>
                    <Label className="text-muted-foreground">审核备注</Label>
                    <p className="text-destructive">{selectedTermination.reviewRemark}</p>
                  </div>
                )}

                {selectedTermination.status === 'pending' && (
                  <DialogFooter className="gap-2">
                    <Button variant="destructive" disabled={isReviewing} onClick={() => openRejectDialog('termination', selectedTermination.id)}>
                      <XCircleIcon className="w-4 h-4 mr-1" />
                      驳回
                    </Button>
                    <Button disabled={isReviewing} onClick={() => handleApproveTermination(selectedTermination.id)}>
                      <CheckCircleIcon className="w-4 h-4 mr-1" />
                      通过
                    </Button>
                  </DialogFooter>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>驳回原因</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="请输入驳回原因..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
                取消
              </Button>
              <Button variant="destructive" disabled={isReviewing} onClick={confirmReject}>
                确认驳回
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
};

/**
 * 整页按 review:Finance 守卫：与后端 `PATCH /contracts/:id/review` 同点位。
 * 此前只靠侧栏导航隐藏入口，直连 /finance/review 仍能看到并点击通过/驳回。
 */
const FinanceReviewPage: React.FC = () => (
  <CanPoint
    action="review"
    subject="Finance"
    fallback={
      <div className="w-full max-w-[1400px] mx-auto flex items-center justify-center min-h-[400px]">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <AlertCircleIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground mb-2">暂无权限</h2>
            <p className="text-sm text-muted-foreground">您当前的角色无权访问财务审核功能</p>
          </CardContent>
        </Card>
      </div>
    }
  >
    <FinanceReviewPageContent />
  </CanPoint>
);

export default FinanceReviewPage;
