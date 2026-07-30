import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import crypto from 'crypto';
import { ActorType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { auditTarget, redactMessage, safeQuery, shouldAudit } from '../audit/audit-scope';

interface ErrorResponse {
  success: false;
  error: {
    statusCode: number;
    message: string | string[];
    error: string;
    path: string;
    timestamp: string;
    requestId?: string;
  };
}

/**
 * Also the audit sink for failed requests.
 *
 * Guards run *before* interceptors in NestJS, so a rejection by JwtAuthGuard or
 * TenantGuard never reaches the AuditLogInterceptor at all — which meant refused
 * requests, the very events an examiner looks for, were recorded nowhere. This
 * was found by firing three rejected requests and counting zero audit rows.
 *
 * Exception filters do catch guard rejections, so failures are recorded here and
 * successes in the interceptor. Splitting it that way gives exactly one row per
 * request instead of the double-write that would follow from both recording
 * handler errors.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly audit: AuditService) {}

  /** Record a refused or failed request. Never allowed to mask the response. */
  private recordFailure(request: any, statusCode: number, requestId: string, message: unknown) {
    try {
      if (!shouldAudit(request.method, request.url, statusCode)) return;

      const target = auditTarget(request.method, request.url);
      const reason = Array.isArray(message) ? message.join('; ') : String(message ?? '');

      void this.audit.record({
        ...target,
        actorId: request.user?.id ?? null,
        actorType:
          request.user?.role && request.user.role in ActorType
            ? (request.user.role as ActorType)
            : ActorType.SYSTEM,
        userId: request.user?.id ?? null,
        tenantId: request.tenantContext?.tenantId ?? request.user?.currentTenantId ?? null,
        ipAddress: request.ip ?? null,
        userAgent: (request.headers?.['user-agent'] as string) ?? null,
        metadata: {
          requestId,
          statusCode,
          outcome: 'FAILURE',
          // Framework messages quote the request URL, which can carry an NRIC.
          reason: redactMessage(reason).slice(0, 300),
          ...(safeQuery(request.url) ? { query: safeQuery(request.url) } : {}),
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to record an audit row for a refused request',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const requestId = (request.headers['x-request-id'] as string) || crypto.randomUUID();

    let statusCode: number;
    let message: string | string[];
    let error: string;
    const additionalData: Record<string, any> = {};

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = (responseObj.message as string | string[]) || exception.message;
        error = (responseObj.error as string) || exception.name;

        // Collect other extra properties (like requiresVerification, userId, phoneNumber)
        const { message: _, error: __, statusCode: ___, ...extras } = responseObj;
        Object.assign(additionalData, extras);
      } else {
        message = exception.message;
        error = exception.name;
      }
    } else if (exception instanceof Error) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'InternalServerError';

      // Log the actual error for debugging
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'An unexpected error occurred';
      error = 'UnknownError';
    }

    const errorResponse: any = {
      success: false,
      error: {
        statusCode,
        message,
        error,
        path: request.url,
        timestamp: new Date().toISOString(),
        requestId,
        ...additionalData,
      },
    };

    this.recordFailure(request, statusCode, requestId, message);

    response.status(statusCode).send(errorResponse);
  }
}
