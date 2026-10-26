import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table } from '@lark-apaas/client-toolkit/antd-table';
import { 
  ArrowLeft, 
  BookOpen, 
  FileText, 
  Calendar, 
  Building2, 
  User, 
  CreditCard,
  AlertCircle,
  CheckCircle,
  XCircle,
  History,
  BarChart3,
  MapPin
} from 'lucide-react';
import { toast } from 'sonner';
import { contractApi } from '@/api';

interface IContractStage {
  id: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  monthlyPropertyFee: number;
  stageType?: string;
}

interface IContract {
  id: string;
  contractNo: string;
  contractType?: 'new_contract' | 'supplement';
  parentContractId?: string;
  propertyName?: string;
  landlord: string;
  tenant: string;
  startDate: string;
  endDate: string;
  hasUtilities: boolean;
  paymentMethod: 'monthly' | 'quarterly';
  advancePaymentDays: number;
  leaseAddress?: string;
  leaseArea?: number;
  signDate?: string;
  stages?: IContractStage[];
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'terminated';
  terminationDate?: string;
  createdAt: string;
  reviewRecords?: IReviewRecord[];
}

interface IReviewRecord {
  id: string;
  type: 'contract' | 'termination';
  action: 'approve' | 'reject';
  reason?: string;
  reviewer: string;
  reviewTime: string;
}

const paymentMethodMap: Record<string, string> = {
  monthly: '月付',
  quarterly: '季付',
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

  const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: '待审核', variant: 'outline' },
  approved: { label: '已通过', variant: 'default' },
  rejected: { label: '已驳回', variant: 'destructive' },
  terminated: { label: '已终止', variant: 'secondary' },
};

  const getStatus = (status: string) => statusMap[status] || { label: '未知', variant: 'outline' as const };

const ContractDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contract, setContract] = useState<IContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [parentContract, setParentContract] = useState<IContract | null>(null);

  useEffect(() => {
    loadContract();
  }, [id]);

  const loadContract = async () => {
    setLoading(true);
    try {
      const res = await contractApi.getDetail(id!);
      const c = res.data as IContract;
      setContract(c);
      if (c.contractType === 'supplement' && c.parentContractId) {
        try {
          const parentRes = await contractApi.getDetail(c.parentContractId);
          setParentContract(parentRes.data as IContract);
        } catch {
          setParentContract(null);
        }
      }
    } catch (error) {
      toast.error('加载合同数据失败');
      navigate('/contracts');
    } finally {
      setLoading(false);
    }
  };

  const stageColumns = [
    {
      title: '阶段类型',
      dataIndex: 'stageType',
      key: 'stageType',
      width: 120,
      render: (_: unknown, record: IContractStage, index: number) =>
        record.stageType ? (stageTypeMap[record.stageType] || record.stageType) : `第${index + 1}阶段`,
    },
    {
      title: '起止日期',
      dataIndex: 'startDate',
      key: 'period',
      width: 220,
      render: (_: string, record: IContractStage) => (
        <span className="font-mono text-sm">
          {record.startDate} 至 {record.endDate}
        </span>
      ),
    },
    {
      title: '月租金',
      dataIndex: 'monthlyRent',
      key: 'monthlyRent',
      width: 150,
      align: 'right' as const,
      render: (value: number) => (
        <span className="font-mono text-sm">¥{value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      ),
    },
    {
      title: '月物业费',
      dataIndex: 'monthlyPropertyFee',
      key: 'monthlyPropertyFee',
      width: 150,
      align: 'right' as const,
      render: (value: number) => (
        <span className="font-mono text-sm">¥{value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      ),
    },
    {
      title: '月费用合计',
      key: 'total',
      width: 150,
      align: 'right' as const,
      render: (_: unknown, record: IContractStage) => (
        <span className="font-mono text-sm font-medium">
          ¥{(record.monthlyRent + record.monthlyPropertyFee).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      ),
    },
  ];

  const calculateTotalAmount = () => {
    if (!contract) return { rentTotal: 0, feeTotal: 0 };
    
    let rentTotal = 0;
    let feeTotal = 0;
    
    (contract.stages ?? []).forEach(stage => {
      const stageStart = new Date(stage.startDate + 'T00:00:00');
      const stageEnd = new Date(stage.endDate + 'T00:00:00');

      // 逐月计算，首末月按天数比例折算，与后端台账生成逻辑一致
      const cursor = new Date(stageStart.getFullYear(), stageStart.getMonth(), 1);
      const endMonth = new Date(stageEnd.getFullYear(), stageEnd.getMonth(), 1);

      while (cursor <= endMonth) {
        const year = cursor.getFullYear();
        const month = cursor.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        const monthStart = stageStart > firstDay ? stageStart : firstDay;
        const monthEnd = stageEnd < lastDay ? stageEnd : lastDay;

        if (monthStart <= monthEnd) {
          const daysInMonth = lastDay.getDate();
          const stageDays = Math.floor((monthEnd.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

          const isFirstMonth = year === stageStart.getFullYear() && month === stageStart.getMonth();
          const isLastMonth = year === stageEnd.getFullYear() && month === stageEnd.getMonth();

          let rent = stage.monthlyRent;
          let fee = stage.monthlyPropertyFee;

          if (isFirstMonth || isLastMonth) {
            const ratio = stageDays / daysInMonth;
            rent = Math.round(stage.monthlyRent * ratio * 100) / 100;
            fee = Math.round(stage.monthlyPropertyFee * ratio * 100) / 100;
          }

          rentTotal += rent;
          feeTotal += fee;
        }

        cursor.setMonth(cursor.getMonth() + 1);
      }
    });
    
    return { rentTotal, feeTotal };
  };

  const handleViewLedger = () => {
    navigate(`/ledger?contractId=${contract?.id}`);
  };

  const handleGoBack = () => {
    navigate('/contracts');
  };

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="w-full flex flex-col items-center justify-center py-20 gap-4">
        <AlertCircle className="w-12 h-12 text-muted-foreground" />
        <div className="text-muted-foreground">合同不存在或已被删除</div>
        <Button onClick={handleGoBack}>返回合同列表</Button>
      </div>
    );
  }

  const { rentTotal, feeTotal } = calculateTotalAmount();
  const status = getStatus(contract.status);

  const lastRejectReason = contract.status === 'rejected'
    ? [...(contract.reviewRecords ?? [])].reverse().find(r => r.action === 'reject')?.reason
    : undefined;

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={handleGoBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <h1 className="text-xl font-semibold text-foreground">合同详情</h1>
          <Badge variant={status.variant}>{status.label}</Badge>
          {lastRejectReason && (
            <span className="text-sm text-muted-foreground truncate max-w-[400px]">
              驳回原因：<span className="text-destructive">{lastRejectReason}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleViewLedger}>
            <BookOpen className="w-4 h-4 mr-2" />
            查看台账
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              基础信息
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">合同编号</div>
                <div className="font-mono text-sm font-medium">{contract.contractNo}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">房产名称</div>
                <div className="text-sm font-medium flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-muted-foreground" />
                  {contract.propertyName || '-'}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">租赁地址</div>
                <div className="text-sm font-medium flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-muted-foreground" />
                  {contract.leaseAddress || '-'}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">合同类型</div>
                <div className="text-sm font-medium">
                  {contract.contractType === 'supplement' ? '补充协议' : '新签合同'}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">签约日期</div>
                <div className={`text-sm font-medium flex items-center gap-1 ${parentContract && contract.signDate !== parentContract.signDate ? 'text-destructive' : ''}`}>
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  {contract.signDate || '-'}
                </div>
              </div>
              {contract.leaseArea != null && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">租赁面积（㎡）</div>
                  <div className="text-sm font-medium">{contract.leaseArea}</div>
                </div>
              )}
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">出租方</div>
                <div className="text-sm font-medium flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-muted-foreground" />
                  {contract.landlord}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">承租方</div>
                <div className="text-sm font-medium flex items-center gap-1">
                  <User className="w-3 h-3 text-muted-foreground" />
                  {contract.tenant}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">合同起止日期</div>
                <div className={`text-sm font-medium flex items-center gap-1 ${parentContract && (contract.startDate !== parentContract.startDate || contract.endDate !== parentContract.endDate) ? 'text-destructive' : ''}`}>
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  {contract.startDate} 至 {contract.endDate}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">租金支付方式</div>
                <div className={`text-sm font-medium flex items-center gap-1 ${parentContract && contract.paymentMethod !== parentContract.paymentMethod ? 'text-destructive' : ''}`}>
                  <CreditCard className="w-3 h-3 text-muted-foreground" />
                  {paymentMethodMap[contract.paymentMethod]}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">提前付款天数</div>
                <div className={`text-sm font-medium flex items-center gap-1 ${parentContract && contract.advancePaymentDays !== parentContract.advancePaymentDays ? 'text-destructive' : ''}`}>
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  {contract.advancePaymentDays}天
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">水电费收取</div>
                <div className={`text-sm font-medium ${parentContract && contract.hasUtilities !== parentContract.hasUtilities ? 'text-destructive' : ''}`}>
                  {contract.hasUtilities ? (
                    <Badge variant="outline" className="text-xs">需收取</Badge>
                  ) : (
                    <span className="text-muted-foreground">不收取</span>
                  )}
                </div>
              </div>
              {contract.terminationDate && (
                <div className="space-y-1 col-span-2">
                  <div className="text-xs text-muted-foreground">终止日期</div>
                  <div className="text-sm font-medium text-destructive">
                    {contract.terminationDate}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {parentContract && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                原合同信息
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">合同编号</div>
                  <div className="font-mono text-sm font-medium">{parentContract.contractNo}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">签约日期</div>
                  <div className="text-sm font-medium">{parentContract.signDate || '-'}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">合同起止日期</div>
                  <div className="text-sm font-medium">{parentContract.startDate} 至 {parentContract.endDate}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">租金支付方式</div>
                  <div className="text-sm font-medium">{paymentMethodMap[parentContract.paymentMethod]}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">提前付款天数</div>
                  <div className="text-sm font-medium">{parentContract.advancePaymentDays}天</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">承租方</div>
                  <div className="text-sm font-medium">{parentContract.tenant || '-'}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">租赁地址</div>
                  <div className="text-sm font-medium">{parentContract.leaseAddress || '-'}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">租赁面积</div>
                  <div className="text-sm font-medium">{parentContract.leaseArea != null ? `${parentContract.leaseArea} ㎡` : '-'}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">水电费收取</div>
                  <div className="text-sm font-medium">
                    {parentContract.hasUtilities ? '需收取' : '不收取'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            金额汇总
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center">
            <div className="flex-1 text-center space-y-1">
              <div className="text-xs text-muted-foreground">租金总金额</div>
              <div className="text-2xl font-mono font-semibold text-foreground">
                ¥{rentTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <Separator orientation="vertical" className="h-14" />
            <div className="flex-1 text-center space-y-1">
              <div className="text-xs text-muted-foreground">物业费总金额</div>
              <div className="text-2xl font-mono font-semibold text-foreground">
                ¥{feeTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <Separator orientation="vertical" className="h-14" />
            <div className="flex-1 text-center space-y-1">
              <div className="text-xs text-muted-foreground">费用总计</div>
              <div className="text-2xl font-mono font-bold text-primary">
                ¥{(rentTotal + feeTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            租期阶段明细
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table
            columns={stageColumns}
            dataSource={contract.stages ?? []}
            rowKey="id"
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
        </CardContent>
      </Card>

      {contract.reviewRecords && contract.reviewRecords.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              审核记录
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {contract.reviewRecords.map((record, index) => (
                <div key={record.id} className="flex items-start gap-4">
                  <div className="mt-0.5">
                    {record.action === 'approve' ? (
                      <CheckCircle className="w-5 h-5 text-success" />
                    ) : (
                      <XCircle className="w-5 h-5 text-destructive" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {record.type === 'contract' ? '合同审核' : '终止审核'}
                      </span>
                      <Badge 
                        variant={record.action === 'approve' ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        {record.action === 'approve' ? '通过' : '驳回'}
                      </Badge>
                    </div>
                    {record.reason && (
                      <div className="text-sm text-muted-foreground">
                        原因：{record.reason}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {record.reviewer} · {record.reviewTime}
                    </div>
                  </div>
                  {index < contract.reviewRecords!.length - 1 && (
                    <Separator className="absolute left-7 top-10 bottom-0 w-px" />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {contract.status === 'terminated' && contract.terminationDate && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertCircle className="w-4 h-4" />
              终止记录
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">终止日期：</span>
                <span className="text-sm font-medium">{contract.terminationDate}</span>
              </div>
              <div className="text-sm text-muted-foreground">
                该合同已于 {contract.terminationDate} 终止，不再产生新的台账记录。
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ContractDetailPage;
