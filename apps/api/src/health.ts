export interface HealthResponse {
  service: "api";
  status: "ok";
  time: string;
  version: string;
}

export function createHealthResponse(now = new Date()): HealthResponse {
  return {
    service: "api",
    status: "ok",
    time: now.toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
  };
}
