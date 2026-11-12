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
      ...navigation
        .filter((n) => n.id !== 'dashboard')
        .map((n) => ({ path: n.path, element: <ComingSoonPage /> })),
      { path: '*', element: <ComingSoonPage /> },
    ],
  },
]);
