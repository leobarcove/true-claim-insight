import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  holdsAdjusterDuties,
  isRoleAllowedInTenant,
  isSelfAction,
  mayAuthorAdjusterWork,
  ROLE_PROFILES,
  TENANT_ROLES,
} from '@tci/shared-types';

/**
 * The access policy (@tci/shared-types access-policy.ts) — the rules every
 * service reads, pinned so a change to them is a visible, reviewed act.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const PRISMA = join(REPO_ROOT, 'packages', 'prisma-client', 'prisma');

describe('which roles may exist in which kind of tenant', () => {
  it('pins the matrix', () => {
    expect(TENANT_ROLES).toEqual({
      ADJUSTING_FIRM: [
        'ADJUSTER',
        'FIRM_ADMIN',
        'COMPLIANCE_OFFICER',
        'SUPPORT_DESK',
        'INTAKE_AGENT',
      ],
      INSURER: [
        'FIRM_ADMIN',
        'SIU_INVESTIGATOR',
        'COMPLIANCE_OFFICER',
        'SUPPORT_DESK',
        'SHARIAH_REVIEWER',
        'INTAKE_AGENT',
      ],
    });
  });

  it('refuses an adjusting employee inside an insurer — the independence the PD requires', () => {
    expect(isRoleAllowedInTenant('ADJUSTER', 'INSURER')).toBe(false);
    expect(isRoleAllowedInTenant('ADJUSTER', 'ADJUSTING_FIRM')).toBe(true);
  });

  it('keeps insurer functions out of the adjusting firm', () => {
    expect(isRoleAllowedInTenant('SIU_INVESTIGATOR', 'ADJUSTING_FIRM')).toBe(false);
    expect(isRoleAllowedInTenant('SHARIAH_REVIEWER', 'ADJUSTING_FIRM')).toBe(false);
  });

  it('never grants the platform role or the claimant identity through a membership', () => {
    for (const type of ['ADJUSTING_FIRM', 'INSURER']) {
      expect(isRoleAllowedInTenant('SUPER_ADMIN', type)).toBe(false);
      expect(isRoleAllowedInTenant('CLAIMANT', type)).toBe(false);
    }
  });

  it('fails closed on an unknown or missing tenant type', () => {
    expect(isRoleAllowedInTenant('FIRM_ADMIN', null)).toBe(false);
    expect(isRoleAllowedInTenant('FIRM_ADMIN', 'BROKER')).toBe(false);
    expect(isRoleAllowedInTenant(null, 'INSURER')).toBe(false);
  });

  it('the migration that suspended stale memberships used the same matrix', () => {
    // The SQL cannot import the TypeScript, so it mirrors it by hand. This is
    // the check that the mirror was right when the migration was written.
    const migration = readdirSync(join(PRISMA, 'migrations')).find(name =>
      name.endsWith('_tenant_scoped_registers_and_memberships')
    );
    const sql = readFileSync(join(PRISMA, 'migrations', migration!, 'migration.sql'), 'utf8');
    const listFor = (type: string) => {
      const match = sql.match(
        new RegExp(`t\\."type" = '${type}' AND ut\\."role" NOT IN \\(([^)]*)\\)`)
      );
      return match![1].split(',').map(role => role.trim().replace(/'/g, ''));
    };
    // INTAKE_AGENT arrived a day later (25 Sep 2026); no membership could hold
    // it when this migration ran, so its absence from the lists suspended
    // nothing. Every other role must match.
    const atTheTime = (roles: readonly string[]) => roles.filter(role => role !== 'INTAKE_AGENT');
    expect(listFor('ADJUSTING_FIRM')).toEqual(atTheTime(TENANT_ROLES.ADJUSTING_FIRM));
    expect(listFor('INSURER')).toEqual(atTheTime(TENANT_ROLES.INSURER));
  });
});

describe('who authors the adjuster work and holds the adjuster duties', () => {
  it('only the adjusting firm, and unknown is no', () => {
    expect(mayAuthorAdjusterWork('ADJUSTING_FIRM')).toBe(true);
    expect(mayAuthorAdjusterWork('INSURER')).toBe(false);
    expect(mayAuthorAdjusterWork(undefined)).toBe(false);
    expect(holdsAdjusterDuties('ADJUSTING_FIRM')).toBe(true);
    expect(holdsAdjusterDuties('INSURER')).toBe(false);
    expect(holdsAdjusterDuties(null)).toBe(false);
  });
});

describe('separation of duties', () => {
  it('matches the actor against the subjects, and absence never matches', () => {
    expect(isSelfAction('u1', ['u2', 'u1'])).toBe(true);
    expect(isSelfAction('u1', ['u2', null, undefined])).toBe(false);
    expect(isSelfAction(null, [null])).toBe(false);
  });
});

describe('role profiles (BNM MCIPD 10.25)', () => {
  it('describes every role the schema defines, and no other', () => {
    const schema = readFileSync(join(PRISMA, 'schema.prisma'), 'utf8');
    const block = schema.match(/enum UserRole \{([^}]*)\}/)![1];
    const roles = block
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('//'));
    expect(Object.keys(ROLE_PROFILES).sort()).toEqual(roles.sort());
  });

  it('places each role where TENANT_ROLES allows it', () => {
    for (const [role, profile] of Object.entries(ROLE_PROFILES)) {
      for (const type of ['ADJUSTING_FIRM', 'INSURER'] as const) {
        expect([role, type, profile.heldIn.includes(type)]).toEqual([
          role,
          type,
          isRoleAllowedInTenant(role, type),
        ]);
      }
    }
  });
});
