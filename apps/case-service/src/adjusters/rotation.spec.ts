import { ROTATION_RUN_THRESHOLD, rotationAdvisory } from './rotation';

/**
 * COMPLIANCE TESTS — PD 11.2(b) rotation of adjusting assignments.
 *
 * Rotation is monitored, never blocked: a hard rule would regularly force the
 * less qualified adjuster onto a claim, which 12.2(b) forbids from the other
 * direction. The advisory on the assignment audit row is the monitoring.
 */
describe('Rotation (PD 11.2(b))', () => {
  it('advises when the candidate would extend an unbroken streak', () => {
    const advisory = rotationAdvisory(['a1', 'a1', 'a1'], 'a1');

    expect(advisory).toMatch(/11\.2\(b\)/);
    expect(advisory).toMatch(/rotat/i);
  });

  it('stays quiet when anyone else appears in the recent run', () => {
    expect(rotationAdvisory(['a1', 'a2', 'a1'], 'a1')).toBeNull();
  });

  it('stays quiet when a different adjuster breaks the streak now', () => {
    // Assigning someone NEW is exactly what rotation wants — no advisory.
    expect(rotationAdvisory(['a1', 'a1', 'a1'], 'a2')).toBeNull();
  });

  it('needs a full threshold of history before it speaks', () => {
    // Two assignments ever is a young panel, not a capture pattern.
    expect(rotationAdvisory(['a1', 'a1'], 'a1')).toBeNull();
    expect(ROTATION_RUN_THRESHOLD).toBe(3);
  });

  it('judges only the most recent run, not ancient history', () => {
    expect(rotationAdvisory(['a1', 'a1', 'a1', 'a2', 'a2'], 'a1')).not.toBeNull();
    expect(rotationAdvisory(['a2', 'a1', 'a1', 'a1'], 'a1')).toBeNull();
  });
});
