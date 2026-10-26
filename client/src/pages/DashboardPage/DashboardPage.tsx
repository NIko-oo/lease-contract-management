import React, { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table } from '@lark-apaas/client-toolkit/antd-table';
import { dashboardApi } from '@/api';
import { LayoutDashboard } from 'lucide-react';

/** 千分位格式化金额/面积 */
const formatNumber = (value: number | null | undefined, digits = 2): string => {
  if (value == null || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
};

/** 出租率（0~1 → 百分比字符串） */
const formatRate = (value: number | null | undefined): string => {
  if (value == null || Number.isNaN(value)) return '-';
  return `${(value * 100).toFixed(2)}%`;
};

/** 生成年份选项：当前年前后 5 年 */
const buildYearOptions = (): number[] => {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let y = current - 5; y <= current + 5; y++) years.push(y);
  return years;
};

const YEAR_OPTIONS = buildYearOptions();
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

const columns = [
  { title: '房产名称', dataIndex: 'propertyName', key: 'propertyName', width: 200 },
  {
    title: '可出租面积（㎡）',
    dataIndex: 'rentableArea',
    key: 'rentableArea',
    width: 150,
    render: (v) => formatNumber(v as number | null),
  },
  {
    title: '已出租面积（㎡）',
    dataIndex: 'rentedArea',
    key: 'rentedArea',
    width: 150,
    render: (v) => formatNumber(v as number | null),
  },
  {
    title: '未出租面积（㎡）',
    dataIndex: 'vacantArea',
    key: 'vacantArea',
    width: 150,
    render: (v) => formatNumber(v as number | null),
  },
  {
    title: '加权平均出租率',
    dataIndex: 'avgRentRate',
    key: 'avgRentRate',
    width: 140,
    render: (v) => formatRate(v as number | null),
  },
  {
    title: '期末出租率',
    dataIndex: 'endRentRate',
    key: 'endRentRate',
    width: 130,
    render: (v) => formatRate(v as number | null),
  },
  {
    title: '年累计租金（元）',
    dataIndex: 'yearRent',
    key: 'yearRent',
    width: 170,
    render: (v) => formatNumber(v as number | null),
  },
  {
    title: '年累计物业费（元）',
    dataIndex: 'yearPropertyFee',
    key: 'yearPropertyFee',
    width: 170,
    render: (v) => formatNumber(v as number | null),
  },
];

const DashboardPage: React.FC = () => {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', 'property-rent-summary', year, month],
    queryFn: async () => {
      const res = await dashboardApi.getPropertyRentSummary(year, month);
      return res.data;
    },
  });

  const handleYearChange = useCallback((value: string) => {
    setYear(Number(value));
  }, []);

  const handleMonthChange = useCallback((value: string) => {
    setMonth(Number(value));
  }, []);

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <LayoutDashboard className="size-6" />
            数据看板
          </h1>
          <p className="text-sm text-muted-foreground mt-1">房产出租概况（第 1 卡片）</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(year)} onValueChange={handleYearChange}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="年份" />
            </SelectTrigger>
            <SelectContent>
              {YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(month)} onValueChange={handleMonthChange}>
            <SelectTrigger className="w-24">
              <SelectValue placeholder="月份" />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m}月
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>房产出租概况</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <p className="text-sm text-destructive py-8 text-center">
              数据加载失败，请稍后重试
            </p>
          ) : (
            <Table
              columns={columns}
              dataSource={data?.items ?? []}
              rowKey="propertyId"
              loading={isLoading}
              pagination={false}
              scroll={{ x: 1260 }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardPage;
