import type { AiToolRiskClass } from "./ai-policy.service.js";
import type { JsonObject } from "./ai.types.js";

interface ToolSpec {
  description: string;
  parameters: JsonObject;
  providerName: string;
  risk: AiToolRiskClass;
}

const id = { minimum: 1, type: "integer" };
const revision = { minimum: 1, type: "integer" };
const shortText = { maxLength: 200, minLength: 1, type: "string" };
const boolean = { type: "boolean" };

function parameters(
  properties: Record<string, JsonObject>,
  required: string[] = [],
): JsonObject {
  return {
    additionalProperties: false,
    properties,
    required,
    type: "object",
  };
}

export const AI_TOOL_SPECS = {
  "admin.stats.read": {
    description: "Read aggregate Notes AI service statistics.",
    parameters: parameters({}),
    providerName: "admin_stats_read",
    risk: "read_only",
  },
  "admin.users.list": {
    description:
      "List user identifiers, usernames and roles for administration.",
    parameters: parameters({
      limit: { maximum: 100, minimum: 1, type: "integer" },
    }),
    providerName: "admin_users_list",
    risk: "read_only",
  },
  "attachments.attachToNote": {
    description: "Attach an owned file to an owned note.",
    parameters: parameters({ fileId: id, noteId: id }, ["fileId", "noteId"]),
    providerName: "attachments_attach_to_note",
    risk: "reversible_write",
  },
  "attachments.list": {
    description: "List owned files, optionally restricted to one note.",
    parameters: parameters({
      noteId: { anyOf: [id, { type: "null" }] },
      query: shortText,
    }),
    providerName: "attachments_list",
    risk: "read_only",
  },
  "notes.autotag": {
    description:
      "Replace an owned note's tags with the supplied normalized tags.",
    parameters: parameters(
      {
        noteId: id,
        revision,
        tags: { items: shortText, maxItems: 20, type: "array" },
      },
      ["noteId", "revision", "tags"],
    ),
    providerName: "notes_autotag",
    risk: "reversible_write",
  },
  "notes.create": {
    description: "Create a note in the user's workspace.",
    parameters: parameters(
      {
        name: { ...shortText, maxLength: 160 },
        parentId: { anyOf: [id, { type: "null" }] },
      },
      ["name"],
    ),
    providerName: "notes_create",
    risk: "reversible_write",
  },
  "notes.createNestedBatch": {
    description:
      "Create an ordered chain of nested notes from a list of names.",
    parameters: parameters(
      {
        names: {
          items: { ...shortText, maxLength: 160 },
          maxItems: 20,
          minItems: 1,
          type: "array",
        },
        parentId: { anyOf: [id, { type: "null" }] },
      },
      ["names"],
    ),
    providerName: "notes_create_nested_batch",
    risk: "reversible_write",
  },
  "notes.delete": {
    description: "Move an owned note to trash using its current revision.",
    parameters: parameters({ noteId: id, revision }, ["noteId", "revision"]),
    providerName: "notes_delete",
    risk: "destructive",
  },
  "notes.deleteAll": {
    description: "Move every active owned note to trash.",
    parameters: parameters({ confirmAll: boolean }, ["confirmAll"]),
    providerName: "notes_delete_all",
    risk: "destructive",
  },
  "notes.favorite.set": {
    description: "Set the favorite state of an owned note.",
    parameters: parameters({ noteId: id, revision, value: boolean }, [
      "noteId",
      "revision",
      "value",
    ]),
    providerName: "notes_favorite_set",
    risk: "reversible_write",
  },
  "notes.pinned.set": {
    description: "Set the pinned state of an owned note.",
    parameters: parameters({ noteId: id, revision, value: boolean }, [
      "noteId",
      "revision",
      "value",
    ]),
    providerName: "notes_pinned_set",
    risk: "reversible_write",
  },
  "notes.read": {
    description: "Read one owned note by ID.",
    parameters: parameters({ noteId: id }, ["noteId"]),
    providerName: "notes_read",
    risk: "read_only",
  },
  "notes.restore": {
    description: "Restore an owned note from trash using its current revision.",
    parameters: parameters({ noteId: id, revision }, ["noteId", "revision"]),
    providerName: "notes_restore",
    risk: "reversible_write",
  },
  "notes.search": {
    description: "Search owned notes by title and text.",
    parameters: parameters({ query: shortText }, ["query"]),
    providerName: "notes_search",
    risk: "read_only",
  },
  "notes.semanticSearch": {
    description:
      "Search owned notes for semantically relevant text using the available index.",
    parameters: parameters({ query: shortText }, ["query"]),
    providerName: "notes_semantic_search",
    risk: "read_only",
  },
  "notes.tags.set": {
    description: "Replace an owned note's tags.",
    parameters: parameters(
      {
        noteId: id,
        revision,
        tags: { items: shortText, maxItems: 20, type: "array" },
      },
      ["noteId", "revision", "tags"],
    ),
    providerName: "notes_tags_set",
    risk: "reversible_write",
  },
  "notes.update": {
    description:
      "Update the title or content of an owned note using its current revision.",
    parameters: parameters(
      {
        contentHtml: { maxLength: 2_000_000, type: "string" },
        contentText: { maxLength: 2_000_000, type: "string" },
        name: { ...shortText, maxLength: 160 },
        noteId: id,
        revision,
      },
      ["noteId", "revision"],
    ),
    providerName: "notes_update",
    risk: "reversible_write",
  },
  "shareLinks.create": {
    description: "Create an expiring public link for an owned note.",
    parameters: parameters(
      {
        includeSecrets: boolean,
        noteId: id,
        oneTime: boolean,
        ttlHours: { maximum: 720, minimum: 1, type: "integer" },
      },
      ["noteId", "ttlHours", "oneTime", "includeSecrets"],
    ),
    providerName: "share_links_create",
    risk: "external",
  },
  "templates.createNote": {
    description: "Create a note from an available template.",
    parameters: parameters(
      { parentId: { anyOf: [id, { type: "null" }] }, templateId: id },
      ["templateId"],
    ),
    providerName: "templates_create_note",
    risk: "reversible_write",
  },
  "templates.list": {
    description: "List templates available to the user.",
    parameters: parameters({}),
    providerName: "templates_list",
    risk: "read_only",
  },
  "versions.list": {
    description: "List saved versions of an owned note.",
    parameters: parameters({ noteId: id }, ["noteId"]),
    providerName: "versions_list",
    risk: "read_only",
  },
  "versions.restore": {
    description:
      "Restore an owned note version using the note's current revision.",
    parameters: parameters({ noteId: id, revision, versionId: id }, [
      "noteId",
      "versionId",
      "revision",
    ]),
    providerName: "versions_restore",
    risk: "reversible_write",
  },
} as const satisfies Record<string, ToolSpec>;

export type AiToolName = keyof typeof AI_TOOL_SPECS;

const providerNames = new Map<string, AiToolName>(
  Object.entries(AI_TOOL_SPECS).map(([name, spec]) => [
    spec.providerName,
    name as AiToolName,
  ]),
);

export function providerTools(names: readonly string[]): JsonObject[] {
  return names.map((name) => {
    const spec = AI_TOOL_SPECS[name as AiToolName];
    if (!spec) throw new Error(`Unknown AI tool: ${name}`);
    const properties = spec.parameters.properties;
    const required = spec.parameters.required;
    const strict =
      properties !== null &&
      typeof properties === "object" &&
      !Array.isArray(properties) &&
      Array.isArray(required) &&
      required.length === Object.keys(properties).length;
    return {
      description: spec.description,
      name: spec.providerName,
      parameters: spec.parameters,
      strict,
      type: "function",
    };
  });
}

export function internalToolName(providerName: string): AiToolName | null {
  return providerNames.get(providerName) ?? null;
}
