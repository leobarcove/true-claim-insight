import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaseFlow, FlowStep } from '@tci/shared-types';

import { apiClient } from '@/lib/api-client';
import { createSessionStore } from '@/lib/public-session';

/**
 * The web form's side of the public intake conversation.
 *
 * The same engine as the chat, reached through the same endpoints — but its
 * **own channel** on the server and its own session key here. A visitor on
 * `/form` and the same visitor on `/chat` hold two bindings that never meet, so
 * moving between them starts a fresh claim request with nothing carried over.
 * Sharing a key would put that separation in the database and not in the
 * browser, and "start again" on one page would strand the other's conversation.
 *
 * The one endpoint the chat does not use is `/state`: the chat renders from its
 * transcript, because one question at a time means the newest bubble *is* the
 * state. A form shows a section at once and needs the answers, the flow and
 * which stage it is at, all together.
 */
const session = createSessionStore('tci.webform.session');

export const formStateKey = ['form-state'] as const;

/** Everything the form needs to draw itself. Mirrors the server's shape. */
export interface FormState {
  stage: 'phone' | 'code' | 'consent' | 'claim-type' | 'flow' | 'submitted';
  locale: 'en' | 'ms';
  /** The bot's last message — the form's error text. */
  lastReply: string | null;
  consent?: { title: string; body: string; version: number };
  claimTypes?: FlowStep['choices'];
  case?: {
    id: string;
    caseNumber: string;
    status: string;
    currentStepId: string | null;
    answers: Record<string, string | number | boolean>;
    documents: Array<{
      fileName: string;
      documentType: string;
      stepId: string | null;
      createdAt: string;
    }>;
  };
  flow?: CaseFlow;
}

export interface FormTurn {
  clientMessageId: string;
  text?: string;
  callbackValue?: string;
  callbackStepId?: string;
  storedDocumentId?: string;
  locale?: string;
}

export function useFormState(enabled = true) {
  return useQuery({
    queryKey: formStateKey,
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: FormState }>('/public/conversation/state', {
        headers: session.headers(),
      });
      return ((data as any).data ?? data) as FormState;
    },
    enabled,
    // Nothing arrives unprompted. The form is submit-only: a colleague who
    // needs more will contact the claimant on WhatsApp, never through this
    // page, so there is nothing to poll for.
    refetchOnWindowFocus: false,
  });
}

/**
 * Open the conversation on the **form** channel.
 *
 * `surface=form` is read only when a session is minted; an existing token keeps
 * whatever it was issued as, so a form session cannot be walked onto the chat
 * channel by calling this again.
 */
export function useStartFormConversation() {
  return useMutation({
    mutationFn: async (locale?: string) => {
      const { data } = await apiClient.post<{ data: { session: string } }>(
        '/public/conversation/start',
        {},
        {
          params: { surface: 'form', ...(locale ? { locale } : {}) },
          headers: session.headers(),
        }
      );
      const payload = (data as any).data ?? data;
      // Stored before anything else runs, so the very next request carries it.
      if (payload?.session) session.write(payload.session);
      return payload;
    },
  });
}

/**
 * Send one answer.
 *
 * One per request, in the order the server expects — the same rule the chat
 * follows, and the reason there is no batch endpoint. Everything that makes an
 * answer safe lives on that path: redaction, policy matching, deadline
 * tracking, audit rows and access checks.
 *
 * Returns the turn's own reply rather than writing to the cache. A section
 * sends several of these in sequence and re-reads `/state` once at the end, so
 * publishing each intermediate response would repaint the form mid-section.
 */
export function useSendFormTurn() {
  return useMutation({
    mutationFn: async (turn: FormTurn) => {
      const { data } = await apiClient.post<{ data: unknown }>(
        '/public/conversation/turn',
        turn,
        { headers: session.headers() }
      );
      return (data as any).data ?? data;
    },
  });
}

export async function uploadFormDocument(file: File, documentType: string, stepId: string) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', documentType);
  formData.append('stepId', stepId);
  const { data } = await apiClient.post<{ data: { id: string } }>(
    '/public/conversation/upload',
    formData,
    { headers: { ...session.headers(), 'Content-Type': 'multipart/form-data' } }
  );
  return ((data as any).data ?? data) as { id: string };
}

/** Re-read the whole picture. Called once a section has been accepted. */
export function useRefreshFormState() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: formStateKey });
}

/**
 * Whether this browser holds a session naming a messaging binding rather than a
 * form thread of its own.
 *
 * Read from the session rather than passed in, because the thing it guards —
 * "start again" — is destructive in one case and harmless in the other, and a
 * prop is something a future page can forget to set.
 */
export function isFormChannelSession(): boolean {
  return session.isChannelSession();
}

/**
 * Whether this browser has opened a conversation yet.
 *
 * The gateway answers `/state` with `stage: 'phone'` when it sees no session,
 * because a cleared browser is the ordinary first visit and the right screen to
 * draw is the one asking for a number. That friendliness is a trap for the
 * caller: a truthy state is not evidence that a conversation exists, and
 * treating it as such means `start` never runs, no session is ever minted, and
 * every turn is sent to nobody. The browser's own storage is the only honest
 * answer to "have we begun?".
 */
export function hasFormSession(): boolean {
  return session.read() !== undefined;
}

/** Forget this conversation. Clears the form's key only, never the chat's. */
export function clearFormSession() {
  session.clear();
}
