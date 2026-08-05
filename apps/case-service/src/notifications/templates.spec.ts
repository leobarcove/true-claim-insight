import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, TEMPLATES, TemplateId } from './templates';

/**
 * COMPLIANCE TESTS — outbound notifications (MASTER_PLAN §5 Phase 2).
 *
 * What these guard:
 *
 *  - Email carries no personal identifier. NRIC and bank details are encrypted
 *    at rest (§8) and a notification is the one place that protection could be
 *    undone: mail is unencrypted beyond the first hop and lands in mailboxes
 *    this platform does not control.
 *  - A claimant-facing message never carries fraud or behavioural data. The
 *    redaction work withholds it from the claimant's own screen; putting it in
 *    an email addressed to them would be the same disclosure by another route.
 *  - Templates stay in code. A control editable by an UPDATE statement is not
 *    a control — the same reasoning as the PD 12.6 report sections.
 */

const NEVER_IN_AN_EMAIL = [
  /\b\d{6}-\d{2}-\d{4}\b/, // NRIC
  /\bnric\b/i,
  /\bbank\s*account\b/i,
  /\baccount\s*number\b/i,
  /\bdeception\b/i,
  /\bfraud\s*score\b/i,
  /\bpassword\b/i,
];

describe('notification templates — what may leave the building', () => {
  const rendered = [
    render('case.information-requested', {
      caseNumber: 'CSE-2026-000123',
      request: 'Please upload the boarding pass for flight D7 522.',
      claimantName: 'Siti binti Rahman',
    }),
    render('sla.breach-escalated', {
      stage: 'FINAL_REPORT',
      subject: 'CLM-2026-000045',
      workingDaysLate: 3,
      escalationLevel: 2,
    }),
    render('assignment.acknowledged', {
      externalRef: 'MSIG-2026-8891',
      firmName: 'Pacific Adjusters Sdn Bhd',
      acknowledgedAt: new Date('2026-08-05T02:00:00Z'),
      scope: 'Travel — flight delay',
    }),
  ];

  it.each(NEVER_IN_AN_EMAIL.map(p => [p.source, p] as const))(
    'no template mentions %s',
    (_label, pattern) => {
      for (const message of rendered) {
        expect(`${message.subject}\n${message.text}`).not.toMatch(pattern);
      }
    }
  );

  it('every template produces a subject and a body', () => {
    for (const message of rendered) {
      expect(message.subject.trim().length).toBeGreaterThan(0);
      expect(message.text.trim().length).toBeGreaterThan(0);
    }
  });

  it('warns the claimant not to email sensitive material back', () => {
    // The reply path is the leak this cannot otherwise prevent: a claimant who
    // replies with a photo of their IC has put it in a mailbox, and no server
    // control reaches that.
    const claimantFacing = rendered[0].text;
    expect(claimantFacing).toMatch(/do not reply with/i);
    expect(claimantFacing).toMatch(/encrypted/i);
  });
});

describe('notification templates — content', () => {
  it('names the case and repeats the operator request verbatim', () => {
    const message = render('case.information-requested', {
      caseNumber: 'CSE-2026-000123',
      request: 'Please upload the boarding pass.',
    });
    expect(message.subject).toContain('CSE-2026-000123');
    expect(message.text).toContain('Please upload the boarding pass.');
  });

  it('states the escalation level and lateness on a breach', () => {
    const message = render('sla.breach-escalated', {
      stage: 'FINAL_REPORT',
      subject: 'CLM-1',
      workingDaysLate: 5,
      escalationLevel: 3,
    });
    expect(message.text).toContain('5 working day(s)');
    expect(message.text).toContain('level 3');
    // Level 3 is where the Board reporting obligation attaches; the message
    // should say so rather than leave the reader to know it.
    expect(message.text).toMatch(/11\.2\(d\)/);
  });

  it('acknowledges with the insurer own reference, in day-first format', () => {
    const message = render('assignment.acknowledged', {
      externalRef: 'MSIG-2026-8891',
      firmName: 'Pacific Adjusters Sdn Bhd',
      acknowledgedAt: new Date('2026-08-05T02:00:00Z'),
    });
    expect(message.subject).toContain('MSIG-2026-8891');
    // Malaysian convention, matching the intake parser.
    expect(message.text).toContain('05/08/2026');
  });
});

describe('notification templates — held in code', () => {
  it('declares exactly the templates the registry exports', () => {
    const ids: TemplateId[] = [
      'case.information-requested',
      'sla.breach-escalated',
      'assignment.acknowledged',
    ];
    expect(Object.keys(TEMPLATES).sort()).toEqual([...ids].sort());
  });

  it('keeps the delivery log free of the rendered body', () => {
    // Read from the schema rather than asserted in prose: the log is permanent
    // and claimant-facing prose does not belong in a plain column. If a `body`
    // column is ever added, this fails and the decision gets re-made
    // deliberately.
    const schema = readFileSync(
      join(__dirname, '../../../../packages/prisma-client/prisma/schema.prisma'),
      'utf8'
    );
    const model = /model NotificationLog \{([\s\S]*?)\n\}/.exec(schema);
    expect(model).not.toBeNull();
    expect(model![1]).not.toMatch(/^\s*body\s/m);
    expect(model![1]).toMatch(/dedupeKey\s+String\?\s+@unique/);
  });
});
