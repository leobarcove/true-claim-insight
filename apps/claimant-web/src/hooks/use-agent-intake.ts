import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CaseFlow } from '@tci/shared-types';

import { apiClient } from '@/lib/api-client';

/**
 * The agent-assisted side of the form.
 *
 * The same six sections a claimant fills in, reached from a staff address and
 * driven through the **authenticated per-case endpoints** — the ones the
 * logged-in claimant app already uses. There is no `/agent/intakes/*` family
 * and there should not be: `POST /cases`, `PATCH /cases/:id/answers`,
 * `POST /cases/:id/documents/upload` and `POST /cases/:id/submit` already carry
 * the consent gate, per-step validation against the pinned flow, answer
 * redaction, policy promotion and audit rows, and their role list is exactly
 * the one agent-assisted intake was given.
 *
 * That also makes this path simpler than the public one. `PATCH answers` takes
 * a step id and a value, so there is no server-owned cursor to move first, no
 * `__edit` turns, and no per-conversation rate limit to pace against. The
 * public form needs the submit engine; this needs a loop.
 */

const AGENT_TOKEN_KEY = 'tci.agent.token';

/**
 * The staff session, kept where the form can find it.
 *
 * Its own key, never the portal's: this is a separate origin in every
 * environment past local dev, and sharing storage across them is not possible
 * anyway. Cleared on sign-out and whenever the server refuses it.
 */
export const agentSession = {
  read: () => localStorage.getItem(AGENT_TOKEN_KEY) ?? undefined,
  write: (token: string) => localStorage.setItem(AGENT_TOKEN_KEY, token),
  clear: () => localStorage.removeItem(AGENT_TOKEN_KEY),
  headers: () => {
    const token = localStorage.getItem(AGENT_TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>);
  },
};

export interface AgentUser {
  id: string;
  fullName: string;
  role: string;
  tenantName: string;
}

const AGENT_USER_KEY = 'tci.agent.user';

export const agentUser = {
  read: (): AgentUser | null => {
    try {
      const raw = localStorage.getItem(AGENT_USER_KEY);
      return raw ? (JSON.parse(raw) as AgentUser) : null;
    } catch {
      return null;
    }
  },
  write: (user: AgentUser) => localStorage.setItem(AGENT_USER_KEY, JSON.stringify(user)),
  clear: () => localStorage.removeItem(AGENT_USER_KEY),
};

/** Step one of sign-in: a code to the agent's *own* number. */
export function useAgentSendCode() {
  return useMutation({
    mutationFn: async (phoneNumber: string) => {
      const { data } = await apiClient.post<{ data: { expiresIn: number; code?: string } }>(
        '/auth/staff/send-code',
        { phoneNumber }
      );
      return (data as any).data ?? data;
    },
  });
}

/** Step two: the code, and a session that survives the fortnight. */
export function useAgentVerifyCode() {
  return useMutation({
    mutationFn: async (input: { phoneNumber: string; code: string; keepSignedIn: boolean }) => {
      const { data } = await apiClient.post<{ data: any }>('/auth/staff/verify-code', input);
      const payload = (data as any).data ?? data;

      agentSession.write(payload.tokens.accessToken);
      agentUser.write({
        id: payload.user.id,
        fullName: payload.user.fullName,
        role: payload.user.role,
        tenantName: payload.user.tenantName ?? '',
      });
      return payload;
    },
  });
}

export interface ResolvedClaimant {
  id: string;
  phoneNumber: string;
  fullName: string | null;
  nricLast4: string | null;
  /** True when we already held a record — the agent should not re-key a name. */
  existing: boolean;
}

/**
 * Who this claim is for, whether or not a record exists for them yet.
 *
 * The lookup screen works in this shape rather than in `ResolvedClaimant`,
 * because before consent is attested there is deliberately nothing with an id:
 * the agent has typed a number, a name and an IC, and none of it has been
 * written. `id` fills in at the moment consent is recorded.
 */
