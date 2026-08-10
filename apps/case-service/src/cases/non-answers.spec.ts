import { validateAnswer, type FlowStep } from '@tci/shared-types';

/**
 * NON-ANSWERS on the fields nobody else can fill in.
 *
 * "I don't know" was stored verbatim as a luggage damage description. The
 * claim reaches vetting unusable and bounces back days later, when the
 * claimant has stopped thinking about it.
 */
describe('description steps require substance', () => {
  const description: FlowStep = {
    id: 'damage-description',
    prompt: 'Please describe the damage to your luggage.',
    label: 'Damage description',
    answerType: 'text',
    validation: { minLength: 20 },
    next: { type: 'end' },
  };

  const plainText: FlowStep = {
    id: 'airline',
    prompt: 'Which airline?',
    label: 'Airline',
    answerType: 'text',
    next: { type: 'end' },
  };

  it('refuses the exact answer that got through before', () => {
    const result = validateAnswer(description, "I don't know");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/your own description/i);
  });

  it('refuses the other ways people decline, including Malay', () => {
    for (const text of ['idk', 'not sure', 'N/A', 'nil', '-', 'tak tahu']) {
      expect(validateAnswer(description, text).valid).toBe(false);
    }
  });

  it('accepts a real description', () => {
    expect(
      validateAnswer(description, 'The wheel snapped off and the zip is torn along one side.').valid
    ).toBe(true);
  });

  it('asks for more when the answer is too thin to use', () => {
    const result = validateAnswer(description, 'broken');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/more detail/i);
  });

  it('never touches steps that did not ask for substance', () => {
    // "nil" is a poor airline name but refusing it strands a claimant who has
    // no idea what we would accept instead.
    expect(validateAnswer(plainText, 'nil').valid).toBe(true);
    expect(validateAnswer(plainText, 'MH').valid).toBe(true);
  });
});
