/**
 * Which surface this browser is on: the claimant's form, or the agent's.
 *
 * **The door decides, never the page.** Whether the claimant's phone code is
 * required is settled by where the app was served from and what session it
 * carries — never by a field, flag or query parameter the client can set. A
 * form that could declare itself assisted is a form in which anyone can start a
 * claim against any number they can type, and the code sent to the claimant's
 * own phone is the only control standing in the way of exactly that.
 *
 * So the agent surface is recognised by its **host** from staging onwards: one
 * DNS record and one more Caddy block pointing at the same build. A claimant
 * cannot reach it because it is not an address they can open, and it can be
 * locked down further later — office IP, VPN — without touching the public
 * form.
 *
 * Locally there is one host and no edge, so the path stands in. That is not a
 * weakening: nothing is granted by being on `/agent`, because every request it
 * makes carries a staff bearer token the server checks for itself. The path
 * chooses which screens to draw; the token is what decides whether anything
 * happens.
 */

/** Hosts that serve the agent surface. Matched exactly, never by substring. */
const AGENT_HOST_PREFIX = 'agent.';

export type Surface = 'claimant' | 'agent';

export function surfaceFor(location: { hostname: string; pathname: string }): Surface {
  if (location.hostname.startsWith(AGENT_HOST_PREFIX)) return 'agent';

  // Local development only: one host, no edge, so the path selects the surface.
  // A real deployment never reaches this line, because the hostname above has
  // already answered.
  const local =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname.endsWith('.localhost');

  return local && location.pathname.startsWith('/agent') ? 'agent' : 'claimant';
}

export const currentSurface = (): Surface => surfaceFor(window.location);
