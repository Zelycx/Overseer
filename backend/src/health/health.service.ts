import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

export interface HealthStatus {
  status: "ok" | "degraded";
  api: "ok";
  database: "connected" | "disconnected";
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseService) {}

  async getStatus(): Promise<HealthStatus> {
    const connected = await this.database.isConnected();
    return {
      status: connected ? "ok" : "degraded",
      api: "ok",
      database: connected ? "connected" : "disconnected",
      timestamp: new Date().toISOString(),
    };
  }
}
