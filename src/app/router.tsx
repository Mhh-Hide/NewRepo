import { RolePerspectivesRoute } from './RolePerspectivesRoute';
import { RemediationRoute } from './RemediationRoute';
import { TestingRoute } from './TestingRoute';
import { BulkQuotationRoute } from './BulkQuotationRoute';
import { ProcurementAnalyticsRoute } from './ProcurementAnalyticsRoute';
import { QuotationRoute } from './QuotationRoutes';
import { SourcingRoute } from './SourcingRoutes';
import {
  ModelPoolRoute,
  ModelDetailRoute,
  ChannelDetailRoute,
  ChannelListRoute,
} from './ResourceRoutes';
import '../features/models/resources.css';
import { SupplierRoute } from '../features/suppliers/SupplierRoute';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { WelcomePage } from './WelcomePage';
import { AppShell } from './AppShell';
import { DashboardRoute } from '../features/dashboard/DashboardPage';
import { ComingSoonPage } from '../features/placeholder/ComingSoonPage';
import { navigation } from './navigation';
export const router = createBrowserRouter([
  { path: '/welcome', element: <WelcomePage /> },
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <Navigate to="/dashboard" replace /> },
      { path: '/dashboard', element: <DashboardRoute /> },
      { path: '/system/roles', element: <RolePerspectivesRoute /> },
      {
        path: '/models',
        element: <ModelPoolRoute />,
      },
      {
        path: '/models/:modelId',
        element: <ModelDetailRoute />,
      },
      {
        path: '/channels/:channelId',
        element: <ChannelDetailRoute />,
      },
      {
        path: '/analytics/procurement',
        element: <ProcurementAnalyticsRoute />,
      },
      {
        path: '/analysis/purchase',
        element: <Navigate to="/analytics/procurement" replace />,
      },
      { path: '/procurement/bulk-quotes', element: <BulkQuotationRoute /> },
      {
        path: '/procurement/bulk-quotes/:batchId',
        element: <BulkQuotationRoute />,
      },
      { path: '/quotes', element: <QuotationRoute /> },
      { path: '/quotes/:quoteId', element: <QuotationRoute /> },
      { path: '/sourcing', element: <SourcingRoute /> },
      { path: '/sourcing/:demandId', element: <SourcingRoute /> },
      { path: '/remediations', element: <RemediationRoute /> },
      { path: '/remediations/:remediationId', element: <RemediationRoute /> },
      { path: '/tests', element: <TestingRoute /> },
      { path: '/tests/:taskId', element: <TestingRoute /> },
      { path: '/channels', element: <ChannelListRoute /> },
      { path: '/suppliers', element: <SupplierRoute /> },
      { path: '/suppliers/:supplierId', element: <SupplierRoute /> },
      ...navigation
        .filter(
          (n) =>
            n.id !== 'roles' &&
            n.id !== 'remediations' &&
            n.id !== 'tests' &&
            n.id !== 'dashboard' &&
            n.id !== 'suppliers' &&
            n.id !== 'models' &&
            n.id !== 'channels' &&
            n.id !== 'sourcing' &&
            n.id !== 'quotes' &&
            n.id !== 'bulk-quotes' &&
            n.id !== 'purchase-analysis',
        )
        .map((n) => ({ path: n.path, element: <ComingSoonPage /> })),
      { path: '*', element: <ComingSoonPage /> },
    ],
  },
]);
