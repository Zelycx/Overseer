import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { StructuredLogger } from "./common/logging/structured-logger.js";

async function bootstrap(): Promise<void> {
  const logger = new StructuredLogger();
  const app = await NestFactory.create(AppModule, { logger });

  const config = app.get(ConfigService);
  const nodeEnvironment = config.get<string>("NODE_ENV", "development");
  const corsOrigins = config
    .get<string>("CORS_ORIGINS", "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsCredentials =
    config.get<string>("CORS_CREDENTIALS", "false") === "true";
  const swaggerSetting = config.get<string>("SWAGGER_ENABLED", "auto");
  const swaggerEnabled =
    swaggerSetting === "true" ||
    (swaggerSetting === "auto" && nodeEnvironment !== "production");

  app.use(
    helmet({
      strictTransportSecurity:
        nodeEnvironment === "production"
          ? { maxAge: 31_536_000, includeSubDomains: true }
          : false,
    }),
  );
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: corsCredentials,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  });
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: 0, prefix: "v" });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.enableShutdownHooks();

  if (swaggerEnabled) {
    const documentConfig = new DocumentBuilder()
      .setTitle("Overseer API")
      .setDescription("Central API for Overseer clients.")
      .setVersion("1.0.0")
      .addServer("/api/v1")
      .build();
    const document = SwaggerModule.createDocument(app, documentConfig);
    SwaggerModule.setup("api/docs", app, document, {
      jsonDocumentUrl: "api/docs/openapi.json",
      yamlDocumentUrl: "api/docs/openapi.yaml",
    });
  }

  const port = config.get<number>("PORT", 3000);
  const host = config.get<string>("HOST", "127.0.0.1");
  await app.listen(port, host);
  logger.log(`Overseer API listening on ${host}:${port}`, "Bootstrap");
}

bootstrap().catch(() => {
  // Avoid printing configuration or low-level adapter errors during startup.
  process.stderr.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), level: "error", context: "Bootstrap", message: "Application startup failed" })}\n`,
  );
  process.exitCode = 1;
});
