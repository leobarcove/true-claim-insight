import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FlowStep } from '@tci/shared-types';
import { describe, expect, it, vi } from 'vitest';

import { FieldControl } from './field-control';

/**
 * What the upload box says while it is busy.
 *
 * Uploading and removing shared one `busy` flag, and the button's label was
 * driven off it — so clicking **Remove** turned "Add another" into
 * "Uploading…". A claimant taking a photo back was told one was arriving, at
 * the one moment the two are easy to confuse and the count is about to move
 * the other way.
 *
 * The distinction is worth a test rather than an eye: both states are
 * transient, both leave the same screen behind, and nothing fails when they
 * are crossed.
 */
const photoStep: FlowStep = {
  id: 'doc-damage-photo',
  prompt: 'Please upload clear photographs of the damaged luggage.',
  label: 'Damage photographs',
  answerType: 'document',
  documentType: 'DAMAGE_PHOTO',
  allowMultiple: true,
  next: { type: 'end' },
} as FlowStep;

const renderControl = (overrides: Partial<Parameters<typeof FieldControl>[0]> = {}) =>
  render(
    <FieldControl
      step={photoStep}
      value=""
      onChange={vi.fn()}
      attached={[
        { fileName: 'bag-whole.jpg', id: 'doc-1' },
        { fileName: 'bag-handle.jpg', id: 'doc-2' },
      ]}
      onUpload={vi.fn().mockResolvedValue(undefined)}
      onRemove={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />
  );

describe('the upload box while a photo is being taken back', () => {
  it('says Removing on the row, and leaves the add button’s label alone', async () => {
    // Never settles: the assertions are about the state during the request.
    const onRemove = vi.fn(() => new Promise<void>(() => {}));
    renderControl({ onRemove });

    const rows = screen.getAllByRole('button', { name: 'Remove' });
    await userEvent.click(rows[0]);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Removing…' })).toBeTruthy());
    // The bug: this read "Uploading…" while a file was on its way out.
    expect(screen.getByRole('button', { name: /Add another/ })).toBeTruthy();
    expect(screen.queryByText('Uploading…')).toBeNull();
  });

  it('marks only the row being removed, and blocks a second removal meanwhile', async () => {
    const onRemove = vi.fn(() => new Promise<void>(() => {}));
    renderControl({ onRemove });

    const rows = screen.getAllByRole('button', { name: 'Remove' });
    await userEvent.click(rows[1]);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Removing…' })).toBeTruthy());
    // The other row still reads Remove — one file is going, not both — but is
    // disabled, because both paths refetch the case when they finish and a
    // second request in flight would be answered against the older picture.
    const other = screen.getByRole('button', { name: 'Remove' });
    expect((other as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(other);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('still says Uploading while a file is actually uploading', async () => {
    const onUpload = vi.fn(() => new Promise<void>(() => {}));
    const { container } = renderControl({ onUpload });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File(['x'], 'bag-zip.jpg', { type: 'image/jpeg' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Uploading…' })).toBeTruthy());
  });
});
