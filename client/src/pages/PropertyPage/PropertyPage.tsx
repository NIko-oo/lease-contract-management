import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Building2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Table, TableProps } from '@lark-apaas/client-toolkit/antd-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { companyApi, propertyApi } from '@/api';
import type {
  PropertyResponse,
  CreatePropertyDto,
  CompanyEntityResponse,
  CreateCompanyDto,
  UpdateCompanyDto,
} from '@shared/api.interface';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CanPoint } from '@/components/PermissionGate';

const calendarProps = {
  captionLayout: 'dropdown' as const,
  fromYear: 2020,
  toYear: 2099,
};

interface PropertyFormData {
  name: string;
  companyEntity: string;
  companyId: string;
  validFrom: string;
  validTo: string;
  totalArea: string;
  rentableArea: string;
}

const emptyForm: PropertyFormData = {
  name: '',
  companyEntity: '',
  companyId: '',
  validFrom: '',
  validTo: '',
  totalArea: '',
  rentableArea: '',
};

interface CompanyFormData {
  name: string;
  creditCode: string;
  bankAccountName: string;
  bankAccountNo: string;
  bankName: string;
  rentInvoiceTaxRate: string;
  propertyFeeInvoiceTaxRate: string;
}

const emptyCompanyForm: CompanyFormData = {
  name: '',
  creditCode: '',
  bankAccountName: '',
  bankAccountNo: '',
  bankName: '',
  rentInvoiceTaxRate: '',
  propertyFeeInvoiceTaxRate: '6%',
};

