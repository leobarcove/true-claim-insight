import { describe, expect, it } from 'vitest';

import { checkAgentRegistrationNumber } from './registration-number';

describe('agent registration number validation', () => {
  it('accepts the PIAM registration format', () => {
    expect(checkAgentRegistrationNumber('999999-00')).toBeNull();
  });

  it.each(['', '999999', '999999-0000000', 'ABC999-00'])('rejects %j', value => {
    expect(checkAgentRegistrationNumber(value)).toBeTruthy();
  });
});
