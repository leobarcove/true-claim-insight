import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient, ApiResponse } from '@/lib/api-client';

export const ingestionKeys = {
  all: ['ingestion'] as const,
  messages: (status?: string) => [...ingestionKeys.all, 'messages', status ?? 'all'] as const,
};

export type InboundMessageStatus =
  | 'PENDING'
  | 'PROCESSED'
  | 'NEEDS_REVIEW'
  | 'FAILED'
  | 'IGNORED';

export interface InboundMessage {
  id: string;
  messageId: string;
  fromAddress: string;
  subject: string | null;
  receivedAt: string;
  status: InboundMessageStatus;
  caseId: string | null;
  error: string | null;
  attempts: number;
  /** Non-identifying extraction only — never claimant contact details. */
  parsed: {
    policyNumber?: string;
    travelClaimType?: string;
    incidentDate?: string;
    flightNumber?: string;
    destination?: string;
    missing?: string[];
  } | null;
  processedAt: string | null;
  case?: { caseNumber: string; status: string } | null;
}

export function useInboundMessages(
  status?: InboundMessageStatus,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ingestionKeys.messages(status),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<{ messages: InboundMessage[] }>>(
        '/ingestion/messages',
        { params: status ? { status } : undefined }
      );
      return data.data.messages;
    },
    // Intake arrives on a five-minute poll, so the queue is only ever a few
    // minutes stale; refetching on focus is enough without hammering it.
    refetchOnWindowFocus: true,
    // The sidebar badge shares this query; gated by the caller's permissions.
    enabled: options?.enabled ?? true,
  });
}

export function useRetryMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<ApiResponse<InboundMessage>>(
        `/ingestion/messages/${id}/retry`
      );
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ingestionKeys.all }),
  });
}

export function useIgnoreMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await apiClient.post<ApiResponse<InboundMessage>>(
        `/ingestion/messages/${id}/ignore`
      );
      return data.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ingestionKeys.all }),
  });
}