const PropertyPage: React.FC = () => {
  const [data, setData] = useState<PropertyResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<PropertyFormData>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [companies, setCompanies] = useState<CompanyEntityResponse[]>([]);
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyFormData>(emptyCompanyForm);
  const [companySaving, setCompanySaving] = useState(false);
  const [companyDeleteDialogOpen, setCompanyDeleteDialogOpen] = useState(false);
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await propertyApi.getList();
      setData(res.data);
    } catch {
      toast.error('加载房产信息失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await companyApi.getList();
      setCompanies(res.data);
    } catch {
      toast.error('加载公司主体信息失败');
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchCompanies();
  }, [fetchData, fetchCompanies]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (record: PropertyResponse) => {
    setEditingId(record.id);
    setForm({
      name: record.name,
      companyEntity: record.companyEntity,
      companyId: record.companyId || '',
      validFrom: record.validFrom,
      validTo: record.validTo,
      totalArea: record.totalArea !== undefined && record.totalArea !== null ? String(record.totalArea) : '',
      rentableArea: record.rentableArea !== undefined && record.rentableArea !== null ? String(record.rentableArea) : '',
    });
    setDialogOpen(true);
  };

  const handleOpenDelete = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.companyEntity || !form.validFrom || !form.validTo) {
      toast.error('请填写所有必填项');
      return;
    }
    // 校验：可出租面积不能大于房产总面积
    const totalAreaNum = form.totalArea ? parseFloat(form.totalArea) : null;
    const rentableAreaNum = form.rentableArea ? parseFloat(form.rentableArea) : null;
    if (totalAreaNum !== null && rentableAreaNum !== null && rentableAreaNum > totalAreaNum) {
      toast.error('可出租面积不能大于房产总面积');
      return;
    }
    setSaving(true);
    try {
      const payload: CreatePropertyDto = {
        name: form.name,
        companyEntity: form.companyEntity,
        companyId: form.companyId || undefined,
        validFrom: form.validFrom,
        validTo: form.validTo,
        totalArea: totalAreaNum ?? undefined,
        rentableArea: rentableAreaNum ?? undefined,
      };
      if (editingId) {
        await propertyApi.update(editingId, payload);
        toast.success('房产信息已更新');
      } else {
        await propertyApi.create(payload);
        toast.success('房产信息已创建');
      }
      setDialogOpen(false);
      fetchData();
    } catch {
      toast.error(editingId ? '更新失败' : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setSaving(true);
    try {
      await propertyApi.delete(deletingId);
      toast.success('房产信息已删除');
      setDeleteDialogOpen(false);
      fetchData();
    } catch {
      toast.error('删除失败');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenCompanyCreate = () => {
    setEditingCompanyId(null);
    setCompanyForm(emptyCompanyForm);
    setCompanyDialogOpen(true);
  };

  const handleOpenCompanyEdit = (record: CompanyEntityResponse) => {
    setEditingCompanyId(record.id);
    setCompanyForm({
      name: record.name,
      creditCode: record.creditCode || '',
      bankAccountName: record.bankAccountName || '',
      bankAccountNo: record.bankAccountNo || '',
      bankName: record.bankName || '',
      rentInvoiceTaxRate: record.rentInvoiceTaxRate || '',
      propertyFeeInvoiceTaxRate: record.propertyFeeInvoiceTaxRate || '6%',
    });
    setCompanyDialogOpen(true);
  };

  const handleOpenCompanyDelete = (id: string) => {
    setDeletingCompanyId(id);
    setCompanyDeleteDialogOpen(true);
  };

  const handleCompanySave = async () => {
    if (!companyForm.name) {
      toast.error('请填写公司名称');
      return;
    }
    setCompanySaving(true);
    try {
      const payload: CreateCompanyDto = {
        name: companyForm.name,
        creditCode: companyForm.creditCode || undefined,
        bankAccountName: companyForm.bankAccountName || undefined,
        bankAccountNo: companyForm.bankAccountNo || undefined,
        bankName: companyForm.bankName || undefined,
        rentInvoiceTaxRate: companyForm.rentInvoiceTaxRate || undefined,
        propertyFeeInvoiceTaxRate: companyForm.propertyFeeInvoiceTaxRate || undefined,
      };
      if (editingCompanyId) {
        await companyApi.update(editingCompanyId, payload as UpdateCompanyDto);
        toast.success('公司主体已更新');
      } else {
        await companyApi.create(payload);
        toast.success('公司主体已创建');
      }
      setCompanyDialogOpen(false);
      fetchCompanies();
    } catch {
      toast.error(editingCompanyId ? '更新公司主体失败' : '创建公司主体失败');
    } finally {
      setCompanySaving(false);
    }
  };

  const handleCompanyDelete = async () => {
    if (!deletingCompanyId) return;
    setCompanySaving(true);
    try {
      await companyApi.delete(deletingCompanyId);
      toast.success('公司主体已删除');
      setCompanyDeleteDialogOpen(false);
      fetchCompanies();
    } catch {
      toast.error('删除失败，该公司主体可能已被房产引用');
    } finally {
      setCompanySaving(false);
    }
  };

  const companyColumns: TableProps<CompanyEntityResponse>['columns'] = [
    {
      title: '公司名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: '统一社会信用代码',
      dataIndex: 'creditCode',
      key: 'creditCode',
      width: 220,
    },
    {
      title: '银行户名',
      dataIndex: 'bankAccountName',
      key: 'bankAccountName',
      width: 180,
    },
    {
      title: '银行账号',
      dataIndex: 'bankAccountNo',
      key: 'bankAccountNo',
      width: 200,
    },
    {
      title: '开户行',
      dataIndex: 'bankName',
      key: 'bankName',
      width: 200,
    },
    {
      title: '租金发票开票税率',
      dataIndex: 'rentInvoiceTaxRate',
      key: 'rentInvoiceTaxRate',
      width: 150,
      render: (value: unknown) => {
        if (!value) return '-';
        return value === '9%' ? '9%-一般计税' : value === '5%' ? '5%-简易计税' : String(value);
      },
    },
    {
      title: '物业费开票税率',
      dataIndex: 'propertyFeeInvoiceTaxRate',
      key: 'propertyFeeInvoiceTaxRate',
      width: 140,
      render: (value: unknown) => (value ? String(value) : '-'),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, record: CompanyEntityResponse) => (
        <div className="flex gap-2">
          <CanPoint action="update" subject="Property">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenCompanyEdit(record)}
            >
              <Pencil className="h-4 w-4 mr-1" />
              编辑
            </Button>
          </CanPoint>
          <CanPoint action="delete" subject="Property">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => handleOpenCompanyDelete(record.id)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              删除
            </Button>
          </CanPoint>
        </div>
      ),
    },
  ];

  const columns: TableProps<PropertyResponse>['columns'] = [
    {
      title: '房产名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      fixed: 'left',
    },
    {
      title: '公司主体',
      dataIndex: 'companyEntity',
      key: 'companyEntity',
      width: 200,
    },
    {
      title: '有效期起',
      dataIndex: 'validFrom',
      key: 'validFrom',
      width: 130,
    },
    {
      title: '有效期止',
      dataIndex: 'validTo',
      key: 'validTo',
      width: 130,
    },
    {
      title: '房产总面积（㎡）',
      dataIndex: 'totalArea',
      key: 'totalArea',
      width: 150,
      render: (value: unknown) => (value !== undefined && value !== null ? String(value) : '-'),
    },
    {
      title: '可出租面积（㎡）',
      dataIndex: 'rentableArea',
      key: 'rentableArea',
      width: 150,
      render: (value: unknown) => (value !== undefined && value !== null ? String(value) : '-'),
    },
    {
      title: '是否有效',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (isActive: boolean) => (
        <Badge
          variant={isActive ? 'default' : 'destructive'}
          className={
            isActive
              ? 'bg-success/10 text-success border border-success/20'
              : 'bg-destructive/10 text-destructive border border-destructive/20'
          }
        >
          {isActive ? '有效' : '无效'}
        </Badge>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_: unknown, record: PropertyResponse) => (
        <div className="flex gap-2">
          <CanPoint action="update" subject="Property">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenEdit(record)}
            >
              <Pencil className="h-4 w-4 mr-1" />
              编辑
            </Button>
          </CanPoint>
          <CanPoint action="delete" subject="Property">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => handleOpenDelete(record.id)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              删除
            </Button>
          </CanPoint>
        </div>
      ),
    },
  ];

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">房产信息管理</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            公司主体信息
          </CardTitle>
          <CanPoint action="create" subject="Property">
            <Button size="sm" onClick={handleOpenCompanyCreate}>
              <Plus className="mr-2 h-4 w-4" />
              新增公司
            </Button>
          </CanPoint>
        </CardHeader>
        <CardContent>
          <Table<CompanyEntityResponse>
            columns={companyColumns}
            dataSource={companies}
            rowKey="id"
            pagination={false}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            房产信息列表
          </CardTitle>
          <CanPoint action="create" subject="Property">
            <Button size="sm" onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" />
              新增房产
            </Button>
          </CanPoint>
        </CardHeader>
        <CardContent>
          <Table<PropertyResponse>
            columns={columns}
            dataSource={data}
            loading={loading}
            rowKey="id"
            scroll={{ x: 1050, y: 500 }}
            pagination={false}
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? '编辑房产信息' : '新增房产信息'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>
                房产名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="请输入房产名称"
              />
            </div>
            <div className="space-y-2">
              <Label>
                公司主体 <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.companyId || ''}
                onValueChange={(value) => {
                  const company = companies.find((c) => c.id === value);
                  setForm((f) => ({
                    ...f,
                    companyId: value,
                    companyEntity: company?.name || '',
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择公司主体（出租方）" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  有效期起 <span className="text-destructive">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.validFrom && 'text-muted-foreground',
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.validFrom
                        ? format(new Date(form.validFrom), 'yyyy-MM-dd')
                        : '选择日期'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      {...calendarProps}
                      selected={
                        form.validFrom
                          ? new Date(form.validFrom)
                          : undefined
                      }
                      onSelect={(date) =>
                        setForm((f) => ({
                          ...f,
                          validFrom: date
                            ? format(date, 'yyyy-MM-dd')
                            : '',
                        }))
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>
                  有效期止 <span className="text-destructive">*</span>
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !form.validTo && 'text-muted-foreground',
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.validTo
                        ? format(new Date(form.validTo), 'yyyy-MM-dd')
                        : '选择日期'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      {...calendarProps}
                      selected={
                        form.validTo ? new Date(form.validTo) : undefined
                      }
                      onSelect={(date) =>
                        setForm((f) => ({
                          ...f,
                          validTo: date
                            ? format(date, 'yyyy-MM-dd')
                            : '',
                        }))
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2">
              <Label>房产总面积（㎡）</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.totalArea}
                onChange={(e) =>
                  setForm((f) => ({ ...f, totalArea: e.target.value }))
                }
                placeholder="请输入房产总面积"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>可出租面积（㎡）</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>已审批为投资性房地产面积</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.rentableArea}
                onChange={(e) =>
                  setForm((f) => ({ ...f, rentableArea: e.target.value }))
                }
                placeholder="请输入可出租面积"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-muted-foreground">
            确定要删除该房产信息吗？有关联合同的房产不建议删除。
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={companyDialogOpen} onOpenChange={setCompanyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCompanyId ? '编辑公司主体' : '新增公司主体'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>
                公司名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                value={companyForm.name}
                onChange={(e) =>
                  setCompanyForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="请输入公司名称"
              />
            </div>
            <div className="space-y-2">
              <Label>统一社会信用代码</Label>
              <Input
                value={companyForm.creditCode}
                onChange={(e) =>
                  setCompanyForm((f) => ({ ...f, creditCode: e.target.value }))
                }
                placeholder="请输入统一社会信用代码"
              />
            </div>
            <div className="space-y-2">
              <Label>银行户名</Label>
              <Input
                value={companyForm.bankAccountName}
                onChange={(e) =>
                  setCompanyForm((f) => ({
                    ...f,
                    bankAccountName: e.target.value,
                  }))
                }
                placeholder="请输入银行户名"
              />
            </div>
            <div className="space-y-2">
              <Label>银行账号</Label>
              <Input
                value={companyForm.bankAccountNo}
                onChange={(e) =>
                  setCompanyForm((f) => ({
                    ...f,
                    bankAccountNo: e.target.value,
                  }))
                }
                placeholder="请输入银行账号"
              />
            </div>
            <div className="space-y-2">
              <Label>开户行</Label>
              <Input
                value={companyForm.bankName}
                onChange={(e) =>
                  setCompanyForm((f) => ({ ...f, bankName: e.target.value }))
                }
                placeholder="请输入开户行"
              />
            </div>
            <div className="space-y-2">
              <Label>租金发票开票税率</Label>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="rentInvoiceTaxRate"
                    value="9%"
                    checked={companyForm.rentInvoiceTaxRate === '9%'}
                    onChange={(e) =>
                      setCompanyForm((f) => ({ ...f, rentInvoiceTaxRate: e.target.value }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm">9%-一般计税</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="rentInvoiceTaxRate"
                    value="5%"
                    checked={companyForm.rentInvoiceTaxRate === '5%'}
                    onChange={(e) =>
                      setCompanyForm((f) => ({ ...f, rentInvoiceTaxRate: e.target.value }))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm">5%-简易计税</span>
                </label>
              </div>
            </div>
            <div className="space-y-2">
              <Label>物业费开票税率</Label>
              <Input
                value={companyForm.propertyFeeInvoiceTaxRate}
                onChange={(e) =>
                  setCompanyForm((f) => ({ ...f, propertyFeeInvoiceTaxRate: e.target.value }))
                }
                placeholder="请输入物业费开票税率，如6%"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCompanyDialogOpen(false)}
              disabled={companySaving}
            >
              取消
            </Button>
            <Button onClick={handleCompanySave} disabled={companySaving}>
              {companySaving ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={companyDeleteDialogOpen}
        onOpenChange={setCompanyDeleteDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-muted-foreground">
            确定要删除该公司主体吗？已被房产引用的公司主体无法删除。
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCompanyDeleteDialogOpen(false)}
              disabled={companySaving}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={handleCompanyDelete}
              disabled={companySaving}
            >
              {companySaving ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PropertyPage;
