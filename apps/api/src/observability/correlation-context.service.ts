import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { isCorrelationId } from "@notes/config";

@Injectable()
export class CorrelationContextService {
  private readonly storage = new AsyncLocalStorage<string>();

  current(): string | null {
    return this.storage.getStore() ?? null;
  }

  getOrCreate(): string {
    return this.current() ?? randomUUID();
  }

  run<Result>(correlationId: string, callback: () => Result): Result {
    return this.storage.run(
      isCorrelationId(correlationId) ? correlationId : randomUUID(),
      callback,
    );
  }
}
