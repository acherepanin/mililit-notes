import { Queue, type ConnectionOptions } from "bullmq";

export function parseRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis:// or rediss://");
  }

  const database = url.pathname === "/" ? 0 : Number(url.pathname.slice(1));
  if (!Number.isInteger(database) || database < 0) {
    throw new Error("REDIS_URL database must be a non-negative integer");
  }

  return {
    db: database,
    host: url.hostname,
    maxRetriesPerRequest: null,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export function createSystemQueue(redisUrl: string): Queue {
  return new Queue("system", {
    connection: parseRedisConnection(redisUrl),
    prefix: "notes",
  });
}

export async function pingQueue(queue: Queue): Promise<void> {
  await queue.getVersion();
}
