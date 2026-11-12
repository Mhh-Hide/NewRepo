import { useEffect, useState } from 'react';
import type { DemoSession } from '../../services/demo-session';
import { loadDashboard } from '../../services/dashboard';
import type { DashboardData } from './types';
type Result =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: DashboardData };
export function useDashboard(session: DemoSession) {
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState<{
    api: DemoSession['api'];
    result: Result;
  }>({ api: session.api, result: { status: 'loading' } });
  useEffect(() => {
    let active = true;
    loadDashboard(session.api, session.permits).then(
      (data) => {
        if (active)
          setResult({ api: session.api, result: { status: 'ready', data } });
      },
      () => {
        if (active)
          setResult({ api: session.api, result: { status: 'error' } });
      },
    );
    return () => {
      active = false;
    };
  }, [session, request]);
  const reload = () => {
    setResult({ api: session.api, result: { status: 'loading' } });
    setRequest((v) => v + 1);
  };
  return {
    result:
      result.api === session.api
        ? result.result
        : ({ status: 'loading' } as const),
    reload,
  };
}
