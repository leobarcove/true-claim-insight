import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CASE_FLOWS,
  TravelClaimType,
  type CaseAnswers,
  type FlowStep,
} from '@tci/shared-types';

import { ClaimFormPage } from './index';
import { sectionsFor } from './sections';

/**
 * REGRESSION TEST — a half-filled section survives Back.
 *
 * Typing saves nothing: it lands in the component's `values`, and only
 * Continue sends a section to the server. Back kept `values` intact, but the
 * only way *forward* again is Continue on the earlier section — and that
 * cleared the whole map rather than the section it had just sent. So filling
 * in half of Payout, pressing Back to check an earlier answer, then continuing
 * forward returned to Payout with the fields blank. Nothing warned, because
 * nothing knew the values had been discarded.
 *
 * Driven through the real page rather than a helper, because the bug was in
 * the wiring: each piece was individually reasonable.
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

const FLOW = CASE_FLOWS[TravelClaimType.FLIGHT_DELAY];

/**
 * A plausible stored answer for a step, so earlier sections read as complete.
 *
 * Derived from `answerType` rather than hand-listed per step id: the point of
 * this fixture is "everything before Payout is answered", and a literal list
 * would quietly stop meaning that the first time the flow gained a question.
 */
const answerFor = (step: FlowStep): string => {
  switch (step.answerType) {
    case 'choice':
      return step.choices?.[0]?.value ?? 'yes';
    case 'date':
      return '2026-09-06';
    case 'datetime':
      return '2026-09-06T10:00:00.000Z';
    case 'number':
      return '100';
    case 'phone':
      return '+60123456789';
    case 'document':
      return 'attached';
    default:
      return 'Something';
  }
};

/** Every step before the payout section answered; payout itself left empty. */
const answersUpToPayout = (): CaseAnswers => {
  const answers: CaseAnswers = {};
  for (const section of sectionsFor(FLOW, {}).sections) {
    if (section.id === 'payout' || section.id === 'review') continue;
    for (const step of section.steps) answers[step.id] = answerFor(step);
  }
  return answers;
};

const stateAtPayout = () => ({
  stage: 'flow',
  locale: 'en',
  lastReply: null,
  flow: FLOW,
  case: {
    id: 'c1',
    caseNumber: 'CSE-2026-000999',
    status: 'IN_PROGRESS',
    currentStepId: null,
    answers: answersUpToPayout(),
    documents: [],
  },
});

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
  vi.clearAllMocks();
  localStorage.setItem('tci.webform.session', '7c9e6679-7425-40de-944b-e07fc1f90ae7.a1b2c3');
  // The server's answers never change during this test: nothing the claimant
  // types in Payout is ever submitted, which is the whole point.
  get.mockResolvedValue({ data: { data: stateAtPayout() } });
  post.mockResolvedValue({ data: { data: { currentStepId: null, lastReply: null } } });
});

describe('a section filled in but not submitted', () => {
  it('still holds what was typed after Back and Continue', async () => {
    const user = userEvent.setup();
    renderForm();

    // Lands on Payout: it is the first section with a required answer missing.
    const bank = await screen.findByLabelText(/bank name/i);
    await user.type(bank, 'Maybank');
    expect(bank).toHaveValue('Maybank');

    // Out of the section without submitting it...
    await user.click(screen.getByRole('button', { name: /back/i }));
    await waitFor(() => expect(screen.queryByLabelText(/bank name/i)).not.toBeInTheDocument());

    // ...and back in, which can only be done by continuing forward.
    await user.click(screen.getByRole('button', { name: /continue/i }));

    const bankAgain = await screen.findByLabelText(/bank name/i);
    expect(bankAgain).toHaveValue('Maybank');
  });
});
