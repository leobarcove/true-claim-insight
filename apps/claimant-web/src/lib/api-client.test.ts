import { describe, expect, it } from 'vitest';

import { isStaffOtpVerification } from './api-client';

describe('staff OTP response handling', () => {
  it('recognises the staff verification endpoint', () => {
    expect(isStaffOtpVerification('/auth/staff/verify-code')).toBe(true);
    expect(isStaffOtpVerification('/auth/staff/verify-code?attempt=2')).toBe(true);
  });

  it('does not exempt authenticated endpoints from token refresh', () => {
    expect(isStaffOtpVerification('/auth/me')).toBe(false);
    expect(isStaffOtpVerification('/cases/claim-1')).toBe(false);
    expect(isStaffOtpVerification(undefined)).toBe(false);
  });
});
