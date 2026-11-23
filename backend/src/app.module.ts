import { Module } from "@nestjs/common";
import { ConfigurationModule } from "./config/configuration.module.js";
import { CommonModule } from "./common/common.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";

@Module({
  imports: [ConfigurationModule, CommonModule, DatabaseModule, HealthModule],
})
export class AppModule {}
