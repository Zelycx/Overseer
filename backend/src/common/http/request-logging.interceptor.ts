import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { Observable, finalize } from "rxjs";
import { StructuredLogger } from "../logging/structured-logger.js";

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: StructuredLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    const requestId = this.requestId(request.headers["x-request-id"]);
    response.setHeader("X-Request-Id", requestId);

    return next.handle().pipe(
      finalize(() => {
        this.logger.logEvent(
          "http_request",
          {
            requestId,
            method: request.method,
            route: request.route?.path ?? request.path,
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
          },
          "Http",
        );
      }),
    );
  }

  private requestId(value: string | string[] | undefined): string {
    const candidate = Array.isArray(value) ? value[0] : value;
    return candidate && /^[A-Za-z0-9._-]{1,64}$/.test(candidate)
      ? candidate
      : randomUUID();
  }
}
