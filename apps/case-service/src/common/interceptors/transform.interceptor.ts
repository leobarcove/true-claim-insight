import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Decimal } from '@prisma/client/runtime/library';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    timestamp: string;
    requestId?: string;
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

/**
 * Convert Prisma Decimal types to numbers for JSON serialization
 */
function serializeDecimals(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Decimal) {
    return obj.toNumber();
  }

  if (obj instanceof Date) {
    return obj.toISOString();
  }

  if (typeof obj === 'bigint') {
    return Number(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeDecimals);
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: any = {};
    for (const key of Object.keys(obj)) {
      result[key] = serializeDecimals(obj[key]);
    }
    return result;
  }

  return obj;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      map(data => {
        // A binary body is the response, not something to put inside one.
        // Wrapping a StreamableFile produced "Attempted to send payload of
        // invalid type 'object'" — Fastify cannot serialise it, and an
        // envelope around a JPEG would be meaningless even if it could.
        if (data instanceof StreamableFile) return data as unknown as ApiResponse<T>;

        return {
          success: true,
          data: serializeDecimals(data),
          meta: {
            timestamp: new Date().toISOString(),
            requestId: request.id,
          },
        };
      })
    );
  }
}
