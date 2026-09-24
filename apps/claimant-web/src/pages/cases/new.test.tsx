import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CaseIntakePage } from './new';

/**
 * REGRESSION TEST — a finished claim must not be a dead end.
 *
 * The gateway already offers "would you like to start another claim?" on
 * every messaging channel, the moment a claimant sends anything after their
 * case has nothing left to ask — see `conversation.gateway.ts`'s
 * `!step` branch. On the web chat, `AnswerControl` draws nothing once
 * `currentStep` is null, and — unlike the messaging channels — there was no
 * free-text box standing in for "send literally anything" once the bot had
 * stopped asking. So a claimant back to file a second claim read their first
 * claim's transcript with no way to say anything at all, short of the door
 * "Talk to a person" opens onto a human queue.
 */

// The network boundary, and only that. The hooks and the query cache run for
// real — mocking them would mock the thing under test.
const get = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}));

const FINISHED_CONVERSATION = {
  bindingId: 'binding-1',
  withAgent: false,
  caseId: 'case-1',
  currentStep: null,
  messages: [
    {
      id: 'm1',
      direction: 'OUTBOUND' as const,
      text: 'Thank you — your claim request CSE-2026-000006 has been submitted.',
      stepId: null,
      fromAgent: false,
      createdAt: new Date().toISOString(),
    },
  ],
};

const OPEN_QUESTION_STEP = {
  id: 'your-name',
  prompt: 'What is your name?',
  label: 'Name',
  answerType: 'text' as const,
};

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CaseIntakePage />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('a claimant whose case has nothing left to ask', () => {
  it('is offered a way to start another claim', async () => {
    get.mockResolvedValue({ data: { data: FINISHED_CONVERSATION } });
    renderPage();

    expect(
      await screen.findByRole('button', { name: /file another claim/i })
    ).toBeInTheDocument();
  });

  it('sending it is what actually reaches the gateway', async () => {
    get.mockResolvedValue({ data: { data: FINISHED_CONVERSATION } });
    post.mockResolvedValue({
      data: {
        data: {
          ...FINISHED_CONVERSATION,
          currentStep: {
            id: '__another-claim',
            prompt: 'Would you like to start another claim?',
            label: 'Another claim',
            answerType: 'choice',
            choices: [
              { value: 'YES', label: 'Yes, start another' },
              { value: 'NO', label: 'No, thank you' },
            ],
          },
        },
      },
    });
    renderPage();

    const button = await screen.findByRole('button', { name: /file another claim/i });
    await userEvent.click(button);

    expect(post).toHaveBeenCalledWith(
      '/conversation/turn',
      expect.objectContaining({ text: 'Start another claim' })
    );
    // The server's own next question renders through the normal choice
    // control — proving the turn actually unstuck the conversation, not just
    // that a request went out.
    expect(await screen.findByRole('button', { name: /yes, start another/i })).toBeInTheDocument();
  });

  it('does not appear while a human has taken over — "Talk to a person" already covers that door', async () => {
    get.mockResolvedValue({
      data: { data: { ...FINISHED_CONVERSATION, withAgent: true } },
    });
    renderPage();

    // Waiting for the agent composer proves the page has finished loading,
    // so an absent button below is a real absence and not an early read.
    expect(await screen.findByPlaceholderText(/reply to our team/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /file another claim/i })).not.toBeInTheDocument();
  });
});

describe('a claim still being answered', () => {
  it('does not offer to start another one over an open question', async () => {
    get.mockResolvedValue({
      data: { data: { ...FINISHED_CONVERSATION, currentStep: OPEN_QUESTION_STEP } },
    });
    renderPage();

    // The open question's own control proves the page has rendered past
    // loading, so an absent button below is a real absence.
    expect(await screen.findByPlaceholderText(/type your answer/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /file another claim/i })).not.toBeInTheDocument();
  });
});
