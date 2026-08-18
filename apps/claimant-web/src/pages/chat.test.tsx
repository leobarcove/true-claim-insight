import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { adoptPublicSession } from '@/hooks/use-public-conversation';
import { PublicChatPage } from './chat';

/**
 * REGRESSION TEST — "Start again" must not abandon a messaging claim.
 *
 * The Mini App renders this page against a session that names a *Telegram*
 * binding. Clearing that session does not restart a conversation; it detaches
 * the claimant from the claim they have been building with the bot and drops
 * them into a fresh anonymous web thread, with no route back but closing the
 * window and reopening it from the chat. It is the exact failure the session
 * bridge exists to prevent, and it was reachable in one tap.
 *
 * Found by audit rather than by a test, because this app had no tests. That is
 * why this file exists before any other component test.
 */

// The network boundary, and only that. The hooks, the query cache and
// `isChannelSession` all run for real — mocking them would mock the thing
// under test.
const get = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

const EMPTY_CONVERSATION = {
  bindingId: 'binding-1',
  withAgent: false,
  currentStep: null,
  messages: [],
};

const renderPage = (ui: ReactElement) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

beforeEach(() => {
  get.mockResolvedValue({ data: { data: EMPTY_CONVERSATION } });
  post.mockResolvedValue({ data: { data: EMPTY_CONVERSATION } });
});

describe('the way out of a conversation depends on whose conversation it is', () => {
  it('offers "Start again" on a visitor session', async () => {
    adoptPublicSession('7c9e6679-7425-40de-944b-e07fc1f90ae7.a1b2c3');
    renderPage(<PublicChatPage />);

    expect(await screen.findByRole('button', { name: /start again/i })).toBeInTheDocument();
  });

  it('does not offer it on a Telegram session', async () => {
    adoptPublicSession('tg:987654321:1787034567.a1b2c3');
    renderPage(<PublicChatPage />);

    // "Talk to a person" is rendered beside it, so waiting for that proves the
    // controls have mounted — otherwise this passes on an empty page.
    expect(await screen.findByRole('button', { name: /talk to a person/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start again/i })).not.toBeInTheDocument();
  });

  it('clears the session when a visitor starts again', async () => {
    // The behaviour the guard must not break: on a thread the visitor owns,
    // starting again is theirs to do.
    adoptPublicSession('7c9e6679-7425-40de-944b-e07fc1f90ae7.a1b2c3');
    renderPage(<PublicChatPage />);

    await userEvent.click(await screen.findByRole('button', { name: /start again/i }));
    expect(localStorage.getItem('tci.webchat.session')).not.toBe(
      '7c9e6679-7425-40de-944b-e07fc1f90ae7.a1b2c3'
    );
  });
});

/**
 * The second layer, asserted against the source.
 *
 * The guard sits at the button *and* inside `startOver`, and the inner one
 * exists for a caller that does not exist yet — which no rendering test can
 * reach, because the only route to it today is the control the outer guard
 * hides. So this scans instead, the same way the services assert their own
 * invariants: it is the only thing that can catch the inner guard being
 * dropped as redundant, which is exactly how it would be lost.
 */
describe('the session is not cleared without checking whose it is', () => {
  const source = readFileSync(join(__dirname, 'chat.tsx'), 'utf8');

  it('clears the session in exactly one place', () => {
    expect(source.match(/clearPublicSession\(\)/g) ?? []).toHaveLength(1);
  });

  it('checks the session kind before clearing it', () => {
    const guard = source.indexOf('if (isChannelSession()) return;');
    const clear = source.indexOf('clearPublicSession()');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(clear);
  });
});
