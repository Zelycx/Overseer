import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.js";
import { StructuredLogger } from "../common/logging/structured-logger.js";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly client: PrismaClient | null;

  constructor(
    config: ConfigService,
    private readonly logger: StructuredLogger,
  ) {
    const connectionString = config.get<string>("DATABASE_URL");
    this.client = connectionString
      ? new PrismaClient({
          adapter: new PrismaPg({
            connectionString,
            connectionTimeoutMillis: 5000,
            idleTimeoutMillis: 30000,
            max: 10,
          }),
        })
      : null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) {
      this.logger.warn("Database is not configured", "Database");
      return;
    }

    try {
      await this.client.$connect();
      this.logger.log("Database connection established", "Database");
    } catch {
      this.logger.error("Database connection unavailable", "Database");
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.$disconnect();
    }
  }

  async isConnected(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
