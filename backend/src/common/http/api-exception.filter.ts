import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { StructuredLogger } from "../logging/structured-logger.js";

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: StructuredLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = this.requestId(request.headers["x-request-id"]);
    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : "Internal server error";

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error("Request failed", "ApiExceptionFilter");
    }

    response.status(statusCode).json({
      statusCode,
      error:
        statusCode >= HttpStatus.INTERNAL_SERVER_ERROR
          ? "Internal Server Error"
          : undefined,
      message,
      timestamp: new Date().toISOString(),
      path: request.path,
      requestId,
    });
  }

  private requestId(value: string | string[] | undefined): string {
    const candidate = Array.isArray(value) ? value[0] : value;
    return candidate && /^[A-Za-z0-9._-]{1,64}$/.test(candidate)
      ? candidate
      : randomUUID();
  }
}
