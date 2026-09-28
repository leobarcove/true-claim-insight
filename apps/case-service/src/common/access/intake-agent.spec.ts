import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import * as ts from 'typescript';
import { isRoleAllowedInTenant, ROLE_PROFILES } from '@tci/shared-types';
import { CasesService } from '../../cases/cases.service';
import { TenantScope } from '../decorators/tenant.decorator';
import { TenantContext } from '../guards/tenant.guard';

/**
 * The intake agent (25 Sep 2026).
 *
 * PIAM-registered agents signed in as ADJUSTER. Under TENANT_ROLES that either
 * refused them — the agent-assisted design has them typing for the insurer they
 * represent, where ADJUSTER cannot exist — or, in an adjusting firm, let them
 * write reports and quantum, which PD 5.2 reserves for adjusting employees.
 * INTAKE_AGENT takes a claim in and nothing else.
 */

const REPO = join(__dirname, '..', '..', '..', '..', '..');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts') ? [full] : [];
  });

const name = (d: ts.Decorator) =>
  ts.isCallExpression(d.expression) ? d.expression.expression.getText() : d.expression.getText();

/** Every route whose effective @Roles admits INTAKE_AGENT, as "Controller.method". */
function routesAdmittingTheAgent(app: string): string[] {
  const found: string[] = [];
  for (const file of sourceFiles(join(REPO, 'apps', app, 'src'))) {
    const text = readFileSync(file, 'utf8');
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    // Role lists declared as constants in the file (INTAKE_ROLES = [...]).
    const constants = new Map<string, string>();
    source.forEachChild(node => {
      if (!ts.isVariableStatement(node)) return;
      for (const declaration of node.declarationList.declarations) {
        if (declaration.initializer) {
          constants.set(declaration.name.getText(), declaration.initializer.getText());
        }
      }
    });
    const expand = (list: string): string =>
      list.replace(/\.\.\.(\w+)/g, (_m, id) =>
        constants.has(id) ? expand(constants.get(id)!) : id
      );

    source.forEachChild(node => {
      if (!ts.isClassDeclaration(node)) return;
      const classDecorators = ts.getDecorators(node) ?? [];
      if (!classDecorators.some(d => name(d) === 'Controller')) return;
      const classRoles = classDecorators.find(d => name(d) === 'Roles')?.getText();
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const decorators = ts.getDecorators(member) ?? [];
        if (!decorators.some(d => ['Get', 'Post', 'Put', 'Patch', 'Delete'].includes(name(d))))
          continue;
        const roles = decorators.find(d => name(d) === 'Roles')?.getText() ?? classRoles;
        if (roles && /INTAKE_AGENT/.test(expand(roles))) {
          found.push(`${node.name!.getText()}.${member.name.getText()}`);
        }
      }
    });
  }
  return found.sort();
}

describe('the intake agent takes a claim in, and nothing else', () => {
  it('reaches exactly the intake routes in case-service', () => {
    expect(routesAdmittingTheAgent('case-service')).toEqual(
      [
        'CasesController.create',
        'CasesController.findOne',
        'CasesController.getFlow',
        'CasesController.patchAnswer',
        'CasesController.upload',
        'CasesController.removeDocument',
        'CasesController.submit',
        'ConsentController.notice',
        'ConsentController.grant',
      ].sort()
    );
  });

  it('reaches exactly the intake routes the gateway owns', () => {
    expect(routesAdmittingTheAgent('api-gateway')).toEqual(
      ['CasesController.create', 'ClaimantsController.lookup', 'ClaimantsController.resolve'].sort()
    );
  });

  it('may sit in either kind of tenant, because it grants nothing either side', () => {
    expect(isRoleAllowedInTenant('INTAKE_AGENT', 'INSURER')).toBe(true);
    expect(isRoleAllowedInTenant('INTAKE_AGENT', 'ADJUSTING_FIRM')).toBe(true);
    expect(ROLE_PROFILES.INTAKE_AGENT.customerInformation).toBe('CASE_SCOPED');
  });

  it('is what a PIAM agent signs in as — never ADJUSTER', () => {
    const auth = readFileSync(join(REPO, 'apps/api-gateway/src/auth/auth.service.ts'), 'utf8');
    expect(auth).toMatch(/const PIAM_AGENT_ROLE = 'INTAKE_AGENT';/);
    expect(auth).not.toMatch(/'ADJUSTER'/);
  });
});

describe('what an agent takes in goes to the handling firm', () => {
  const context = (userRole: string): TenantContext => ({
    tenantId: 'insurer-x',
    tenantType: 'INSURER',
    userId: 'agent-1',
    userRole,
    scope: TenantScope.STRICT,
    allowCrossTenant: false,
  });

  const service = () =>
    Object.assign(Object.create(CasesService.prototype), {
      configService: { get: () => 'pacific' },
      prisma: { tenant: { findUnique: jest.fn(async () => ({ type: 'ADJUSTING_FIRM' })) } },
      logger: { warn: jest.fn() },
    }) as unknown as {
      resolveCaseTenant: (ctx: TenantContext, p?: string | null, r?: boolean) => Promise<string>;
    };

  it('even when the request leaves routeAsClaimant off', async () => {
    await expect(service().resolveCaseTenant(context('INTAKE_AGENT'), null, false)).resolves.toBe(
      'pacific'
    );
  });

  it('while staff opening their own case still keep it', async () => {
    await expect(service().resolveCaseTenant(context('FIRM_ADMIN'), null, false)).resolves.toBe(
      'insurer-x'
    );
  });
});
