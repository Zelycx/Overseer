import { Injectable, LoggerService } from "@nestjs/common";

type LogLevel =
  | "info"
  | "log"
  | "error"
  | "warn"
  | "debug"
  | "verbose"
  | "fatal";

@Injectable()
export class StructuredLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    this.write("info", message, context);
  }

  error(message: unknown, _trace?: string, context?: string): void {
    this.write("error", message, context);
  }

  warn(message: unknown, context?: string): void {
    this.write("warn", message, context);
  }

  debug(message: unknown, context?: string): void {
    this.write("debug", message, context);
  }

  verbose(message: unknown, context?: string): void {
    this.write("debug", message, context);
  }

  fatal(message: unknown, context?: string): void {
    this.write("fatal", message, context);
  }

  logEvent(
    event: string,
    fields: Record<string, string | number>,
    context?: string,
  ): void {
    const record = {
      timestamp: new Date().toISOString(),
      level: "info",
      ...(context ? { context } : {}),
      event,
      ...fields,
    };
    process.stdout.write(`${JSON.stringify(record)}\n`);
  }

  private write(level: LogLevel, message: unknown, context?: string): void {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      ...(context ? { context } : {}),
      message: typeof message === "string" ? message : "Application log event",
    };
    const line = JSON.stringify(record);
    if (level === "error" || level === "fatal") {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
}
