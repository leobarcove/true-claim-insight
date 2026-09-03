import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CaseAnswers, FlowStep } from '@tci/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { ReviewStage, type ReviewRow } from './review';
import type { ResolvedSection } from './sections';

/**
 * Replacing a document from the review screen.
 *
 * The screen this covers had the failure it is easiest to ship and hardest to
 * report: **Replace** opened the file picker, took the file, and did nothing
 * whatsoever with it. `FieldControl` drops an upload when no `onUpload` is
 * passed, and the review screen passed none — so the row went on naming the old
 * file, no error appeared, and the only sensible reading was "it did not save
 * yet, try again".
 *
 * Asserted here rather than left to the manual walk-through because the symptom
 * is *absence*: nothing to see, nothing thrown, and nothing in the network log
 * either.
 */

const documentStep: FlowStep = {
  id: 'boarding-pass',
  prompt: 'Send your boarding pass.',
  label: 'Boarding pass',
  answerType: 'document',
  documentType: 'BOARDING_PASS',
  next: { type: 'end' },
} as FlowStep;

const textStep: FlowStep = {
  id: 'bank-account-holder',
  prompt: 'Whose name is the account in?',
  label: 'Account holder name',
  answerType: 'text',
  next: { type: 'end' },
} as FlowStep;

const section = (step: FlowStep): ResolvedSection =>
  ({ id: 'evidence', title: 'Evidence', heading: 'Evidence', steps: [step] }) as ResolvedSection;

const renderStage = (
  step: FlowStep,
  {
    answers = {},
    documents = [] as Array<{ fileName: string; stepId: string | null }>,
    onChange = vi.fn().mockResolvedValue(true),
    onUpload = vi.fn().mockResolvedValue('doc-new'),
  } = {}
) => {
  const rowsFor = (resolved: ResolvedSection): ReviewRow[] =>
    resolved.steps.map(each => ({
      step: each,
      label: each.label,
      value:
        each.answerType === 'document'
          ? (documents.find(document => document.stepId === each.id)?.fileName ?? 'Provided')
          : String((answers as CaseAnswers)[each.id] ?? ''),
    }));

  render(
    <ReviewStage
      sections={[section(step)]}
      answers={answers as CaseAnswers}
      documents={documents}
      rowsFor={rowsFor}
      busy={false}
      onChange={onChange}
      onUpload={onUpload}
      onSubmit={vi.fn()}
      onBack={vi.fn()}
    />
  );

  return { onChange, onUpload };
};

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

describe('ReviewStage — replacing a document', () => {
  it('stores the chosen file and names it on an answer', async () => {
    const user = userEvent.setup();
    const { onChange, onUpload } = renderStage(documentStep, {
      answers: { 'boarding-pass': 'doc-old' },
      documents: [{ fileName: 'old-pass.pdf', stepId: 'boarding-pass' }],
    });

    await user.click(screen.getByRole('button', { name: 'Change' }));

    const replacement = new File(['%PDF-'], 'new-pass.pdf', { type: 'application/pdf' });
    await user.upload(fileInput(), replacement);

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(1));
    expect(onUpload.mock.calls[0][0].id).toBe('boarding-pass');
    expect(onUpload.mock.calls[0][1]).toBe(replacement);

    // The upload alone leaves the file on the case with the step still open.
    // The answer has to name the stored id or the section never advances.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(documentStep, 'doc-new'));
  });

  it('closes the editor once the replacement is accepted', async () => {
    const user = userEvent.setup();
    renderStage(documentStep, {
      answers: { 'boarding-pass': 'doc-old' },
      documents: [{ fileName: 'old-pass.pdf', stepId: 'boarding-pass' }],
    });

    await user.click(screen.getByRole('button', { name: 'Change' }));
    await user.upload(
      fileInput(),
      new File(['%PDF-'], 'new-pass.pdf', { type: 'application/pdf' })
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Change' })).toBeVisible());
  });

  it('keeps the editor open when the answer is refused', async () => {
    const user = userEvent.setup();
    renderStage(documentStep, {
      answers: { 'boarding-pass': 'doc-old' },
      documents: [{ fileName: 'old-pass.pdf', stepId: 'boarding-pass' }],
      onChange: vi.fn().mockResolvedValue(false),
    });

    await user.click(screen.getByRole('button', { name: 'Change' }));
    await user.upload(
      fileInput(),
      new File(['%PDF-'], 'new-pass.pdf', { type: 'application/pdf' })
    );

    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible());
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });

  it('offers no Save on a document row, because choosing the file is the save', async () => {
    const user = userEvent.setup();
    renderStage(documentStep, {
      answers: { 'boarding-pass': 'doc-old' },
      documents: [{ fileName: 'old-pass.pdf', stepId: 'boarding-pass' }],
    });

    await user.click(screen.getByRole('button', { name: 'Change' }));

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  it('still saves an ordinary answer on Save', async () => {
    const user = userEvent.setup();
    const { onChange } = renderStage(textStep, {
      answers: { 'bank-account-holder': 'John Doe' },
    });

    await user.click(screen.getByRole('button', { name: 'Change' }));
    const box = screen.getByRole('textbox');
    await user.clear(box);
    await user.type(box, 'Jane Doe');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(textStep, 'Jane Doe'));
  });
});
