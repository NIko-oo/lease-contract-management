import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Shield, Building2, Settings, UserCog, Calculator } from 'lucide-react';
import { useRoleStore, sortByPriority } from '@/store/roleStore';
import { ROLE_DISPLAY_NAMES, ROLE_DESCRIPTIONS, type MockRole } from '@/hooks/useMockRole';
import { UserDisplay } from '@client/src/components/business-ui/user-display';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';

const ROLE_ICONS: Record<MockRole, React.ReactNode> = {
  super_admin: <Shield className="w-5 h-5" />,
  administrative: <Building2 className="w-5 h-5" />,
  finance: <Settings className="w-5 h-5" />,
  logistics: <UserCog className="w-5 h-5" />,
  role_99xxcvu983p: <Calculator className="w-5 h-5" />,
};

interface RoleSwitcherProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RoleSwitcher: React.FC<RoleSwitcherProps> = ({ open, onOpenChange }) => {
  const { currentRole, availableRoles, setCurrentRole } = useRoleStore();
  const userInfo = useCurrentUserProfile();

  // 按优先级排序展示（复用 store 的 sortByPriority）
  const sortedRoles = useMemo<MockRole[]>(() => {
    return sortByPriority(availableRoles);
  }, [availableRoles]);

  const handleSelectRole = (role: MockRole) => {
    if (role !== currentRole) {
      setCurrentRole(role);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>切换身份</DialogTitle>
          <DialogDescription>
            选择您要使用的角色，不同角色拥有不同的功能权限
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-sm mb-4">
          <span className="text-sm text-muted-foreground">当前用户：</span>
          <UserDisplay userId={userInfo.user_id} />
        </div>

        {sortedRoles.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">
              您尚未被分配角色，请联系管理员配置权限
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedRoles.map((role) => {
              const isActive = role === currentRole;
              return (
                <button
                  key={role}
                  onClick={() => handleSelectRole(role)}
                  className={`w-full flex items-center gap-4 p-4 rounded-sm border text-left transition-all ${
                    isActive
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50 hover:bg-accent/50'
                  }`}
                >
                  <div
                    className={`p-2 rounded-sm ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {ROLE_ICONS[role]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-foreground">
                      {ROLE_DISPLAY_NAMES[role]}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ROLE_DESCRIPTIONS[role]}
                    </p>
                  </div>
                  {isActive && (
                    <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded-sm">
                      当前
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {sortedRoles.length === 1 && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            您目前只拥有一个角色，如需其他角色权限请联系管理员
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RoleSwitcher;
