import { describe, expect, it } from "vitest";

import { integrationToolAllowlist } from "./integration-processing.service.js";

const base = {
  accessMode: "read",
  allowAttachments: false,
  allowNoteDelete: false,
  allowNoteRead: true,
  allowNoteWrite: false,
  allowShareLinks: false,
  allowTags: false,
  allowTemplates: false,
  allowVersions: false,
};

describe("integration tool permissions", () => {
  it("keeps write and destructive tools out of a read-only channel", () => {
    expect(integrationToolAllowlist(base)).toEqual([
      "notes.read",
      "notes.search",
      "notes.semanticSearch",
    ]);
  });

  it("maps enabled write capabilities without granting administrator tools", () => {
    const tools = integrationToolAllowlist({
      ...base,
      accessMode: "write",
      allowAttachments: true,
      allowNoteDelete: true,
      allowNoteWrite: true,
      allowShareLinks: true,
      allowTags: true,
      allowTemplates: true,
      allowVersions: true,
    });

    expect(tools).toContain("notes.update");
    expect(tools).toContain("notes.deleteAll");
    expect(tools).toContain("attachments.attachToNote");
    expect(tools).toContain("shareLinks.create");
    expect(tools).not.toContain("admin.users.list");
  });
});
