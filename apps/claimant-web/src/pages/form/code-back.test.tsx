import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimFormPage } from './index';

/**
 * REGRESSION TEST — **Back** on the code screen means back.
 *
 * It used to open a panel titled "Send the code to a different number" — the
 * same panel the "Wrong number?" link opened. Two controls, one behaviour, and
 * the one carrying the universal word was the one not doing the universal
 * thing. A claimant who wanted the previous screen pressed Back and got a
 * second number field in a box, which reads as a different offer entirely.
 *
 * The mechanism underneath is unchanged and cannot be otherwise: the stage is
 * the server's and it is at `code`, so the way back is to send a new number,
 * which the gateway takes at this step. What this covers is that the screen
 * shown is the number screen, and that the panel is gone.
 */

// The network boundary, and only that: the hooks, the query cache and the
// session helpers all run for real.
const get = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

const AT_CODE = {
  stage: 'code',
  locale: 'en',
  lastReply: 'We have sent you a 6-digit code on WhatsApp.',
  pendingPhone: '+60123456789',
};

const renderForm = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ClaimFormPage />
    </QueryClientProvider>
  );
};

beforeEach(() => {
  // A session already exists, so the page does not open a new conversation.
  localStorage.setItem('tci.webform.session', '7c9e6679-7425-40de-944b-e07fc1f90ae7.a1b2c3');
  get.mockResolvedValue({ data: { data: AT_CODE } });
  post.mockResolvedValue({ data: { data: AT_CODE } });
});

describe('Back on the code screen', () => {
  it('returns to the number screen', async () => {
    const user = userEvent.setup();
    renderForm();

    await screen.findByText('Check your messages');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByLabelText('Mobile number')).toBeVisible();
    expect(screen.queryByText('Check your messages')).toBeNull();
  });

  it('no longer offers a second number field in a panel', async () => {
    const user = userEvent.setup();
    renderForm();

    await screen.findByText('Check your messages');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.queryByText('Send the code to a different number')).toBeNull();
  });

  it('sends the new number as an ordinary turn, the way the panel did', async () => {
    const user = userEvent.setup();
    renderForm();

    await screen.findByText('Check your messages');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    await user.type(await screen.findByLabelText('Mobile number'), '129998888');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/public/conversation/turn',
        expect.objectContaining({ text: '+60129998888' }),
        expect.anything()
      )
    );
  });

  it('takes "Wrong number?" to the same place', async () => {
    const user = userEvent.setup();
    renderForm();

    await screen.findByText('Check your messages');
    await user.click(screen.getByRole('button', { name: 'Wrong number?' }));

    expect(await screen.findByLabelText('Mobile number')).toBeVisible();
  });

  it('stays on the number screen while the server has not taken the new number', async () => {
    const user = userEvent.setup();
    renderForm();

    await screen.findByText('Check your messages');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    /*
      A well-formed number the server still refuses — no WhatsApp account on it,
      say. The shape is the field's business and passes; whether the number can
      be reached is the server's, and only sending finds out. The pending number
      is therefore still the old one, so bouncing back to the code screen would
      carry the refusal away with it.
    */
    get.mockResolvedValue({
      data: { data: { ...AT_CODE, lastReply: 'We could not reach that number on WhatsApp.' } },
    });

    await user.type(await screen.findByLabelText('Mobile number'), '129998888');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    await screen.findByText('We could not reach that number on WhatsApp.');
    expect(screen.queryByText('Check your messages')).toBeNull();
  });

  it('returns to the code screen once the code is going to the new number', async () => {
    const user = userEvent.setup();
    renderForm();

    await screen.findByText('Check your messages');
    await user.click(screen.getByRole('button', { name: 'Back' }));

    get.mockResolvedValue({ data: { data: { ...AT_CODE, pendingPhone: '+60129998888' } } });

    await user.type(await screen.findByLabelText('Mobile number'), '129998888');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByText('Check your messages')).toBeVisible();
  });
});
