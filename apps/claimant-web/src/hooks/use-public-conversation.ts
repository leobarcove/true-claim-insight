import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';
import type { Conversation } from './use-conversation';

/**
 * The public intake conversation — no login, no account.
 *
 * The authenticated twin in `use-conversation.ts` resolves the claimant from
 * their token. Here there is no token and no claimant: the server issues an
 * opaque session on the first call, this hook keeps it, and the conversation
 * itself asks for a mobile number and verifies it with a code.
 *
 * The session is stored in localStorage rather than a cookie so it survives a
 * reload, and so "start again" is a client-side action. It names a
 * conversation and grants nothing: until a code is verified the thread behind
 * it is attached to no claimant and can see no claim.
 */
const SESSION_KEY = 'tci.webchat.session';

export const publicConversationKey = ['public-conversation'] as const;

const readSession = () => localStorage.getItem(SESSION_KEY) ?? undefined;

const sessionHeaders = () => {
  const session = readSession();
  return session ? { 'X-Web-Session': session } : {};
};

export function usePublicConversation(enabled = true) {
  return useQuery({
    queryKey: publicConversationKey,
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Conversation }>('/public/conversation', {
        headers: sessionHeaders(),
      });
      return (data as any).data ?? data;
    },
    enabled,
    // Same reasoning as the authenticated hook: a turn returns the new
    // transcript, so polling is only needed once a person has taken over.
    refetchInterval: query => (query.state.data?.withAgent ? 5_000 : false),
    refetchOnWindowFocus: true,
  });
}

export function useStartPublicConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (locale?: string) => {
      const { data } = await apiClient.post<{ data: { session: string; conversation: Conversation } }>(
        '/public/conversation/start',
        {},
        { params: locale ? { locale } : undefined, headers: sessionHeaders() }
      );
      const payload = (data as any).data ?? data;
      // Stored before the transcript is published to the cache, so the very
      // next request already carries it. The other order loses the first turn
      // of a brand-new conversation.
      if (payload?.session) localStorage.setItem(SESSION_KEY, payload.session);
      return payload?.conversation as Conversation;
    },
    onSuccess: conversation => queryClient.setQueryData(publicConversationKey, conversation),
  });
}

export function useSendPublicTurn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (turn: {
      clientMessageId: string;
      text?: string;
      callbackValue?: string;
      callbackStepId?: string;
      storedDocumentId?: string;
    }) => {
      const { data } = await apiClient.post<{ data: Conversation }>(
        '/public/conversation/turn',
        turn,
        { headers: sessionHeaders() }
      );
      return ((data as any).data ?? data) as Conversation;
    },
    onSuccess: conversation => queryClient.setQueryData(publicConversationKey, conversation),
  });
}

/**
 * Attach evidence to the visitor's open claim.
 *
 * Same two-step shape as the authenticated app: the bytes go to an endpoint
 * that validates and stores them, and only the resulting id is named on a
 * turn. The session header is the authorisation — the server refuses unless
 * the binding behind it has a verified claimant and an open case.
 */
export async function uploadPublicDocument(file: File, documentType: string, stepId: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', documentType);
  formData.append('stepId', stepId);
  const { data } = await apiClient.post<{ data: { id: string } }>(
    '/public/conversation/upload',
    formData,
    { headers: { ...sessionHeaders(), 'Content-Type': 'multipart/form-data' } }
  );
  return (data as any).data ?? data;
}

/** Forget this conversation — the claimant asked to start over. */
export function clearPublicSession() {
  localStorage.removeItem(SESSION_KEY);
}
