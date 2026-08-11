import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient, ApiResponse } from '@/lib/api-client';

export const conversationKeys = {
  all: ['conversations'] as const,
  list: (mode?: string) => [...conversationKeys.all, 'list', mode ?? 'all'] as const,
  detail: (id: string) => [...conversationKeys.all, 'detail', id] as const,
};

export type ConversationMode = 'BOT' | 'HANDOVER';

/**
 * What the conversation is waiting on — a different question from who is
 * talking. An agent who has replied and is waiting on the claimant is still in
 * HANDOVER, but owes nothing.
 */
export type ConversationStatus = 'BOT' | 'OPEN' | 'PENDING' | 'SNOOZED' | 'RESOLVED';
/** INTERNAL is a note between colleagues. It is never sent to the claimant. */
export type MessageDirection = 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
export type ConversationMessageStatus =
  | 'PENDING'
  | 'PROCESSED'
  | 'ONBOARDING'
  | 'UNPARSEABLE'
  | 'AWAITING_AGENT'
  | 'FAILED';

export interface ConversationMessage {
  id: string;
  direction: MessageDirection;
  text: string | null;
  /** The exact value behind a tapped button; null when the claimant typed. */
  callbackValue: string | null;
  mediaRef: string | null;
  stepId: string | null;
  /**
   * The stored file this turn produced, with the case that owns it — the
   * platform's own `mediaRef` points at their servers and cannot be served.
   */
  attachment: {
    id: string;
    caseId: string;
    fileName: string;
    mimeType: string | null;
    documentType: string;
  } | null;
  /** Null on an outbound message means the bot said it; a value means an agent did. */
  sentByUserId: string | null;
  status: ConversationMessageStatus;
  error: string | null;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  channel: string;
  mode: ConversationMode;
  status: ConversationStatus;
  snoozedUntil: string | null;
  /** When a person first replied. Null means nobody has yet. */
  firstRespondedAt: string | null;
  assignedUserId: string | null;
  handoverAt: string | null;
  handoverReason: string | null;
  lastSeenAt: string;
  claimant: { id: string; fullName: string | null; phoneNumber: string } | null;
  case: { id: string; caseNumber: string; status: string; travelClaimType: string | null } | null;
  lastMessage: {
    text: string | null;
    direction: MessageDirection;
    createdAt: string;
    sentByUserId: string | null;
  } | null;
  /** Inbound messages that arrived during handover and nobody has answered. */
  awaitingAgent: number;
}

export interface ConversationTranscript
  extends Omit<ConversationSummary, 'lastMessage' | 'awaitingAgent'> {
  resolvedAt: string | null;
  messages: ConversationMessage[];
}

export interface AssignableAgent {
  id: string;
  fullName: string;
  role: string;
}

/**
 * Colleagues this conversation can be handed to.
 *
 * Cached for a minute: firm membership changes on the timescale of somebody
 * joining, not of an agent working a queue, and re-fetching it under every
 * assign dropdown would be noise.
 */
export function useAssignableAgents() {
  return useQuery({
    queryKey: [...conversationKeys.all, 'agents'] as const,
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<AssignableAgent[]>>('/conversations/agents');
      return data.data;
    },
    staleTime: 60_000,
  });
}

export function useConversations(mode?: ConversationMode) {
  return useQuery({
    queryKey: conversationKeys.list(mode),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ConversationSummary[]>>('/conversations', {
        params: mode ? { mode } : undefined,
      });
      return data.data;
    },
    // A claimant waiting on a human is waiting in real time, unlike the FNOL
    // queue which arrives on a five-minute poll. Ten seconds is the difference
    // between an inbox and a report.
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: conversationKeys.detail(id || ''),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<ConversationTranscript>>(
        `/conversations/${id}`
      );
      return data.data;
    },
    enabled: !!id,
    // Faster than the list: an agent with the thread open is mid-exchange, and
    // a reply arriving five seconds late reads as the claimant being ignored.
    refetchInterval: 5_000,
  });
}

/** Invalidate both the open thread and the list its badge counts feed. */
function useConversationMutation<TVars>(
  fn: (vars: TVars & { id: string }) => Promise<unknown>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (_data, vars: TVars & { id: string }) => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.detail(vars.id) });
      queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    },
  });
}

export function useTakeOverConversation() {
  return useConversationMutation<{ reason: string }>(async ({ id, reason }) => {
    const { data } = await apiClient.post(`/conversations/${id}/take-over`, { reason });
    return data;
  });
}

export function useReplyToConversation() {
  return useConversationMutation<{ text: string }>(async ({ id, text }) => {
    const { data } = await apiClient.post(`/conversations/${id}/reply`, { text });
    return data;
  });
}

export function useResolveConversation() {
  // No variables beyond the id; the empty object keeps the shared mutation
  // helper's (vars & { id }) shape without an unusable Record<string, never>.
  return useConversationMutation<Record<never, never>>(async ({ id }) => {
    const { data } = await apiClient.post(`/conversations/${id}/resolve`, {});
    return data;
  });
}

export function useAssignConversation() {
  return useConversationMutation<{ assigneeId: string | null }>(async ({ id, assigneeId }) => {
    const { data } = await apiClient.post(`/conversations/${id}/assign`, { assigneeId });
    return data;
  });
}

export function useSetConversationStatus() {
  return useConversationMutation<{
    status: 'OPEN' | 'PENDING' | 'SNOOZED';
    snoozedUntil?: string;
  }>(async ({ id, status, snoozedUntil }) => {
    const { data } = await apiClient.post(`/conversations/${id}/status`, { status, snoozedUntil });
    return data;
  });
}

export function useAddNote() {
  return useConversationMutation<{ text: string }>(async ({ id, text }) => {
    const { data } = await apiClient.post(`/conversations/${id}/notes`, { text });
    return data;
  });
}
