import { plainToInstance, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
} from "class-validator";

class EnvironmentVariables {
  @IsIn(["development", "test", "production"])
  NODE_ENV = "development";

  @IsInt()
  @Min(1)
  @Max(65535)
  @Type(() => Number)
  PORT = 3000;

  @IsString()
  HOST = "127.0.0.1";

  @IsOptional()
  @IsString()
  @Matches(/^postgres(?:ql)?:\/\//, {
    message: "DATABASE_URL must use a PostgreSQL URL scheme",
  })
  DATABASE_URL?: string;

  @IsString()
  CORS_ORIGINS = "";

  @IsIn(["true", "false"])
  CORS_CREDENTIALS = "false";

  @IsIn(["auto", "true", "false"])
  SWAGGER_ENABLED = "auto";
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const applicationKeys = [
    "NODE_ENV",
    "PORT",
    "HOST",
    "DATABASE_URL",
    "CORS_ORIGINS",
    "CORS_CREDENTIALS",
    "SWAGGER_ENABLED",
  ];
  const applicationConfig = Object.fromEntries(
    applicationKeys
      .filter((key) => Object.hasOwn(config, key))
      .map((key) => [key, config[key]]),
  );
  const withDefaults = {
    NODE_ENV: "development",
    PORT: "3000",
    HOST: "127.0.0.1",
    CORS_ORIGINS: "",
    CORS_CREDENTIALS: "false",
    SWAGGER_ENABLED: "auto",
    ...applicationConfig,
  };
  const environment = plainToInstance(EnvironmentVariables, withDefaults, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(environment, {
    skipMissingProperties: false,
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  if (errors.length > 0) {
    const details = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  validateCorsOrigins(
    environment.CORS_ORIGINS,
    environment.NODE_ENV,
    environment.CORS_CREDENTIALS,
  );

  return {
    ...withDefaults,
    PORT: Number(environment.PORT),
    HOST: environment.HOST,
    NODE_ENV: environment.NODE_ENV,
  };
}

function validateCorsOrigins(
  origins: string,
  nodeEnvironment: string,
  credentials: string,
): void {
  for (const value of origins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("CORS_ORIGINS must contain valid absolute origins");
    }

    if (parsed.origin !== value || parsed.origin === "null") {
      throw new Error(
        "CORS_ORIGINS entries must be exact origins without paths",
      );
    }
    if (credentials === "true" && value === "*") {
      throw new Error("Credentialed CORS cannot use a wildcard origin");
    }
    if (
      nodeEnvironment === "production" &&
      parsed.protocol !== "https:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    ) {
      throw new Error("Production CORS origins must use HTTPS");
    }
  }
}
