import assert from "node:assert/strict";
import { test } from "node:test";
import { HealthService } from "./health.service.js";

test("health reports a connected database and an ISO timestamp", async () => {
  const service = new HealthService({ isConnected: async () => true } as never);

  const result = await service.getStatus();

  assert.equal(result.status, "ok");
  assert.equal(result.api, "ok");
  assert.equal(result.database, "connected");
  assert.equal(Number.isNaN(Date.parse(result.timestamp)), false);
});

test("health reports degraded status when the database is unavailable", async () => {
  const service = new HealthService({
    isConnected: async () => false,
  } as never);

  const result = await service.getStatus();

  assert.equal(result.status, "degraded");
  assert.equal(result.api, "ok");
  assert.equal(result.database, "disconnected");
});
