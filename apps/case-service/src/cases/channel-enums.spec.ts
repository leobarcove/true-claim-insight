import { CaseChannel as PrismaCaseChannel } from '@prisma/client';
import { CaseChannel as SharedCaseChannel } from '@tci/shared-types';

/**
 * The same channels, declared twice.
 *
 * Prisma generates one enum from the schema; `@tci/shared-types` declares
 * another so the frontends and the flow resolver can use it without depending
 * on Prisma. They are value-identical, which is what lets the flow resolver
 * accept a channel that came out of the database.
 *
 * TypeScript treats them as nominally distinct, so the crossing point is a
 * cast — and a cast is exactly where a divergence would go unnoticed. Adding a
 * channel to one and not the other would mean the resolver silently matching
 * no overlay for it, and a claimant reading the wrong wording with nothing in
 * the logs. This test is the tripwire for that.
 */
describe('CaseChannel is declared identically in Prisma and shared-types', () => {
  it('has the same members in both', () => {
    expect(Object.keys(SharedCaseChannel).sort()).toEqual(Object.keys(PrismaCaseChannel).sort());
  });

  it('maps each member to the same string', () => {
    for (const key of Object.keys(PrismaCaseChannel)) {
      expect(String(SharedCaseChannel[key as keyof typeof SharedCaseChannel])).toBe(
        String(PrismaCaseChannel[key as keyof typeof PrismaCaseChannel])
      );
    }
  });
});
