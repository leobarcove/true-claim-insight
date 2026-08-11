import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FlowStep } from '@tci/shared-types';

import { apiClient, ApiResponse } from '@/lib/api-client';

/**
 * The claimant's side of the intake conversation.
 *
 * There is no flow logic here on purpose. The server says what has been said
 * and what is being asked; this app renders it and posts back what the person
 * did. The previous version worked out the next question in the browser, which
 * meant every rule existed twice and only one copy ever got fixed.
 */

export interface ConversationMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  text: string | null;
  stepId: string | null;
  /** A person wrote this, not the bot. Worth showing — it changes what to expect. */
  fromAgent: boolean;
  createdAt: string;
}

export interface Conversation {
  bindingId: string;
  /** A colleague has taken over; the bot has stood down. */
  withAgent: boolean;
  caseId: string | null;
  /** The open question, or null when nothing is being asked. */
  currentStep: FlowStep | null;
  messages: ConversationMessage[];
}

export const conversationKey = ['claimant-conversation'] as const;

export function useConversation(enabled = true) {
  return useQuery({
    queryKey: conversationKey,
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<Conversation>>('/conversation');
      return data.data;
    },
    enabled,
    /**
     * Polled, because a human may join at any moment and the claimant should
     * not have to reload to hear them. Five seconds matches the adjuster
     * portal's open-thread interval, so neither side waits noticeably longer
     * than the other.
     *
     * Stopped once nobody is going to say anything unprompted: while the bot
     * is asking a question, the only thing that will change the thread is this
     * claimant answering it, and polling for our own action is pure noise.
     */
    refetchInterval: query => (query.state.data?.withAgent ? 5_000 : false),
    refetchOnWindowFocus: true,
  });
}

export function useStartConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (locale?: string) => {
      const { data } = await apiClient.post<ApiResponse<Conversation>>('/conversation/start', null, {
        params: locale ? { locale } : undefined,
      });
      return data.data;
    },
    onSuccess: data => queryClient.setQueryData(conversationKey, data),
  });
}

export interface TurnInput {
  /** Makes a retry safe: the server dedupes on it rather than answering twice. */
  clientMessageId: string;
  text?: string;
  callbackValue?: string;
  callbackStepId?: string;
  storedDocumentId?: string;
}

export function useSendTurn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (turn: TurnInput) => {
      const { data } = await apiClient.post<ApiResponse<Conversation>>('/conversation/turn', turn);
      return data.data;
    },
    // The response is the whole thread, so the reply lands without a second
    // request. Set rather than invalidated: refetching here would show the
    // claimant their own message disappear and come back.
    onSuccess: data => queryClient.setQueryData(conversationKey, data),
  });
}

/**
 * A per-turn id the server can dedupe on.
 *
 * `crypto.randomUUID` where it exists, which is everywhere the PWA runs except
 * a plain-HTTP origin on older Safari — hence the fallback rather than a bare
 * call. Charset stays within what the API accepts: it becomes part of a key,
 * and anything else is rejected.
 */
export function newTurnId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
