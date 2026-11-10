import type { OfficeBusinessEvent, OfficeStatusEvent } from '@synectra/contracts';

export function eventStatus(event: OfficeBusinessEvent | OfficeStatusEvent) {
  if ('type' in event && event.type === 'app_job_completed') return event.statusSnapshot;
  return event.status;
}
