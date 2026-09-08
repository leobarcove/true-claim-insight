import { afterEach, describe, expect, it, vi } from 'vitest';

import { surfaceFor } from './surface';

/**
 * The configured-host list is read once, at module load, so a test cannot stub
 * the value and re-call the same import — it has to load the module again.
 */
async function surfaceForWithAgentHosts(configured: string) {
  vi.stubEnv('VITE_AGENT_HOSTS', configured);
  vi.resetModules();
  const reloaded = await import('./surface');
  return reloaded.surfaceFor;
}

/**
 * SECURITY-ADJACENT TEST — the door decides, never the page.
 *
 * The agent surface skips the code sent to the claimant's phone, which is the
 * only control standing between a stranger and a claim filed against any number
 * they can type. What replaces it is that the agent has proved *their own*
 * number and holds a staff token the server checks.
 *
 * So the one thing this must never do is let a *claimant-reachable* address
 * select the agent surface. On a real deployment that is a hostname; locally it
 * is a path, and locally is the only place a path is ever consulted.
 */
describe('which surface a browser is on', () => {
  const at = (hostname: string, pathname = '/form') => surfaceFor({ hostname, pathname });

  describe('a real deployment', () => {
    it('serves the agent surface on its own host', () => {
      expect(at('agent.claims.example.my', '/form')).toBe('agent');
    });

    it('serves the claimant surface everywhere else', () => {
      expect(at('claims.example.my', '/form')).toBe('claimant');
      expect(at('tci-app.smitherytech.com', '/form')).toBe('claimant');
    });

    /**
     * The failure that matters. A path is something a claimant can type, so on
     * a public host it must decide nothing at all — otherwise anyone could
     * reach the surface that skips the phone check simply by navigating to it.
     */
    it('ignores the path on a public host, whatever it says', () => {
      expect(at('claims.example.my', '/agent')).toBe('claimant');
      expect(at('claims.example.my', '/agent/anything')).toBe('claimant');
      expect(at('tci-app.smitherytech.com', '/agent')).toBe('claimant');
    });

    it('is not fooled by a host that merely contains the word', () => {
      expect(at('my-agent-claims.example.my', '/agent')).toBe('claimant');
      expect(at('claims.example.my/agent.', '/form')).toBe('claimant');
    });
  });

  /**
   * A deployment whose DNS does not follow the `agent.` convention names the
   * host at build time instead. The risk this introduces is a matching rule
   * loose enough to accept a host the deployment did not name — so these check
   * the rejections at least as hard as the acceptance.
   */
  describe('a deployment that names its agent host', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it('serves the agent surface on the named host', async () => {
      const at = await surfaceForWithAgentHosts('tci-agent.smitherytech.com');
      expect(at({ hostname: 'tci-agent.smitherytech.com', pathname: '/form' })).toBe('agent');
    });

    it('still serves claimants on the other hosts of the same deployment', async () => {
      const at = await surfaceForWithAgentHosts('tci-agent.smitherytech.com');
      expect(at({ hostname: 'tci-claim.smitherytech.com', pathname: '/form' })).toBe('claimant');
      expect(at({ hostname: 'tci.smitherytech.com', pathname: '/form' })).toBe('claimant');
    });

    it('ignores the path there too, exactly as on any public host', async () => {
      const at = await surfaceForWithAgentHosts('tci-agent.smitherytech.com');
      expect(at({ hostname: 'tci-claim.smitherytech.com', pathname: '/agent' })).toBe('claimant');
    });

    /**
     * The failure that would matter. A suffix or `includes` test would hand the
     * agent surface to a host an attacker controls — `…smitherytech.com.evil.io`
     * ends with nothing we own, but it *contains* the name we do.
     */
    it('matches the whole hostname, not a part of it', async () => {
      const at = await surfaceForWithAgentHosts('tci-agent.smitherytech.com');
      expect(at({ hostname: 'tci-agent.smitherytech.com.evil.io', pathname: '/form' })).toBe(
        'claimant'
      );
      expect(at({ hostname: 'not-tci-agent.smitherytech.com', pathname: '/form' })).toBe(
        'claimant'
      );
      expect(at({ hostname: 'tci-agent.smitherytech.co', pathname: '/form' })).toBe('claimant');
    });

    it('is case-insensitive, because DNS is', async () => {
      const at = await surfaceForWithAgentHosts('tci-agent.smitherytech.com');
      expect(at({ hostname: 'TCI-Agent.SmitheryTech.com', pathname: '/form' })).toBe('agent');
    });

    it('keeps the agent. convention working alongside a named host', async () => {
      const at = await surfaceForWithAgentHosts('tci-agent.smitherytech.com');
      expect(at({ hostname: 'agent.claims.example.my', pathname: '/form' })).toBe('agent');
    });

    it('accepts more than one name, and tolerates untidy spacing', async () => {
      const at = await surfaceForWithAgentHosts(' tci-agent.smitherytech.com , agent.example.my ');
      expect(at({ hostname: 'tci-agent.smitherytech.com', pathname: '/form' })).toBe('agent');
      expect(at({ hostname: 'agent.example.my', pathname: '/form' })).toBe('agent');
      expect(at({ hostname: 'other.example.my', pathname: '/form' })).toBe('claimant');
    });
  });

  describe('local development', () => {
    // One host and no edge, so the path stands in. Nothing is *granted* by it:
    // every request the agent screens make carries a staff token the server
    // checks for itself. The path chooses which screens to draw.
    it('uses the path, because there is only one host', () => {
      expect(at('localhost', '/agent')).toBe('agent');
      expect(at('127.0.0.1', '/agent')).toBe('agent');
      expect(at('localhost', '/form')).toBe('claimant');
    });
  });
});
