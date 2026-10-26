import React from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Plus, Trash2, ChevronLeft, Save, Send, Info } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { contractApi, propertyApi, customerApi } from '@/api';
import type { PropertyResponse, CustomerResponse } from '@shared/api.interface';
import { usePointPermission } from '@/components/PermissionGate';

const paymentMethodOptions = [
  { value: 'monthly', label: '月付' },
  { value: 'quarterly', label: '季付' },
];

const stageTypeOptions = [
  { value: 'free', label: '免租期' },
  { value: 'phase_1', label: '第一期租金' },
  { value: 'phase_2', label: '第二期租金' },
  { value: 'phase_3', label: '第三期租金' },
  { value: 'phase_4', label: '第四期租金' },
  { value: 'phase_5', label: '第五期租金' },
  { value: 'phase_6', label: '第六期租金' },
  { value: 'phase_7', label: '第七期租金' },
  { value: 'phase_8', label: '第八期租金' },
  { value: 'phase_9', label: '第九期租金' },
  { value: 'phase_10', label: '第十期租金' },
];

const stageSchema = z.object({
  id: z.string(),
  stageType: z.string().optional(),
  startDate: z.string().min(1, '请输入阶段开始日期'),
  endDate: z.string().min(1, '请输入阶段结束日期'),
  monthlyRent: z.number({ invalid_type_error: '请输入月租金' }).min(0, '月租金不能为负数'),
  monthlyPropertyFee: z.number({ invalid_type_error: '请输入月物业费' }).min(0, '月物业费不能为负数'),
}).refine((data) => {
  if (!data.startDate || !data.endDate) return true;
  return new Date(data.startDate) <= new Date(data.endDate);
}, {
  message: '结束日期必须晚于开始日期',
  path: ['endDate'],
});

const contractSchema = z.object({
  contractNo: z.string().min(1, '合同编号不能为空'),
  contractType: z.enum(['new_contract', 'supplement']).default('new_contract'),
  parentContractId: z.string().optional(),
  propertyId: z.string().min(1, '请选择房产名称'),
  landlord: z.string().min(1, '出租方不能为空'),
  tenant: z.string().min(1, '承租方不能为空'),
  signDate: z.string().min(1, '合同签署日期不能为空'),
  leaseAddress: z.string().min(1, '租赁地址不能为空'),
  startDate: z.string().min(1, '合同开始日期不能为空'),
  endDate: z.string().min(1, '合同结束日期不能为空'),
  hasUtilities: z.boolean(),
  paymentMethod: z.enum(['monthly', 'quarterly']),
  advancePaymentDays: z.number({ invalid_type_error: '请输入提前付款天数' }).int('必须输入整数').positive('必须输入正整数').default(5),
  leaseArea: z.number({ required_error: '请输入租赁面积', invalid_type_error: '请输入租赁面积' }).min(0, '租赁面积不能为负数'),
  stages: z.array(stageSchema).min(1, '至少需要添加一个租期阶段'),
}).refine((data) => {
  if (!data.startDate || !data.endDate) return true;
  return new Date(data.startDate) <= new Date(data.endDate);
}, {
  message: '合同结束日期必须晚于开始日期',
  path: ['endDate'],
});

type ContractFormData = z.infer<typeof contractSchema>;

const ContractCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const isEditMode = location.pathname.includes('/edit/') && id;
  const { allowed: canSave } = usePointPermission(isEditMode ? 'update' : 'create', 'Contract');
  const { allowed: canSubmit } = usePointPermission('submit', 'Contract');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingContract, setExistingContract] = useState<any>(null);
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [contractType, setContractType] = useState<'new_contract' | 'supplement'>('new_contract');
  const [relatedContractSearch, setRelatedContractSearch] = useState('');
  const [relatedContracts, setRelatedContracts] = useState<any[]>([]);
  const [showRelatedSearch, setShowRelatedSearch] = useState(false);
  const [selectedRelatedContract, setSelectedRelatedContract] = useState<any>(null);
  const [tenantEditable, setTenantEditable] = useState(true);
  const [addressEditable, setAddressEditable] = useState(false);
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<CustomerResponse[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResponse | null>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ContractFormData>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      contractNo: '',
      contractType: 'new_contract' as const,
      parentContractId: '',
      leaseArea: undefined as any,
      propertyId: '',
      landlord: '',
      tenant: '',
      signDate: '',
      leaseAddress: '',
      startDate: '',
      endDate: '',
      hasUtilities: false,
      paymentMethod: 'quarterly',
      advancePaymentDays: 5,
      stages: [
        {
          id: Date.now().toString(),
          stageType: 'phase_1',
          startDate: '',
          endDate: '',
          monthlyRent: 0,
          monthlyPropertyFee: 0,
        },
      ],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'stages',
  });

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const res = await propertyApi.getList(true);
        setProperties(res.data);
      } catch {
        // ignore
      }
    };
    fetchProperties();
  }, []);

  // 编辑模式：加载现有合同数据
  useEffect(() => {
    if (isEditMode && id) {
      const loadContract = async () => {
        try {
          const res = await contractApi.getDetail(id);
          const contract = res.data;
          setExistingContract(contract);
          setContractType(contract.contractType || 'new_contract');
          if (contract.parentContractId) {
            setSelectedRelatedContract({
              id: contract.parentContractId,
              contractNo: contract.contractNo,
              tenant: contract.tenant,
            });
          }
          reset({
            contractNo: contract.contractNo,
            contractType: contract.contractType || 'new_contract',
            parentContractId: contract.parentContractId || '',
            leaseArea: contract.leaseArea,
            propertyId: contract.propertyId || '',
            landlord: contract.landlord,
            tenant: contract.tenant,
            signDate: contract.signDate || '',
            leaseAddress: contract.leaseAddress || '',
            startDate: contract.startDate,
            endDate: contract.endDate,
            hasUtilities: contract.hasUtilities,
            paymentMethod: contract.paymentMethod,
            advancePaymentDays: contract.advancePaymentDays,
            stages: (contract.stages || []).map((s: any, idx: number) => ({
              ...s,
              id: s.id || generateId(),
              stageType: inferStageType(s, idx),
            })),
          });
        } catch (error) {
          toast.error('加载合同数据失败');
          navigate('/contracts');
        }
      };
      loadContract();
    }
  }, [isEditMode, id, reset, navigate]);

  const contractStartDate = watch('startDate');
  const contractEndDate = watch('endDate');

  // 自动同步第一阶段开始日期与合同开始日期（强制同步）
  useEffect(() => {
    if (contractStartDate && fields.length > 0) {
      setValue('stages.0.startDate', contractStartDate);
    }
  }, [contractStartDate, fields.length, setValue]);

  // 自动同步最后阶段结束日期与合同结束日期（强制同步）
  useEffect(() => {
    if (contractEndDate && fields.length > 0) {
      const lastIndex = fields.length - 1;
      setValue(`stages.${lastIndex}.endDate`, contractEndDate);
    }
  }, [contractEndDate, fields.length, setValue]);

  // 监听阶段结束日期变化，自动更新下一阶段开始日期
  const stages = watch('stages');
  const stagesEndDates = stages?.map(s => s.endDate).join(',') || '';
  useEffect(() => {
    if (!stages || stages.length < 2) return;

    stages.forEach((stage, index) => {
      if (index === 0) return; // 第1阶段开始日期由合同开始日期决定
      const prevStage = stages[index - 1];
      if (prevStage?.endDate) {
        const prevEndDate = new Date(prevStage.endDate);
        prevEndDate.setDate(prevEndDate.getDate() + 1);
        const expectedStartDate = prevEndDate.toISOString().split('T')[0];

        // 只有变化时才更新，避免无限循环
        if (stage.startDate !== expectedStartDate) {
          setValue(`stages.${index}.startDate`, expectedStartDate, { shouldValidate: false });
        }
      }
    });
  }, [stagesEndDates, setValue]);

  const generateId = () => Date.now().toString() + Math.random().toString(36).substr(2, 9);

  const handleAddStage = () => {
    const stages = watch('stages');
    const lastStage = stages[stages.length - 1];
    // 默认开始日期为上一阶段的结束日期+1天，如果没有上一阶段则设为空
    let defaultStartDate = '';
    if (lastStage?.endDate) {
      const lastEndDate = new Date(lastStage.endDate);
      lastEndDate.setDate(lastEndDate.getDate() + 1);
      defaultStartDate = lastEndDate.toISOString().split('T')[0];
    }
    
    append({
      id: generateId(),
      stageType: '',
      startDate: defaultStartDate,
      endDate: '',
      monthlyRent: 0,
      monthlyPropertyFee: 0,
    });
  };

  const inferStageType = (s: any, idx: number): string => {
    if (s.stageType) return s.stageType;
    if (s.monthlyRent === 0) return 'free';
    return `phase_${(s.stageOrder ?? idx) + 1}`;
  };

  const handleSaveContract = useCallback(async (data: ContractFormData, contractId?: string) => {
    try {
      const payload = { ...data } as any;
      if (contractId) {
        const res = await contractApi.update(contractId, payload);
        return res.data;
      }
      const res = await contractApi.create(payload);
      return res.data;
    } catch (error: any) {
      const msg = error.response?.data?.message || '保存合同失败';
      throw new Error(msg);
    }
  }, []);

  const onSubmit = async (data: ContractFormData, submitForReview: boolean = false) => {
    // 提交审核时的校验
    if (submitForReview) {
      const stages = data.stages || [];

      // 1. 检查月租金为0的阶段是否选择了免租期
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        if (stage.monthlyRent === 0 && stage.stageType !== 'free') {
          toast.error(`第${i + 1}阶段月租金为0，租金阶段请选择免租期`);
          return;
        }
      }

      // 2. 检查租金阶段是否连续（排除免租期后，应从第一期开始连续）
      const rentStages = stages
        .map((s, idx) => ({ ...s, originalIndex: idx }))
        .filter(s => s.stageType !== 'free' && s.stageType)
        .sort((a, b) => a.originalIndex - b.originalIndex);

      if (rentStages.length > 0) {
        const expectedPhaseNumbers: number[] = [];
        for (let i = 0; i < rentStages.length; i++) {
          expectedPhaseNumbers.push(i + 1);
        }

        for (let i = 0; i < rentStages.length; i++) {
          const stage = rentStages[i];
          const match = stage.stageType?.match(/phase_(\d+)/);
          if (match) {
            const phaseNum = parseInt(match[1], 10);
            if (phaseNum !== expectedPhaseNumbers[i]) {
              toast.error('租金阶段不连续，请检查');
              return;
            }
          }
        }
      }
    }

    setIsSubmitting(true);
    try {
      const saved = await handleSaveContract(data, isEditMode ? id : undefined);
      const contractId = isEditMode ? id : saved?.id;
      if (submitForReview && contractId) {
        await contractApi.submit(contractId);
      }
      toast.success(isEditMode ? '合同已更新并提交审核' : '合同已提交审核');
      navigate('/contracts');
    } catch (error: any) {
      toast.error(error.message || '操作失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = useCallback(async () => {
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      const formValues = watch();
      const contractId = isEditMode ? id : undefined;
      
      const dataWithIds = {
        ...formValues,
        stages: formValues.stages?.map((stage: any) => ({
          ...stage,
          id: stage.id || generateId(),
        })) || [],
      };
      
      await handleSaveContract(dataWithIds as ContractFormData, contractId);
      toast.success('草稿已保存');
      if (!isEditMode) {
        navigate('/contracts');
      }
    } catch (error: any) {
      toast.error(error.message || '保存草稿失败');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, watch, isEditMode, id, handleSaveContract, navigate]);
  const onSubmitForReview = handleSubmit((data) => onSubmit(data, true));

  // Calendar 通用配置
  const calendarProps = {
    captionLayout: "dropdown" as const,
    fromYear: 2020,
    toYear: 2099,
  };

  const searchRelatedContracts = useCallback((query: string) => {
    if (!query.trim()) {
      setRelatedContracts([]);
      return;
    }
    contractApi.getList().then((res) => {
      const items = res.data.items || [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const terminatedContracts = items.filter((c: any) => {
        if (c.status === 'terminated') return true;
        if (c.status === 'approved' && new Date(c.endDate) < today) return true;
        return false;
      });
      const q = query.toLowerCase();
      const filtered = terminatedContracts.filter((c: any) =>
        c.contractNo.toLowerCase().includes(q) || c.tenant.toLowerCase().includes(q)
      );
      setRelatedContracts(filtered);
    }).catch(() => {
      setRelatedContracts([]);
    });
  }, []);

  const handleSelectRelatedContract = useCallback((contract: any) => {
    setSelectedRelatedContract(contract);
    setValue('parentContractId', contract.id);
    setValue('propertyId', contract.propertyId || '');
    setValue('landlord', contract.landlord);
    setValue('tenant', contract.tenant);
    setValue('leaseAddress', contract.leaseAddress || '');
    setShowRelatedSearch(false);
    setRelatedContractSearch('');
    setTenantEditable(false);
    setAddressEditable(false);
  }, [setValue]);

  const searchCustomers = useCallback((query: string) => {
    if (!query.trim()) {
      setCustomerSearchResults([]);
      return;
    }
    customerApi.search(query).then((res) => {
      setCustomerSearchResults(res.data);
    }).catch(() => {
      setCustomerSearchResults([]);
    });
  }, []);

  const handleSelectCustomer = useCallback((customer: CustomerResponse) => {
    setSelectedCustomer(customer);
    setValue('tenant', customer.companyName);
    setShowCustomerSearch(false);
    setCustomerSearchQuery('');
  }, [setValue]);

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/contracts')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold text-foreground">{isEditMode ? '编辑合同' : '合同录入'}</h1>
        </div>
        <div className="flex gap-3">
          {canSave && (
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={isSubmitting}
            >
              <Save className="mr-2 h-4 w-4" />
              保存草稿
            </Button>
          )}
          {canSubmit && (
            <Button
              onClick={onSubmitForReview}
              disabled={isSubmitting}
            >
              <Send className="mr-2 h-4 w-4" />
              提交审核
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">基础信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                合同类型 <span className="text-destructive">*</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground cursor-help">
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p>新签合同：完全新签租户</p>
                    <p>补充协议：对原合同的租期延长、对剩余租期减租、加租，新增补充协议前请终止原合同。</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Controller
                control={control}
                name="contractType"
                render={({ field }) => (
                  <Select
                    value={contractType}
                    onValueChange={(val) => {
                      setContractType(val as 'new_contract' | 'supplement');
                      field.onChange(val);
                      if (val === 'new_contract') {
                        setValue('parentContractId', '');
                        setSelectedRelatedContract(null);
                        setRelatedContractSearch('');
                        setTenantEditable(false);
                        setAddressEditable(false);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择合同类型" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new_contract">新签合同</SelectItem>
                      <SelectItem value="supplement">补充协议</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2 md:col-span-1 lg:col-span-2">
              <Label className="flex items-center gap-1">
                关联合同 {contractType === 'supplement' && <span className="text-destructive">*</span>}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground cursor-help">
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>关联合同前请确保原合同已终止</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Popover open={contractType === 'supplement' ? showRelatedSearch : false} onOpenChange={contractType === 'supplement' ? setShowRelatedSearch : undefined}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={contractType === 'new_contract'}
                    className={cn('w-full justify-start text-left font-normal', !selectedRelatedContract && 'text-muted-foreground', contractType === 'new_contract' && 'bg-muted cursor-not-allowed opacity-50')}
                    type="button"
                  >
                    {selectedRelatedContract
                      ? `${selectedRelatedContract.contractNo}-${selectedRelatedContract.tenant}`
                      : '搜索租户名称或合同编号'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <div className="p-2">
                    <Input
                      placeholder="输入租户名称或合同编号搜索..."
                      value={relatedContractSearch}
                      onChange={(e) => {
                        setRelatedContractSearch(e.target.value);
                        searchRelatedContracts(e.target.value);
                      }}
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {relatedContracts.length > 0 ? (
                      relatedContracts.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                          onClick={() => handleSelectRelatedContract(c)}
                        >
                          {c.contractNo}-{c.tenant}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                        {relatedContractSearch ? '未找到匹配的正常履行合同' : '请输入租户名称或合同编号'}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contractNo">
                合同编号 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="contractNo"
                placeholder="请输入合同编号"
                {...register('contractNo')}
              />
              {errors.contractNo && (
                <p className="text-sm text-destructive">{errors.contractNo.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                房产名称 <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="propertyId"
                render={({ field }) => (
                  <Select
                    disabled={contractType === 'supplement' && !!selectedRelatedContract}
                    value={field.value}
                    onValueChange={(val) => {
                      field.onChange(val);
                      const prop = properties.find((p) => p.id === val);
                      if (prop) {
                        setValue('landlord', prop.companyEntity);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="请选择房产名称" />
                    </SelectTrigger>
                    <SelectContent>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.propertyId && (
                <p className="text-sm text-destructive">{errors.propertyId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="landlord">
                出租方 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="landlord"
                readOnly
                className="bg-muted cursor-not-allowed"
                placeholder="选择房产后自动填充"
                {...register('landlord')}
              />
              {errors.landlord && (
                <p className="text-sm text-destructive">{errors.landlord.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Label htmlFor="tenant">
                  承租方 <span className="text-destructive">*</span>
                </Label>
                {contractType === 'supplement' && selectedRelatedContract && (
                  <div className="flex items-center gap-1.5">
                    <Switch
                      id="tenantSwitch"
                      checked={tenantEditable}
                      onCheckedChange={setTenantEditable}
                    />
                    <Label htmlFor="tenantSwitch" className="text-xs text-muted-foreground font-normal cursor-pointer">
                      转租变更
                    </Label>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Popover open={tenantEditable !== false && !(contractType === 'supplement' && !!selectedRelatedContract && !tenantEditable) ? showCustomerSearch : false} onOpenChange={tenantEditable !== false && !(contractType === 'supplement' && !!selectedRelatedContract && !tenantEditable) ? setShowCustomerSearch : undefined}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      type="button"
                      className={cn('flex-1 justify-start text-left font-normal', !selectedCustomer && 'text-muted-foreground', contractType === 'supplement' && !!selectedRelatedContract && !tenantEditable && 'bg-muted cursor-not-allowed opacity-50')}
                    >
                      {selectedCustomer ? `${selectedCustomer.customerCode} - ${selectedCustomer.companyName}` : '搜索客户名称或客户编码'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <div className="p-2">
                      <Input
                        placeholder="输入客户名称或客户编码搜索..."
                        value={customerSearchQuery}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          setCustomerSearchQuery(e.target.value);
                          searchCustomers(e.target.value);
                        }}
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {customerSearchResults.length > 0 ? (
                        customerSearchResults.map((c: CustomerResponse) => (
                          <button
                            key={c.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                            onClick={() => handleSelectCustomer(c)}
                          >
                            {c.customerCode} - {c.companyName}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                          {customerSearchQuery ? '未找到匹配的客户' : '请输入客户名称或客户编码'}
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <Input id="tenant" type="hidden" {...register('tenant')} />
              {errors.tenant && (
                <p className="text-sm text-destructive">{errors.tenant.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="leaseArea">租赁面积（㎡） <span className="text-destructive">*</span></Label>
              <Input
                id="leaseArea"
                type="number"
                min="0"
                step="0.01"
                placeholder="请输入租赁面积"
                {...register('leaseArea', { valueAsNumber: true })}
              />
              {errors.leaseArea && (
                <p className="text-sm text-destructive">{errors.leaseArea.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                合同签署日期 <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="signDate"
                render={({ field }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? (
                          format(new Date(field.value), 'yyyy-MM-dd')
                        ) : (
                          <span>选择日期</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        {...calendarProps}
                        selected={field.value ? new Date(field.value) : undefined}
                        onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {errors.signDate && (
                <p className="text-sm text-destructive">{errors.signDate.message}</p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2 lg:col-span-3">
              <div className="flex items-center gap-3">
                <Label htmlFor="leaseAddress">
                  租赁地址 <span className="text-destructive">*</span>
                </Label>
                {contractType === 'supplement' && selectedRelatedContract && (
                  <div className="flex items-center gap-1.5">
                    <Switch
                      id="addressSwitch"
                      checked={addressEditable}
                      onCheckedChange={setAddressEditable}
                    />
                    <Label htmlFor="addressSwitch" className="text-xs text-muted-foreground font-normal cursor-pointer">
                      租赁地址变更
                    </Label>
                  </div>
                )}
              </div>
              <Input
                id="leaseAddress"
                placeholder="请输入租赁地址"
                readOnly={contractType === 'supplement' && !!selectedRelatedContract && !addressEditable}
                className={contractType === 'supplement' && selectedRelatedContract && !addressEditable ? 'bg-muted cursor-not-allowed' : ''}
                {...register('leaseAddress')}
              />
              {errors.leaseAddress && (
                <p className="text-sm text-destructive">{errors.leaseAddress.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                合同开始日期 <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="startDate"
                render={({ field }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? (
                          format(new Date(field.value), 'yyyy-MM-dd')
                        ) : (
                          <span>选择日期</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        {...calendarProps}
                        selected={field.value ? new Date(field.value) : undefined}
                        onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {errors.startDate && (
                <p className="text-sm text-destructive">{errors.startDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>
                合同结束日期 <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="endDate"
                render={({ field }) => (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {field.value ? (
                          format(new Date(field.value), 'yyyy-MM-dd')
                        ) : (
                          <span>选择日期</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        {...calendarProps}
                        selected={field.value ? new Date(field.value) : undefined}
                        onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                )}
              />
              {errors.endDate && (
                <p className="text-sm text-destructive">{errors.endDate.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">
                租金支付方式 <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="paymentMethod"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择支付方式" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethodOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.paymentMethod && (
                <p className="text-sm text-destructive">{errors.paymentMethod.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="advancePaymentDays" className="flex items-center gap-1">
                提前付款天数（天） <span className="text-destructive">*</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground cursor-help">
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>该合同约定租金需要在所属期开始前提前多少天付款，默认为5天</p>
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="advancePaymentDays"
                type="number"
                min={1}
                step={1}
                placeholder="请输入提前付款天数"
                {...register('advancePaymentDays', { valueAsNumber: true })}
              />
              {errors.advancePaymentDays && (
                <p className="text-sm text-destructive">{errors.advancePaymentDays.message}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Controller
              control={control}
              name="hasUtilities"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  id="hasUtilities"
                />
              )}
            />
            <Label htmlFor="hasUtilities" className="cursor-pointer">
              收取水电费
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">租期分段配置</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={handleAddStage}>
            <Plus className="mr-2 h-4 w-4" />
            添加阶段
          </Button>
        </CardHeader>
        <CardContent>
          {errors.stages && typeof errors.stages === 'object' && !Array.isArray(errors.stages) && (
            <p className="text-sm text-destructive mb-4">{errors.stages.message}</p>
          )}

          <div className="space-y-4">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="grid grid-cols-1 md:grid-cols-8 gap-4 p-4 border border-border rounded-sm bg-muted/30"
              >
                <div className="space-y-2">
                  <Label>序号</Label>
                  <div className="h-10 flex items-center font-medium text-foreground">
                    第 {index + 1} 阶段
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>租金阶段 <span className="text-destructive">*</span></Label>
                  <Controller
                    control={control}
                    name={`stages.${index}.stageType`}
                    render={({ field }) => {
                      const stages = watch('stages');
                      const usedStageTypes: string[] = stages
                        ?.filter((_, i) => i !== index)
                        ?.map(s => s.stageType)
                        ?.filter(t => t !== 'free') || [];

                      return (
                        <Select value={field.value} onValueChange={(val) => {
                      field.onChange(val);
                      if (val === 'free') {
                        setValue(`stages.${index}.monthlyRent`, 0);
                      }
                    }}>
                          <SelectTrigger>
                            <SelectValue placeholder="选择阶段" />
                          </SelectTrigger>
                          <SelectContent>
                            {stageTypeOptions.map((option) => {
                              const isDisabled = option.value !== 'free' && usedStageTypes.includes(option.value);
                              return (
                                <SelectItem
                                  key={option.value}
                                  value={option.value}
                                  disabled={isDisabled}
                                >
                                  {option.label}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      );
                    }}
                  />
                  {errors.stages?.[index]?.stageType && (
                    <p className="text-sm text-destructive">
                      {errors.stages[index]?.stageType?.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>
                    阶段开始日期 <span className="text-destructive">*</span>
                  </Label>
                  {index === 0 ? (
                    // 第一个阶段：只读展示
                    <div className="h-10 px-3 flex items-center border border-border rounded-sm bg-muted/50 text-foreground text-sm">
                      {contractStartDate || '与合同开始日期一致'}
                    </div>
                  ) : (
                    // 其他阶段：只读展示（自动计算）
                    <Controller
                      control={control}
                      name={`stages.${index}.startDate`}
                      render={({ field }) => (
                        <div className="h-10 px-3 flex items-center border border-border rounded-sm bg-muted/50 text-foreground text-sm">
                          {field.value || '与上一阶段结束日期关联'}
                        </div>
                      )}
                    />
                  )}
                  {errors.stages?.[index]?.startDate && (
                    <p className="text-sm text-destructive">
                      {errors.stages[index]?.startDate?.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>
                    阶段结束日期 <span className="text-destructive">*</span>
                  </Label>
                  {index === fields.length - 1 ? (
                    // 最后一个阶段：只读展示
                    <div className="h-10 px-3 flex items-center border border-border rounded-sm bg-muted/50 text-foreground text-sm">
                      {contractEndDate || '与合同结束日期一致'}
                    </div>
                  ) : (
                    // 其他阶段：日期选择器
                    <Controller
                      control={control}
                      name={`stages.${index}.endDate`}
                      render={({ field }) => (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                'w-full justify-start text-left font-normal',
                                !field.value && 'text-muted-foreground'
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? (
                                format(new Date(field.value), 'yyyy-MM-dd')
                              ) : (
                                <span>选择日期</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              {...calendarProps}
                              selected={field.value ? new Date(field.value) : undefined}
                              onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                              disabled={(date) => {
                                if (contractStartDate && date < new Date(contractStartDate)) return true;
                                if (contractEndDate && date > new Date(contractEndDate)) return true;
                                return false;
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      )}
                    />
                  )}
                  {errors.stages?.[index]?.endDate && (
                    <p className="text-sm text-destructive">
                      {errors.stages[index]?.endDate?.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>月租金 (元) <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="请输入月租金"
                    disabled={watch(`stages.${index}.stageType`) === 'free'}
                    {...register(`stages.${index}.monthlyRent`, { valueAsNumber: true })}
                  />
                  {errors.stages?.[index]?.monthlyRent && (
                    <p className="text-sm text-destructive">
                      {errors.stages[index]?.monthlyRent?.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>月物业费 (元) <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="请输入月物业费"
                    {...register(`stages.${index}.monthlyPropertyFee`, { valueAsNumber: true })}
                  />
                  {errors.stages?.[index]?.monthlyPropertyFee && (
                    <p className="text-sm text-destructive">
                      {errors.stages[index]?.monthlyPropertyFee?.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>租赁单价（月/㎡）</Label>
                  <div className="h-10 px-3 flex items-center border border-border rounded-sm bg-muted/50 text-foreground text-sm">
                    {watch('leaseArea') && watch('leaseArea') > 0
                      ? (watch(`stages.${index}.monthlyRent`) / watch('leaseArea')).toFixed(2)
                      : '—'}
                  </div>
                </div>

                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => remove(index)}
                    disabled={fields.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => navigate('/contracts')}
        >
          取消
        </Button>
        {canSave && (
          <Button
            variant="outline"
            onClick={handleSaveDraft}
            disabled={isSubmitting}
          >
            <Save className="mr-2 h-4 w-4" />
            保存草稿
          </Button>
        )}
        {canSubmit && (
          <Button
            onClick={onSubmitForReview}
            disabled={isSubmitting}
          >
            <Send className="mr-2 h-4 w-4" />
            提交审核
          </Button>
        )}
      </div>
    </div>
  );
};

export default ContractCreatePage;
