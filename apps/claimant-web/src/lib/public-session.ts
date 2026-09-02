/**
 * Where a public conversation's session token is kept in the browser.
 *
 * Extracted so the web chat and the web form can each own **their own key**.
 * The two are separate channels on the server — a visitor on `/form` and the
 * same visitor on `/chat` hold two bindings that never meet — and sharing one
 * key would put that separation in the database and not in the browser, which
 * is precisely the bug the decision was meant to prevent: "Start again" on one
 * page would silently strand the other's conversation, and staff would see two
 * threads for one person with no explanation.
 *
 * `localStorage` rather than a cookie so a reload resumes and "start again" is
 * a client-side act. The token names a conversation and grants nothing: the
 * binding behind it carries no claimant until a code is verified, and every
 * claim read is scoped by that claimant.
 */

export interface SessionStore {
  read: () => string | undefined;
  write: (session: string) => void;
  clear: () => void;
  /** `X-Web-Session`, or nothing when this browser holds no session yet. */
  headers: () => Record<string, string>;
  /**
   * Whether the stored session names a *messaging* binding rather than a web
   * thread of its own — a Telegram Mini App launch, today.
   *
   * Read from the session rather than passed down as a prop, because the thing
   * it guards ("start again") is destructive in one case and harmless in the
   * other, and a prop is something a future page can forget to set.
   */
  isChannelSession: () => boolean;
}

export function createSessionStore(key: string): SessionStore {
  const read = () => localStorage.getItem(key) ?? undefined;

  return {
    read,
    write: session => localStorage.setItem(key, session),
    clear: () => localStorage.removeItem(key),
    headers: () => {
      const session = read();
      return session ? { 'X-Web-Session': session } : ({} as Record<string, string>);
    },
    isChannelSession: () => (read() ?? '').startsWith('tg:'),
  };
}
