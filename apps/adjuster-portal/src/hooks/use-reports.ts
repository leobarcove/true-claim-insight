import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient, ApiResponse } from '@/lib/api-client';
import { slaKeys } from '@/hooks/use-sla';

export const reportKeys = {
  all: ['reports'] as const,
  forClaim: (claimId: string) => [...reportKeys.all, 'claim', claimId] as const,
  template: (type: ReportType) => [...reportKeys.all, 'template', type] as const,
};

export type ReportType = 'PRELIMINARY' | 'INTERIM' | 'FINAL' | 'SUPPLEMENTARY';
export type ReportStatus = 'DRAFT' | 'IN_REVIEW' | 'SIGNED' | 'ISSUED' | 'WITHDRAWN';

export interface ReportSectionTemplate {
  key: string;
  heading: string;
  mandatory: boolean;
  guidance: string;
  /** The PD paragraph this section discharges, shown beside it. */
  regulatoryBasis?: string;
}

export interface ReportSectionContent {
  body: string;
  /** Per section, not per report: what matters is which conclusion AI touched. */
  aiAssisted?: boolean;
}

export interface AdjusterReport {
  id: string;
  claimId: string;
  type: ReportType;
  status: ReportStatus;
  version: number;
  sections: Record<string, ReportSectionContent>;
  authorAdjusterId: string;
  signedByAdjusterId: string | null;
  countersignBasis: string | null;
  quantumWorksheetId: string | null;
  submittedAt: string | null;
  signedAt: string | null;
  issuedAt: string | null;
}

export function useClaimReports(claimId?: string) {
  return useQuery({
    queryKey: reportKeys.forClaim(claimId ?? ''),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<AdjusterReport[]>>(
        `/reports/claim/${claimId}`
      );
      return response.data?.data ?? [];
    },
    enabled: Boolean(claimId),
  });
}

export function useReportTemplate(type: ReportType) {
  return useQuery({
    queryKey: reportKeys.template(type),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<ReportSectionTemplate[]>>(
        `/reports/template?type=${type}`
      );
      return response.data?.data ?? [];
    },
  });
}

/**
 * Mutations against one claim's reports.
 *
 * Every one invalidates the claim's report list rather than patching a cache
 * entry: the server decides the resulting status, and several of these
 * transitions can legitimately refuse — a junior's report needs a senior's
 * signature, an issued report is immutable. Reading the answer back is the only
 * way the screen stays honest about what happened.
 */
export function useReportActions(claimId?: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: reportKeys.forClaim(claimId ?? '') });
    // Issuing discharges the reporting clock, so the turnaround panel beside
    // this one is stale the moment the report goes out.
    queryClient.invalidateQueries({ queryKey: slaKeys.forClaim(claimId ?? '') });
  };

  const create = useMutation({
    mutationFn: async (type: ReportType) => {
      const response = await apiClient.post(`/reports/claim/${claimId}`, { type });
      return response.data?.data ?? response.data;
    },
    onSuccess: invalidate,
  });

  const saveSections = useMutation({
    mutationFn: async (input: { id: string; sections: Record<string, ReportSectionContent> }) => {
      const response = await apiClient.patch(`/reports/${input.id}/sections`, {
        sections: input.sections,
      });
      return response.data?.data ?? response.data;
    },
    onSuccess: invalidate,
  });

  const act = useMutation({
    mutationFn: async (input: {
      id: string;
      action: 'submit' | 'sign' | 'issue' | 'return' | 'withdraw' | 'refresh-quantum';
      body?: unknown;
    }) => {
      const response = await apiClient.post(`/reports/${input.id}/${input.action}`, input.body ?? {});
      return response.data?.data ?? response.data;
    },
    onSuccess: invalidate,
  });

  return { create, saveSections, act };
}
