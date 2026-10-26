import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, RotateCcw, Save, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ROLE_DISPLAY_NAMES, type MockRole } from '@/hooks/useMockRole';
import { permissionApi } from '@/api';
import type { AuthzPermission, AuthzRolePermission } from '@/api';
import { useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';

const ALL_ROLES: MockRole[] = [
  'super_admin',
  'administrative',
  'finance',
  'logistics',
  'role_99xxcvu983p',
];

const EDITABLE_ROLES: MockRole[] = ['administrative', 'finance', 'logistics', 'role_99xxcvu983p'];

const ROLE_COLORS: Record<MockRole, string> = {
  super_admin: 'bg-primary/10 text-primary border-primary/20',
  administrative: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  finance: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  logistics: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  role_99xxcvu983p: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
};

const SUBJECT_LABELS: Record<string, string> = {
  Property: '房产信息',
  Contract: '合同管理',
  Finance: '财务审核',
  Ledger: '台账管理',
  Utility: '水电费管理',
  Termination: '合同终止',
  Statistics: '数据统计',
  Dashboard: '数据看板',
  Receipt: '收款报表',
  Statement: '对账单',
  Overdue: '逾期提醒',
  Customer: '客户管理',
  Sync: '系统配置',
  Permission: '权限管理',
};

const ACTION_LABELS: Record<string, string> = {
  read: '查看',
  create: '新增',
  update: '编辑',
  delete: '删除',
  submit: '提交审核',
  amend: '合同变更',
  review: '财务审核',
  edit: '编辑/登记',
  receive: '收款',
  config: '配置管理',
  send: '发送提醒',
  manage: '管理',
};

function getPermissionLabel(perm: AuthzPermission): string {
  const action = ACTION_LABELS[perm.action] ?? perm.action;
  const subject = SUBJECT_LABELS[perm.subject] ?? perm.subject;
  return `${action}${subject}`;
}

interface PermissionGroup {
  subject: string;
  label: string;
  permissions: AuthzPermission[];
}

function groupBySubject(perms: AuthzPermission[]): PermissionGroup[] {
  const groups = new Map<string, AuthzPermission[]>();
  for (const p of perms) {
    const list = groups.get(p.subject) ?? [];
    list.push(p);
    groups.set(p.subject, list);
  }
  const result: PermissionGroup[] = [];
  for (const [subject, permissions] of groups.entries()) {
    result.push({
      subject,
      label: SUBJECT_LABELS[subject] ?? subject,
      permissions: permissions.sort((a, b) => a.action.localeCompare(b.action)),
    });
  }
  // Sort by subject order in SUBJECT_LABELS
  result.sort((a, b) => {
    const orderA = Object.keys(SUBJECT_LABELS).indexOf(a.subject);
    const orderB = Object.keys(SUBJECT_LABELS).indexOf(b.subject);
    if (orderA === -1 && orderB === -1) return a.subject.localeCompare(b.subject);
    if (orderA === -1) return 1;
    if (orderB === -1) return -1;
    return orderA - orderB;
  });
  return result;
}

const PermissionConfigPage: React.FC = () => {
  const { ability, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const isSuperAdmin = !authLoading && ability.can('super_admin', ROLE_SUBJECT);

  const [permissionPoints, setPermissionPoints] = useState<AuthzPermission[]>([]);
  const [roleMappings, setRoleMappings] = useState<AuthzRolePermission[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Record<MockRole, Set<string>>>(() => ({
    super_admin: new Set(),
    administrative: new Set(),
    finance: new Set(),
    logistics: new Set(),
    role_99xxcvu983p: new Set(),
  }));
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [permsResp, mappingsResp] = await Promise.all([
        permissionApi.listPermissions(),
        permissionApi.listRoleMappings(),
      ]);
      const perms = permsResp.data;
      const mappings = mappingsResp.data;
      setPermissionPoints(perms);
      setRoleMappings(mappings);

      const allPermIds = new Set(perms.map((p: AuthzPermission) => p.id));
      const byRole: Record<MockRole, Set<string>> = {
        super_admin: new Set(allPermIds),
        administrative: new Set(),
        finance: new Set(),
        logistics: new Set(),
        role_99xxcvu983p: new Set(),
      };
      for (const m of mappings) {
        const roleKey = m.roleKey as MockRole;
        if (byRole[roleKey]) {
          byRole[roleKey].add(m.permissionId);
        }
      }
      // super_admin always has all permissions
      byRole.super_admin = new Set(allPermIds);
      setEditing(byRole);
      setHasChanges(false);
      setLoaded(true);
    } catch (error) {
      toast.error('加载权限配置失败');
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadData();
    }
  }, [isSuperAdmin, loadData]);

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      toast.error('无权限访问权限配置页面');
      navigate('/contracts', { replace: true });
    }
  }, [authLoading, isSuperAdmin, navigate]);

  const permissionGroups = useMemo(
    () => groupBySubject(permissionPoints),
    [permissionPoints],
  );

  const togglePermission = useCallback((role: MockRole, permId: string) => {
    setEditing((prev) => {
      const nextSet = new Set(prev[role]);
      if (nextSet.has(permId)) {
        nextSet.delete(permId);
      } else {
        nextSet.add(permId);
      }
      setHasChanges(true);
      return { ...prev, [role]: nextSet };
    });
  }, []);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      // Compute diff for each editable role based on current mappings
      const originalByRole: Record<string, Set<string>> = {};
      for (const m of roleMappings) {
        if (!originalByRole[m.roleKey]) originalByRole[m.roleKey] = new Set();
        originalByRole[m.roleKey].add(m.permissionId);
      }

      for (const role of EDITABLE_ROLES) {
        const original = originalByRole[role] ?? new Set<string>();
        const current = editing[role];
        const add: string[] = [];
        const remove: string[] = [];
        for (const pid of current) {
          if (!original.has(pid)) add.push(pid);
        }
        for (const pid of original) {
          if (!current.has(pid)) remove.push(pid);
        }
        if (add.length > 0 || remove.length > 0) {
          await permissionApi.batchUpdateRoleMappings({ roleKey: role, add, remove });
        }
      }

      await loadData();
      setHasChanges(false);
      toast.success('权限配置已保存');
    } catch (error) {
      toast.error('保存权限配置失败');
    } finally {
      setIsSaving(false);
    }
  }, [editing, roleMappings, loadData]);

  const handleReset = useCallback(async () => {
    // Reset to current saved state by reloading
    setIsSaving(true);
    try {
      await loadData();
      setHasChanges(false);
      toast.success('已重置为当前保存的配置');
    } catch (error) {
      toast.error('重置失败');
    } finally {
      setIsSaving(false);
    }
  }, [loadData]);

  if (authLoading || (isSuperAdmin && !loaded)) {
    return (
      <div className="w-full max-w-[1400px] mx-auto space-y-6">
        <div className="flex items-center justify-center py-20">
          <div className="text-muted-foreground">加载中...</div>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="w-full max-w-[1400px] mx-auto space-y-6">
        <div className="flex flex-col items-center justify-center py-20">
          <Lock className="w-12 h-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-medium text-foreground mb-2">无权限访问</h2>
          <p className="text-muted-foreground">仅超级管理员可访问权限配置页面</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">权限配置</h1>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="mr-2 h-4 w-4" />
            重置
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {permissionGroups.map((group) => (
          <Card key={group.subject}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                {group.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-sm font-medium text-muted-foreground w-48">
                        功能点
                      </th>
                      {ALL_ROLES.map((role) => (
                        <th key={role} className="text-center py-2 px-3 text-sm">
                          <Badge variant="outline" className={ROLE_COLORS[role]}>
                            {ROLE_DISPLAY_NAMES[role]}
                          </Badge>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.permissions.map((perm) => (
                      <tr
                        key={perm.id}
                        className="border-b border-border/50 hover:bg-accent/30"
                      >
                        <td className="py-2 px-3 text-sm text-foreground">
                          <div className="font-medium">{getPermissionLabel(perm)}</div>
                          {perm.description && perm.description !== getPermissionLabel(perm) && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {perm.description}
                            </div>
                          )}
                        </td>
                        {ALL_ROLES.map((role) => {
                          const checked = editing[role]?.has(perm.id) ?? false;
                          const isReadOnly = role === 'super_admin';
                          return (
                            <td key={role} className="text-center py-2 px-3">
                              <button
                                type="button"
                                disabled={isReadOnly}
                                onClick={() => togglePermission(role, perm.id)}
                                className={`inline-flex items-center justify-center w-6 h-6 rounded-sm border transition-colors ${
                                  checked
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : 'bg-card border-border hover:border-primary/50'
                                } ${isReadOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                                aria-label={`${ROLE_DISPLAY_NAMES[role]} - ${getPermissionLabel(perm)}`}
                              >
                                {checked && (
                                  <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default PermissionConfigPage;
