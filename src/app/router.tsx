import {
  ModelPoolRoute,
  ModelDetailRoute,
  ChannelDetailRoute,
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
      { path: '/suppliers', element: <SupplierRoute /> },
      { path: '/suppliers/:supplierId', element: <SupplierRoute /> },
      ...navigation
        .filter(
          (n) =>
            n.id !== 'dashboard' && n.id !== 'suppliers' && n.id !== 'models',
        )
        .map((n) => ({ path: n.path, element: <ComingSoonPage /> })),
      { path: '*', element: <ComingSoonPage /> },
    ],
  },
]);
