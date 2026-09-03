import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaimFormPage } from './index';

/**
 * The number field, as a claimant meets it.
 *
 * `mobile-number.test.ts` covers what counts as a number. This covers the part
 * that cannot be tested from a pure function: that pressing the button when the
 * number is wrong says so instead of sending, that the message goes away when
 * they start fixing it, and that a shape this screen can judge never costs a
 * round trip to WhatsApp.
 */

const get = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

const AT_PHONE = {
  stage: 'phone',
  locale: 'en',
  lastReply: 'Hello — we handle travel insurance claims.',
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
  localStorage.setItem('tci.webform.session', '7c9e6679-7425-40de-944b-e07fc1f90ae7.a1b2c3');
  get.mockResolvedValue({ data: { data: AT_PHONE } });
  post.mockResolvedValue({ data: { data: AT_PHONE } });
});

describe('the mobile number field', () => {
  it('sends nothing when the number is too short, and says why', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(await screen.findByLabelText('Mobile number'), '12345');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too short/);
    expect(post).not.toHaveBeenCalled();
  });

  it('asks for a number rather than doing nothing when the field is empty', async () => {
    const user = userEvent.setup();
    renderForm();

    // The button is live on an empty field on purpose: a disabled one cannot
    // say what is missing.
    await screen.findByLabelText('Mobile number');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your mobile number.');
  });

  it('names the country code instead of silently eating it', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(await screen.findByLabelText('Mobile number'), '60123456789');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Leave out the 60/);
    expect(post).not.toHaveBeenCalled();
  });

  it('clears the message as soon as the claimant starts fixing it', async () => {
    const user = userEvent.setup();
    renderForm();

    const box = await screen.findByLabelText('Mobile number');
    await user.type(box, '12345');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    await screen.findByRole('alert');

    await user.type(box, '6');

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('sends a good number, with the country code the field never asked for', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(await screen.findByLabelText('Mobile number'), '012 345 6789');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/public/conversation/turn',
        expect.objectContaining({ text: '+60123456789' }),
        expect.anything()
      )
    );
  });

  it('does not greet an untouched form with a red bot message', async () => {
    renderForm();

    await screen.findByLabelText('Mobile number');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /*
    REGRESSION — no red flash on a good number.

    Pressing Send used to paint the *previous* bot message in red for as long as
    the request took: `attempted` flipped immediately, `lastReply` was still the
    greeting, and nothing gated the two on the answer having arrived. A claimant
    who typed a perfectly good number saw a validation failure for a second and
    then the next page, which reads as the form arguing with itself.

    Held open here by a turn that does not resolve until the test lets it, so
    "during the request" is a state the assertions can stand in rather than a
    frame they have to catch.
  */
  it('shows nothing in red while a good number is on its way', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    post.mockImplementation(
      () =>
        new Promise(resolve => {
          release = () => resolve({ data: { data: AT_PHONE } });
        })
    );

    renderForm();

    await user.type(await screen.findByLabelText('Mobile number'), '123456789');
    await user.click(screen.getByRole('button', { name: 'Send code' }));

    // In flight: the greeting is still the only thing `lastReply` holds, and it
    // is not a verdict on anything.
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();

    release();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send code' })).toBeEnabled());
  });
});
