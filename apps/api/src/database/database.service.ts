import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createDatabase, createDatabasePool } from "@notes/db";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool = createDatabasePool(this.requireDatabaseUrl(), {
    max: 8,
  });

  readonly client = createDatabase(this.pool);

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  private requireDatabaseUrl(): string {
    const value = process.env.DATABASE_URL;
    if (!value) {
      throw new Error("DATABASE_URL is required");
    }
    return value;
  }
}
