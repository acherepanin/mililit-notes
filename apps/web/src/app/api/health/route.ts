interface WebHealthResponse {
  service: "web";
  status: "ok";
  time: string;
  version: string;
}

export const dynamic = "force-dynamic";

export function GET(): Response {
  const response: WebHealthResponse = {
    service: "web",
    status: "ok",
    time: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
  };

  return Response.json(response);
}
