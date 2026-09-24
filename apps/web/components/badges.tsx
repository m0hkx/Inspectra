import { humanize, isOverdue } from '@/lib/format';
import type { AssetStatus, Inspection, IssueStatus, Severity, WorkOrderStatus } from '@/lib/types';
import { Status, type Tone } from './ui';

const severityTone: Record<Severity, Tone> = {
  LOW: 'neutral',
  MEDIUM: 'caution',
  HIGH: 'danger',
  CRITICAL: 'critical',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Status tone={severityTone[severity]}>{humanize(severity)}</Status>;
}

export const workOrderTone: Record<WorkOrderStatus, Tone> = {
  OPEN: 'info',
  IN_PROGRESS: 'caution',
  ON_HOLD: 'neutral',
  COMPLETED: 'pending',
  VERIFIED: 'safe',
  CANCELLED: 'neutral',
};

export const workOrderLabel: Record<WorkOrderStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold',
  COMPLETED: 'Awaiting verification',
  VERIFIED: 'Verified',
  CANCELLED: 'Cancelled',
};

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  return <Status tone={workOrderTone[status]}>{workOrderLabel[status]}</Status>;
}

const issueTone: Record<IssueStatus, Tone> = { OPEN: 'danger', IN_WORK: 'caution', RESOLVED: 'safe' };

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return <Status tone={issueTone[status]}>{humanize(status)}</Status>;
}

export function inspectionTone(inspection: Inspection): Tone {
  if (inspection.status === 'SUBMITTED') return 'safe';
  return isOverdue(inspection) ? 'danger' : 'info';
}

export function InspectionStatusBadge({ inspection }: { inspection: Inspection }) {
  const tone = inspectionTone(inspection);
  return <Status tone={tone}>{tone === 'safe' ? 'Submitted' : tone === 'danger' ? 'Overdue' : 'Due'}</Status>;
}

const assetTone: Record<AssetStatus, Tone> = { ACTIVE: 'safe', OUT_OF_SERVICE: 'danger', RETIRED: 'neutral' };

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  return <Status tone={assetTone[status]}>{humanize(status)}</Status>;
}
