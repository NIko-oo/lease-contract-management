import { useState, useEffect, useMemo } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import {
  FileText,
  AlertCircle,
  CheckCircle,
  BookOpen,
  Zap,
  BarChart3,
  FileSpreadsheet,
  User,
  LogOut,
  Repeat,
  Building2,
  ChevronUp,
  Shield,
  BellRing,
  Users,
  LayoutDashboard,
  Banknote,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { getDataloom } from '@lark-apaas/client-toolkit/dataloom';
import { useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';
import { ROLE_DISPLAY_NAMES, type MockRole } from '@/hooks/useMockRole';
import RoleSwitcher from '@/components/RoleSwitcher';
import { useRoleStore, buildRolePermissions, sortByPriority } from '@/store/roleStore';
import { permissionApi } from '@/api';

const CURRENT_USER_KEY = '__global_lease_current_user';

const ROLE_PRIORITY: MockRole[] = [
  'super_admin',
  'finance',
  'administrative',
  'logistics',
  'role_99xxcvu983p',
];

interface NavPermission {
  action: string;
  subject: string;
}

const navItems: Array<{ path: string; label: string; icon: typeof FileText; permission: NavPermission }> = [
  { path: "/properties", label: "房产信息", icon: Building2, permission: { action: 'read', subject: 'Property' } },
  { path: "/customers", label: "客户管理", icon: Users, permission: { action: 'read', subject: 'Customer' } },
  { path: "/contracts", label: "合同管理", icon: FileText, permission: { action: 'read', subject: 'Contract' } },
  { path: "/terminations", label: "合同终止", icon: AlertCircle, permission: { action: 'read', subject: 'Termination' } },
  { path: "/finance/review", label: "财务审核", icon: CheckCircle, permission: { action: 'review', subject: 'Finance' } },
  { path: "/ledger", label: "台账管理", icon: BookOpen, permission: { action: 'read', subject: 'Ledger' } },
  { path: "/receipts", label: "收款报表", icon: Banknote, permission: { action: 'read', subject: 'Receipt' } },
  { path: "/utilities", label: "水电费管理", icon: Zap, permission: { action: 'read', subject: 'Utility' } },
  { path: "/statistics", label: "合同统计", icon: BarChart3, permission: { action: 'read', subject: 'Statistics' } },
  { path: "/dashboard", label: "数据看板", icon: LayoutDashboard, permission: { action: 'read', subject: 'Dashboard' } },
  { path: "/statements", label: "对账单", icon: FileSpreadsheet, permission: { action: 'read', subject: 'Statement' } },
  { path: "/overdue", label: "逾期提醒", icon: BellRing, permission: { action: 'read', subject: 'Overdue' } },
  { path: "/permission-config", label: "权限配置", icon: Shield, permission: { action: 'manage', subject: 'Permission' } },
];

const LayoutContent = () => {
  const { pathname } = useLocation();
  const userInfo = useCurrentUserProfile();
  const { ability, isLoading: authLoading } = useAuth();
  const {
    currentRole,
    setAvailableRoles,
    setRolePermissions,
    finishPermissionLoad,
    canAccess,
  } = useRoleStore();

  const [roleSwitcherOpen, setRoleSwitcherOpen] = useState(false);

  // 平台真实可用角色（按优先级排序，useMemo 稳定引用避免 effect 无限循环）
  const platformRoles: MockRole[] = useMemo(() => {
    if (authLoading) return [];
    return sortByPriority(
      ROLE_PRIORITY.filter((role) => ability.can(role, ROLE_SUBJECT)) as MockRole[],
    );
  }, [authLoading, ability]);

  // 同步可用角色到全局 store（自动回退当前角色）
  useEffect(() => {
    if (!authLoading) {
      setAvailableRoles(platformRoles);
    }
  }, [authLoading, platformRoles, setAvailableRoles]);

  // 加载角色→权限点映射（用于导航按模拟角色过滤）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [permsResp, mappingsResp] = await Promise.all([
          permissionApi.listPermissions(),
          permissionApi.listRoleMappings(),
        ]);
        if (!cancelled) {
          setRolePermissions(buildRolePermissions(permsResp.data, mappingsResp.data));
        }
      } catch {
        // 权限映射加载失败：保持空映射（导航与页面内按钮全部隐藏），不阻塞页面渲染
        if (!cancelled) finishPermissionLoad();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setRolePermissions, finishPermissionLoad]);

  const currentRoleDisplayName =
    currentRole && platformRoles.includes(currentRole)
      ? ROLE_DISPLAY_NAMES[currentRole]
      : platformRoles.length > 0
        ? ROLE_DISPLAY_NAMES[platformRoles[0]]
        : '未分配角色';

  const handleLogout = async () => {
    const dataloom = await getDataloom();
    await dataloom.service.session.signOut();
    localStorage.removeItem(CURRENT_USER_KEY);
    window.location.reload();
  };

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-sm bg-sidebar-primary text-sidebar-primary-foreground">
                    <Building2 className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-semibold">租赁合同管理</span>
                    <span className="truncate text-xs text-sidebar-foreground/60">
                      行政财务系统
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems
                  .filter((item) => {
                    if (authLoading) return false;
                    return canAccess(item.permission.action, item.permission.subject);
                  })
                  .map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.path}
                      tooltip={item.label}
                    >
                      <Link to={item.path}>
                        <item.icon className="size-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton>
                    <User className="size-4" />
                    <span className="truncate">
                      {userInfo.name || "当前用户"}
                    </span>
                    <span className="text-xs text-sidebar-foreground/50 ml-1 group-data-[collapsible=icon]:hidden">
                      ({currentRoleDisplayName})
                    </span>
                    <ChevronUp className="ml-auto size-4" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  className="w-[--radix-popper-anchor-width]"
                >
                  <DropdownMenuItem onClick={() => setRoleSwitcherOpen(true)}>
                    <Repeat className="mr-2 size-4" />
                    <span>切换身份</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 size-4" />
                    <span>退出登录</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <RoleSwitcher open={roleSwitcherOpen} onOpenChange={setRoleSwitcherOpen} />

      <main className="flex-1 min-w-0 bg-background">
        <header className="flex items-center gap-2 px-6 py-4 mb-4 border-b border-border sticky top-0 bg-background z-10">
          <SidebarTrigger />
        </header>
        <div className="px-6 pb-8">
          <Outlet />
        </div>
      </main>
    </>
  );
};

const Layout = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <LayoutContent />
      </div>
    </SidebarProvider>
  );
};

export default Layout;
