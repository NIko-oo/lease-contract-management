import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table } from '@lark-apaas/client-toolkit/antd-table';
import { BellRing, Users, AlertTriangle, Zap, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import { overdueApi } from '@/api';
import { UserSelect } from '@/components/business-ui/user-select';
import { UserDisplay } from '@/components/business-ui/user-display';
import { CanPoint } from '@/components/PermissionGate';
import type {
  OverdueConfig,
  RentOverdueItem,
  UtilityOverdueItem,
  UtilityUnregisteredGroup,
} from '@shared/api.interface';

const REMINDER_DAY_OPTIONS = [
  { value: '15', label: '每月15号' },
  { value: '20', label: '每月20号' },
  { value: '25', label: '每月25号' },
];

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(amount);

const OverduePage: React.FC = () => {
  const [configs, setConfigs] = useState<OverdueConfig[]>([]);
  const [rentData, setRentData] = useState<RentOverdueItem[]>([]);
  const [rentFollowers, setRentFollowers] = useState<string[]>([]);
  const [utilityData, setUtilityData] = useState<UtilityOverdueItem[]>([]);
  const [utilityFollowers, setUtilityFollowers] = useState<string[]>([]);
  const [unregisteredData, setUnregisteredData] = useState<UtilityUnregisteredGroup[]>([]);
  const [unregisteredFollowers, setUnregisteredFollowers] = useState<string[]>([]);
  const [sendingType, setSendingType] = useState<string | null>(null);
  const [sendingAll, setSendingAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const configMap = useMemo(() => {
    const map: Record<string, OverdueConfig> = {};
    configs.forEach((c) => { map[c.configType] = c; });
    return map;
  }, [configs]);

  const loadConfigs = useCallback(async () => {
    try {
      const res = await overdueApi.getConfig();
      setConfigs(res.data || []);
    } catch (error) {
      toast.error('加载逾期配置失败');
    }
  }, []);

  const loadRentOverdue = useCallback(async () => {
    try {
      const res = await overdueApi.getRentOverdue();
      setRentData(res.data?.data || []);
      setRentFollowers(res.data?.followerIds || []);
    } catch (error) {
      toast.error('加载逾期租金数据失败');
    }
  }, []);

  const loadUtilityOverdue = useCallback(async () => {
    try {
      const res = await overdueApi.getUtilityOverdue();
      setUtilityData(res.data?.data || []);
      setUtilityFollowers(res.data?.followerIds || []);
    } catch (error) {
      toast.error('加载逾期水电费数据失败');
    }
  }, []);

  const loadUtilityUnregistered = useCallback(async () => {
    try {
      const res = await overdueApi.getUtilityUnregistered();
      setUnregisteredData(res.data?.data || []);
      setUnregisteredFollowers(res.data?.followerIds || []);
    } catch (error) {
      toast.error('加载水电费未登记数据失败');
    }
  }, []);

  useEffect(() => {
    loadConfigs();
    loadRentOverdue();
    loadUtilityOverdue();
    loadUtilityUnregistered();
  }, [loadConfigs, loadRentOverdue, loadUtilityOverdue, loadUtilityUnregistered]);

  const handleSaveAllConfigs = async (
    allData: Array<{
      type: string;
      data: { followerIds: string[]; reminderEnabled: boolean; reminderDay: number };
    }>,
  ) => {
    setSaving(true);
    try {
      await Promise.all(
        allData.map(({ type, data }) =>
          overdueApi.updateConfig(type, data),
        ),
      );
      toast.success('保存成功');
      loadConfigs();
    } catch (error) {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSendReminder = async (type: 'rent' | 'utility' | 'utility_unregistered') => {
    const config = configMap[type];
    if (!config?.followerIds?.length) {
      toast.warning('请先配置跟进人员');
      return;
    }
    setSendingType(type);
    try {
      const res = await overdueApi.sendReminder({ type });
      if (res.data?.success) {
        toast.success(`提醒已发送，共 ${res.data.count} 条记录`);
      }
    } catch (error) {
      toast.error('发送提醒失败');
    } finally {
      setSendingType(null);
    }
  };

  const handleSendAllReminder = async () => {
    const hasFollowers = [rentFollowers, utilityFollowers, unregisteredFollowers].some(
      (ids) => ids.length > 0,
    );
    if (!hasFollowers) {
      toast.warning('请先配置跟进人员');
      return;
    }
    setSendingAll(true);
    try {
      const res = await overdueApi.sendAllReminder();
      if (res.data?.success) {
        toast.success(`全部提醒已发送，共 ${res.data.count} 条记录`);
      }
    } catch (error) {
      toast.error('发送全部提醒失败');
    } finally {
      setSendingAll(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">逾期查询提醒</h1>
        <CanPoint action="send" subject="Overdue">
          <Button disabled={sendingAll} onClick={handleSendAllReminder}>
            <BellRing className="w-4 h-4 mr-1" />
            {sendingAll ? '发送中...' : '全部提醒'}
          </Button>
        </CanPoint>
      </div>

      <FollowerConfigCard
        configs={configMap}
        onSaveAll={handleSaveAllConfigs}
        saving={saving}
      />

      <CanPoint action="read" subject="Overdue">
        <RentOverdueCard
          data={rentData}
          followerIds={rentFollowers}
          onSendReminder={() => handleSendReminder('rent')}
          sending={sendingType === 'rent'}
        />
      </CanPoint>

      <CanPoint action="read" subject="Overdue">
        <UtilityOverdueCard
          data={utilityData}
          followerIds={utilityFollowers}
          onSendReminder={() => handleSendReminder('utility')}
          sending={sendingType === 'utility'}
        />
      </CanPoint>

      <CanPoint action="read" subject="Overdue">
        <UtilityUnregisteredCard
          data={unregisteredData}
          followerIds={unregisteredFollowers}
          onSendReminder={() => handleSendReminder('utility_unregistered')}
          sending={sendingType === 'utility_unregistered'}
        />
      </CanPoint>
    </div>
  );
};

interface FollowerConfigCardProps {
  configs: Record<string, OverdueConfig>;
  onSaveAll: (data: Array<{
    type: string;
    data: { followerIds: string[]; reminderEnabled: boolean; reminderDay: number };
  }>) => void;
  saving: boolean;
}

const FollowerConfigCard: React.FC<FollowerConfigCardProps> = ({
  configs,
  onSaveAll,
  saving,
}) => {
  const [localState, setLocalState] = useState<
    Record<string, { followerIds: string[]; reminderEnabled: boolean }>
  >({});
  const [reminderDay, setReminderDay] = useState<number>(20);

  useEffect(() => {
    const state: Record<string, { followerIds: string[]; reminderEnabled: boolean }> = {};
    let day = 20;
    ['rent', 'utility', 'utility_unregistered'].forEach((type) => {
      const c = configs[type];
      state[type] = {
        followerIds: c?.followerIds || [],
        reminderEnabled: c?.reminderEnabled || false,
      };
      if (c?.reminderDay) {
        day = c.reminderDay;
      }
    });
    setLocalState(state);
    setReminderDay(day);
  }, [configs]);

  const configLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    rent: { label: '租金物业费逾期跟进', icon: <AlertTriangle className="w-4 h-4 text-warning" /> },
    utility: { label: '水电费逾期跟进', icon: <Zap className="w-4 h-4 text-warning" /> },
    utility_unregistered: { label: '水电费未登记跟进', icon: <FileWarning className="w-4 h-4 text-warning" /> },
  };

  const handleSaveAll = () => {
    const allData = Object.entries(configLabels).map(([type]) => ({
      type,
      data: {
        followerIds: localState[type]?.followerIds || [],
        reminderEnabled: localState[type]?.reminderEnabled || false,
        reminderDay,
      },
    }));
    onSaveAll(allData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-5 h-5" />
          跟进人员配置
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(configLabels).map(([type, { label, icon }]) => {
          const local = localState[type];
          if (!local) return null;
          return (
            <div key={type} className="space-y-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                {icon}
                {label}
              </div>
              <div className="flex items-start gap-4 pl-6">
                <CanPoint
                  action="config"
                  subject="Overdue"
                  fallback={
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground mb-1">跟进人员</div>
                      <div className="flex flex-wrap gap-1">
                        {local.followerIds.length > 0
                          ? local.followerIds.map((uid) => (
                              <UserDisplay key={uid} user_id={uid} size="small" />
                            ))
                          : <span className="text-xs text-muted-foreground">未配置</span>}
                      </div>
                    </div>
                  }
                >
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground mb-1">跟进人员</div>
                    <UserSelect
                      multiple
                      value={local.followerIds}
                      onChange={(ids: string[]) =>
                        setLocalState((prev) => ({
                          ...prev,
                          [type]: { ...prev[type], followerIds: ids },
                        }))
                      }
                      placeholder="选择跟进人员"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <Switch
                      checked={local.reminderEnabled}
                      onCheckedChange={(checked: boolean) =>
                        setLocalState((prev) => ({
                          ...prev,
                          [type]: { ...prev[type], reminderEnabled: checked },
                        }))
                      }
                    />
                    <span className="text-sm text-muted-foreground">定时提醒</span>
                  </div>
                </CanPoint>
              </div>
            </div>
          );
        })}

        <div className="flex items-center gap-4 pl-6 pt-2 border-t border-border">
          <CanPoint
            action="config"
            subject="Overdue"
            fallback={
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">提醒时间</span>
                <span className="text-sm font-medium">每月{reminderDay}号</span>
              </div>
            }
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">提醒时间</span>
              <Select
                value={String(reminderDay)}
                onValueChange={(val) => setReminderDay(Number(val))}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_DAY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={saving}
              onClick={handleSaveAll}
            >
              保存
            </Button>
          </CanPoint>
        </div>
      </CardContent>
    </Card>
  );
};

type RentRow = RentOverdueItem & { followerIds: string[] };

const rentColumns = [
  { title: '合同编号', dataIndex: 'contractNo', width: 130 },
  { title: '承租方', dataIndex: 'tenant', width: 120 },
  { title: '所属期', dataIndex: 'period', width: 90 },
  {
    title: '应收租金',
    dataIndex: 'receivableRent',
    width: 120,
    align: 'right' as const,
    render: (val: number) => (
      <span className="font-mono">{formatCurrency(val)}</span>
    ),
  },
  {
    title: '应收物业费',
    dataIndex: 'receivablePropertyFee',
    width: 120,
    align: 'right' as const,
    render: (val: number) => (
      <span className="font-mono">{formatCurrency(val)}</span>
    ),
  },
  {
    title: '未交租金',
    dataIndex: 'unpaidRent',
    width: 120,
    align: 'right' as const,
    render: (val: number) => (
      <span className="font-mono text-destructive">{formatCurrency(val)}</span>
    ),
  },
  {
    title: '未交物业费',
    dataIndex: 'unpaidPropertyFee',
    width: 120,
    align: 'right' as const,
    render: (val: number) => (
      <span className="font-mono text-destructive">{formatCurrency(val)}</span>
    ),
  },
  { title: '最后缴纳期限', dataIndex: 'dueDate', width: 120 },
  {
    title: '逾期天数',
    dataIndex: 'overdueDays',
    width: 100,
    align: 'center' as const,
    render: (val: number) => (
      <span className="text-destructive font-mono">{val}天</span>
    ),
  },
  {
    title: '跟进人员',
    dataIndex: 'followerIds',
    width: 200,
    render: (_: string[], record: RentRow) => (
      <FollowerDisplay followerIds={record.followerIds || []} />
    ),
  },
];

type UtilityRow = UtilityOverdueItem & { followerIds: string[] };

const utilityColumns = [
  { title: '房产', dataIndex: 'propertyName', width: 150, render: (val?: string) => val ? <span>{val}</span> : <span className="text-muted-foreground">-</span> },
  { title: '承租方', dataIndex: 'tenant', width: 150 },
  { title: '所属期', dataIndex: 'period', width: 90 },
  {
    title: '电费总额',
    dataIndex: 'totalElectricityFee',
    width: 110,
    align: 'right' as const,
    render: (val: number) => (
      <span className="font-mono">{formatCurrency(val)}</span>
    ),
  },
  {
    title: '水费总额',
    dataIndex: 'totalWaterFee',
    width: 110,
    align: 'right' as const,
    render: (val: number) => (
      <span className="font-mono">{formatCurrency(val)}</span>
    ),
  },
  {
    title: '未交电费',
    dataIndex: 'unpaidElectricity',
    width: 110,
    align: 'right' as const,
    render: (val: number) => (
      <span className="font-mono text-destructive">{formatCurrency(val)}</span>
    ),
  },
  {
    title: '未交水费',
    dataIndex: 'unpaidWater',
    width: 110,
    align: 'right' as const,
    render: (val: number) => (
      <span className="font-mono text-destructive">{formatCurrency(val)}</span>
    ),
  },
  { title: '最后缴纳期限', dataIndex: 'dueDate', width: 120 },
  {
    title: '逾期天数',
    dataIndex: 'overdueDays',
    width: 100,
    align: 'center' as const,
    render: (val: number) => (
      <span className="text-destructive font-mono">{val}天</span>
    ),
  },
  {
    title: '跟进人员',
    dataIndex: 'followerIds',
    width: 200,
    render: (_: string[], record: UtilityRow) => (
      <FollowerDisplay followerIds={record.followerIds || []} />
    ),
  },
];

interface RentOverdueCardProps {
  data: RentOverdueItem[];
  followerIds: string[];
  onSendReminder: () => void;
  sending: boolean;
}

const RentOverdueCard: React.FC<RentOverdueCardProps> = ({
  data,
  followerIds,
  onSendReminder,
  sending,
}) => {
  const enrichedData = data.map((item) => ({ ...item, followerIds }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="w-5 h-5 text-warning" />
          逾期租金物业费
          <Badge className="bg-warning/10 text-warning border border-warning/20 ml-2">
            {data.length}条
          </Badge>
        </CardTitle>
        <CanPoint action="send" subject="Overdue">
          <Button size="sm" disabled={sending} onClick={onSendReminder}>
            <BellRing className="w-4 h-4 mr-1" />
            {sending ? '发送中...' : '一键提醒'}
          </Button>
        </CanPoint>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState message="暂无逾期租金物业费记录" />
        ) : (
          <Table
            columns={rentColumns}
            dataSource={enrichedData}
            rowKey={(r: RentRow) => `${r.contractNo}-${r.period}`}
            pagination={false}
            scroll={{ x: 1250 }}
            size="small"
          />
        )}
      </CardContent>
    </Card>
  );
};

interface UtilityOverdueCardProps {
  data: UtilityOverdueItem[];
  followerIds: string[];
  onSendReminder: () => void;
  sending: boolean;
}

const UtilityOverdueCard: React.FC<UtilityOverdueCardProps> = ({
  data,
  followerIds,
  onSendReminder,
  sending,
}) => {
  const enrichedData = data.map((item) => ({ ...item, followerIds }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="w-5 h-5 text-warning" />
          逾期水电费
          <Badge className="bg-warning/10 text-warning border border-warning/20 ml-2">
            {data.length}条
          </Badge>
        </CardTitle>
        <CanPoint action="send" subject="Overdue">
          <Button size="sm" disabled={sending} onClick={onSendReminder}>
            <BellRing className="w-4 h-4 mr-1" />
            {sending ? '发送中...' : '一键提醒'}
          </Button>
        </CanPoint>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState message="暂无逾期水电费记录" />
        ) : (
          <Table
            columns={utilityColumns}
            dataSource={enrichedData}
            rowKey={(r: UtilityRow) => `${r.contractNo}-${r.period}`}
            pagination={false}
            scroll={{ x: 1260 }}
            size="small"
          />
        )}
      </CardContent>
    </Card>
  );
};

type UnregisteredRow = {
  contractId?: string;
  tenant: string;
  propertyName?: string;
  unregisteredPeriods: string;
  unregisteredCount: number;
  followerIds: string[];
};

interface UtilityUnregisteredCardProps {
  data: UtilityUnregisteredGroup[];
  followerIds: string[];
  onSendReminder: () => void;
  sending: boolean;
}

const UtilityUnregisteredCard: React.FC<UtilityUnregisteredCardProps> = ({
  data,
  followerIds,
  onSendReminder,
  sending,
}) => {
  const totalCount = data.reduce((sum, g) => sum + g.unregisteredCount, 0);

  const unregisteredColumns = [
    {
      title: '房产',
      dataIndex: 'propertyName',
      width: 130,
      render: (val?: string) =>
        val ? <Badge variant="outline">{val}</Badge> : <span className="text-muted-foreground">-</span>,
    },
    { title: '承租方', dataIndex: 'tenant', width: 150 },
    { title: '未登记月份', dataIndex: 'unregisteredPeriods', width: 300 },
    {
      title: '未登记期数',
      dataIndex: 'unregisteredCount',
      width: 100,
      align: 'center' as const,
      render: (val: number) => (
        <span className="text-destructive font-mono">{val}期</span>
      ),
    },
    {
      title: '跟进人员',
      dataIndex: 'followerIds',
      width: 200,
      render: (_: string[], record: UnregisteredRow) => (
        <FollowerDisplay followerIds={record.followerIds || []} />
      ),
    },
  ];

  const flatData = data.map((group) => ({
    ...group,
    followerIds,
  }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileWarning className="w-5 h-5 text-warning" />
          水电费未登记汇总
          <Badge className="bg-warning/10 text-warning border border-warning/20 ml-2">
            {totalCount}条
          </Badge>
        </CardTitle>
        <CanPoint action="send" subject="Overdue">
          <Button size="sm" disabled={sending} onClick={onSendReminder}>
            <BellRing className="w-4 h-4 mr-1" />
            {sending ? '发送中...' : '一键提醒'}
          </Button>
        </CanPoint>
      </CardHeader>
      <CardContent>
        {flatData.length === 0 ? (
          <EmptyState message="暂无水电费未登记记录" />
        ) : (
          <Table
            columns={unregisteredColumns}
            dataSource={flatData}
            rowKey={(r: UnregisteredRow) =>
              r.contractId || `${r.tenant}::${r.propertyName || ''}`
            }
            pagination={false}
            scroll={{ x: 880 }}
            size="small"
          />
        )}
      </CardContent>
    </Card>
  );
};

const FollowerDisplay: React.FC<{ followerIds: string[] }> = ({ followerIds }) => {
  if (!followerIds.length) return <span className="text-muted-foreground text-xs">未配置</span>;

  return (
    <div className="flex flex-wrap gap-1">
      {followerIds.map((uid) => (
        <UserDisplay key={uid} user_id={uid} size="small" />
      ))}
    </div>
  );
};

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
    <AlertTriangle className="w-8 h-8 mb-2 opacity-30" />
    <span className="text-sm">{message}</span>
  </div>
);

export default OverduePage;
