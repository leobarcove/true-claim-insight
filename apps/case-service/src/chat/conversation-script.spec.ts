import { readFileSync } from 'fs';
import { join } from 'path';

import { CASE_FLOWS, whatYouWillNeed } from '@tci/shared-types';

/**
 * THE SCRIPT, READ AS A CLAIMANT READS IT.
 *
 * Everything else about this channel has been tested as code. These are the
 * properties that only show up when the messages are laid end to end — the
 * things a conversational review catches and a correctness review does not,
 * because none of them is a bug in any single function.
 */
const gatewaySource = readFileSync(
  join(__dirname, 'conversation.gateway.ts'),
  'utf8'
);

/**
 * The source with its commentary removed.
 *
 * Needed because the literal extractor below cannot span an interpolated
 * expression — the orientation message builds a bullet list mid-string — and
 * because the first version of one test failed on a *comment* explaining the
 * very phrase it was banning. Same trick as the audit-scope suite: assert on
 * the code, never on the prose about it.
 */
const codeOnly = (): string =>
  gatewaySource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Every literal the bot can say. */
const botMessages = (): string[] => {
  const found = gatewaySource.match(
    /text:\s*(?:'[^']*'|"[^"]*"|`[^`]*`)(?:\s*\+\s*(?:'[^']*'|"[^"]*"|`[^`]*`))*/g
  );
  return (found ?? []).map(block =>
    (block.match(/'([^']*)'|"([^"]*)"|`([^`]*)`/g) ?? [])
      .map(part => part.slice(1, -1))
      .join('')
      .replace(/\s+/g, ' ')
      .trim()
  );
};

describe('the bot speaks with one voice', () => {
  it('is always the firm, never a person', () => {
    // The script had drifted between "I could not read that date" and "we
    // cannot read a voice note" — sometimes an individual, sometimes a
    // company. An insurer is a "we", and a claimant deciding whether this is
    // legitimate reads inconsistency as a tell.
    const firstPerson = botMessages().filter(text => /\bI\b/.test(text));
    expect(firstPerson).toEqual([]);
  });
});

describe('a claimant is told what they are in for', () => {
  it.each(Object.entries(CASE_FLOWS))('%s lists what to gather', (_name, flow) => {
    // Meeting "upload the Property Irregularity Report" at question eleven
    // with nothing to hand leaves two options: abandon, or skip something the
    // claim needs. Both are losses, and neither shows up as an error.
    const needs = whatYouWillNeed(flow);
    expect(needs.length).toBeGreaterThan(2);
    expect(needs.some(need => /bank/.test(need))).toBe(true);
  });

  it('does not promise "a few questions" before asking sixteen', () => {
    // It did, and the very next message said "(1 of 16)" — the bot
    // contradicting itself while trust is still being established.
    //
    // Asserted against what the bot *says*, not against the file: the first
    // version of this test read the source and failed on the comment
    // explaining the removal, which is a test measuring the wrong thing.
    expect(codeOnly()).not.toMatch(/a few questions and we are done/i);
  });

  it('says the conversation can be paused', () => {
    // The state is in the database, so it was always true; nobody had told
    // the claimant. On a sixteen-question form that is the difference between
    // a pause and an abandonment.
    expect(codeOnly()).toMatch(/stop at any point/i);
  });
});

describe('asking for a payout account in a chat', () => {
  it('explains itself before asking', () => {
    // Three questions for bank details, over Telegram, is the exact shape of
    // a scam. A cautious claimant stopping here loses the claim at the last
    // step, and the reassurance costs one sentence.
    const bankStep = CASE_FLOWS.LUGGAGE_LOSS.steps.find(step => step.id === 'bank-name');
    expect(bankStep?.prompt).toMatch(/encrypted/i);
    expect(bankStep?.prompt).toMatch(/never ask you to pay/i);
  });
});
