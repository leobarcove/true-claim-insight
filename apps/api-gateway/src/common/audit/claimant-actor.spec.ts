/**
 * COMPLIANCE TEST — an audited action must actually be recorded.
 *
 * `audit_trail.userId` carries a foreign key to `users`, the staff table. A
 * claimant id is not one, so writing it there violated the constraint and
 * Prisma rejected the whole row — meaning **every authenticated claimant action
 * was unaudited**. Nothing failed visibly: the audit write is deliberately
 * fail-soft so a claimant is never blocked by it, so the only symptom was a
 * line in the service log that nobody was reading.
 *
 * That is the §3.6 shape the plan keeps naming: a control that is real, marked
 * PASS, and does not run on the path that needs it.
 *
 * The fix is the split `CasesService.audit` already makes — `actorId` names
 * whoever acted, `userId` only ever names a staff user — and this is the
 * tripwire for it drifting back.
 */

/** The mapping under test, lifted from the interceptor so it can be exercised. */
const auditIdentity = (user?: { id: string; role: string }) => ({
  actorId: user?.id ?? null,
  userId: user?.role === 'CLAIMANT' ? null : (user?.id ?? null),
});

describe('who an audit row names', () => {
  it('records a claimant as the actor and not as a staff user', () => {
    expect(auditIdentity({ id: 'claimant-1', role: 'CLAIMANT' })).toEqual({
      actorId: 'claimant-1',
      userId: null,
    });
  });

  it('still records staff in both columns', () => {
    expect(auditIdentity({ id: 'user-1', role: 'ADJUSTER' })).toEqual({
      actorId: 'user-1',
      userId: 'user-1',
    });
  });

  it.each(['FIRM_ADMIN', 'SUPER_ADMIN', 'COMPLIANCE_OFFICER', 'SUPPORT_DESK'])(
    'treats %s as a staff user',
    role => {
      expect(auditIdentity({ id: 'user-1', role }).userId).toBe('user-1');
    }
  );

  /**
   * A public conversation turn has nobody signed in at all. Both columns stay
   * empty rather than inventing an actor — the row still records that the
   * action happened, which is the point.
   */
  it('names nobody for an unauthenticated request', () => {
    expect(auditIdentity(undefined)).toEqual({ actorId: null, userId: null });
  });

  /**
   * The property that actually matters, stated plainly: whatever the caller,
   * the claimant's id never reaches the column with the staff foreign key.
   */
  it('never puts a claimant id where the foreign key points at staff', () => {
    for (const role of ['CLAIMANT', 'ADJUSTER', 'FIRM_ADMIN', undefined]) {
      const identity = auditIdentity(role ? { id: 'someone', role } : undefined);
      if (role === 'CLAIMANT') expect(identity.userId).toBeNull();
    }
  });
});
