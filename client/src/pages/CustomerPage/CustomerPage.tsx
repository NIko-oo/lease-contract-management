import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Download,
  Edit,
  Search,
  Snowflake,
  Unlock,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CanPoint } from '@/components/PermissionGate';
import { customerApi } from '@/api';
import type {
  CustomerResponse,
  CreateCustomerDto,
  UpdateCustomerDto,
} from '@shared/api.interface';
import { logger } from '@lark-apaas/client-toolkit/logger';

const TENANT_TYPE_OPTIONS = [
  { value: '集团内', label: '集团内' },
  { value: '集团外', label: '集团外' },
] as const;

const formSchema = z.object({
  customerCode: z.string().min(1, '客户编码不能为空'),
  companyName: z.string().min(1, '公司名称不能为空'),
  creditCode: z.string().optional(),
  bankAccount: z.string().optional(),
  tenantType: z.string().optional(),
  bankName: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;
interface FormState {
  values: FormValues;
  errors: Partial<Record<keyof FormValues, string>>;
}
const emptyValues: FormValues = { customerCode: '', companyName: '', creditCode: '', bankAccount: '', tenantType: '', bankName: '' };
const initialFormState: FormState = { values: { ...emptyValues }, errors: {} };

const CustomerPage: React.FC = () => {
  const [data, setData] = useState<CustomerResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchText, setSearchText] = useState<string>('');
  const [frozenFilter, setFrozenFilter] = useState<string>('all');

  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [saving, setSaving] = useState<boolean>(false);

  const [freezeDialogOpen, setFreezeDialogOpen] = useState<boolean>(false);
  const [freezeTarget, setFreezeTarget] = useState<CustomerResponse | null>(null);
  const [freezing, setFreezing] = useState<boolean>(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: { search?: string; frozen?: string } = {};
      if (searchText) params.search = searchText;
      if (frozenFilter !== 'all') params.frozen = frozenFilter;
      const res = await customerApi.getList(params);
      setData(res.data);
    } catch (err: unknown) {
      logger.error('加载客户列表失败: ' + JSON.stringify(err));
      toast.error('加载客户列表失败');
    } finally {
      setLoading(false);
    }
  }, [searchText, frozenFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenCreate = (): void => {
    setEditingId(null);
    setFormState({ values: { ...emptyValues }, errors: {} });
    setDialogOpen(true);
  };

  const handleOpenEdit = (row: CustomerResponse): void => {
    setEditingId(row.id);
    setFormState({
      values: {
        customerCode: row.customerCode,
        companyName: row.companyName,
        creditCode: row.creditCode ?? '',
        bankAccount: row.bankAccount ?? '',
        tenantType: row.tenantType ?? '',
        bankName: row.bankName ?? '',
      },
      errors: {},
    });
    setDialogOpen(true);
  };

  const handleFieldChange = (field: keyof FormValues, value: string): void => {
    setFormState((prev: FormState) => ({ values: { ...prev.values, [field]: value }, errors: { ...prev.errors, [field]: undefined } }));
  };

  const validateForm = (): boolean => {
    const result = formSchema.safeParse(formState.values);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof FormValues, string>> = {};
      result.error.issues.forEach((issue: z.ZodIssue) => {
        const field = issue.path[0] as keyof FormValues;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      });
      setFormState((prev: FormState) => ({ ...prev, errors: fieldErrors }));
      return false;
    }
    return true;
  };

  const handleSave = async (): Promise<void> => {
    if (!validateForm()) return;
    setSaving(true);
    try {
      if (editingId) {
        const dto: UpdateCustomerDto = {
          companyName: formState.values.companyName,
          creditCode: formState.values.creditCode || undefined,
          bankAccount: formState.values.bankAccount || undefined,
          tenantType: formState.values.tenantType || undefined,
          bankName: formState.values.bankName || undefined,
        };
        await customerApi.update(editingId, dto);
        toast.success('客户信息更新成功');
      } else {
        const dto: CreateCustomerDto = {
          customerCode: formState.values.customerCode,
          companyName: formState.values.companyName,
          creditCode: formState.values.creditCode || undefined,
          bankAccount: formState.values.bankAccount || undefined,
          tenantType: formState.values.tenantType || undefined,
          bankName: formState.values.bankName || undefined,
        };
        await customerApi.create(dto);
        toast.success('客户创建成功');
      }
      setDialogOpen(false);
      fetchData();
    } catch (err: unknown) {
      logger.error('保存客户失败: ' + JSON.stringify(err));
      const errMsg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? '';
      if (errMsg.includes('已存在')) {
        setFormState((prev: FormState) => ({
          ...prev,
          errors: { ...prev.errors, customerCode: '输入客户编码已存在，请检查' },
        }));
      } else {
        toast.error(editingId ? '更新失败' : '创建失败');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleOpenFreeze = (row: CustomerResponse): void => {
    setFreezeTarget(row);
    setFreezeDialogOpen(true);
  };

  const handleConfirmFreeze = async (): Promise<void> => {
    if (!freezeTarget) return;
    setFreezing(true);
    try {
      const nextFrozen = !freezeTarget.isFrozen;
      await customerApi.freeze(freezeTarget.id, nextFrozen);
      toast.success(nextFrozen ? '客户已冻结' : '客户已解冻');
      setFreezeDialogOpen(false);
      fetchData();
    } catch (err: unknown) {
      logger.error('冻结操作失败: ' + JSON.stringify(err));
      toast.error('操作失败，请重试');
    } finally {
      setFreezing(false);
    }
  };

  const handleExportExcel = async (): Promise<void> => {
    try {
      const xlsx = await import('xlsx');
      const exportData = data.map((item: CustomerResponse) => ({ '客户编码': item.customerCode, '公司名称': item.companyName, '租户类型': item.tenantType ?? '', '统一社会信用代码': item.creditCode ?? '', '银行账户': item.bankAccount ?? '', '开户行': item.bankName ?? '', '状态': item.isFrozen ? '已冻结' : '正常', '创建时间': item._createdAt ?? '' }));
      const ws = xlsx.utils.json_to_sheet(exportData);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, '客户列表');
      xlsx.writeFile(wb, `客户列表_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('导出成功');
    } catch (err: unknown) {
      logger.error('导出 Excel 失败: ' + JSON.stringify(err));
      toast.error('导出失败，请重试');
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-6 h-6 text-foreground" />
          <h1 className="text-xl font-semibold text-foreground">客户管理</h1>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={handleExportExcel} className="rounded-sm">
            <Download className="w-4 h-4 mr-2" />导出 Excel
          </Button>
          <CanPoint action="edit" subject="Customer">
            <Button onClick={handleOpenCreate} className="rounded-sm">
              <Plus className="w-4 h-4 mr-2" />新建客户
            </Button>
          </CanPoint>
        </div>
      </div>
      <Card className="rounded-sm shadow-sm border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="搜索客户编码/公司名称" value={searchText} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchText(e.target.value)} className="pl-9 rounded-sm" />
            </div>
            <Select value={frozenFilter} onValueChange={setFrozenFilter}>
              <SelectTrigger className="w-[140px] rounded-sm"><SelectValue placeholder="全部状态" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="false">正常</SelectItem>
                <SelectItem value="true">已冻结</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-sm shadow-sm border-border">
        <CardHeader className="pb-3"><CardTitle className="text-base font-medium">客户列表</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16"><div className="animate-pulse text-muted-foreground text-sm">加载中...</div></div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Users className="w-10 h-10 text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm">暂无客户数据</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-medium">客户编码</TableHead>
                  <TableHead className="font-medium">公司名称</TableHead>
                  <TableHead className="font-medium">租户类型</TableHead>
                  <TableHead className="font-medium">统一社会信用代码</TableHead>
                  <TableHead className="font-medium">银行账户</TableHead>
                  <TableHead className="font-medium">开户行</TableHead>
                  <TableHead className="font-medium">状态</TableHead>
                  <TableHead className="font-medium text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row: CustomerResponse) => (
                  <TableRow
                    key={row.id}
                    className="hover:bg-accent/50 transition-colors"
                  >
                    <TableCell className="font-mono text-sm">
                      {row.customerCode}
                    </TableCell>
                    <TableCell>{row.companyName}</TableCell>
                    <TableCell>
                      {row.tenantType ? (
                        <Badge className="bg-accent text-accent-foreground rounded-full text-xs font-medium px-2.5 py-0.5">
                          {row.tenantType}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {row.creditCode || '—'}
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      {row.bankAccount || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.bankName || '—'}
                    </TableCell>
                    <TableCell>
                      {row.isFrozen ? (
                        <Badge className="bg-destructive/10 text-destructive border-destructive/20 rounded-full text-xs font-medium px-2.5 py-0.5">
                          已冻结
                        </Badge>
                      ) : (
                        <Badge className="bg-success/10 text-success border-success/20 rounded-full text-xs font-medium px-2.5 py-0.5">
                          正常
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <CanPoint action="edit" subject="Customer">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(row)} className="rounded-sm">
                            <Edit className="w-4 h-4 mr-1" />编辑
                          </Button>
                        </CanPoint>
                        <CanPoint action="edit" subject="Customer">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenFreeze(row)} className="rounded-sm">
                            {row.isFrozen ? (<><Unlock className="w-4 h-4 mr-1" />解冻</>) : (<><Snowflake className="w-4 h-4 mr-1" />冻结</>)}
                          </Button>
                        </CanPoint>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-sm">
          <DialogHeader><DialogTitle>{editingId ? '编辑客户' : '新建客户'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="customerCode">客户编码</Label>
              <Input
                id="customerCode"
                value={formState.values.customerCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleFieldChange('customerCode', e.target.value)
                }
                disabled={!!editingId}
                placeholder="请输入客户编码"
                className="rounded-sm"
              />
              {formState.errors.customerCode && (
                <p className="text-destructive text-xs">
                  {formState.errors.customerCode}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="companyName">公司名称</Label>
              <Input
                id="companyName"
                value={formState.values.companyName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleFieldChange('companyName', e.target.value)
                }
                placeholder="请输入公司名称"
                className="rounded-sm"
              />
              {formState.errors.companyName && (
                <p className="text-destructive text-xs">
                  {formState.errors.companyName}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="creditCode">统一社会信用代码</Label>
              <Input
                id="creditCode"
                value={formState.values.creditCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleFieldChange('creditCode', e.target.value)
                }
                placeholder="请输入统一社会信用代码（选填）"
                className="rounded-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenantType">租户类型</Label>
              <Select
                value={formState.values.tenantType || '_empty'}
                onValueChange={(val: string) =>
                  handleFieldChange('tenantType', val === '_empty' ? '' : val)
                }
              >
                <SelectTrigger className="rounded-sm" id="tenantType">
                  <SelectValue placeholder="请选择租户类型（选填）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_empty">请选择</SelectItem>
                  {TENANT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankAccount">银行账户</Label>
              <Input
                id="bankAccount"
                value={formState.values.bankAccount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleFieldChange('bankAccount', e.target.value)
                }
                placeholder="请输入银行账户（选填）"
                className="rounded-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bankName">开户行</Label>
              <Input
                id="bankName"
                value={formState.values.bankName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleFieldChange('bankName', e.target.value)
                }
                placeholder="请输入开户行（选填）"
                className="rounded-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-sm">取消</Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-sm">{saving ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={freezeDialogOpen} onOpenChange={setFreezeDialogOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              {freezeTarget?.isFrozen ? '确认解冻' : '确认冻结'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-foreground">
              {freezeTarget?.isFrozen
                ? `确定要解冻客户「${freezeTarget?.companyName}」吗？解冻后该客户将恢复正常状态。`
                : `确定要冻结客户「${freezeTarget?.companyName}」吗？冻结后该客户将无法正常使用。`}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFreezeDialogOpen(false)} className="rounded-sm">取消</Button>
            <Button variant={freezeTarget?.isFrozen ? 'default' : 'destructive'} onClick={handleConfirmFreeze} disabled={freezing} className="rounded-sm">
              {freezing ? '处理中...' : freezeTarget?.isFrozen ? '确认解冻' : '确认冻结'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerPage;
