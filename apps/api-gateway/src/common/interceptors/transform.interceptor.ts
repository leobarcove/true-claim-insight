import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import crypto from 'crypto';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: {
    timestamp: string;
    requestId?: string;
  };
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const request = context.switchToHttp().getRequest();
    const requestId = request.headers['x-request-id'] || crypto.randomUUID();

    return next.handle().pipe(
      map(data => {
        // A binary body is the response, not something to wrap. Enveloping a
        // StreamableFile made Fastify refuse it with "payload of invalid type
        // 'object'" — and an envelope around a JPEG would be meaningless even
        // if it could be serialised. The same guard exists in case-service:
        // both ends of a proxied download have to agree not to wrap it.
        if (data instanceof StreamableFile) return data as unknown as ApiResponse<T>;

        return {
          success: true,
          data,
          meta: {
            timestamp: new Date().toISOString(),
            requestId,
          },
        };
      })
    );
  }
}
