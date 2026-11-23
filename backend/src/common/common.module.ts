import { Global, Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ApiExceptionFilter } from "./http/api-exception.filter.js";
import { RequestLoggingInterceptor } from "./http/request-logging.interceptor.js";
import { StructuredLogger } from "./logging/structured-logger.js";

@Module({
  providers: [
    StructuredLogger,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
  ],
  exports: [StructuredLogger],
})
@Global()
export class CommonModule {}
