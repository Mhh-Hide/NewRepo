import {
  CheckCircleFilled,
  CloseCircleFilled,
  ClockCircleOutlined,
  PauseCircleFilled,
  SyncOutlined,
} from '@ant-design/icons';
import type { LifecycleStep } from '../../domain/lifecycle';
import { stepStateLabels } from '../../domain/lifecycle';
export function progressStepItem(step: LifecycleStep) {
  const failed = step.state === 'failed',
    completed = step.state === 'completed',
    held = step.state === 'held';
  const color = failed
    ? '#cf1322'
    : completed
      ? '#389e0d'
      : held
        ? '#595959'
        : step.state === 'not_started'
          ? '#8c8c8c'
          : '#1677ff';
  const icon = failed ? (
    <CloseCircleFilled />
  ) : completed ? (
    <CheckCircleFilled />
  ) : held ? (
    <PauseCircleFilled />
  ) : step.state === 'in_progress' || step.state === 'remediating' ? (
    <SyncOutlined />
  ) : (
    <ClockCircleOutlined />
  );
  return {
    key: step.id,
    title: (
      <span data-progress-step={step.kind} data-progress-phase={step.phase}>
        {step.label}
      </span>
    ),
    content: <span style={{ color }}>{stepStateLabels[step.state]}</span>,
    icon: <span style={{ color }}>{icon}</span>,
    status: (failed
      ? 'error'
      : completed
        ? 'finish'
        : step.state === 'not_started'
          ? 'wait'
          : 'process') as 'error' | 'finish' | 'wait' | 'process',
  };
}
