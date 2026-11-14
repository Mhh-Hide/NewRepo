import { lazy, Suspense } from 'react';
import { LoadingState } from '../components/FeedbackStates';
const TestingPage = lazy(() => import('../features/testing/TestingPage'));
export function TestingRoute() {
  return (
    <Suspense fallback={<LoadingState />}>
      <TestingPage />
    </Suspense>
  );
}