export interface ClaimSubject {
  phoneNumber: string;
  fullName: string | null;
  nric: string | null;
  nricLast4: string | null;
  /** The record's id, once there is a record. Null until consent is attested. */
  id: string | null;
  /** True when we already held this person when we looked. */
  existing: boolean;
}

export interface ClaimantLookup {
  existing: boolean;
  /**
   * Which field found them.
   *
   * An IC identifies a person and a phone number identifies a handset, so the
   * IC wins — which means a claimant can be found on a number that is not the
   * one we hold for them. The screen has to say so, or an agent attaches a
   * claim to a record the firm will later ring on a different number.
   */
  matchedOn?: 'phone' | 'nric';
  claimant: ResolvedClaimant | null;
}

/**
 * Whether we already hold this person. Writes nothing.
 *
 * What **Find claimant** calls. It used to call `resolve` below, which creates
 * — so a mistyped digit left a claimant row behind, and the row held a name and
 * an IC that had been stored before anybody consented to storing them.
 */
export function useLookupClaimant() {
  return useMutation({
    mutationFn: async (input: { phoneNumber: string; nric?: string }) => {
      const { data } = await apiClient.post<{ data: ClaimantLookup }>(
        '/claimants/lookup',
        input,
        { headers: agentSession.headers() }
      );
      return ((data as any).data ?? data) as ClaimantLookup;
    },
  });
}

/**
 * Who this claim is for. Finds the claimant, or creates one.
 *
 * Called once, from the declaration screen, as the first of the three writes
 * that consent authorises — the claimant, the consent row and the case. Never
 * from the lookup screen: see `useLookupClaimant`.
 */
export function useResolveClaimant() {
  return useMutation({
    mutationFn: async (input: { phoneNumber: string; fullName?: string; nric?: string }) => {
      const { data } = await apiClient.post<{ data: ResolvedClaimant }>(
        '/claimants/resolve',
        input,
        { headers: agentSession.headers() }
      );
      return ((data as any).data ?? data) as ResolvedClaimant;
    },
  });
}

export interface ConsentNotice {
  title: string;
  body: string;
  version: number | string;
  locale?: string;
  approvedAt?: string;
}

/**
 * The approved notice, fetched rather than reproduced.
 *
 * The agent has to read this to the claimant word for word, and consent is
 * recorded against the exact approved version — so a copy written into this
 * page would be a second source that drifts, and the day it drifts the consent
 * on file is against wording nobody heard. Telling the agent to find it
 * somewhere else was the same problem wearing a different hat: there is no
 * claimant screen in front of them.
 */
export function useConsentNotice(locale = 'en') {
  return useQuery({
    queryKey: ['consent-notice', locale] as const,
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: ConsentNotice }>('/consent/notice', {
        params: { purpose: 'CLAIM_PROCESSING', locale },
        headers: agentSession.headers(),
      });
      return ((data as any).data ?? data) as ConsentNotice;
    },
  });
}

export type InteractionChannel = 'PHONE' | 'IN_PERSON' | 'VIDEO' | 'OTHER';

/**
 * Record the verbal consent the agent is attesting to.
 *
 * Must succeed before a case can be opened — `CasesService.create` refuses
 * without a live consent, which is what makes the declaration a gate rather
 * than a formality. `capturedByUserId` comes from the caller's own token on the
 * server, never from here: who attested is a fact about who acted.
 */
export function useAttestConsent() {
  return useMutation({
    mutationFn: async (input: {
      claimantId: string;
      interactionChannel: InteractionChannel;
      interactionReference?: string;
    }) => {
      const { data } = await apiClient.post<{ data: unknown }>(
        `/consent/claimant/${input.claimantId}/grant`,
        {
          purpose: 'CLAIM_PROCESSING',
          capturedVia: 'VERBAL_AGENT_ATTESTED',
          attestation: {
            interactionChannel: input.interactionChannel,
            interactionReference: input.interactionReference || undefined,
          },
        },
        { headers: agentSession.headers() }
      );
      return (data as any).data ?? data;
    },
  });
}

