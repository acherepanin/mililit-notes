import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabase, createDatabasePool } from "./index.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const pool = createDatabasePool(connectionString, { max: 1 });

try {
  await migrate(createDatabase(pool), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("Database migrations completed");
} finally {
  await pool.end();
}
