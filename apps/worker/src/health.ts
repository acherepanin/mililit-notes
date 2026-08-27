export interface WorkerHealthResponse {
  service: "worker";
  status: "ok";
  time: string;
  version: string;
}

export function createWorkerHealthResponse(
  now = new Date(),
): WorkerHealthResponse {
  return {
    service: "worker",
    status: "ok",
    time: now.toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
  };
}