/**
 * Open the claim request.
 *
 * `routeAsClaimant` is the whole reason this is not an ordinary staff case: the
 * claim belongs in the handling adjusting firm's queue, exactly as if the
 * claimant had used the form themselves. Without it an insurer's agent drops it
 * into the insurer's own queue, where the adjusters who do the work cannot see
 * it.
 */
export function useCreateAssistedCase() {
  return useMutation({
    mutationFn: async (input: { claimantId: string; travelClaimType: string }) => {
      const { data } = await apiClient.post<{ data: { id: string; caseNumber: string } }>(
        '/cases',
        { ...input, channel: 'STAFF', initiatedBy: 'STAFF', routeAsClaimant: true },
        { headers: agentSession.headers() }
      );
      return (data as any).data ?? data;
    },
  });
}

export interface AssistedCase {
  id: string;
  caseNumber: string;
  status: string;
  currentStepId: string | null;
  answers: Record<string, string | number | boolean>;
  documents: Array<{ id: string; fileName: string; stepId: string | null }>;
}

export const assistedCaseKey = (caseId: string) => ['assisted-case', caseId] as const;

/** The case and its pinned flow — the same pair the form reads for a claimant. */
export function useAssistedCase(caseId: string | null) {
  return useQuery({
    queryKey: assistedCaseKey(caseId ?? ''),
    enabled: Boolean(caseId),
    queryFn: async () => {
      const [caseResponse, flowResponse] = await Promise.all([
        apiClient.get<{ data: AssistedCase }>(`/cases/${caseId}`, {
          headers: agentSession.headers(),
        }),
        apiClient.get<{ data: CaseFlow }>(`/cases/${caseId}/flow`, {
          headers: agentSession.headers(),
        }),
      ]);
      return {
        case: ((caseResponse.data as any).data ?? caseResponse.data) as AssistedCase,
        flow: ((flowResponse.data as any).data ?? flowResponse.data) as CaseFlow,
      };
    },
  });
}

export interface AnswerOutcome {
  accepted: boolean;
  /** The flow's own message when it refuses — shown under that field. */
  error?: string;
}

/**
 * One answer.
 *
 * The server validates against the pinned flow and answers `accepted: false`
 * with the reason rather than throwing, so a bad date is an ordinary outcome
 * and not an exception to catch.
 */
export function useSaveAssistedAnswer() {
  return useMutation({
    mutationFn: async (input: { caseId: string; stepId: string; value: string }) => {
      const { data } = await apiClient.patch<{ data: AnswerOutcome }>(
        `/cases/${input.caseId}/answers`,
        { stepId: input.stepId, value: input.value },
        { headers: agentSession.headers() }
      );
      return ((data as any).data ?? data) as AnswerOutcome;
    },
  });
}

export async function uploadAssistedDocument(
  caseId: string,
  file: File,
  documentType: string,
  stepId: string
) {
  const formData = new FormData();
  formData.append('type', documentType);
  formData.append('stepId', stepId);
  formData.append('file', file);
  const { data } = await apiClient.post<{ data: { id: string } }>(
    `/cases/${caseId}/documents/upload`,
    formData,
    { headers: { ...agentSession.headers(), 'Content-Type': 'multipart/form-data' } }
  );
  return ((data as any).data ?? data) as { id: string };
}

export function useSubmitAssistedCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (caseId: string) => {
      const { data } = await apiClient.post<{ data: { caseNumber: string; status: string } }>(
        `/cases/${caseId}/submit`,
        {},
        { headers: agentSession.headers() }
      );
      return (data as any).data ?? data;
    },
    onSuccess: (_result, caseId) =>
      queryClient.invalidateQueries({ queryKey: assistedCaseKey(caseId) }),
  });
}

export function useRefreshAssistedCase(caseId: string | null) {
  const queryClient = useQueryClient();
  return () =>
    caseId
      ? queryClient.invalidateQueries({ queryKey: assistedCaseKey(caseId) })
      : Promise.resolve();
}

/** Sign out. Clears the staff session only; no claimant data lives here. */
export function agentSignOut() {
  agentSession.clear();
  agentUser.clear();
}
