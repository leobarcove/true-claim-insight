import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { ActorType } from '@prisma/client';
import crypto from 'crypto';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../audit/audit.service';
import { auditTarget, safeQuery, shouldAudit } from '../audit/audit-scope';

/**
 * Records what happened at the edge, into the audit trail.
 *
 * Until now this interceptor logged to stdout and carried a TODO where the
 * persistence should be — the system appeared to audit everything and audited
 * nothing, which is the most dangerous shape a control can take
 * (docs/MASTER_PLAN.md §3.6). It now writes rows.
 *
 * **It never reads the request body.** Not as an oversight — as an invariant.
 * Bodies here carry NRICs, bank account numbers and passwords, and the audit
 * table is append-only by design, so anything written into it cannot afterwards
 * be redacted. Persisting a body would therefore move personal data into the one
 * place it can never be removed from. What gets recorded is the route, the actor,
 * the outcome and the timing; *what changed* is recorded by the services that
 * own the data, which can capture before/after values safely because they know
 * which fields are sensitive.
 */
/**
 * ActorType mirrors the role enum rather than being a generic actor kind, so the
 * caller's role is recorded when it is one we know and SYSTEM otherwise — an
 * unauthenticated or service-initiated request is not attributable to a person.
 */
function actorTypeFor(role: string | undefined): ActorType {
  return role && role in ActorType ? (role as ActorType) : ActorType.SYSTEM;
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditLog');

  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const startedAt = Date.now();
    const requestId = request.headers['x-request-id'] || crypto.randomUUID();
    response.header('X-Request-ID', requestId);

    const method: string = request.method;
    const url: string = request.url;

    const log = (statusCode: number, errorMessage?: string) => {
      this.logger.log(
        `${method} ${url} ${statusCode} ${Date.now() - startedAt}ms` +
          (request.user?.id ? ` [user:${request.user.id}]` : '') +
          (errorMessage ? ` - ${errorMessage}` : '')
      );
    };

    /** Successful requests only — failures are recorded by HttpExceptionFilter. */
    const record = (statusCode: number) => {
      if (!shouldAudit(method, url, statusCode)) return;

      // Deliberately not awaited: the response must not wait on the audit write,
      // and AuditService swallows and logs its own failures.
      void this.audit.record({
        ...auditTarget(method, url),
        actorId: request.user?.id ?? null,
        actorType: actorTypeFor(request.user?.role),
        userId: request.user?.id ?? null,
        tenantId: request.tenantContext?.tenantId ?? request.user?.currentTenantId ?? null,
        ipAddress: request.ip || request.headers['x-forwarded-for'] || null,
        userAgent: request.headers['user-agent'] ?? null,
        metadata: {
          requestId,
          statusCode,
          durationMs: Date.now() - startedAt,
          outcome: 'SUCCESS',
          ...(safeQuery(url) ? { query: safeQuery(url) } : {}),
        },
      });
    };

    return next.handle().pipe(
      tap({
        next: () => {
          log(response.statusCode);
          record(response.statusCode);
        },
        // Failures are recorded by HttpExceptionFilter, which is the only place
        // that sees guard rejections. Recording in both would double every
        // failed request.
        error: error => log(error.status || 500, error.message),
      })
    );
  }
}
