import { CasesService } from './cases.service';

/**
 * A payout account that cannot be recovered must say so.
 *
 * Five cases on the demo book hold a `last4` and no ciphertext, from the
 * re-encryption defect fixed in `ecd342a`: `patchAnswer` wrote the display mask
 * over the real value on the turn after capture. The plaintext is gone by
 * design — it lived only in the column that was overwritten — so the repair
 * cleared the column rather than leaving it decrypting to "••••3123", which
 * reads as an account number and is not one.
 *
 * What is under test is the *distinction*. "Never captured" and "captured and
 * lost" are both a blank field, and they call for opposite actions: one needs
 * the claimant asked again, the other needs nothing at all.
 */
describe('revealing a payout account', () => {
  const context = { tenantId: 'tenant-1', userId: 'user-1', userRole: 'FIRM_ADMIN' } as never;

  const build = (caseRow: Record<string, unknown>, plaintext: string | null) => {
    const audit = jest.fn().mockResolvedValue(undefined);
    const service = Object.create(CasesService.prototype) as CasesService;

    Object.assign(service, {
      prisma: {
        case: { findUniqueOrThrow: jest.fn().mockResolvedValue({ bankAccountNumberEncrypted: null }) },
      },
      encryption: { decrypt: jest.fn().mockResolvedValue(plaintext) },
      auditService: { record: audit },
      getStaffCase: jest.fn().mockResolvedValue(caseRow),
      audit: jest.fn().mockResolvedValue(undefined),
    });

    return { service, audited: (service as unknown as { audit: jest.Mock }).audit };
  };

  const captured = {
    id: 'case-1',
    bankName: 'CIMB',
    bankAccountHolderName: 'Leo Boey',
    bankAccountLast4: '3123',
  };

  it('returns the account when it is there', async () => {
    const { service } = build(captured, '157098233123');
    const result = await service.revealPayoutDetails('case-1', context);

    expect(result.bankAccountNumber).toBe('157098233123');
    expect(result.unrecoverable).toBe(false);
  });

  it('flags a tail with nothing behind it as lost, not as absent', async () => {
    // The five repaired cases. A `last4` exists only because an account was
    // once promoted, so a null ciphertext beside it can only mean it is gone.
    const { service } = build(captured, null);
    const result = await service.revealPayoutDetails('case-1', context);

    expect(result.bankAccountNumber).toBeNull();
    expect(result.unrecoverable).toBe(true);
  });

  it('does not flag a case that never captured an account', async () => {
    // Crying "lost" over a claim that never reached the bank step would send
    // an operator chasing a claimant for something never asked of them.
    const { service } = build({ ...captured, bankAccountLast4: null }, null);
    const result = await service.revealPayoutDetails('case-1', context);

    expect(result.unrecoverable).toBe(false);
  });

  it('records the failure on the audit row', async () => {
    // An examiner asking "who saw this account" must not be shown a reveal
    // where nobody could have.
    const { service, audited } = build(captured, null);
    await service.revealPayoutDetails('case-1', context);

    expect(audited).toHaveBeenCalledWith(
      'case-1',
      'PAYOUT_DETAILS_REVEALED',
      context,
      expect.objectContaining({
        metadata: expect.objectContaining({ outcome: 'unrecoverable', last4: '3123' }),
      })
    );
  });

  it('still audits a successful reveal, without the failure marker', async () => {
    const { service, audited } = build(captured, '157098233123');
    await service.revealPayoutDetails('case-1', context);

    const [, , , options] = audited.mock.calls[0];
    expect(options.metadata.outcome).toBeUndefined();
  });
});
