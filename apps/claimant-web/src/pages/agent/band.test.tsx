import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AgentBand } from './band';

/**
 * The strip whose job is to stop an agent typing into the wrong claim.
 *
 * Its content is load-bearing rather than decorative, and on a phone it is also
 * the thing most at risk of being squeezed out: wrapped to 390px the desktop
 * row became four lines, and the line that wrapped off the bottom was the
 * consent state — pushed under the fold by the agent's own name. So what is
 * asserted here is presence, not layout: both facts are on the page at every
 * width, and neither is spelled out twice in a way that could drift.
 */

const agent = { fullName: 'Faiz Rahman', tenantName: 'Pacific Adjusters' } as never;
const claimant = { fullName: 'Nur Aisyah binti Rahman', phoneNumber: '+60 12 345 6789' } as never;

describe('the assisted band', () => {
  it('names the claimant it is entering for, and their number', () => {
    render(<AgentBand agent={agent} claimant={claimant} consent={null} />);

    expect(screen.getByText(/Entering for Nur Aisyah binti Rahman/)).toBeVisible();
    expect(screen.getByText('+60 12 345 6789')).toBeVisible();
  });

  it('says consent is outstanding, and what that forbids', () => {
    render(<AgentBand agent={agent} claimant={claimant} consent={null} />);

    // Mounted twice — the phone row and the desktop line — from one string, so
    // the two can never disagree.
    const outstanding = screen.getAllByText(/Consent not yet recorded/);
    expect(outstanding.length).toBeGreaterThan(0);
    outstanding.forEach(node => expect(node).toHaveTextContent(/no claim details can be entered/));
  });

  it('shows the time but not the internal notice version once consent is recorded', () => {
    render(
      <AgentBand
        agent={agent}
        claimant={claimant}
        consent={{ attestedAt: '2026-08-14T02:42:00.000Z', noticeVersion: 3 }}
      />
    );

    expect(screen.queryByText(/Consent not yet recorded/)).toBeNull();
    expect(screen.getAllByText(/Verbal consent attested by you at/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/notice v3/)).toBeNull();
  });

  it('opens an account panel rather than signing out on the tap', async () => {
    const user = userEvent.setup();
    render(<AgentBand agent={agent} claimant={claimant} consent={null} />);

    /*
      The trap this closes: the initials used to sign out on the tap. A 44px
      circle beside the claimant's name, ending the session and discarding a
      half-entered claim, with nothing on it saying so — an agent reaching for
      it to check whose account they were in lost the claim instead.
    */
    const initials = screen.getByRole('button', { name: 'Signed in as Faiz Rahman — account' });
    expect(initials).toHaveTextContent('FR');
    expect(screen.queryByRole('dialog', { name: 'Account' })).toBeNull();

    await user.click(initials);

    // Asked for inside the panel: jsdom applies no CSS, so the desktop strip's
    // own Sign out — hidden below `sm` by a class alone — is in the tree too.
    const panel = screen.getByRole('dialog', { name: 'Account' });
    expect(within(panel).getByRole('button', { name: 'Sign out' })).toBeVisible();
    expect(within(panel).getByText(/Anything not yet submitted is lost/)).toBeVisible();
  });

  it('closes the panel again, so the tap is reversible', async () => {
    const user = userEvent.setup();
    render(<AgentBand agent={agent} claimant={claimant} consent={null} />);

    await user.click(screen.getByRole('button', { name: 'Signed in as Faiz Rahman — account' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog', { name: 'Account' })).toBeNull();
  });

  it('stands up before a claimant is resolved', () => {
    // The declaration screen renders it with no claimant yet; a band that threw
    // there would take the whole assisted flow with it.
    render(<AgentBand agent={agent} claimant={null} consent={null} />);

    expect(screen.getByText('Assisted claim')).toBeVisible();
  });

  it('says nothing about an agent who is not signed in', () => {
    render(<AgentBand agent={null} claimant={claimant} consent={null} />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
