import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema/index.js";

export * from "./schema/index.js";

export function createDatabasePool(
  connectionString: string,
  options: Omit<PoolConfig, "connectionString"> = {},
) {
  return new Pool({ connectionString, ...options });
}

export function createDatabase(pool: Pool) {
  return drizzle({ client: pool, schema });
}

export type Database = ReturnType<typeof createDatabase>;
