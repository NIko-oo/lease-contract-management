import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MockRole } from '@/hooks/useMockRole';

/** 权限点：action:subject 组合，如 read:Contract */
export type PermissionPointKey = string;

interface RoleState {
  /** 当前生效的模拟角色（用于切换身份预览） */
  currentRole: MockRole | null;
  /** 用户实际拥有的可用角色 */
  availableRoles: MockRole[];
  /** 角色 → 权限点集合（从 /api/permissions + role-mappings 加载） */
  rolePermissions: Record<MockRole, Set<PermissionPointKey>>;
  /** 角色→权限映射是否已完成首次加载（未完成前所有点位判定一律为 false，避免按钮闪现） */
  permissionsLoaded: boolean;
  /** 设置可用角色（登录后由 Layout 依据平台权限填充） */
  setAvailableRoles: (roles: MockRole[]) => void;
  /** 设置角色权限映射（由 Layout 从 API 加载） */
  setRolePermissions: (perms: Record<MockRole, Set<PermissionPointKey>>) => void;
  /** 标记加载流程结束（失败时也要调用，使判定回落到空映射＝全部隐藏） */
  finishPermissionLoad: () => void;
  /** 切换当前角色 */
  setCurrentRole: (role: MockRole | null) => void;
  /** 判断当前角色是否拥有某权限点 */
  canAccess: (action: string, subject: string) => boolean;
}

const ROLE_PRIORITY: MockRole[] = [
  'super_admin',
  'finance',
  'administrative',
  'logistics',
  'role_99xxcvu983p',
];

const EMPTY_PERMS: Record<MockRole, Set<PermissionPointKey>> = {
  super_admin: new Set(),
  administrative: new Set(),
  finance: new Set(),
  logistics: new Set(),
  role_99xxcvu983p: new Set(),
};

export const useRoleStore = create<RoleState>()(
  persist(
    (set, get) => ({
      currentRole: null,
      availableRoles: [],
      rolePermissions: EMPTY_PERMS,
      permissionsLoaded: false,
      setAvailableRoles: (roles) => {
        const { currentRole } = get();
        const valid =
          currentRole && roles.includes(currentRole) ? currentRole : (roles[0] ?? null);
        set({ availableRoles: roles, currentRole: valid });
      },
      setRolePermissions: (perms) => set({ rolePermissions: perms, permissionsLoaded: true }),
      finishPermissionLoad: () => set({ permissionsLoaded: true }),
      setCurrentRole: (role) => {
        const { availableRoles } = get();
        if (role && !availableRoles.includes(role)) return; // 不能切到不可用角色
        set({ currentRole: role });
      },
      canAccess: (action, subject) => {
        const { currentRole, rolePermissions } = get();
        const key = `${action}:${subject}`;
        if (currentRole === 'super_admin') return true; // 超管恒有全部权限
        if (!currentRole) return false;
        return rolePermissions[currentRole]?.has(key) ?? false;
      },
    }),
    {
      name: '__global_lease_current_role',
      partialize: (state) => ({ currentRole: state.currentRole }),
    },
  ),
);

/** 按角色优先级排序可用角色 */
export const sortByPriority = (roles: MockRole[]): MockRole[] => {
  return [...ROLE_PRIORITY].filter((r) => roles.includes(r));
};

/** 构建角色 → 权限点集合：从权限点列表 + 角色映射列表 */
export function buildRolePermissions(
  permissions: Array<{ id: string; action: string; subject: string }>,
  mappings: Array<{ roleKey: string; permissionId: string }>,
): Record<MockRole, Set<PermissionPointKey>> {
  const permKeyById = new Map<string, string>();
  for (const p of permissions) {
    permKeyById.set(p.id, `${p.action}:${p.subject}`);
  }
  const result: Record<MockRole, Set<PermissionPointKey>> = {
    super_admin: new Set(),
    administrative: new Set(),
    finance: new Set(),
    logistics: new Set(),
    role_99xxcvu983p: new Set(),
  };
  for (const m of mappings) {
    const role = m.roleKey as MockRole;
    const key = permKeyById.get(m.permissionId);
    if (role && key && result[role]) {
      result[role].add(key);
    }
  }
  return result;
}
