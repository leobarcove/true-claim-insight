import { useQuery } from '@tanstack/react-query';

import { apiClient, ApiResponse } from '@/lib/api-client';

export const slaKeys = {
  all: ['sla'] as const,
  forClaim: (claimId: string) => [...slaKeys.all, 'claim', claimId] as const,
};

export type SlaStage =
  | 'ACK_TO_INSURER'
  | 'PRELIMINARY_REPORT'
  | 'FINAL_REPORT'
  | 'SUPPLEMENTARY_CLAIM'
  | 'INSURER_DECISION'
  | 'INSURER_PAYMENT';

export type SlaClockState = 'RUNNING' | 'PAUSED' | 'MET' | 'BREACHED';

export interface SlaClock {
  id: string;
  stage: SlaStage;
  state: SlaClockState;
  startedAt: string;
  dueAt: string;
  pausedAt: string | null;
  /** Banked when the clock paused, so a pause never silently consumes time. */
  remainingWorkingDaysAtPause: number | null;
  pauseReason: string | null;
  stoppedAt: string | null;
  breachedAt: string | null;
  escalationLevel: number;
  policy: {
    workingDays: number;
    warnWorkingDaysBefore: number;
    calendarState: string | null;
    /** Insurer-side obligations: measured and reported, never escalated against the firm. */
    monitorOnly: boolean;
  };
}

/**
 * The CSP clocks on one claim.
 *
 * They have run since Phase 1b with nothing reading them — a breach was
 * recorded, escalated and shown to nobody. Turnaround is the product for a TPA,
 * so the person working the file is the last person who should have to ask.
 */
export function useClaimSla(claimId?: string) {
  return useQuery({
    queryKey: slaKeys.forClaim(claimId ?? ''),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SlaClock[]>>(`/sla/claims/${claimId}`);
      return response.data?.data ?? [];
    },
    enabled: Boolean(claimId),
  });
}
