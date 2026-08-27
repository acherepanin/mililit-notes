import { describe, expect, it } from "vitest";

import {
  resolveCorrelationId,
  sanitizeDiagnosticMessage,
} from "./request-context.js";

describe("request correlation IDs", () => {
  it("keeps a safe caller ID and replaces unsafe input", () => {
    expect(resolveCorrelationId("edge:request-42")).toBe("edge:request-42");
    expect(resolveCorrelationId("secret\nheader")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
    );
  });
});

describe("diagnostic message sanitization", () => {
  it("redacts common credentials without losing the useful failure context", () => {
    const message = sanitizeDiagnosticMessage(
      new Error(
        "upstream failed: Bearer abc.def; password=hunter2 " +
          "postgresql://notes:db-secret@postgres/notes?token=query-secret",
      ),
    );

    expect(message).toContain("upstream failed");
    expect(message).toContain("Bearer [redacted]");
    expect(message).toContain("password=[redacted]");
    expect(message).toContain("postgresql://notes:[redacted]@postgres/notes");
    expect(message).toContain("token=[redacted]");
    expect(message).not.toContain("hunter2");
    expect(message).not.toContain("db-secret");
    expect(message).not.toContain("query-secret");
  });
});
