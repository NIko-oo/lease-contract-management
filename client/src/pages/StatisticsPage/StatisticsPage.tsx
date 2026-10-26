import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table } from '@lark-apaas/client-toolkit/antd-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, Search, TrendingUp, Calendar, Users, Wallet, ChevronDown, Clock } from 'lucide-react';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { CanPoint } from '@/components/PermissionGate';
import { contractApi, ledgerApi, terminationApi, companyApi } from '@/api';
import type { ContractResponse, LedgerItem, TerminationRequest, ContractAmendmentResponse, CompanyEntityResponse } from '@shared/api.interface';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { CalendarIcon } from 'lucide-react';
import {
  type IContractSummary,
  getMonthDiff,
  formatCurrency,
  formatDate,
  exportCsv,
  exportExcel,
  exportImpactExcel,
} from './statistics-utils';

const StatisticsPage: React.FC = () => {
  const [contracts, setContracts] = useState<ContractResponse[]>([]);
  const [ledgerMap, setLedgerMap] = useState<Record<string, LedgerItem[]>>({});
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  // 新增合同对年收入影响
  const [impactYear, setImpactYear] = useState<string>(String(new Date().getFullYear()));
  const [impactStatusFilter, setImpactStatusFilter] = useState<string>('all');
  const [terminations, setTerminations] = useState<TerminationRequest[]>([]);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactDetailData, setImpactDetailData] = useState<Array<Record<string, unknown>>>([]);
  const [impactSummary, setImpactSummary] = useState({ totalRent: 0, totalPropertyFee: 0, totalAmount: 0 });
  const [companyTaxRates, setCompanyTaxRates] = useState<Record<string, { rentRate: number; feeRate: number }>>({});

  useEffect(() => {
    const loadData = async () => {
      try {
        const [contractRes, terminationRes, companyRes] = await Promise.all([
          contractApi.getList({ pageSize: 9999 }),
          terminationApi.getList(),
          companyApi.getList(),
        ]);
        const allContracts = contractRes.data.items || [];
        const filtered = allContracts.filter(
          (c) => c.status === 'approved' || c.status === 'terminated'
        );
        setContracts(filtered);
        setTerminations(terminationRes.data.items || []);

        // 构建出租方名称到税率的映射
        const taxRateMap: Record<string, { rentRate: number; feeRate: number }> = {};
        const companies = companyRes.data || [];
        companies.forEach((c: CompanyEntityResponse) => {
          const rentRate = c.rentInvoiceTaxRate ? parseFloat(c.rentInvoiceTaxRate) / 100 : 0;
          const feeRate = c.propertyFeeInvoiceTaxRate ? parseFloat(c.propertyFeeInvoiceTaxRate) / 100 : 0;
          taxRateMap[c.name] = { rentRate, feeRate };
        });
        setCompanyTaxRates(taxRateMap);

        // 加载每个合同的台账数据，用于汇总应收金额
        const map: Record<string, LedgerItem[]> = {};
        await Promise.all(
          filtered.map(async (c) => {
            try {
              const ledgerRes = await ledgerApi.getList({ contractId: c.id, pageSize: 9999 });
              map[c.id] = ledgerRes.data.items || [];
            } catch {
              map[c.id] = [];
            }
          })
        );
        setLedgerMap(map);
      } catch (error) {
        logger.error('加载合同数据失败:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // 新增合同对年收入影响 - 数据计算
  useEffect(() => {
    const computeImpact = async () => {
      setImpactLoading(true);
      try {
        const year = parseInt(impactYear, 10);
        // signDateInfo: contractId -> { date, source }
        // source: 'contract' | 'termination' | 'amendment'
        const signDateInfo: Record<string, { date: string; source: string }> = {};
        const contractIdSet = new Set<string>();

        // 3.1 合同管理中签订日期(signDate)年份=选择年份的合同
        contracts.forEach((c) => {
          if (c.signDate && new Date(c.signDate).getFullYear() === year) {
            contractIdSet.add(c.id);
            if (!signDateInfo[c.id]) signDateInfo[c.id] = { date: c.signDate, source: 'contract' };
          }
        });

        // 3.2 合同终止内创建日期(createdAt)年份=选择年份的合同（被终止合同编号）
        terminations.forEach((t) => {
          const createdAtStr = (t as unknown as Record<string, string>).createdAt || t._createdAt;
          if (createdAtStr && new Date(createdAtStr).getFullYear() === year) {
            contractIdSet.add(t.contractId);
            if (!signDateInfo[t.contractId]) signDateInfo[t.contractId] = { date: createdAtStr.split('T')[0], source: 'termination' };
          }
        });

        // 3.3 合同变更历史内合同签署日期年份=选择年份，排除水电费变更（被变更合同编号）
        contracts.forEach((c) => {
          if (c.amendments) {
            c.amendments.forEach((a: ContractAmendmentResponse) => {
              if (
                a.signDate &&
                new Date(a.signDate).getFullYear() === year &&
                a.changeType !== 'utility_enable' &&
                a.changeType !== 'utility_disable'
              ) {
                contractIdSet.add(c.id);
                if (!signDateInfo[c.id]) signDateInfo[c.id] = { date: a.signDate, source: 'amendment' };
              }
            });
          }
        });

        if (contractIdSet.size === 0) {
          setImpactDetailData([]);
          setImpactSummary({ totalRent: 0, totalPropertyFee: 0, totalAmount: 0 });
          setImpactLoading(false);
          return;
        }

        // 加载这些合同的台账数据
        const contractIds = Array.from(contractIdSet);
        const ledgerResults = await Promise.all(
          contractIds.map(async (cid) => {
            try {
              const res = await ledgerApi.getList({ contractId: cid, pageSize: 9999 });
              return res.data.items || [];
            } catch {
              return [];
            }
          })
        );

        // 构建合同ID到合同信息的映射
        const contractMap = new Map<string, ContractResponse>();
        contracts.forEach((c) => contractMap.set(c.id, c));

        // 筛选所属期年份=2026的台账记录，生成明细
        const detailRows: Array<Record<string, unknown>> = [];

        ledgerResults.forEach((items) => {
          items.forEach((item) => {
            const periodYear = parseInt(item.period.split('-')[0], 10);
            if (periodYear !== 2026) return;

            const contract = contractMap.get(item.contractId);
            const info = signDateInfo[item.contractId];
            const signDate = info ? info.date : '';
            const rent = Number(item.monthlyRent) || 0;
            const fee = Number(item.monthlyPropertyFee) || 0;
            const amendRent = Number(item.amendmentRent) || 0;
            const amendFee = Number(item.amendmentPropertyFee) || 0;

            // 应收租金 = 变更合同租金 ?? 合同租金
            const receivableRent = item.amendmentRent !== undefined && item.amendmentRent !== null
              ? (Number(item.amendmentRent) || 0)
              : rent;
            // 应收物业费 = 变更合同物业费 ?? 合同物业费
            const receivableFee = item.amendmentPropertyFee !== undefined && item.amendmentPropertyFee !== null
              ? (Number(item.amendmentPropertyFee) || 0)
              : fee;

            // 确定合同类型
            let contractTypeLabel = '';
            const source = info?.source;
            if (source === 'contract') {
              // 3.1 按合同登记时的新签合同/补充协议标记
              contractTypeLabel = contract?.contractType === 'supplement' ? '补充协议' : '新签合同';
            } else if (source === 'termination') {
              contractTypeLabel = '终止合同';
            } else if (source === 'amendment') {
              contractTypeLabel = '部分变更协议';
            }

            // 获取出租方税率
            const landlordName = item.landlord || contract?.landlord || '';
            const taxRates = companyTaxRates[landlordName] || { rentRate: 0, feeRate: 0 };

            // 租金对利润的影响 / 物业费对利润的影响（含税转不含税：除以 1+税率）
            let rentProfitImpact = 0;
            let feeProfitImpact = 0;
            if (contractTypeLabel === '终止合同') {
              if (item.status === 'terminated') {
                // 收款状态为"已终止"：= 0 - 应收租金/物业费
                rentProfitImpact = (0 - receivableRent) / (1 + taxRates.rentRate);
                feeProfitImpact = (0 - receivableFee) / (1 + taxRates.feeRate);
              } else if (item.amendmentNo) {
                // 收款状态非"已终止"，且变更合同编号不为空
                // 判断该变更合同编号在合同变更历史内的签署日期年份是否=选择年份
                const matchedAmendment = contract?.amendments?.find(
                  (a: ContractAmendmentResponse) => a.amendmentNo === item.amendmentNo
                );
                if (matchedAmendment && matchedAmendment.signDate && new Date(matchedAmendment.signDate).getFullYear() === year) {
                  rentProfitImpact = (amendRent - rent) / (1 + taxRates.rentRate);
                  feeProfitImpact = (amendFee - fee) / (1 + taxRates.feeRate);
                }
                // 不满足年份条件则保持 0
              }
              // 变更合同编号为空则保持 0
            } else if (contractTypeLabel === '新签合同' || contractTypeLabel === '补充协议') {
              // 优先判断收款状态是否为"已终止"，满足则=0
              if (item.status !== 'terminated') {
                // 3.2 = 应收租金/应收物业费（含税转不含税）
                rentProfitImpact = receivableRent / (1 + taxRates.rentRate);
                feeProfitImpact = receivableFee / (1 + taxRates.feeRate);
              }
            } else if (contractTypeLabel === '部分变更协议') {
              // 3.3 优先判断变更合同编号是否为空，为空则=0
              if (item.amendmentNo) {
                rentProfitImpact = (amendRent - rent) / (1 + taxRates.rentRate);
                feeProfitImpact = (amendFee - fee) / (1 + taxRates.feeRate);
              }
            }

            // 对利润影响金额 = 租金影响 + 物业费影响
            const profitImpact = rentProfitImpact + feeProfitImpact;

            detailRows.push({
              id: item.id,
              contractNo: item.contractNo,
              propertyName: item.propertyName || contract?.propertyName || '-',
              landlord: item.landlord || contract?.landlord || '-',
              tenant: item.tenant,
              period: item.period,
              stageStartDate: item.stageStartDate,
              stageEndDate: item.stageEndDate,
              monthlyRent: rent,
              monthlyPropertyFee: fee,
              amendmentNo: item.amendmentNo || '',
              amendmentRent: amendRent,
              amendmentPropertyFee: amendFee,
              receivableRent,
              receivableFee,
              status: item.status,
              contractTypeLabel,
              rentProfitImpact,
              feeProfitImpact,
              profitImpact,
              signDate,
            });
          });
        });

        // 按合同类型筛选
        let filteredRows = detailRows;
        if (impactStatusFilter !== 'all') {
          filteredRows = detailRows.filter((row) => row.contractTypeLabel === impactStatusFilter);
        }

        setImpactDetailData(filteredRows);
        setImpactSummary({
          totalRent: filteredRows.reduce((s, r) => s + (Number(r.rentProfitImpact) || 0), 0),
          totalPropertyFee: filteredRows.reduce((s, r) => s + (Number(r.feeProfitImpact) || 0), 0),
          totalAmount: filteredRows.reduce((s, r) => s + (Number(r.profitImpact) || 0), 0),
        });
      } catch (error) {
        logger.error('计算影响数据失败:', error);
      } finally {
        setImpactLoading(false);
      }
    };

    if (contracts.length > 0) {
      computeImpact();
    }
  }, [impactYear, impactStatusFilter, contracts, terminations]);

  const summaryData: IContractSummary[] = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thirtyDaysLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

    return contracts.map(contract => {
      // 从台账数据汇总应收租金和应收物业费，剔除已终止的行记录
      const items = (ledgerMap[contract.id] || []).filter(item => item.status !== 'terminated');
      let totalRent = 0;
      let totalPropertyFee = 0;

      items.forEach(item => {
        // 应收租金 = 变更租金 ?? 合同租金
        totalRent += Number(item.amendmentRent) || Number(item.monthlyRent);
        // 应收物业费 = 变更物业费 ?? 合同物业费
        totalPropertyFee += Number(item.amendmentPropertyFee) || Number(item.monthlyPropertyFee);
      });

      const monthCount = getMonthDiff(contract.startDate, contract.endDate);

      const endDate = new Date(contract.endDate);
      endDate.setHours(0, 0, 0, 0);
      let status: IContractSummary['status'] = 'active';
      if (contract.status === 'terminated') {
        status = 'terminated';
      } else if (endDate < today) {
        status = 'expired';
      } else if (endDate <= thirtyDaysLater && endDate >= today) {
        status = 'expiring';
      }

      return {
        id: contract.id,
        contractNo: contract.contractNo,
        tenant: contract.tenant,
        startDate: contract.startDate,
        endDate: contract.endDate,
        totalRent,
        totalPropertyFee,
        totalAmount: totalRent + totalPropertyFee,
        status,
        monthCount,
      };
    });
  }, [contracts, ledgerMap]);

  const filteredData = useMemo(() => {
    return summaryData.filter(item => {
      const matchSearch = searchText === '' || 
        item.contractNo.toLowerCase().includes(searchText.toLowerCase()) ||
        item.tenant.toLowerCase().includes(searchText.toLowerCase());
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [summaryData, searchText, statusFilter]);

  const statistics = useMemo(() => {
    const total = filteredData.length;
    const active = filteredData.filter(d => d.status === 'active').length;
    const terminated = filteredData.filter(d => d.status === 'terminated').length;
    const expiring = filteredData.filter(d => d.status === 'expiring').length;
    const expired = filteredData.filter(d => d.status === 'expired').length;
    const totalRent = filteredData.reduce((sum, d) => sum + d.totalRent, 0);
    const totalPropertyFee = filteredData.reduce((sum, d) => sum + d.totalPropertyFee, 0);

    return { total, active, terminated, expiring, expired, totalRent, totalPropertyFee };
  }, [filteredData]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-success/10 text-success border border-success/20">正常履行</Badge>;
      case 'terminated':
        return <Badge className="bg-destructive/10 text-destructive border border-destructive/20">已终止</Badge>;
      case 'expiring':
        return <Badge className="bg-warning/10 text-warning border border-warning/20">即将到期</Badge>;
      case 'expired':
        return <Badge className="bg-muted text-muted-foreground border border-muted-foreground/20">已到期</Badge>;
      default:
        return <Badge variant="secondary">未知</Badge>;
    }
  };

  const columns = [
    {
      title: '合同编号',
      dataIndex: 'contractNo',
      key: 'contractNo',
      fixed: 'left' as const,
      width: 140,
    },
    {
      title: '承租方',
      dataIndex: 'tenant',
      key: 'tenant',
      width: 180,
    },
    {
      title: '合同起止日期',
      key: 'dateRange',
      width: 200,
      render: (_, record) => `${formatDate(record.startDate)} 至 ${formatDate(record.endDate)}`,
    },
    {
      title: '租期月数',
      dataIndex: 'monthCount',
      key: 'monthCount',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '租金总金额',
      dataIndex: 'totalRent',
      key: 'totalRent',
      width: 140,
      align: 'right' as const,
      render: (value) => formatCurrency(value),
    },
    {
      title: '物业费总金额',
      dataIndex: 'totalPropertyFee',
      key: 'totalPropertyFee',
      width: 140,
      align: 'right' as const,
      render: (value) => formatCurrency(value),
    },
    {
      title: '合同总金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 140,
      align: 'right' as const,
      render: (value) => <span className="font-medium text-primary">{formatCurrency(value)}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      fixed: 'right' as const,
      render: (status) => getStatusBadge(status),
    },
  ];

  const statusFilters = [
    { key: 'all', label: '全部' },
    { key: 'active', label: '正常履行' },
    { key: 'expiring', label: '即将到期' },
    { key: 'expired', label: '已到期' },
    { key: 'terminated', label: '已终止' },
  ];

  const impactColumns = [
    {
      title: '合同编号',
      dataIndex: 'contractNo',
      key: 'contractNo',
      width: 140,
      fixed: 'left' as const,
    },
    {
      title: '房产名称',
      dataIndex: 'propertyName',
      key: 'propertyName',
      width: 120,
    },
    {
      title: '出租方',
      dataIndex: 'landlord',
      key: 'landlord',
      width: 120,
    },
    {
      title: '承租方',
      dataIndex: 'tenant',
      key: 'tenant',
      width: 150,
    },
    {
      title: '所属期',
      dataIndex: 'period',
      key: 'period',
      width: 100,
    },
    {
      title: '阶段起止日期',
      key: 'stageDateRange',
      width: 200,
      render: (_: unknown, record: Record<string, unknown>) =>
        `${record.stageStartDate || '-'} 至 ${record.stageEndDate || '-'}`,
    },
    {
      title: '合同租金',
      dataIndex: 'monthlyRent',
      key: 'monthlyRent',
      width: 110,
      align: 'right' as const,
      render: (value: unknown) => formatCurrency(Number(value) || 0),
    },
    {
      title: '合同物业费',
      dataIndex: 'monthlyPropertyFee',
      key: 'monthlyPropertyFee',
      width: 120,
      align: 'right' as const,
      render: (value: unknown) => formatCurrency(Number(value) || 0),
    },
    {
      title: '变更合同编号',
      dataIndex: 'amendmentNo',
      key: 'amendmentNo',
      width: 140,
      render: (value: unknown) => (value ? String(value) : '-'),
    },
    {
      title: '变更合同租金',
      dataIndex: 'amendmentRent',
      key: 'amendmentRent',
      width: 120,
      align: 'right' as const,
      render: (value: unknown) => (value ? formatCurrency(Number(value)) : '-'),
    },
    {
      title: '变更合同物业费',
      dataIndex: 'amendmentPropertyFee',
      key: 'amendmentPropertyFee',
      width: 130,
      align: 'right' as const,
      render: (value: unknown) => (value ? formatCurrency(Number(value)) : '-'),
    },
    {
      title: '收款状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value: unknown) => {
        const statusMap: Record<string, string> = {
          unpaid: '未收',
          partial: '部分收款',
          paid: '已收齐',
          no_payment_required: '无需收款',
          terminated: '已终止',
        };
        return statusMap[String(value)] || String(value) || '-';
      },
    },
    {
      title: '应收租金',
      dataIndex: 'receivableRent',
      key: 'receivableRent',
      width: 120,
      align: 'right' as const,
      render: (value: unknown) => formatCurrency(Number(value) || 0),
    },
    {
      title: '应收物业费',
      dataIndex: 'receivableFee',
      key: 'receivableFee',
      width: 120,
      align: 'right' as const,
      render: (value: unknown) => formatCurrency(Number(value) || 0),
    },
    {
      title: '合同类型',
      dataIndex: 'contractTypeLabel',
      key: 'contractTypeLabel',
      width: 120,
      render: (value: unknown) => {
        const colorMap: Record<string, string> = {
          '新签合同': 'bg-blue-100 text-blue-800',
          '补充协议': 'bg-purple-100 text-purple-800',
          '终止合同': 'bg-red-100 text-red-800',
          '部分变更协议': 'bg-orange-100 text-orange-800',
        };
        const label = String(value) || '-';
        const cls = colorMap[label] || 'bg-gray-100 text-gray-800';
        return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label}</span>;
      },
    },
    {
      title: '租金对利润的影响',
      dataIndex: 'rentProfitImpact',
      key: 'rentProfitImpact',
      width: 140,
      align: 'right' as const,
      render: (value: unknown) => {
        const num = Number(value) || 0;
        return (
          <span className={num < 0 ? 'text-destructive font-medium' : num > 0 ? 'text-success font-medium' : ''}>
            {formatCurrency(num)}
          </span>
        );
      },
    },
    {
      title: '物业费对利润的影响',
      dataIndex: 'feeProfitImpact',
      key: 'feeProfitImpact',
      width: 150,
      align: 'right' as const,
      render: (value: unknown) => {
        const num = Number(value) || 0;
        return (
          <span className={num < 0 ? 'text-destructive font-medium' : num > 0 ? 'text-success font-medium' : ''}>
            {formatCurrency(num)}
          </span>
        );
      },
    },
    {
      title: '对利润影响金额',
      dataIndex: 'profitImpact',
      key: 'profitImpact',
      width: 130,
      align: 'right' as const,
      render: (value: unknown) => {
        const num = Number(value) || 0;
        return (
          <span className={num < 0 ? 'text-destructive font-medium' : num > 0 ? 'text-success font-medium' : ''}>
            {formatCurrency(num)}
          </span>
        );
      },
    },
    {
      title: '合同签署日期',
      dataIndex: 'signDate',
      key: 'signDate',
      width: 120,
      render: (value: unknown) => (value ? formatDate(String(value)) : '-'),
    },
  ];

  return (
    <>
      <style jsx>{`
        .statistics-page {
          animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="statistics-page w-full space-y-6">
        {/* 新增合同对年收入的影响 */}
        <section className="w-full">
          <Card>
            <CardHeader>
              <CardTitle>新增合同对年收入的影响</CardTitle>
              <CardDescription>
                本次统计只从合同口径统计合同总金额对本年的影响，未考虑物业费收入净额法对本年利润的影响（即合同统计使用总额法）
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* 第一部分：年份选择 + 状态筛选 */}
              <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-sm text-muted-foreground whitespace-nowrap">合同签订年份</Label>
                  <Select value={impactYear} onValueChange={setImpactYear}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 }, (_, i) => 2026 + i).map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}年</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  {[
                    { key: 'all', label: '全部' },
                    { key: '新签合同', label: '新签合同' },
                    { key: '补充协议', label: '补充协议' },
                    { key: '终止合同', label: '终止合同' },
                    { key: '部分变更协议', label: '部分变更协议' },
                  ].map((f) => (
                    <Button
                      key={f.key}
                      variant={impactStatusFilter === f.key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setImpactStatusFilter(f.key)}
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* 第二部分：汇总金额 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">租金影响利润总金额（不含税）</p>
                    <p className="text-2xl font-bold text-primary mt-1">{formatCurrency(impactSummary.totalRent)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-yellow-50 border-yellow-200">
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">物业费影响利润总金额（不含税）</p>
                    <p className="text-2xl font-bold text-secondary-foreground mt-1">{formatCurrency(impactSummary.totalPropertyFee)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-success/5 border-success/20">
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">影响利润总金额（不含税）</p>
                    <p className="text-2xl font-bold text-success mt-1">{formatCurrency(impactSummary.totalAmount)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* 第三部分：明细表格 */}
              <div className="flex justify-end mb-3">
                <CanPoint action="read" subject="Statistics">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => exportImpactExcel(impactDetailData)}
                    disabled={impactDetailData.length === 0}
                  >
                    <Download className="w-4 h-4" />
                    导出明细
                  </Button>
                </CanPoint>
              </div>
              <Table
                columns={impactColumns}
                dataSource={impactDetailData}
                rowKey="id"
                loading={impactLoading}
                scroll={{ x: 2600 }}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  showTotal: (total) => `共 ${total} 条记录`,
                }}
              />
            </CardContent>
          </Card>
        </section>

        <section className="w-full">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">合同统计</h1>
              <p className="text-muted-foreground mt-1">按合同维度汇总展示统计信息</p>
            </div>
            <CanPoint action="read" subject="Statistics">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="gap-2">
                    <Download className="w-4 h-4" />
                    导出统计表
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportExcel(filteredData)}>
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    导出 Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportCsv(filteredData)}>
                    <Download className="w-4 h-4 mr-2" />
                    导出 CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </CanPoint>
          </div>
        </section>

        <section className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">合同总数</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{statistics.total}</p>
                </div>
                <div className="w-10 h-10 rounded-sm bg-primary/10 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">正常履行</p>
                  <p className="text-2xl font-bold text-success mt-1">{statistics.active}</p>
                </div>
                <div className="w-10 h-10 rounded-sm bg-success/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">即将到期</p>
                  <p className="text-2xl font-bold text-warning mt-1">{statistics.expiring}</p>
                </div>
                <div className="w-10 h-10 rounded-sm bg-warning/10 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">已到期</p>
                  <p className="text-2xl font-bold text-muted-foreground mt-1">{statistics.expired}</p>
                </div>
                <div className="w-10 h-10 rounded-sm bg-muted/50 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">已终止</p>
                  <p className="text-2xl font-bold text-destructive mt-1">{statistics.terminated}</p>
                </div>
                <div className="w-10 h-10 rounded-sm bg-destructive/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="w-full grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-sm bg-primary/10 flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">租金总金额</p>
                  <p className="text-3xl font-bold text-foreground">{formatCurrency(statistics.totalRent)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-sm bg-secondary flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-secondary-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">物业费总金额</p>
                  <p className="text-3xl font-bold text-foreground">{formatCurrency(statistics.totalPropertyFee)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="w-full">
          <Card>
            <CardHeader>
              <CardTitle>合同汇总表</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 mb-6">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索合同编号或承租方..."
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-2">
                  {statusFilters.map((filter) => (
                    <Button
                      key={filter.key}
                      variant={statusFilter === filter.key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setStatusFilter(filter.key)}
                    >
                      {filter.label}
                    </Button>
                  ))}
                </div>
              </div>

              <Table
                columns={columns}
                dataSource={filteredData}
                rowKey="id"
                loading={loading}
                scroll={{ x: 1200 }}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: true,
                  showTotal: (total) => `共 ${total} 条记录`,
                }}
              />
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
};

export default StatisticsPage;
