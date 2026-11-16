import { lazy, Suspense } from 'react';
import { LoadingState } from '../components/FeedbackStates';
const RolePerspectivesPage = lazy(
  () => import('../features/roles/RolePerspectivesPage'),
);
export function RolePerspectivesRoute() {
  return (
    <Suspense fallback={<LoadingState />}>
      <RolePerspectivesPage />
    </Suspense>
  );
}
