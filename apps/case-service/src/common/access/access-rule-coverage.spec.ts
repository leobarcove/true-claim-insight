import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import * as ts from 'typescript';

/**
 * SECURITY TEST — every route declares who may call it.
 *
 * Both edges deny by default: the roles guard is global and refuses a route
 * that declares no rule (OWASP A01:2025, "deny by default"; BNM MCIPD 10.25,
 * access rights described per job). A route without a rule therefore fails
 * *closed* at runtime — this test makes it fail *loudly* in CI instead, before
 * a closed route ships as a broken screen and someone "fixes" it by opening
 * everything.
 *
 * Until September 2026 the default was the opposite: a route with no `@Roles`
 * admitted every signed-in role. 35 case-service routes relied on that, and 120
 * of the gateway's 153 authenticated routes declared no rule of their own —
 * document downloads, report signing and the retention sweep among them.
 *
 * Parsed with the TypeScript compiler, not a regex: decorators span lines and a
 * line scan silently misses them.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');

interface Route {
  file: string;
  controller: string;
  method: string;
  rules: string[];
  guards: string[];
}

const ROUTE_DECORATORS = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'All']);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(entry => {
    if (entry === 'node_modules' || entry === 'dist') return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts') ? [full] : [];
  });

const decoratorName = (decorator: ts.Decorator) => {
  const expression = decorator.expression;
  return ts.isCallExpression(expression) ? expression.expression.getText() : expression.getText();
};

const guardsIn = (decorators: readonly ts.Decorator[]) =>
  decorators
    .filter(decorator => decoratorName(decorator) === 'UseGuards')
    .flatMap(decorator =>
      ts.isCallExpression(decorator.expression)
        ? decorator.expression.arguments.map(argument => argument.getText())
        : []
    );

function routesOf(app: string, ruleNames: ReadonlySet<string>): Route[] {
  const routes: Route[] = [];
  for (const file of sourceFiles(join(REPO_ROOT, 'apps', app, 'src'))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    source.forEachChild(node => {
      if (!ts.isClassDeclaration(node)) return;
      const classDecorators = ts.getDecorators(node) ?? [];
      if (!classDecorators.some(decorator => decoratorName(decorator) === 'Controller')) return;
      const classRules = classDecorators.map(decoratorName).filter(name => ruleNames.has(name));
      const classGuards = guardsIn(classDecorators);

      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const decorators = ts.getDecorators(member) ?? [];
        const names = decorators.map(decoratorName);
        if (!names.some(name => ROUTE_DECORATORS.has(name))) continue;
        routes.push({
          file: relative(REPO_ROOT, file).split(sep).join('/'),
          controller: node.name?.getText() ?? '(anonymous)',
          method: member.name.getText(),
          rules: [...names.filter(name => ruleNames.has(name)), ...classRules],
          guards: [...guardsIn(decorators), ...classGuards],
        });
      }
    });
  }
  return routes;
}

const label = (route: Route) => `${route.file} ${route.controller}.${route.method}`;

describe('every route declares an access rule (deny by default)', () => {
  const gateway = routesOf(
    'api-gateway',
    new Set(['Roles', 'Public', 'InternalRoute', 'Authenticated', 'DelegatedAuthorisation'])
  );
  const caseService = routesOf('case-service', new Set(['Roles', 'Public', 'InternalRoute']));

  it('finds the routes it is meant to check (the scan itself works)', () => {
    expect(gateway.length).toBeGreaterThan(150);
    expect(caseService.length).toBeGreaterThan(150);
  });

  it('api-gateway: no route relies on a default', () => {
    expect(gateway.filter(route => !route.rules.length).map(label)).toEqual([]);
  });

  it('case-service: no route relies on a default', () => {
    expect(caseService.filter(route => !route.rules.length).map(label)).toEqual([]);
  });

  it('an internal route proves itself with the internal key', () => {
    const unkeyed = [
      ...gateway
        .filter(route => route.rules.includes('InternalRoute'))
        .filter(route => !route.guards.includes('InternalAuthGuard')),
      ...caseService
        .filter(route => route.rules.includes('InternalRoute'))
        .filter(route => !route.guards.includes('InternalKeyGuard')),
    ];
    expect(unkeyed.map(label)).toEqual([]);
  });

  it('no controller re-mounts the global authentication or roles guard', () => {
    // Mounted twice they run twice (a second JWT verification and user load per
    // request), and a controller that mounts them looks as though a controller
    // that does not is unprotected — the misreading this change removed.
    const remounted = [
      ...gateway.filter(route =>
        route.guards.some(guard => guard === 'JwtAuthGuard' || guard === 'RolesGuard')
      ),
      ...caseService.filter(route =>
        route.guards.some(guard => guard === 'InternalAuthGuard' || guard === 'RolesGuard')
      ),
    ];
    expect([...new Set(remounted.map(label))]).toEqual([]);
  });

  it.each([
    ['api-gateway', ['ThrottlerGuard', 'JwtAuthGuard', 'RolesGuard']],
    ['case-service', ['ThrottlerGuard', 'InternalAuthGuard', 'RolesGuard']],
  ])('%s registers its guards globally, identity before roles', (app, expected) => {
    const module = readFileSync(join(REPO_ROOT, 'apps', app, 'src', 'app.module.ts'), 'utf8');
    const registered = [...module.matchAll(/provide: APP_GUARD,\s*useClass: (\w+)/g)].map(
      match => match[1]
    );
    expect(registered).toEqual(expected);
  });
});
