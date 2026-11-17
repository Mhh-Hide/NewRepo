import { useOutletContext } from 'react-router-dom';
import type { DemoSession } from '../../services/demo-session';
import { WorkInbox } from './WorkInbox';
import { PageHeader } from '../../components/PageHeader';
export function TasksRoute() {
  const session = useOutletContext<DemoSession>();
  return (
    <>
      <PageHeader title="我的任务" group="业务协同" description="" />
      <WorkInbox session={session} />
    </>
  );
}
