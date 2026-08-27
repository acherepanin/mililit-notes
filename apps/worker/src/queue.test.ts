import { describe, expect, it } from "vitest";

import { parseRedisConnection } from "./queue.js";

describe("parseRedisConnection", () => {
  it("parses credentials, port, and database", () => {
    expect(
      parseRedisConnection("redis://worker:p%40ss@redis.internal:6380/2"),
    ).toMatchObject({
      db: 2,
      host: "redis.internal",
      password: "p@ss",
      port: 6380,
      username: "worker",
    });
  });

  it("enables TLS for rediss URLs", () => {
    expect(parseRedisConnection("rediss://redis.internal")).toHaveProperty(
      "tls",
    );
  });
});
