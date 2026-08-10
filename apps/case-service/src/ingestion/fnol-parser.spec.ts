import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getFlow, getStep, validateAnswer } from '@tci/shared-types';
import { TravelClaimType } from '@prisma/client';

import { parseFnol, toStoredParse } from './fnol-parser';

/**
 * COMPLIANCE TESTS — FNOL email intake (MASTER_PLAN §5 Phase 2).
 *
 * Guarded here:
 *
 *  - Day-first date reading. `03/04/2026` is 3 April in Malaysian mail. Read
 *    month-first it becomes 4 March, shifting the incident date by up to
 *    eleven months and every CSP deadline computed from it.
 *  - Claim-type precedence. "Delayed baggage" is a luggage claim, not a
 *    flight-delay claim; keyword order decides which benefit is assessed.
 *  - Extracted values satisfy the intake flow's own validators, so ingestion
 *    cannot create a Case that the portal would have rejected.
 *  - Identity fields never reach `InboundMessage.parsed`, which is plain JSONB
 *    while this platform encrypts personal identifiers at rest (§8).
 *  - `messageId` carries a unique constraint — the guarantee that a re-polled
 *    mailbox cannot produce a second Case for the same email.
 */

const from = 'agent@brokerage.com.my';

describe('FNOL parser — dates', () => {
  it('reads DD/MM/YYYY day-first, per Malaysian convention', () => {
    const parsed = parseFnol({ text: 'Date of incident: 03/04/2026', fromAddress: from });
    expect(parsed.incidentDate?.toISOString().slice(0, 10)).toBe('2026-04-03');
  });

  it('reads ISO dates unchanged', () => {
    const parsed = parseFnol({ text: 'Date of loss: 2026-04-03', fromAddress: from });
    expect(parsed.incidentDate?.toISOString().slice(0, 10)).toBe('2026-04-03');
  });

  it('reads "12 Aug 2026" style dates', () => {
    const parsed = parseFnol({ text: 'Incident date: 12 Aug 2026', fromAddress: from });
    expect(parsed.incidentDate?.toISOString().slice(0, 10)).toBe('2026-08-12');
  });

  it('rejects an impossible date rather than rolling it over', () => {
    // JS Date would silently turn 31 February into 3 March.
    const parsed = parseFnol({ text: 'Date of loss: 31/02/2026', fromAddress: from });
    expect(parsed.incidentDate).toBeUndefined();
    expect(parsed.missing).toContain('incidentDate');
  });
});

describe('FNOL parser — claim type precedence', () => {
  const cases: [string, TravelClaimType][] = [
    ['My baggage was damaged on arrival', 'LUGGAGE_DAMAGE'],
    ['Delayed baggage never arrived at KLIA', 'LUGGAGE_LOSS'],
    ['Our flight was delayed by 8 hours', 'FLIGHT_DELAY'],
    ['We had to cancel the trip', 'TRIP_CANCELLATION'],
    ['Admitted to hospital in Bangkok', 'MEDICAL'],
  ];

  it.each(cases)('classifies %j as %s', (text, expected) => {
    expect(parseFnol({ text, fromAddress: from }).travelClaimType).toBe(expected);
  });

  it('does not read "delayed baggage" as a flight-delay claim', () => {
    const parsed = parseFnol({
      text: 'Delayed baggage — my luggage is missing after flight MH370',
      fromAddress: from,
    });
    expect(parsed.travelClaimType).toBe('LUGGAGE_LOSS');
  });
});

