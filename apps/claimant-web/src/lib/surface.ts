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
 * Which host that is comes from the build (VITE_AGENT_HOSTS), falling back to
 * the `agent.` convention. Both are fixed when the bundle is compiled, so the
 * answer is not something a running page can be talked into changing.
 *
 * Locally there is one host and no edge, so the path stands in. That is not a
 * weakening: nothing is granted by being on `/agent`, because every request it
 * makes carries a staff bearer token the server checks for itself. The path
 * chooses which screens to draw; the token is what decides whether anything
 * happens.
 */

/**
 * Hostnames that serve the agent surface, named exactly, baked in at build
 * time — comma-separated in VITE_AGENT_HOSTS.
 *
 * The prefix rule below is a convention, not a law, and a deployment whose DNS
 * groups its names another way (`tci-agent.example.com`, say) would fail it
 * silently: the check returns 'claimant', the agent is served the public form,
 * and nothing anywhere reports an error. Naming the host removes the guess.
 *
 * Exact equality, never `includes` or a suffix test: `agent.example.com.evil`
 * must not match, and neither must `not-agent.example.com`.
 */
const CONFIGURED_AGENT_HOSTS: readonly string[] = (import.meta.env.VITE_AGENT_HOSTS ?? '')
  .split(',')
  .map((host: string) => host.trim().toLowerCase())
  .filter((host: string) => host.length > 0);

/**
 * The default convention, kept so a deployment that follows it needs no build
 * configuration at all. Matched as a prefix on the leftmost label only.
 */
const AGENT_HOST_PREFIX = 'agent.';

export type Surface = 'claimant' | 'agent';

export function surfaceFor(location: { hostname: string; pathname: string }): Surface {
  const hostname = location.hostname.toLowerCase();

  if (CONFIGURED_AGENT_HOSTS.includes(hostname)) return 'agent';
  if (hostname.startsWith(AGENT_HOST_PREFIX)) return 'agent';

  // Local development only, and only on a host that has said nothing: one host,
  // no edge, so the path stands in. A real deployment never reaches this line,
  // because the hostname above has already answered.
  //
  // `*.localhost` is deliberately NOT here. claim.localhost is a name that has
  // already chosen a surface, so letting /agent override it would give the
  // local names a behaviour the deployed ones do not have — and the whole point
  // of using them locally is that they behave the same. Bare localhost keeps
  // the fallback, because there the path is the only thing that can choose.
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  return local && location.pathname.startsWith('/agent') ? 'agent' : 'claimant';
}

export const currentSurface = (): Surface => surfaceFor(window.location);
