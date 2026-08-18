import { readFileSync } from 'fs';
import { join } from 'path';

import { branchInputSteps, CASE_FLOWS, CHOICE_DISPLAY_MAX, whatYouWillNeed } from '@tci/shared-types';

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

describe('a question with a known set of answers offers it', () => {
  /** Every step across every flow, so a fix to one flow cannot miss the others. */
  const allSteps = Object.values(CASE_FLOWS).flatMap(flow => flow.steps);

  it.each(['destination', 'airline', 'bank-name', 'treatment-country'])(
    '%s is a list, not a blank box',
    stepId => {
      // A real intake answered these three as "SG", "MAS" and "CIMB" — each
      // an abbreviation an adjuster can guess at and nothing downstream can
      // use. The answers are drawn from bounded, well-known sets, and asking
      // for them as free text is what made them ambiguous.
      const steps = allSteps.filter(step => step.id === stepId);
      expect(steps.length).toBeGreaterThan(0);
      for (const step of steps) {
        expect(step.answerType).toBe('choice');
        expect(step.choices?.length).toBeGreaterThan(0);
      }
    }
  );

  it('never traps a claimant whose answer is not on the list', () => {
    // The documented failure of guided bots: an option set that looks complete
    // and is not. Any list longer than what a channel shows at once is by
    // definition partial, so it must accept typing — otherwise the claimant
    // who flies an unlisted carrier cannot get past the question at all.
    const partial = allSteps.filter(
      step => step.answerType === 'choice' && (step.choices?.length ?? 0) > CHOICE_DISPLAY_MAX
    );
    expect(partial.length).toBeGreaterThan(0);
    for (const step of partial) {
      expect({ step: step.id, allowOther: step.allowOther }).toEqual({
        step: step.id,
        allowOther: true,
      });
    }
  });

  it('keeps free text out of anything a branch routes on', () => {
    // `evaluateNext` matches exact values, so a typed answer on a branch input
    // would fall silently to the default arm — a claimant sent down the wrong
    // half of the flow with no error anywhere.
    for (const flow of Object.values(CASE_FLOWS)) {
      const routed = branchInputSteps(flow);
      const offenders = flow.steps
        .filter(step => routed.has(step.id) && step.allowOther)
        .map(step => step.id);
      expect(offenders).toEqual([]);
    }
  });
});

describe('a claimant is told where to find what we ask for', () => {
  it('never names a document without saying what it is', () => {
    // "Please upload the Property Irregularity Report" names the artefact and
    // stops. That is the airline's term for a form the claimant was handed
    // without being told its name — so the prompt is only useful to someone
    // who already knows the answer.
    const documents = Object.values(CASE_FLOWS)
      .flatMap(flow => flow.steps)
      .filter(step => step.answerType === 'document');

    expect(documents.length).toBeGreaterThan(0);
    for (const step of documents) {
      expect({ step: step.id, hint: (step.hint ?? '').length > 30 }).toEqual({
        step: step.id,
        hint: true,
      });
    }
  });

  it('says what a rejected format should have looked like', () => {
    // "That does not look right" names no rule, so the obvious repair —
    // retyping the same thing more carefully — fails identically. At the
    // payout step that is a loop, not a correction.
    const patterned = Object.values(CASE_FLOWS)
      .flatMap(flow => flow.steps)
      .filter(step => step.validation?.pattern);

    expect(patterned.length).toBeGreaterThan(0);
    for (const step of patterned) {
      expect({ step: step.id, explains: Boolean(step.validation?.patternError) }).toEqual({
        step: step.id,
        explains: true,
      });
    }
  });

  it('offers the date formats it actually accepts, not the narrowest one', () => {
    // `parseTextDate` has always taken "16 June 2026" and "today". Only the
    // recovery message said so, so the generous wording was reserved for
    // claimants who had already failed once.
    expect(codeOnly()).toMatch(/For example 16\/06\/2026, or 16 June 2026/);
  });
});
