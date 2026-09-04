import { describe, expect, it } from 'vitest';

import { surfaceFor } from './surface';

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
