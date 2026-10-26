import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import NotFound from './pages/NotFound/NotFound';
import ContractPage from './pages/ContractPage/ContractPage';
import ContractCreatePage from './pages/ContractCreatePage/ContractCreatePage';
import ContractDetailPage from './pages/ContractDetailPage/ContractDetailPage';
import TerminationPage from './pages/TerminationPage/TerminationPage';
import FinanceReviewPage from './pages/FinanceReviewPage/FinanceReviewPage';
import LedgerPage from './pages/LedgerPage/LedgerPage';
import ReceiptPage from './pages/ReceiptPage/ReceiptPage';
import UtilitiesPage from './pages/UtilitiesPage/UtilitiesPage';
import StatisticsPage from './pages/StatisticsPage/StatisticsPage';
import StatementPage from './pages/StatementPage/StatementPage';
import PropertyPage from './pages/PropertyPage/PropertyPage';
import PermissionConfigPage from './pages/PermissionConfigPage/PermissionConfigPage';
import OverduePage from './pages/OverduePage/OverduePage';
import CustomerPage from './pages/CustomerPage/CustomerPage';
import DashboardPage from './pages/DashboardPage/DashboardPage';

const pageRoutes: Array<{
  path: string;
  element: React.ReactNode;
  action: string;
  subject: string;
}> = [
  { path: '/properties', element: <PropertyPage />, action: 'read', subject: 'Property' },
  { path: '/customers', element: <CustomerPage />, action: 'read', subject: 'Customer' },
  { path: '/contracts', element: <ContractPage />, action: 'read', subject: 'Contract' },
  { path: '/contracts/create', element: <ContractCreatePage />, action: 'create', subject: 'Contract' },
  { path: '/contracts/edit/:id', element: <ContractCreatePage />, action: 'update', subject: 'Contract' },
  { path: '/contracts/:id', element: <ContractDetailPage />, action: 'read', subject: 'Contract' },
  { path: '/terminations', element: <TerminationPage />, action: 'read', subject: 'Termination' },
  { path: '/finance/review', element: <FinanceReviewPage />, action: 'review', subject: 'Finance' },
  { path: '/ledger', element: <LedgerPage />, action: 'read', subject: 'Ledger' },
  { path: '/receipts', element: <ReceiptPage />, action: 'read', subject: 'Receipt' },
  { path: '/utilities', element: <UtilitiesPage />, action: 'read', subject: 'Utility' },
  { path: '/statistics', element: <StatisticsPage />, action: 'read', subject: 'Statistics' },
  { path: '/dashboard', element: <DashboardPage />, action: 'read', subject: 'Dashboard' },
  { path: '/statements', element: <StatementPage />, action: 'read', subject: 'Statement' },
  { path: '/permission-config', element: <PermissionConfigPage />, action: 'manage', subject: 'Permission' },
  { path: '/overdue', element: <OverduePage />, action: 'read', subject: 'Overdue' },
];

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/contracts" replace />} />
        {pageRoutes.map(({ path, element, action, subject }) => (
          <Route
            key={path}
            path={path}
            element={
              <ProtectedRoute action={action} subject={subject}>
                {element}
              </ProtectedRoute>
            }
          />
        ))}
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
