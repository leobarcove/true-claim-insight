/**
 * The staff session the assisted form runs on.
 *
 * Its own keys, never the portal's: this is a separate origin in every
 * environment past local dev, and sharing storage across them is not possible
 * anyway. Cleared on sign-out and whenever the server refuses it.
 *
 * It lives here rather than beside the hooks that use it because `api-client`
 * needs it too — the token refresh has to know which session made the call —
 * and the hooks import `api-client`, so putting it there would close a cycle.
 */
const AGENT_TOKEN_KEY = 'tci.agent.token';
const AGENT_USER_KEY = 'tci.agent.user';

export interface AgentUser {
  id: string;
  fullName: string;
  role: string;
  tenantName: string;
}

export const agentSession = {
  read: () => localStorage.getItem(AGENT_TOKEN_KEY) ?? undefined,
  write: (token: string) => localStorage.setItem(AGENT_TOKEN_KEY, token),
  clear: () => localStorage.removeItem(AGENT_TOKEN_KEY),
  headers: () => {
    const token = localStorage.getItem(AGENT_TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : ({} as Record<string, string>);
  },
};

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
