import { lazy, Suspense } from 'react';
import { LoadingState } from '../components/FeedbackStates';
const ModelPoolPage = lazy(() => import('../features/models/ModelPoolPage'));
const ModelDetailPage = lazy(
  () => import('../features/models/ModelDetailPage'),
);
const ChannelDetailPage = lazy(
  () => import('../features/channels/ChannelDetailPage'),
);
export function ModelPoolRoute() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ModelPoolPage />
    </Suspense>
  );
}
export function ModelDetailRoute() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ModelDetailPage />
    </Suspense>
  );
}
export function ChannelDetailRoute() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ChannelDetailPage />
    </Suspense>
  );
}
