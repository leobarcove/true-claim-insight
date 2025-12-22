import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import crypto from 'crypto';

interface AuditLogEntry {
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  ip: string;
  userAgent: string;
  statusCode: number;
  responseTime: number;
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditLog');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const startTime = Date.now();
    const requestId = request.headers['x-request-id'] || crypto.randomUUID();

    // Add request ID to response headers
    response.header('X-Request-ID', requestId);

    return next.handle().pipe(
      tap({
        next: () => {
          const logEntry: AuditLogEntry = {
            timestamp: new Date().toISOString(),
            requestId,
            method: request.method,
            path: request.url,
            userId: request.user?.id,
            userEmail: request.user?.email,
            userRole: request.user?.role,
            ip: request.ip || request.headers['x-forwarded-for'],
            userAgent: request.headers['user-agent'] || 'unknown',
            statusCode: response.statusCode,
            responseTime: Date.now() - startTime,
          };

          // Log successful requests
          this.logger.log(
            `${logEntry.method} ${logEntry.path} ${logEntry.statusCode} ${logEntry.responseTime}ms` +
              (logEntry.userId ? ` [user:${logEntry.userId}]` : '')
          );

          // TODO: In production, persist to database or send to logging service
          // await this.auditService.log(logEntry);
        },
        error: error => {
          const logEntry: AuditLogEntry = {
            timestamp: new Date().toISOString(),
            requestId,
            method: request.method,
            path: request.url,
            userId: request.user?.id,
            userEmail: request.user?.email,
            userRole: request.user?.role,
            ip: request.ip || request.headers['x-forwarded-for'],
            userAgent: request.headers['user-agent'] || 'unknown',
            statusCode: error.status || 500,
            responseTime: Date.now() - startTime,
          };

          // Log error requests
          this.logger.error(
            `${logEntry.method} ${logEntry.path} ${logEntry.statusCode} ${logEntry.responseTime}ms` +
              (logEntry.userId ? ` [user:${logEntry.userId}]` : '') +
              ` - ${error.message}`
          );
        },
      })
    );
  }
}
