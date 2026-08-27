import "reflect-metadata";
import "./telemetry.js";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { readServiceEnvironment } from "@notes/config";

import { AppModule } from "./app.module.js";
import { resolveCorrelationId } from "./observability/request-context.js";
import { shutdownTelemetry } from "./telemetry.js";

async function bootstrap(): Promise<void> {
  const environment = readServiceEnvironment(process.env, 3001);
  const adapter = new FastifyAdapter();
  adapter.getInstance().addHook("onRequest", (request, reply, done) => {
    const correlationId = resolveCorrelationId(
      request.headers["x-correlation-id"],
    );
    (request as typeof request & { correlationId: string }).correlationId =
      correlationId;
    reply.header("x-correlation-id", correlationId);
    done();
  });
  adapter
    .getInstance()
    .addContentTypeParser(
      "application/sdp",
      { parseAs: "string" },
      (_request, body, done) => done(null, body),
    );
  adapter
    .getInstance()
    .addContentTypeParser(
      /^audio\//,
      { bodyLimit: 10 * 1024 * 1024, parseAs: "buffer" },
      (_request, body, done) => done(null, body),
    );
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    {
      bufferLogs: true,
    },
  );

  app.setGlobalPrefix("api");
  if (process.env.OPENAPI_ENABLED === "true") {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Notes AI API")
        .setDescription("Notes AI platform HTTP contract")
        .setVersion("1.0.0")
        .addCookieAuth("better-auth.session_token", {
          in: "cookie",
          type: "apiKey",
        })
        .build(),
    );
    adapter
      .getInstance()
      .get("/api/openapi.json", (_request, reply) => reply.send(document));
  }
  await app.listen(environment.PORT, environment.HOST);
  const close = async (): Promise<void> => {
    await app.close();
    await shutdownTelemetry();
  };
  process.once("SIGINT", () => void close());
  process.once("SIGTERM", () => void close());
  new Logger("Bootstrap").log(
    `Notes AI API is listening on ${environment.HOST}:${environment.PORT}`,
  );
}

void bootstrap();
