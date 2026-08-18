import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FlowStep } from '@tci/shared-types';
import { CHOICE_DISPLAY_MAX } from '@tci/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { AnswerControl } from './new';

/**
 * The control the claimant actually answers with.
 *
 * Two properties matter here and neither is obvious from reading the component.
 * A list offered without a way past it traps anyone whose answer is not on it —
 * the documented failure of guided intake, and the reason `allowOther` exists.
 * And a list rendered in full is not a choice but a search problem with no
 * search: thirty-one destinations as chips is what the cap is for.
 */
const step = (over: Partial<FlowStep>): FlowStep =>
  ({
    id: 'destination',
    prompt: 'Which country were you travelling to?',
    label: 'Destination',
    answerType: 'choice',
    next: { type: 'end' },
    ...over,
  }) as FlowStep;

const choices = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ value: `V${i}`, label: `Option ${i}` }));

const renderControl = (s: FlowStep, props: Record<string, unknown> = {}) => {
  const handlers = {
    onChange: vi.fn(),
    onSend: vi.fn(),
    onChoose: vi.fn(),
    onSkip: vi.fn(),
    onAttach: vi.fn(),
  };
  render(<AnswerControl step={s} busy={false} value="" {...handlers} {...props} />);
  return handlers;
};

describe('a choice step that cannot list every answer', () => {
  it('caps the options it shows and offers a box for the rest', () => {
    renderControl(step({ choices: choices(31), allowOther: true }));

    expect(screen.getAllByRole('button', { name: /^Option \d+$/ })).toHaveLength(
      CHOICE_DISPLAY_MAX
    );
    expect(screen.getByPlaceholderText(/not listed/i)).toBeInTheDocument();
  });

  it('sends what the claimant typed instead', async () => {
    // The escape hatch, exercised. Without it, someone flying an unlisted
    // carrier cannot get past the question at all.
    const { onSend } = renderControl(step({ choices: choices(31), allowOther: true }), {
      value: 'Uzbekistan',
    });

    await userEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(onSend).toHaveBeenCalled();
  });

  it('sends on Enter, because a phone keyboard has no Send button in view', async () => {
    const { onSend } = renderControl(step({ choices: choices(31), allowOther: true }), {
      value: 'Uzbekistan',
    });

    await userEvent.type(screen.getByPlaceholderText(/not listed/i), '{Enter}');
    expect(onSend).toHaveBeenCalled();
  });

  it('will not send an empty typed answer', async () => {
    const { onSend } = renderControl(step({ choices: choices(31), allowOther: true }), {
      value: '   ',
    });

    await userEvent.type(screen.getByPlaceholderText(/not listed/i), '{Enter}');
    expect(onSend).not.toHaveBeenCalled();
  });
});

describe('a choice step whose list is the complete set of answers', () => {
  it('shows every option and offers no box', () => {
    // A closed list — a cancellation reason, say — is every value the step will
    // accept. Hiding one would be a dead end with nothing to type instead, and
    // a typed answer on a step a branch routes on would fall silently to the
    // default arm.
    renderControl(step({ choices: choices(4) }));

    expect(screen.getAllByRole('button', { name: /^Option \d+$/ })).toHaveLength(4);
    expect(screen.queryByPlaceholderText(/not listed/i)).not.toBeInTheDocument();
  });

  it('reports the tapped value, not its label', async () => {
    const { onChoose } = renderControl(step({ choices: choices(4) }));

    await userEvent.click(screen.getByRole('button', { name: 'Option 2' }));
    expect(onChoose).toHaveBeenCalledWith('V2');
  });
});
