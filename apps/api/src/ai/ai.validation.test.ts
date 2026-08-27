import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  encodeConversationCursor,
  parseConversationList,
  parseCreateMessage,
  parseModelRoute,
  parsePromptVersion,
  parseUpdateProvider,
} from "./ai.validation.js";

describe("AI request validation", () => {
  it("normalizes a complete model route", () => {
    expect(
      parseModelRoute({
        fallbackModels: ["gpt-fast", "gpt-fast"],
        model: "gpt-main",
        providerSettingId: 4,
        reasoningEffort: "high",
      }),
    ).toEqual({
      enabled: true,
      fallbackModels: ["gpt-fast"],
      maxOutputTokens: null,
      model: "gpt-main",
      providerSettingId: 4,
      reasoningEffort: "high",
      temperature: null,
    });
  });

  it("rejects conflicting credential changes", () => {
    expect(() =>
      parseUpdateProvider({ apiKey: "secret", clearApiKey: true }),
    ).toThrow(BadRequestException);
  });

  it("rejects non-prompt model roles", () => {
    expect(() =>
      parsePromptVersion({ content: "Prompt", modelRole: "embedding" }),
    ).toThrow(BadRequestException);
  });

  it("round-trips opaque conversation cursors", () => {
    const updatedAt = new Date("2026-08-05T10:00:00.000Z");
    expect(
      parseConversationList(
        encodeConversationCursor(updatedAt, 42),
        "25",
        "archived",
      ),
    ).toEqual({
      cursor: { id: 42, updatedAt },
      limit: 25,
      status: "archived",
    });
  });

  it("normalizes multimodal composer parts and context", () => {
    expect(
      parseCreateMessage({
        context: { fileIds: [7], noteIds: [3] },
        parts: [
          { text: "Ask about this", type: "text" },
          { fileId: 7, type: "image" },
        ],
      }),
    ).toEqual({
      context: {
        fileIds: [7],
        includeSecrets: false,
        noteIds: [3],
      },
      parts: [
        { text: "Ask about this", type: "text" },
        { fileId: 7, type: "image" },
      ],
    });
  });

  it("rejects duplicate context IDs and non-image part shapes", () => {
    expect(() =>
      parseCreateMessage({
        context: { noteIds: [2, 2] },
        parts: [{ text: "Question", type: "text" }],
      }),
    ).toThrow(BadRequestException);
    expect(() => parseCreateMessage({ parts: [{ type: "image" }] })).toThrow(
      BadRequestException,
    );
  });
});
