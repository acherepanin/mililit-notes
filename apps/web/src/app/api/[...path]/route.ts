import type { NextRequest } from "next/server";

const hopByHopHeaders = [
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const apiUrl = process.env.NOTES_API_URL ?? "http://localhost:3201";
  const target = new URL(
    `/api/${path.map(encodeURIComponent).join("/")}`,
    apiUrl,
  );
  target.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  for (const name of hopByHopHeaders) headers.delete(name);
  headers.set("x-forwarded-host", request.nextUrl.host);
  headers.set("x-forwarded-proto", request.nextUrl.protocol.slice(0, -1));

  try {
    const init: RequestInit & { duplex: "half" } = {
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : request.body,
      headers,
      method: request.method,
      redirect: "manual",
      // Node requires duplex when forwarding a request stream.
      duplex: "half",
    };
    const response = await fetch(target, init);
    const responseHeaders = new Headers(response.headers);
    for (const name of hopByHopHeaders) responseHeaders.delete(name);
    responseHeaders.delete("content-encoding");

    return new Response(response.body, {
      headers: responseHeaders,
      status: response.status,
      statusText: response.statusText,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : "unknown_error",
        event: "api_proxy_failed",
        method: request.method,
        path: request.nextUrl.pathname,
      }),
    );
    return Response.json(
      { code: "API_UNAVAILABLE", message: "Сервис временно недоступен" },
      { status: 502 },
    );
  }
}

export const dynamic = "force-dynamic";

export const DELETE = proxy;
export const GET = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
export const PATCH = proxy;
export const POST = proxy;
export const PUT = proxy;