describe('FNOL parser — flight numbers', () => {
  it('accepts the AirAsia X alphanumeric designator "D7 522"', () => {
    const parsed = parseFnol({ text: 'Flight number: D7 522', fromAddress: from });
    expect(parsed.flightNumber).toBe('D7 522');
  });

  it('accepts MH370', () => {
    expect(parseFnol({ text: 'Flight: MH370', fromAddress: from }).flightNumber).toBe('MH370');
  });

  it('does not mistake a bare number for a flight', () => {
    const parsed = parseFnol({ text: 'Delay of 8 hours, claim 12345', fromAddress: from });
    expect(parsed.flightNumber).toBeUndefined();
  });

  it('produces flight numbers the intake flow itself accepts', () => {
    // Extraction proposes; the flow's validator disposes. If these ever
    // disagree, ingestion would build a Case the portal would have refused.
    const parsed = parseFnol({
      text: 'Flight number: D7 522\nPolicy Number: TRV12345678\nDate of loss: 03/04/2026',
      fromAddress: from,
    });
    const step = getStep(getFlow('FLIGHT_DELAY'), 'flight-number')!;
    expect(validateAnswer(step, parsed.flightNumber!).valid).toBe(true);
  });
});

describe('FNOL parser — labelled fields', () => {
  const email = [
    'Policy Number: TRV-12345678',
    'Insured Name: Siti binti Rahman',
    'Contact Number: 012-345 6789',
    'Destination: Tokyo',
    'Date of incident: 03/04/2026',
    '',
    'Our flight was delayed by 8 hours.',
  ].join('\n');

  it('extracts every labelled field', () => {
    const parsed = parseFnol({ subject: 'Travel claim notification', text: email, fromAddress: from });
    expect(parsed.policyNumber).toBe('TRV-12345678');
    expect(parsed.claimantName).toBe('Siti binti Rahman');
    expect(parsed.claimantPhone).toBe('012-345 6789');
    expect(parsed.destination).toBe('Tokyo');
    expect(parsed.travelClaimType).toBe('FLIGHT_DELAY');
    expect(parsed.missing).toHaveLength(0);
  });

  it('refuses a prose value for a policy number', () => {
    const parsed = parseFnol({ text: 'Policy: please see the attached document', fromAddress: from });
    expect(parsed.policyNumber).toBeUndefined();
    expect(parsed.missing).toContain('policyNumber');
  });

  it('falls back to the sender address for the claimant email', () => {
    expect(parseFnol({ text: 'no contact details here', fromAddress: from }).claimantEmail).toBe(from);
  });
});

describe('FNOL parser — what gets persisted', () => {
  it('never puts identity fields on InboundMessage.parsed', () => {
    const parsed = parseFnol({
      text: [
        'Policy Number: TRV12345678',
        'Insured Name: Siti binti Rahman',
        'Contact Number: 012-345 6789',
        'Date of loss: 03/04/2026',
      ].join('\n'),
      fromAddress: from,
    });

    const stored = toStoredParse(parsed) as Record<string, unknown>;

    expect(stored.policyNumber).toBe('TRV12345678');
    expect(Object.keys(stored)).not.toContain('claimantName');
    expect(Object.keys(stored)).not.toContain('claimantPhone');
    expect(Object.keys(stored)).not.toContain('claimantEmail');
    expect(JSON.stringify(stored)).not.toContain('Siti');
    expect(JSON.stringify(stored)).not.toContain('012-345');
  });

  it('reports mandatory gaps so the operator queue can pick them up', () => {
    const parsed = parseFnol({ text: 'Something happened on my trip', fromAddress: from });
    expect(parsed.missing).toEqual(expect.arrayContaining(['policyNumber', 'incidentDate']));
  });
});

describe('FNOL intake — idempotency guarantee', () => {
  it('declares messageId unique in the schema', () => {
    // Read from the schema rather than asserted in prose: idempotency here is
    // a database constraint, not application logic, precisely so two
    // concurrent pollers cannot both pass a check and then both insert.
    const schema = readFileSync(
      join(__dirname, '../../../../packages/prisma-client/prisma/schema.prisma'),
      'utf8'
    );
    const model = /model InboundMessage \{([\s\S]*?)\n\}/.exec(schema);
    expect(model).not.toBeNull();
    expect(model![1]).toMatch(/messageId\s+String\s+@unique/);
  });
});
