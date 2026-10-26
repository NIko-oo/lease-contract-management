import React from 'react';
import { useRoleStore } from '@/store/roleStore';

/**
 * 页面内权限判定统一入口。
 *
 * 数据源是应用自有的 authz_role_permissions（权限配置页维护，后端 @Can 经 DbPermissionResolver
 * 读同一张表），不是平台 useAuth().ability —— 平台点位不受权限配置页影响，用它会导致
 * 「配置勾了没反应」。平台 ability 只用于识别用户拥有哪些应用角色。
 */
export function usePointPermission(
  action: string,
  subject: string,
): { allowed: boolean; isLoading: boolean } {
  const allowed = useRoleStore((s) => s.canAccess(action, subject));
  const isLoading = useRoleStore((s) => !s.permissionsLoaded);
  return { allowed, isLoading };
}

/** 映射未加载完成时按「无权限」渲染（fail-closed），避免按钮先出现再消失 */
export function CanPoint({
  action,
  subject,
  children,
  fallback,
}: {
  action: string;
  subject: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}): React.ReactElement | null {
  const { allowed } = usePointPermission(action, subject);
  if (allowed) return <>{children}</>;
  return fallback !== undefined ? <>{fallback}</> : null;
}
