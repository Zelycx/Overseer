import { Controller, Get, HttpStatus, Res, Version } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { HealthService } from "./health.service.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Version("1")
  @ApiOperation({ summary: "Check application and database availability" })
  @ApiResponse({ status: 200, description: "API and database are available." })
  @ApiResponse({
    status: 503,
    description: "API is available but database is unavailable.",
  })
  async getHealth(@Res({ passthrough: true }) response: Response) {
    const status = await this.healthService.getStatus();
    response.status(
      status.database === "connected"
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return status;
  }
}
