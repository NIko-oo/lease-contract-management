import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { FileSpreadsheet, Printer, Download, Calendar } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { CanPoint } from '@/components/PermissionGate';
import { AlertCircle } from 'lucide-react';
import { ledgerApi, utilityApi, companyApi, contractApi } from '@/api';
import type { LedgerItem, UtilityRecord, CompanyEntityResponse, ContractResponse } from '@shared/api.interface';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { printStatement, printStatements } from './pdf-export';
import type { IPdfTenantStatement } from './pdf-export';
import { ORG_SIGNATURE } from '@/config/organization';

interface IStatementGroup {
  tenant: string;
  items: LedgerItem[];
  totalRent: number;
  totalPropertyFee: number;
  totalAmount: number;
}

interface IUtilityGroup {
  tenant: string;
  items: UtilityRecord[];
  totalElectricity: number;
  totalWater: number;
  totalAmount: number;
}

const StatementPage: React.FC = () => {
  return (
    <CanPoint
      action="read"
      subject="Statement"
      fallback={
        <div className="w-full max-w-[1400px] mx-auto flex items-center justify-center min-h-[400px]">
          <Card className="w-full max-w-md">
            <CardContent className="py-12 text-center">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-foreground mb-2">暂无权限</h2>
              <p className="text-sm text-muted-foreground">您当前的角色无权访问对账单功能</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <StatementPageContent />
    </CanPoint>
  );
};

const StatementPageContent: React.FC = () => {
  const [statementMonth, setStatementMonth] = useState<string>('');
  const [generatedStatement, setGeneratedStatement] = useState<IStatementGroup[] | null>(null);
  const [utilityStatement, setUtilityStatement] = useState<IUtilityGroup[] | null>(null);
  const [selectedTenants, setSelectedTenants] = useState<Set<string>>(new Set());
  const [paymentStatementMonth, setPaymentStatementMonth] = useState<string>('');
  const [paymentStatement, setPaymentStatement] = useState<IStatementGroup[] | null>(null);
  const [paymentUtilityStatement, setPaymentUtilityStatement] = useState<IUtilityGroup[] | null>(null);
  const [paymentSelectedTenants, setPaymentSelectedTenants] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [paymentGenerating, setPaymentGenerating] = useState(false);
  const [companies, setCompanies] = useState<CompanyEntityResponse[]>([]);
  const [contractList, setContractList] = useState<ContractResponse[]>([]);
  const statementRef = useRef<HTMLDivElement>(null);

  const getCompanyInfo = (landlordName: string): CompanyEntityResponse | undefined => {
    return companies.find(c => c.name === landlordName);
  };

  const getContractInfo = (contractId: string): ContractResponse | undefined => {
    return contractList.find(c => c.id === contractId);
  };

  const formatDateDot = (dateStr: string) => {
    return dateStr.replace(/-/g, '.');
  };

  const getReceivableRent = (item: LedgerItem) => item.amendmentRent != null ? item.amendmentRent : item.monthlyRent;
  const getReceivablePropertyFee = (item: LedgerItem) => item.amendmentPropertyFee != null ? item.amendmentPropertyFee : item.monthlyPropertyFee;

  const groupByContract = (items: LedgerItem[]) => {
    const map = new Map<string, { contractNo: string; tenant: string; leaseAddress: string }>();
    items.forEach(item => {
      if (!map.has(item.contractNo)) {
        const contract = getContractInfo(item.contractId);
        const leaseAddress = item.propertyName || contract?.leaseAddress || contract?.propertyName || '';
        map.set(item.contractNo, { contractNo: item.contractNo, tenant: item.tenant, leaseAddress });
      }
    });
    return Array.from(map.values());
  };

  const handleGenerateStatement = async () => {
    if (!statementMonth) {
      toast.error('请输入对账月份');
      return;
    }

    setGenerating(true);
    try {
      const [ledgerRes, utilityRes, companyRes, contractRes] = await Promise.all([
        ledgerApi.getList({ pageSize: 9999 }),
        utilityApi.getList({ pageSize: 9999 }),
        companyApi.getList(),
        contractApi.getList({ pageSize: 9999 }),
      ]);

      const ledgerData: LedgerItem[] = ledgerRes.data.items || [];
      const utilityData: UtilityRecord[] = utilityRes.data.items || [];
      const companyData: CompanyEntityResponse[] = companyRes.data || [];
      const contractData: ContractResponse[] = contractRes.data.items || [];
      setCompanies(companyData);
      setContractList(contractData);
      // 使用本次请求的局部合同映射，避免依赖未更新的 state（首次生成时 contractList 为空导致终止过滤失效）
      const contractMap = new Map(contractData.map(c => [c.id, c]));

      const targetDate = new Date(statementMonth + '-01');

      const unpaidItems = ledgerData.filter(item => {
        if (item.status === 'terminated') return false;
        const hasAmount = getReceivableRent(item) > 0 || getReceivablePropertyFee(item) > 0;
        if (!hasAmount) return false;
        const contract = contractMap.get(item.contractId);
        if (contract?.terminationDate) {
          const terminationMonth = contract.terminationDate.substring(0, 7);
          if (item.period > terminationMonth) return false;
        }
        if (item.period === statementMonth) return true;
        const itemDate = new Date(item.period + '-01');
        return itemDate < targetDate && item.status !== 'paid';
      });

      const grouped = unpaidItems.reduce((acc, item) => {
        if (!acc[item.tenant]) {
          acc[item.tenant] = {
            tenant: item.tenant,
            items: [],
            totalRent: 0,
            totalPropertyFee: 0,
            totalAmount: 0,
          };
        }
        acc[item.tenant].items.push(item);
        acc[item.tenant].totalRent += getReceivableRent(item) - item.rentReceived;
        acc[item.tenant].totalPropertyFee += getReceivablePropertyFee(item) - item.propertyFeeReceived;
        acc[item.tenant].totalAmount = acc[item.tenant].totalRent + acc[item.tenant].totalPropertyFee;
        return acc;
      }, {} as Record<string, IStatementGroup>);

      const statementData = Object.values(grouped);
      setGeneratedStatement(statementData);
      setSelectedTenants(new Set(statementData.map(g => g.tenant)));

      const utilityItems = utilityData.filter(item => {
        const totalFee = item.totalElectricityFee + item.totalWaterFee;
        if (totalFee === 0) return false;
        const contract = contractMap.get(item.contractId);
        if (contract?.terminationDate) {
          const terminationMonth = contract.terminationDate.substring(0, 7);
          if (item.period > terminationMonth) return false;
        }
        if (item.period === statementMonth) return true;
        const itemDate = new Date(item.period + '-01');
        const totalReceived = item.electricityReceived + item.waterReceived;
        return itemDate < targetDate && totalReceived < totalFee;
      });

      const utilityGrouped = utilityItems.reduce((acc, item) => {
        if (!acc[item.tenant]) {
          acc[item.tenant] = {
            tenant: item.tenant,
            items: [],
            totalElectricity: 0,
            totalWater: 0,
            totalAmount: 0,
          };
        }
        acc[item.tenant].items.push(item);
        acc[item.tenant].totalElectricity += item.totalElectricityFee - item.electricityReceived;
        acc[item.tenant].totalWater += item.totalWaterFee - item.waterReceived;
        acc[item.tenant].totalAmount = acc[item.tenant].totalElectricity + acc[item.tenant].totalWater;
        return acc;
      }, {} as Record<string, IUtilityGroup>);

      setUtilityStatement(Object.values(utilityGrouped));
      toast.success('对账单生成成功');
    } catch {
      toast.error('获取数据失败，请重试');
    } finally {
      setGenerating(false);
    }
  };

  const buildPdfStatement = (group: IStatementGroup, utilityGroup?: IUtilityGroup): IPdfTenantStatement => {
    const landlordName = group.items[0]?.landlord || getContractInfo(group.items[0]?.contractId)?.landlord || '';
    const companyInfo = getCompanyInfo(landlordName);
    const companyName = companyInfo?.name || landlordName;
    const contracts = groupByContract(group.items);

    const totalRentDue = group.items.reduce((s, i) => s + getReceivableRent(i), 0);
    const totalRentPaid = group.items.reduce((s, i) => s + i.rentReceived, 0);
    const totalFeeDue = group.items.reduce((s, i) => s + getReceivablePropertyFee(i), 0);
    const totalFeePaid = group.items.reduce((s, i) => s + i.propertyFeeReceived, 0);
    const totalDue = totalRentDue + totalFeeDue;
    const totalPaid = totalRentPaid + totalFeePaid;
    const totalUnpaid = totalDue - totalPaid;

    const utilityGroupParam = utilityGroup ?? utilityStatement?.find(u => u.tenant === group.tenant);

    const eDue = utilityGroupParam?.items.reduce((s, i) => s + i.totalElectricityFee, 0) ?? 0;
    const ePaid = utilityGroupParam?.items.reduce((s, i) => s + i.electricityReceived, 0) ?? 0;
    const wDue = utilityGroupParam?.items.reduce((s, i) => s + i.totalWaterFee, 0) ?? 0;
    const wPaid = utilityGroupParam?.items.reduce((s, i) => s + i.waterReceived, 0) ?? 0;
    const uDue = eDue + wDue;
    const uPaid = ePaid + wPaid;
    const uUnpaid = uDue - uPaid;

    const gDue = totalDue + uDue;
    const gPaid = totalPaid + uPaid;
    const gUnpaid = gDue - gPaid;

    const ledgerRows = group.items.flatMap(item => [
      { contractNo: item.contractNo, feeType: '租金', dateRange: `${formatDateDot(item.stageStartDate)}-${formatDateDot(item.stageEndDate)}`, dueAmount: getReceivableRent(item).toLocaleString(), paidAmount: item.rentReceived.toLocaleString(), unpaidAmount: (getReceivableRent(item) - item.rentReceived).toLocaleString(), dueDate: item.dueDate },
      { contractNo: item.contractNo, feeType: '物业费', dateRange: `${formatDateDot(item.stageStartDate)}-${formatDateDot(item.stageEndDate)}`, dueAmount: getReceivablePropertyFee(item).toLocaleString(), paidAmount: item.propertyFeeReceived.toLocaleString(), unpaidAmount: (getReceivablePropertyFee(item) - item.propertyFeeReceived).toLocaleString(), dueDate: item.dueDate },
    ]);

    const utilityRows = utilityGroupParam?.items.flatMap(item => [
      { feeType: '电费', period: item.period, usage: item.electricityUsage.toLocaleString(), unitPrice: item.electricityPrice.toFixed(2), dueAmount: item.totalElectricityFee.toLocaleString(), paidAmount: item.electricityReceived.toLocaleString(), unpaidAmount: (item.totalElectricityFee - item.electricityReceived).toLocaleString() },
      { feeType: '水费', period: item.period, usage: item.waterUsage.toLocaleString(), unitPrice: item.waterPrice.toFixed(2), dueAmount: item.totalWaterFee.toLocaleString(), paidAmount: item.waterReceived.toLocaleString(), unpaidAmount: (item.totalWaterFee - item.waterReceived).toLocaleString() },
    ]) ?? [];

    return {
      companyName,
      tenantName: group.tenant,
      contracts: contracts.map(c => ({ contractNo: c.contractNo, tenant: c.tenant, leaseAddress: c.leaseAddress })),
      ledgerRows,
      ledgerSubtotal: { due: totalDue.toLocaleString(), paid: totalPaid.toLocaleString(), unpaid: totalUnpaid.toLocaleString() },
      utilityRows,
      utilitySubtotal: utilityRows.length > 0 ? { due: uDue.toLocaleString(), paid: uPaid.toLocaleString(), unpaid: uUnpaid.toLocaleString() } : undefined,
      grandTotal: { due: gDue.toLocaleString(), paid: gPaid.toLocaleString(), unpaid: gUnpaid.toLocaleString() },
      creditCode: companyInfo?.creditCode,
      bankAccountName: companyInfo?.bankAccountName,
      bankAccountNo: companyInfo?.bankAccountNo,
      bankName: companyInfo?.bankName,
    };
  };

  const handleGeneratePaymentStatement = async () => {
    if (!paymentStatementMonth) {
      toast.error('请输入对账月份');
      return;
    }

    setPaymentGenerating(true);
    try {
      const [ledgerRes, utilityRes, companyRes, contractRes] = await Promise.all([
        ledgerApi.getList({ pageSize: 9999 }),
        utilityApi.getList({ pageSize: 9999 }),
        companyApi.getList(),
        contractApi.getList({ pageSize: 9999 }),
      ]);

      const ledgerData: LedgerItem[] = ledgerRes.data.items || [];
      const utilityData: UtilityRecord[] = utilityRes.data.items || [];
      const companyData: CompanyEntityResponse[] = companyRes.data || [];
      const contractData: ContractResponse[] = contractRes.data.items || [];
      setCompanies(companyData);
      setContractList(contractData);
      // 使用本次请求的局部合同映射，避免依赖未更新的 state（首次生成时 contractList 为空导致终止过滤失效）
      const contractMap = new Map(contractData.map(c => [c.id, c]));

      const targetDate = new Date(paymentStatementMonth + '-01');

      const unpaidItems = ledgerData.filter(item => {
        if (item.status === 'terminated') return false;
        const unpaid = getReceivableRent(item) - item.rentReceived > 0 || getReceivablePropertyFee(item) - item.propertyFeeReceived > 0;
        if (!unpaid) return false;
        const contract = contractMap.get(item.contractId);
        if (contract?.terminationDate) {
          const terminationMonth = contract.terminationDate.substring(0, 7);
          if (item.period > terminationMonth) return false;
        }
        const dueDateMonth = item.dueDate.substring(0, 7);
        return dueDateMonth <= paymentStatementMonth;
      });

      const grouped = unpaidItems.reduce((acc, item) => {
        if (!acc[item.tenant]) {
          acc[item.tenant] = {
            tenant: item.tenant,
            items: [],
            totalRent: 0,
            totalPropertyFee: 0,
            totalAmount: 0,
          };
        }
        acc[item.tenant].items.push(item);
        acc[item.tenant].totalRent += getReceivableRent(item) - item.rentReceived;
        acc[item.tenant].totalPropertyFee += getReceivablePropertyFee(item) - item.propertyFeeReceived;
        acc[item.tenant].totalAmount = acc[item.tenant].totalRent + acc[item.tenant].totalPropertyFee;
        return acc;
      }, {} as Record<string, IStatementGroup>);

      const statementData = Object.values(grouped);
      setPaymentStatement(statementData);
      setPaymentSelectedTenants(new Set(statementData.map(g => g.tenant)));

      const utilityItems = utilityData.filter(item => {
        const totalFee = item.totalElectricityFee + item.totalWaterFee;
        if (totalFee === 0) return false;
        const totalReceived = item.electricityReceived + item.waterReceived;
        if (totalReceived >= totalFee) return false;
        const contract = contractMap.get(item.contractId);
        if (contract?.terminationDate) {
          const terminationMonth = contract.terminationDate.substring(0, 7);
          if (item.period > terminationMonth) return false;
        }
        return item.period <= paymentStatementMonth;
      });

      const utilityGrouped = utilityItems.reduce((acc, item) => {
        if (!acc[item.tenant]) {
          acc[item.tenant] = {
            tenant: item.tenant,
            items: [],
            totalElectricity: 0,
            totalWater: 0,
            totalAmount: 0,
          };
        }
        acc[item.tenant].items.push(item);
        acc[item.tenant].totalElectricity += item.totalElectricityFee - item.electricityReceived;
        acc[item.tenant].totalWater += item.totalWaterFee - item.waterReceived;
        acc[item.tenant].totalAmount = acc[item.tenant].totalElectricity + acc[item.tenant].totalWater;
        return acc;
      }, {} as Record<string, IUtilityGroup>);

      setPaymentUtilityStatement(Object.values(utilityGrouped));
      toast.success('对账单生成成功');
    } catch {
      toast.error('获取数据失败，请重试');
    } finally {
      setPaymentGenerating(false);
    }
  };

  const handlePaymentPrint = (group: IStatementGroup) => {
    const utilityGroup = paymentUtilityStatement?.find(u => u.tenant === group.tenant);
    const stmt = buildPdfStatement(group, utilityGroup);
    printStatement(stmt);
  };

  const handleExportPaymentPDF = () => {
    if (paymentSelectedTenants.size === 0) {
      toast.error('请至少选择一个租户');
      return;
    }
    if (!paymentStatement) return;

    const statements: IPdfTenantStatement[] = paymentStatement
      .filter(group => paymentSelectedTenants.has(group.tenant))
      .map(group => {
        const utilityGroup = paymentUtilityStatement?.find(u => u.tenant === group.tenant);
        return buildPdfStatement(group, utilityGroup);
      });

    printStatements(statements);
  };

  const handlePrint = (group: IStatementGroup) => {
    const stmt = buildPdfStatement(group);
    printStatement(stmt);
  };

  const handleExportPDF = () => {
    if (selectedTenants.size === 0) {
      toast.error('请至少选择一个租户');
      return;
    }
    if (!generatedStatement) return;

    const statements: IPdfTenantStatement[] = generatedStatement
      .filter(group => selectedTenants.has(group.tenant))
      .map(group => buildPdfStatement(group));

    printStatements(statements);
  };

  return (
    <>
      <style jsx global>{`
        .statement-page {
          animation: fadeIn 0.3s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .statement-tenant-block table td,
        .statement-tenant-block table th {
          white-space: nowrap;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          .print\:break-after-page {
            break-after: page !important;
          }
          .statement-tenant-block {
            border: none !important;
            padding: 0 !important;
            margin-bottom: 0 !important;
          }
        }
      `}</style>

      <div className="statement-page w-full max-w-[1400px] mx-auto space-y-6">
        <section className="w-full flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">对账单生成</h1>
            <p className="text-muted-foreground mt-1">生成标准化对账单供租户确认</p>
          </div>
        </section>

        <section className="w-full no-print space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                生成条件（按租金费用所属期生成）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="statementMonth">对账月份</Label>
                  <Input
                    id="statementMonth"
                    type="month"
                    value={statementMonth}
                    onChange={(e) => setStatementMonth(e.target.value)}
                    placeholder="请选择对账月份"
                  />
                </div>
                <Button onClick={handleGenerateStatement} className="gap-2" disabled={generating}>
                  <FileSpreadsheet className="w-4 h-4" />
                  {generating ? '生成中...' : '生成对账单'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                生成条件（按收款所属期生成）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="paymentStatementMonth">对账月份</Label>
                  <Input
                    id="paymentStatementMonth"
                    type="month"
                    value={paymentStatementMonth}
                    onChange={(e) => setPaymentStatementMonth(e.target.value)}
                    placeholder="请选择对账月份"
                  />
                </div>
                <Button onClick={handleGeneratePaymentStatement} className="gap-2" disabled={paymentGenerating}>
                  <FileSpreadsheet className="w-4 h-4" />
                  {paymentGenerating ? '生成中...' : '生成对账单'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {generatedStatement && generatedStatement.length > 0 ? (
          <section className="w-full space-y-6">
            <Card className="no-print">
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedTenants.size === generatedStatement.length && generatedStatement.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedTenants(new Set(generatedStatement.map(g => g.tenant)));
                        } else {
                          setSelectedTenants(new Set());
                        }
                      }}
                    />
                    <span className="text-sm font-medium">全选</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    已选 {selectedTenants.size} / {generatedStatement.length} 户
                  </span>
                </div>
                {(() => {
                  const STATEMENT_METHOD_LABELS: Record<string, string> = { monthly: '月付租户', quarterly: '季付租户' };
                  const grouped = generatedStatement.reduce<Record<string, IStatementGroup[]>>((acc, group) => {
                    const method = group.items[0]?.paymentMethod || 'monthly';
                    if (!acc[method]) acc[method] = [];
                    acc[method].push(group);
                    return acc;
                  }, {});
                  const methodOrder = ['monthly', 'quarterly'];
                  return methodOrder
                    .filter(method => grouped[method] && grouped[method].length > 0)
                    .map(method => {
                      const groups = grouped[method];
                      const allSelected = groups.every(g => selectedTenants.has(g.tenant));
                      const someSelected = groups.some(g => selectedTenants.has(g.tenant));
                      return (
                        <div key={method} className={method !== 'monthly' ? 'mt-4 pt-4 border-t border-border' : ''}>
                          <div className="flex items-center gap-2 mb-2">
                            <Checkbox
                              checked={allSelected}
                              ref={undefined}
                              data-indeterminate={someSelected && !allSelected ? true : undefined}
                              onCheckedChange={(checked) => {
                                const newSet = new Set(selectedTenants);
                                if (checked) {
                                  groups.forEach(g => newSet.add(g.tenant));
                                } else {
                                  groups.forEach(g => newSet.delete(g.tenant));
                                }
                                setSelectedTenants(newSet);
                              }}
                            />
                            <span className="text-sm font-medium text-muted-foreground">{STATEMENT_METHOD_LABELS[method] || method}（{groups.length} 户）</span>
                          </div>
                          <div className="flex flex-wrap gap-3 pl-6">
                            {groups.map(group => (
                              <label key={group.tenant} className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={selectedTenants.has(group.tenant)}
                                  onCheckedChange={(checked) => {
                                    const newSet = new Set(selectedTenants);
                                    if (checked) newSet.add(group.tenant);
                                    else newSet.delete(group.tenant);
                                    setSelectedTenants(newSet);
                                  }}
                                />
                                <span>{group.tenant}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    });
                })()}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between no-print">
              <h2 className="text-lg font-medium">对账单预览（按租金费用所属期）</h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleExportPDF} className="gap-2">
                  <Download className="w-4 h-4" />
                  导出PDF
                </Button>
              </div>
            </div>

            <div ref={statementRef}>
              {generatedStatement
                .filter(group => selectedTenants.has(group.tenant))
                .map((group) => {
                  const utilityGroup = utilityStatement?.find(u => u.tenant === group.tenant);
                  const landlordName = group.items[0]?.landlord || getContractInfo(group.items[0]?.contractId)?.landlord || '';
                  const companyInfo = getCompanyInfo(landlordName);
                  const companyName = companyInfo?.name || landlordName;

                  const contracts = groupByContract(group.items);

                  const totalRentDue = group.items.reduce((sum, item) => sum + getReceivableRent(item), 0);
                  const totalRentPaid = group.items.reduce((sum, item) => sum + item.rentReceived, 0);
                  const totalRentUnpaid = group.items.reduce((sum, item) => sum + (getReceivableRent(item) - item.rentReceived), 0);
                  const totalFeeDue = group.items.reduce((sum, item) => sum + getReceivablePropertyFee(item), 0);
                  const totalFeePaid = group.items.reduce((sum, item) => sum + item.propertyFeeReceived, 0);
                  const totalFeeUnpaid = group.items.reduce((sum, item) => sum + (getReceivablePropertyFee(item) - item.propertyFeeReceived), 0);
                  const totalRentAndFeeDue = totalRentDue + totalFeeDue;
                  const totalRentAndFeePaid = totalRentPaid + totalFeePaid;
                  const totalRentAndFeeUnpaid = totalRentUnpaid + totalFeeUnpaid;

                  const totalElecDue = utilityGroup?.items.reduce((s, i) => s + i.totalElectricityFee, 0) ?? 0;
                  const totalElecPaid = utilityGroup?.items.reduce((s, i) => s + i.electricityReceived, 0) ?? 0;
                  const totalElecUnpaid = utilityGroup?.items.reduce((s, i) => s + (i.totalElectricityFee - i.electricityReceived), 0) ?? 0;
                  const totalWaterDue = utilityGroup?.items.reduce((s, i) => s + i.totalWaterFee, 0) ?? 0;
                  const totalWaterPaid = utilityGroup?.items.reduce((s, i) => s + i.waterReceived, 0) ?? 0;
                  const totalWaterUnpaid = utilityGroup?.items.reduce((s, i) => s + (i.totalWaterFee - i.waterReceived), 0) ?? 0;
                  const totalUtilityDue = totalElecDue + totalWaterDue;
                  const totalUtilityPaid = totalElecPaid + totalWaterPaid;
                  const totalUtilityUnpaid = totalElecUnpaid + totalWaterUnpaid;

                  const grandTotalDue = totalRentAndFeeDue + totalUtilityDue;
                  const grandTotalPaid = totalRentAndFeePaid + totalUtilityPaid;
                  const grandTotalUnpaid = totalRentAndFeeUnpaid + totalUtilityUnpaid;

                  const now = new Date();

                  return (
                    <div
                      className="bg-white p-8 print:break-after-page mb-8 border border-gray-300 statement-tenant-block relative"
                      key={group.tenant}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-3 right-3 no-print gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => handlePrint(group)}
                      >
                        <Printer className="w-4 h-4" />
                        打印
                      </Button>
                      <div className="text-center mb-6">
                        <div className="text-xl font-bold mb-2">{companyName}</div>
                        <div className="text-2xl font-bold mb-4">缴费通知单</div>
                      </div>

                      <div className="text-sm font-bold mb-2">合同基本信息</div>

                      <table className="w-full border-collapse text-sm mb-6">
                        <thead>
                          <tr>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium">合同编号</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium">承租方</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium">租赁地址</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contracts.map((c) => (
                            <tr key={c.contractNo}>
                              <td className="border border-gray-400 px-3 py-2">{c.contractNo}</td>
                              <td className="border border-gray-400 px-3 py-2">{c.tenant}</td>
                              <td className="border border-gray-400 px-3 py-2">{c.leaseAddress}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="text-center font-bold mb-2">租金物业费账单明细</div>
                      <table className="w-full border-collapse text-sm mb-2 table-fixed">
                        <thead>
                          <tr>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium w-[200px] whitespace-nowrap overflow-hidden">合同编号</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium w-[70px]">收费项目</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium w-[180px]">计费起止日期</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-center font-medium w-[90px]">应缴金额</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-center font-medium w-[90px]">已缴金额</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-center font-medium w-[90px]">未缴金额</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-right font-medium w-[100px]">缴纳期限</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.flatMap(item => [
                            <tr key={`${item.id}-rent`}>
                              <td className="border border-gray-400 px-3 py-2">{item.contractNo}</td>
                              <td className="border border-gray-400 px-3 py-2">租金</td>
                              <td className="border border-gray-400 px-3 py-2">{formatDateDot(item.stageStartDate)}-{formatDateDot(item.stageEndDate)}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{getReceivableRent(item).toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.rentReceived.toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{(getReceivableRent(item) - item.rentReceived).toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right">{item.dueDate}</td>
                            </tr>,
                            <tr key={`${item.id}-fee`}>
                              <td className="border border-gray-400 px-3 py-2">{item.contractNo}</td>
                              <td className="border border-gray-400 px-3 py-2">物业费</td>
                              <td className="border border-gray-400 px-3 py-2">{formatDateDot(item.stageStartDate)}-{formatDateDot(item.stageEndDate)}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{getReceivablePropertyFee(item).toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.propertyFeeReceived.toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{(getReceivablePropertyFee(item) - item.propertyFeeReceived).toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right">{item.dueDate}</td>
                            </tr>,
                          ])}
                            <tr className="font-bold bg-gray-50">
                              <td colSpan={3} className="border border-gray-400 px-3 py-2 text-center">小计</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{totalRentAndFeeDue.toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{totalRentAndFeePaid.toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{totalRentAndFeeUnpaid.toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2"></td>
                            </tr>
                        </tbody>
                      </table>

                      {utilityGroup && utilityGroup.items.length > 0 && (
                        <>
                          <div className="text-center font-bold mb-2 mt-6">水电费账单明细</div>
                          <table className="w-full border-collapse text-sm mb-2 table-fixed">
                            <thead>
                              <tr>
                                <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium w-[70px]">收费项目</th>
                                <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium w-[58px]">所属期</th>
                                <th className="border border-gray-400 p-[8px_1px_8px_1px] bg-gray-50 text-center font-medium w-[100px]">使用量<br/>（度或吨）</th>
                                <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-center font-medium w-[80px]">单价(元)</th>
                                <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-center font-medium w-[90px]">应缴金额</th>
                                <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-center font-medium w-[90px]">已缴金额</th>
                                <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-center font-medium w-[90px]">未缴金额</th>
                              </tr>
                            </thead>
                            <tbody>
                              {utilityGroup.items.flatMap(item => [
                                <tr key={`${item.id}-elec`}>
                                  <td className="border border-gray-400 px-3 py-2">电费</td>
                                  <td className="border border-gray-400 px-3 py-2">{item.period}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.electricityUsage.toLocaleString()}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.electricityPrice.toFixed(2)}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.totalElectricityFee.toLocaleString()}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.electricityReceived.toLocaleString()}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{(item.totalElectricityFee - item.electricityReceived).toLocaleString()}</td>
                                </tr>,
                                <tr key={`${item.id}-water`}>
                                  <td className="border border-gray-400 px-3 py-2">水费</td>
                                  <td className="border border-gray-400 px-3 py-2">{item.period}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.waterUsage.toLocaleString()}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.waterPrice.toFixed(2)}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.totalWaterFee.toLocaleString()}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.waterReceived.toLocaleString()}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{(item.totalWaterFee - item.waterReceived).toLocaleString()}</td>
                                </tr>,
                              ])}
                              <tr className="font-bold bg-gray-50">
                                <td colSpan={3} className="border border-gray-400 px-3 py-2 text-center">小计</td>
                                <td className="border border-gray-400 px-3 py-2"></td>
                                <td className="border border-gray-400 px-3 py-2 text-right font-mono">{totalUtilityDue.toLocaleString()}</td>
                                <td className="border border-gray-400 px-3 py-2 text-right font-mono">{totalUtilityPaid.toLocaleString()}</td>
                                <td className="border border-gray-400 px-3 py-2 text-right font-mono">{totalUtilityUnpaid.toLocaleString()}</td>
                              </tr>
                            </tbody>
                          </table>
                        </>
                      )}

                      <table className="w-full border-collapse text-sm mt-2 table-fixed">
                        <tbody>
                          <tr className="font-bold">
                            <td className="border border-gray-400 px-3 py-2 text-right w-[220px]" colSpan={3}>账单应缴金额合计</td>
                            <td className="border border-gray-400 px-3 py-2 text-right font-mono w-[90px]">{grandTotalDue.toLocaleString()}</td>
                            <td className="border border-gray-400 px-3 py-2 text-right w-[220px]" colSpan={1}>账单已缴金额合计</td>
                            <td className="border border-gray-400 px-3 py-2 text-right font-mono w-[90px]">{grandTotalPaid.toLocaleString()}</td>
                            <td className="border border-gray-400 px-3 py-2 text-right w-[220px]" colSpan={1}>账单未缴金额合计</td>
                            <td className="border border-gray-400 px-3 py-2 text-right font-mono w-[90px]">{grandTotalUnpaid.toLocaleString()}</td>
                          </tr>
                        </tbody>
                      </table>

<p>说明: 租金及物业费: 请贵司在最后缴纳期限前缴齐, 水电费: 请在收到账单起的5个工作日内缴齐。</p>
                        <p className="mt-1">请贵司在上述日期前缴纳相关费用，逾期之日起，按每日千分之五收取纳滞纳金！</p>

                      {companyInfo && (companyInfo.creditCode || companyInfo.bankAccountName || companyInfo.bankAccountNo || companyInfo.bankName) && (
                        <div className="mt-4 text-sm space-y-1">
                          {companyInfo.creditCode && <p>统一社会信用代码: {companyInfo.creditCode}</p>}
                          {companyInfo.bankAccountName && <p>户名: {companyInfo.bankAccountName}</p>}
                          {companyInfo.bankAccountNo && <p>银行账号: {companyInfo.bankAccountNo}</p>}
                          {companyInfo.bankName && <p>开户行: {companyInfo.bankName}</p>}
                        </div>
                      )}

                      <div className="mt-8 text-right text-sm">
                        <p>{ORG_SIGNATURE}</p>
                        <p>{now.getFullYear()}年{now.getMonth() + 1}月{now.getDate()}日</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        ) : generatedStatement ? (
          <section className="w-full">
            <Card>
              <CardContent className="py-12">
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>暂无未交款数据</EmptyTitle>
                    <EmptyDescription>所选月份及之前没有未交款的租金明细</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {paymentStatement && paymentStatement.length > 0 ? (
          <section className="w-full space-y-6">
            <Card className="no-print">
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={paymentSelectedTenants.size === paymentStatement.length && paymentStatement.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setPaymentSelectedTenants(new Set(paymentStatement.map(g => g.tenant)));
                        } else {
                          setPaymentSelectedTenants(new Set());
                        }
                      }}
                    />
                    <span className="text-sm font-medium">全选</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    已选 {paymentSelectedTenants.size} / {paymentStatement.length} 户
                  </span>
                </div>
                {(() => {
                  const PAYMENT_METHOD_LABELS: Record<string, string> = { monthly: '月付租户', quarterly: '季付租户' };
                  const grouped = paymentStatement.reduce<Record<string, IStatementGroup[]>>((acc, group) => {
                    const method = group.items[0]?.paymentMethod || 'monthly';
                    if (!acc[method]) acc[method] = [];
                    acc[method].push(group);
                    return acc;
                  }, {});
                  const methodOrder = ['monthly', 'quarterly'];
                  return methodOrder
                    .filter(method => grouped[method] && grouped[method].length > 0)
                    .map(method => {
                      const groups = grouped[method];
                      const allSelected = groups.every(g => paymentSelectedTenants.has(g.tenant));
                      const someSelected = groups.some(g => paymentSelectedTenants.has(g.tenant));
                      return (
                        <div key={method} className={method !== 'monthly' ? 'mt-4 pt-4 border-t border-border' : ''}>
                          <div className="flex items-center gap-2 mb-2">
                            <Checkbox
                              checked={allSelected}
                              ref={undefined}
                              data-indeterminate={someSelected && !allSelected ? true : undefined}
                              onCheckedChange={(checked) => {
                                const newSet = new Set(paymentSelectedTenants);
                                if (checked) {
                                  groups.forEach(g => newSet.add(g.tenant));
                                } else {
                                  groups.forEach(g => newSet.delete(g.tenant));
                                }
                                setPaymentSelectedTenants(newSet);
                              }}
                            />
                            <span className="text-sm font-medium text-muted-foreground">{PAYMENT_METHOD_LABELS[method] || method}（{groups.length} 户）</span>
                          </div>
                          <div className="flex flex-wrap gap-3 pl-6">
                            {groups.map(group => (
                              <label key={group.tenant} className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={paymentSelectedTenants.has(group.tenant)}
                                  onCheckedChange={(checked) => {
                                    const newSet = new Set(paymentSelectedTenants);
                                    if (checked) newSet.add(group.tenant);
                                    else newSet.delete(group.tenant);
                                    setPaymentSelectedTenants(newSet);
                                  }}
                                />
                                <span>{group.tenant}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    });
                })()}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between no-print">
              <h2 className="text-lg font-medium">对账单预览（按收款所属期）</h2>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleExportPaymentPDF} className="gap-2">
                  <Download className="w-4 h-4" />
                  导出PDF
                </Button>
              </div>
            </div>

            <div>
              {paymentStatement
                .filter(group => paymentSelectedTenants.has(group.tenant))
                .map((group) => {
                  const utilityGroup = paymentUtilityStatement?.find(u => u.tenant === group.tenant);
                  const landlordName = group.items[0]?.landlord || getContractInfo(group.items[0]?.contractId)?.landlord || '';
                  const companyInfo = getCompanyInfo(landlordName);
                  const companyName = companyInfo?.name || landlordName;

                  const contracts = groupByContract(group.items);

                  const totalRentDue = group.items.reduce((sum, item) => sum + getReceivableRent(item), 0);
                  const totalRentPaid = group.items.reduce((sum, item) => sum + item.rentReceived, 0);
                  const totalRentUnpaid = group.items.reduce((sum, item) => sum + (getReceivableRent(item) - item.rentReceived), 0);
                  const totalFeeDue = group.items.reduce((sum, item) => sum + getReceivablePropertyFee(item), 0);
                  const totalFeePaid = group.items.reduce((sum, item) => sum + item.propertyFeeReceived, 0);
                  const totalFeeUnpaid = group.items.reduce((sum, item) => sum + (getReceivablePropertyFee(item) - item.propertyFeeReceived), 0);
                  const totalRentAndFeeDue = totalRentDue + totalFeeDue;
                  const totalRentAndFeePaid = totalRentPaid + totalFeePaid;
                  const totalRentAndFeeUnpaid = totalRentUnpaid + totalFeeUnpaid;

                  const totalElecDue = utilityGroup?.items.reduce((s, i) => s + i.totalElectricityFee, 0) ?? 0;
                  const totalElecPaid = utilityGroup?.items.reduce((s, i) => s + i.electricityReceived, 0) ?? 0;
                  const totalElecUnpaid = utilityGroup?.items.reduce((s, i) => s + (i.totalElectricityFee - i.electricityReceived), 0) ?? 0;
                  const totalWaterDue = utilityGroup?.items.reduce((s, i) => s + i.totalWaterFee, 0) ?? 0;
                  const totalWaterPaid = utilityGroup?.items.reduce((s, i) => s + i.waterReceived, 0) ?? 0;
                  const totalWaterUnpaid = utilityGroup?.items.reduce((s, i) => s + (i.totalWaterFee - i.waterReceived), 0) ?? 0;
                  const totalUtilityDue = totalElecDue + totalWaterDue;
                  const totalUtilityPaid = totalElecPaid + totalWaterPaid;
                  const totalUtilityUnpaid = totalElecUnpaid + totalWaterUnpaid;

                  const grandTotalDue = totalRentAndFeeDue + totalUtilityDue;
                  const grandTotalPaid = totalRentAndFeePaid + totalUtilityPaid;
                  const grandTotalUnpaid = totalRentAndFeeUnpaid + totalUtilityUnpaid;

                  const now = new Date();

                  return (
                    <div
                      className="bg-white p-8 print:break-after-page mb-8 border border-gray-300 statement-tenant-block relative"
                      key={`payment-${group.tenant}`}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-3 right-3 no-print gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => handlePaymentPrint(group)}
                      >
                        <Printer className="w-4 h-4" />
                        打印
                      </Button>
                      <div className="text-center mb-6">
                        <div className="text-xl font-bold mb-2">{companyName}</div>
                        <div className="text-2xl font-bold mb-4">缴费通知单</div>
                      </div>

                      <div className="text-sm font-bold mb-2">合同基本信息</div>

                      <table className="w-full border-collapse text-sm mb-6">
                        <thead>
                          <tr>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium">合同编号</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium">承租方</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium">租赁地址</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contracts.map((c) => (
                            <tr key={c.contractNo}>
                              <td className="border border-gray-400 px-3 py-2">{c.contractNo}</td>
                              <td className="border border-gray-400 px-3 py-2">{c.tenant}</td>
                              <td className="border border-gray-400 px-3 py-2">{c.leaseAddress}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <div className="text-center font-bold mb-2">租金物业费账单明细</div>
                      <table className="w-full border-collapse text-sm mb-2 table-fixed">
                        <thead>
                          <tr>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium w-[200px] whitespace-nowrap overflow-hidden">合同编号</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium w-[70px]">收费项目</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium w-[180px]">计费起止日期</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-center font-medium w-[90px]">应缴金额</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-center font-medium w-[90px]">已缴金额</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-center font-medium w-[90px]">未缴金额</th>
                            <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-right font-medium w-[100px]">缴纳期限</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.items.flatMap(item => [
                            <tr key={`payment-${item.id}-rent`}>
                              <td className="border border-gray-400 px-3 py-2">{item.contractNo}</td>
                              <td className="border border-gray-400 px-3 py-2">租金</td>
                              <td className="border border-gray-400 px-3 py-2">{formatDateDot(item.stageStartDate)}-{formatDateDot(item.stageEndDate)}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{getReceivableRent(item).toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.rentReceived.toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{(getReceivableRent(item) - item.rentReceived).toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right">{item.dueDate}</td>
                            </tr>,
                            <tr key={`payment-${item.id}-fee`}>
                              <td className="border border-gray-400 px-3 py-2">{item.contractNo}</td>
                              <td className="border border-gray-400 px-3 py-2">物业费</td>
                              <td className="border border-gray-400 px-3 py-2">{formatDateDot(item.stageStartDate)}-{formatDateDot(item.stageEndDate)}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{getReceivablePropertyFee(item).toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.propertyFeeReceived.toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{(getReceivablePropertyFee(item) - item.propertyFeeReceived).toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right">{item.dueDate}</td>
                            </tr>,
                          ])}
                            <tr className="font-bold bg-gray-50">
                              <td colSpan={3} className="border border-gray-400 px-3 py-2 text-center">小计</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{totalRentAndFeeDue.toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{totalRentAndFeePaid.toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2 text-right font-mono">{totalRentAndFeeUnpaid.toLocaleString()}</td>
                              <td className="border border-gray-400 px-3 py-2"></td>
                            </tr>
                        </tbody>
                      </table>

                      {utilityGroup && utilityGroup.items.length > 0 && (
                        <>
                          <div className="text-center font-bold mb-2 mt-6">水电费账单明细</div>
                          <table className="w-full border-collapse text-sm mb-2 table-fixed">
                            <thead>
                              <tr>
                                <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium w-[70px]">收费项目</th>
                                <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-left font-medium w-[58px]">所属期</th>
                                <th className="border border-gray-400 p-[8px_1px_8px_1px] bg-gray-50 text-center font-medium w-[100px]">使用量<br/>（度或吨）</th>
                                <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-center font-medium w-[80px]">单价(元)</th>
                                <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-center font-medium w-[90px]">应缴金额</th>
                                <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-center font-medium w-[90px]">已缴金额</th>
                                <th className="border border-gray-400 px-3 py-2 bg-gray-50 text-center font-medium w-[90px]">未缴金额</th>
                              </tr>
                            </thead>
                            <tbody>
                              {utilityGroup.items.flatMap(item => [
                                <tr key={`payment-${item.id}-elec`}>
                                  <td className="border border-gray-400 px-3 py-2">电费</td>
                                  <td className="border border-gray-400 px-3 py-2">{item.period}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.electricityUsage.toLocaleString()}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.electricityPrice.toFixed(2)}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.totalElectricityFee.toLocaleString()}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.electricityReceived.toLocaleString()}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{(item.totalElectricityFee - item.electricityReceived).toLocaleString()}</td>
                                </tr>,
                                <tr key={`payment-${item.id}-water`}>
                                  <td className="border border-gray-400 px-3 py-2">水费</td>
                                  <td className="border border-gray-400 px-3 py-2">{item.period}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.waterUsage.toLocaleString()}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.waterPrice.toFixed(2)}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.totalWaterFee.toLocaleString()}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{item.waterReceived.toLocaleString()}</td>
                                  <td className="border border-gray-400 px-3 py-2 text-right font-mono">{(item.totalWaterFee - item.waterReceived).toLocaleString()}</td>
                                </tr>,
                              ])}
                              <tr className="font-bold bg-gray-50">
                                <td colSpan={3} className="border border-gray-400 px-3 py-2 text-center">小计</td>
                                <td className="border border-gray-400 px-3 py-2"></td>
                                <td className="border border-gray-400 px-3 py-2 text-right font-mono">{totalUtilityDue.toLocaleString()}</td>
                                <td className="border border-gray-400 px-3 py-2 text-right font-mono">{totalUtilityPaid.toLocaleString()}</td>
                                <td className="border border-gray-400 px-3 py-2 text-right font-mono">{totalUtilityUnpaid.toLocaleString()}</td>
                              </tr>
                            </tbody>
                          </table>
                        </>
                      )}

                      <table className="w-full border-collapse text-sm mt-2 table-fixed">
                        <tbody>
                          <tr className="font-bold">
                            <td className="border border-gray-400 px-3 py-2 text-right w-[220px]" colSpan={3}>账单应缴金额合计</td>
                            <td className="border border-gray-400 px-3 py-2 text-right font-mono w-[90px]">{grandTotalDue.toLocaleString()}</td>
                            <td className="border border-gray-400 px-3 py-2 text-right w-[220px]" colSpan={1}>账单已缴金额合计</td>
                            <td className="border border-gray-400 px-3 py-2 text-right font-mono w-[90px]">{grandTotalPaid.toLocaleString()}</td>
                            <td className="border border-gray-400 px-3 py-2 text-right w-[220px]" colSpan={1}>账单未缴金额合计</td>
                            <td className="border border-gray-400 px-3 py-2 text-right font-mono w-[90px]">{grandTotalUnpaid.toLocaleString()}</td>
                          </tr>
                        </tbody>
                      </table>

<p>说明: 租金及物业费: 请贵司在最后缴纳期限前缴齐, 水电费: 请在收到账单起的5个工作日内缴齐。</p>
                        <p className="mt-1">请贵司在上述日期前缴纳相关费用，逾期之日起，按每日千分之五收取纳滞纳金！</p>

                      {companyInfo && (companyInfo.creditCode || companyInfo.bankAccountName || companyInfo.bankAccountNo || companyInfo.bankName) && (
                        <div className="mt-4 text-sm space-y-1">
                          {companyInfo.creditCode && <p>统一社会信用代码: {companyInfo.creditCode}</p>}
                          {companyInfo.bankAccountName && <p>户名: {companyInfo.bankAccountName}</p>}
                          {companyInfo.bankAccountNo && <p>银行账号: {companyInfo.bankAccountNo}</p>}
                          {companyInfo.bankName && <p>开户行: {companyInfo.bankName}</p>}
                        </div>
                      )}

                      <div className="mt-8 text-right text-sm">
                        <p>{ORG_SIGNATURE}</p>
                        <p>{now.getFullYear()}年{now.getMonth() + 1}月{now.getDate()}日</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </section>
        ) : paymentStatement ? (
          <section className="w-full">
            <Card>
              <CardContent className="py-12">
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>暂无未交款数据</EmptyTitle>
                    <EmptyDescription>所选月份及之前没有未交款的租金明细</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </CardContent>
            </Card>
          </section>
        ) : null}
      </div>
    </>
  );
};

export default StatementPage;
