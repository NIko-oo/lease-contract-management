import React from 'react';
import { Navigate } from 'react-router-dom';
import { useRoleStore } from '@/store/roleStore';

interface ProtectedRouteProps {
  action: string;
  subject: string;
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ action, subject, children }) => {
  const permissionsLoaded = useRoleStore((s) => s.permissionsLoaded);
  const canAccess = useRoleStore((s) => s.canAccess);

  if (!permissionsLoaded) return null;
  if (!canAccess(action, subject)) return <Navigate to="/" replace />;

  return <>{children}</>;
};

export default ProtectedRoute;
