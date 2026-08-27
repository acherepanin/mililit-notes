import { Readable } from "node:stream";

import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AiInputBuilderService } from "./ai-input-builder.service.js";

function databaseWith(
  history: Record<string, unknown>[],
  files: Record<string, unknown>[],
) {
  let call = 0;
  return {
    client: {
      select: vi.fn(() => {
        call += 1;
        if (call === 1) {
          return {
            from: () => ({
              where: () => ({ limit: async () => [{ sequence: 2 }] }),
            }),
          };
        }
        if (call === 2) {
          return {
            from: () => ({
              where: () => ({
                orderBy: () => ({ limit: async () => history }),
              }),
            }),
          };
        }
        return { from: () => ({ where: async () => files }) };
      }),
    },
  };
}

describe("AiInputBuilderService", () => {
  it("builds owned text and image input without exposing object keys", async () => {
    const database = databaseWith(
      [
        {
          content: [
            { text: "Inspect this image", type: "text" },
            { fileId: 7, type: "image" },
          ],
          contentText: "Inspect this image",
          id: 20,
          role: "user",
          sequence: 2,
        },
        {
          content: [],
          contentText: "Previous answer",
          id: 19,
          role: "assistant",
          sequence: 1,
        },
      ],
      [
        {
          detectedMimeType: "image/png",
          fileName: "diagram.png",
          id: 7,
          mimeType: "image/png",
          objectKey: "private/user-1/diagram.png",
          sizeBytes: 3,
        },
      ],
    );
    const storage = {
      openReadStream: vi.fn(() => Readable.from([Buffer.from("png")])),
    };
    const service = new AiInputBuilderService(
      database as never,
      storage as never,
    );

    const result = await service.build(1, 10, 20);

    expect(result.input).toEqual([
      { content: "Previous answer", role: "assistant" },
      {
        content: [
          { text: "Inspect this image", type: "input_text" },
          {
            detail: "auto",
            image_url: "data:image/png;base64,cG5n",
            type: "input_image",
          },
        ],
        role: "user",
      },
    ]);
    expect(JSON.stringify(result.input)).not.toContain("private/user-1");
    expect(result.estimatedInputTokens).toBeGreaterThan(0);
  });

  it("rejects file metadata above the aggregate provider limit", async () => {
    const database = databaseWith(
      [
        {
          content: [{ fileId: 7, type: "file" }],
          contentText: "File",
          id: 20,
          role: "user",
          sequence: 2,
        },
      ],
      [
        {
          detectedMimeType: "application/pdf",
          fileName: "large.pdf",
          id: 7,
          mimeType: "application/pdf",
          objectKey: "private/large.pdf",
          sizeBytes: 50 * 1024 * 1024 + 1,
        },
      ],
    );
    const storage = { openReadStream: vi.fn() };
    const service = new AiInputBuilderService(
      database as never,
      storage as never,
    );

    await expect(service.build(1, 10, 20)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.openReadStream).not.toHaveBeenCalled();
  });
});
