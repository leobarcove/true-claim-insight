import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentStartClaim } from './start-claim';

/**
 * The first assisted screen asks, and does not touch the database.
 *
 * Two things have to hold, and neither is visible from the screen itself.
 *
 * It must not *write*. It once called the find-*or-create* endpoint, so a
 * mistyped digit left a permanent claimant row carrying a name and an IC —
 * personal data stored before consent, on a screen telling the agent nothing
 * was saved, one screen before another that says no details may be entered
 * until consent is recorded.
 *
 * And it must not *read*. The lookup that replaced the create is gone too: an
 * agent reading details back over a call should not have to run a search, wait
 * for it and read the answer before Continue becomes live, for a result that
 * changes nothing they do. Whether the record exists is settled at the
 * declaration, where the claimant, the consent and the case are written
 * together.
 *
 * So the property under test is the absence of a request, which no rendering
 * assertion can show.
 */

const post = vi.fn();
const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

const renderStart = (onClaimantResolved = vi.fn()) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <AgentStartClaim claimant={null} onClaimantResolved={onClaimantResolved} onOpened={vi.fn()} />
    </QueryClientProvider>
  );
  return onClaimantResolved;
};

const fill = async (
  user: ReturnType<typeof userEvent.setup>,
  { phone = '123456789', nric = '880101145555', name = 'Chua Xin Ying' } = {}
) => {
  if (phone) await user.type(screen.getByLabelText('Their mobile number'), phone);
  if (nric) await user.type(screen.getByLabelText('IC number'), nric);
  if (name) await user.type(screen.getByLabelText('Full name'), name);
};

beforeEach(() => {
  localStorage.setItem('tci.agent.token', 'token');
  post.mockReset();
  get.mockReset();
  get.mockResolvedValue({ data: { data: { title: 'Notice', body: 'Body', version: 1 } } });
  post.mockResolvedValue({ data: { data: {} } });
});

describe('who the claim is for', () => {
  it('sends nothing to the server', async () => {
    const user = userEvent.setup();
    renderStart();

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(post).not.toHaveBeenCalled();
  });

  it('offers no lookup to run', async () => {
    renderStart();

    expect(screen.queryByRole('button', { name: /find claimant/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('carries the typed details forward with no record behind them', async () => {
    const user = userEvent.setup();
    const onChosen = renderStart();

    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(onChosen).toHaveBeenCalledWith({
        phoneNumber: '+60123456789',
        fullName: 'Chua Xin Ying',
        nric: '880101-14-5555',
        nricLast4: null,
        id: null,
        existing: false,
      })
    );
  });

  it('drops a leading zero, because that is how a number is written down', async () => {
    const user = userEvent.setup();
    const onChosen = renderStart();

    await fill(user, { phone: '0123456789' });
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() =>
      expect(onChosen).toHaveBeenCalledWith(
        expect.objectContaining({ phoneNumber: '+60123456789' })
      )
    );
  });

  it('refuses a half-typed IC', async () => {
    // Still checked, and it still matters: the IC is what the declaration
    // matches on, so an incomplete one opens a second record for somebody
    // already on file — with nothing on either saying they are the same.
    const user = userEvent.setup();
    const onChosen = renderStart();

    await fill(user, { nric: '8801' });
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not complete/);
    expect(onChosen).not.toHaveBeenCalled();
  });

  it('refuses a claim with no name, which consent cannot be recorded against', async () => {
    const user = userEvent.setup();
    const onChosen = renderStart();

    await fill(user, { name: '' });
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/full name/i);
    expect(onChosen).not.toHaveBeenCalled();
  });

  it('refuses a claim with no number to reach them on', async () => {
    const user = userEvent.setup();
    const onChosen = renderStart();

    await fill(user, { phone: '' });
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/mobile number/i);
    expect(onChosen).not.toHaveBeenCalled();
  });
});
