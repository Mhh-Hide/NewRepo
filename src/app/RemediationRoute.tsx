import { lazy, Suspense } from 'react';
import { LoadingState } from '../components/FeedbackStates';
const RemediationPage = lazy(
  () => import('../features/remediations/RemediationPage'),
);
export function RemediationRoute() {
  return (
    <Suspense fallback={<LoadingState />}>
      <RemediationPage />
    </Suspense>
  );
}
