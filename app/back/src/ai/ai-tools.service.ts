import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { ActivityService } from '../activity/activity.service';
import { NotesService } from '../notes/notes.service';
import { WorkspaceService } from '../workspace/workspace.service';
import type { AiChatMessage, AiToolAction, AiToolExecutionResponse } from './ai.types';

type AiToolMode = 'readonly' | 'mutation';

interface AiToolDefinition {
  name: string;
  mode: AiToolMode;
  description: string;
  parameters: Record<string, unknown>;
}

interface ParsedToolCall {
  name: string;
  payload: Record<string, unknown>;
}

interface AiToolResult {
  message: AiChatMessage;
  action?: AiToolAction;
  noteId?: number;
  refreshTree?: boolean;
}

const toolDefinitions: AiToolDefinition[] = [
  {
    name: 'notes.search',
    mode: 'readonly',
    description: 'Search current user notes by title or text.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'notes.read',
    mode: 'readonly',
    description: 'Read one current user note by id.',
    parameters: {
      type: 'object',
      properties: { noteId: { type: 'integer', minimum: 1 } },
      required: ['noteId'],
    },
  },
  {
    name: 'notes.create',
    mode: 'mutation',
    description:
      'Create a note for the current user. The model must build full contentHtml/contentText itself from the user request and available context. Use copy field HTML for logins, passwords, tokens and URLs.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        contentHtml: {
          type: 'string',
          description:
            'Full editor HTML. For credentials use div[data-copy-field] with real data-value values extracted by the model.',
        },
        contentText: {
          type: 'string',
          description: 'Plain text equivalent for search. Include the real readable values.',
        },
        parentId: { type: 'integer', minimum: 1 },
        tags: { type: 'array', items: { type: 'string' } },
        isFavorite: { type: 'boolean' },
        isPinned: { type: 'boolean' },
      },
      required: ['name', 'contentHtml', 'contentText'],
    },
  },
  {
    name: 'notes.update',
    mode: 'mutation',
    description:
      'Update an existing current user note by id. The model must calculate the full new note content from currentNote/notes.read and the user task. Do not rely on backend parsing.',
    parameters: {
      type: 'object',
      properties: {
        noteId: { type: 'integer', minimum: 1 },
        name: { type: 'string' },
        contentHtml: {
          type: 'string',
          description:
            'Full replacement editor HTML. Preserve useful existing content unless the user asks to replace it. Copy/secret fields must contain real extracted data-value values.',
        },
        contentText: {
          type: 'string',
          description: 'Full replacement plain text equivalent for search.',
        },
      },
      required: ['noteId'],
    },
  },
  {
    name: 'notes.tags.set',
    mode: 'mutation',
    description: 'Replace tags on an existing current user note.',
    parameters: {
      type: 'object',
      properties: {
        noteId: { type: 'integer', minimum: 1 },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['noteId', 'tags'],
    },
  },
  {
    name: 'notes.favorite.set',
    mode: 'mutation',
    description: 'Set favorite flag on an existing current user note.',
    parameters: {
      type: 'object',
      properties: {
        noteId: { type: 'integer', minimum: 1 },
        value: { type: 'boolean' },
      },
      required: ['noteId', 'value'],
    },
  },
  {
    name: 'notes.pinned.set',
    mode: 'mutation',
    description: 'Set pinned flag on an existing current user note.',
    parameters: {
      type: 'object',
      properties: {
        noteId: { type: 'integer', minimum: 1 },
        value: { type: 'boolean' },
      },
      required: ['noteId', 'value'],
    },
  },
  {
    name: 'notes.delete',
    mode: 'mutation',
    description: 'Move an existing current user note to trash.',
    parameters: {
      type: 'object',
      properties: { noteId: { type: 'integer', minimum: 1 } },
      required: ['noteId'],
    },
  },
  {
    name: 'notes.restore',
    mode: 'mutation',
    description: 'Restore a note from trash.',
    parameters: {
      type: 'object',
      properties: { noteId: { type: 'integer', minimum: 1 } },
      required: ['noteId'],
    },
  },
  {
    name: 'templates.list',
    mode: 'readonly',
    description: 'List available note templates.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'templates.createNote',
    mode: 'mutation',
    description: 'Create a note from template.',
    parameters: {
      type: 'object',
      properties: {
        templateId: { type: 'integer', minimum: 1 },
        parentId: { type: 'integer', minimum: 1 },
      },
      required: ['templateId'],
    },
  },
  {
    name: 'versions.list',
    mode: 'readonly',
    description: 'List note versions.',
    parameters: {
      type: 'object',
      properties: { noteId: { type: 'integer', minimum: 1 } },
      required: ['noteId'],
    },
  },
  {
    name: 'versions.restore',
    mode: 'mutation',
    description: 'Restore a note version.',
    parameters: {
      type: 'object',
      properties: {
        noteId: { type: 'integer', minimum: 1 },
        versionId: { type: 'integer', minimum: 1 },
      },
      required: ['noteId', 'versionId'],
    },
  },
  {
    name: 'attachments.list',
    mode: 'readonly',
    description: 'List attachments for a note or whole account.',
    parameters: {
      type: 'object',
      properties: { noteId: { type: 'integer', minimum: 1 } },
    },
  },
  {
    name: 'shareLinks.create',
    mode: 'mutation',
    description: 'Create temporary public link for a note.',
    parameters: {
      type: 'object',
      properties: {
        noteId: { type: 'integer', minimum: 1 },
        ttlHours: { type: 'integer', minimum: 1, maximum: 720 },
        includeSecrets: { type: 'boolean' },
      },
      required: ['noteId'],
    },
  },
];

@Injectable()
export class AiToolsService {
  constructor(
    @Inject(NotesService) private readonly notesService: NotesService,
    @Inject(WorkspaceService) private readonly workspaceService: WorkspaceService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
  ) {}

  getOpenAiTools(): Array<Record<string, unknown>> {
    return toolDefinitions.map((tool) => ({
      type: 'function',
      function: {
        name: this.toProviderToolName(tool.name),
        description: tool.description,
        parameters: {
          ...tool.parameters,
          additionalProperties: false,
        },
      },
    }));
  }

  getToolInstructions(): string {
    return [
      'STARTER PROMPT FOR NOTES AI.',
      'Role: you are Notes AI, an assistant embedded into a private notebook application. Be concise in chat, but use tools whenever the user asks you to work with notes or account data.',
      'Authority: tools are the only way to read or change application data. Never say that you cannot create or edit notes if a matching tool exists. Return a tool action instead.',
      'There are no hidden backend shortcuts or local command parsers. You must select the correct tool and prepare the exact payload yourself from the user request and available note context.',
      'Execution model: readonly tools run immediately. Mutation tools are only previews; the app will show a confirmation card and execute the action after the user confirms it.',
      'Current note: if a current selected note is provided, use its noteId for phrases like current note, selected note, opened note, this note, already created note. If no current note is provided and the user names a note, use notes.search first, then notes.read if you need exact content.',
      'Search: use notes.search for questions about where something is stored, passwords, deploy notes, sqlite, tags, or any phrase that may exist in note titles/text. Use notes.read after search when you need full note content or must edit a specific note.',
      'Reading: after notes.read, answer from the returned note content. If the content does not contain the requested data, say that clearly and suggest a narrower query.',
      'Creating notes: use notes.create with name, contentHtml and contentText. If the user gives credentials, access data, URLs, tokens or passwords, represent them as copy/secret fields, not as plain paragraphs.',
      'Editing notes: use notes.update. contentHtml/contentText are replacements, so when changing note content send the full new content, not a tiny patch. Preserve useful existing text unless the user asks to replace it. For rename-only requests send only name.',
      'Formatting: contentHtml should be clean editor HTML. Prefer p, h2, h3, ul, ol, li, blockquote, strong, em, u, a[href], pre/code. For code use pre/code and set language class when useful, for example <pre><code class="language-json">...</code></pre>. Keep contentText as readable plain text equivalent for search.',
      'Copy/secret fields: use <div data-copy-field="" data-label="Label" data-value="Value" data-kind="login|password|token|url|text" data-secret="true|false"></div>. Use data-secret="true" for password and token. Use data-kind="url" for links that should open in preview mode. Labels should be human-readable in Russian when the user writes Russian.',
      'Moving existing credentials to secret fields: when the user asks to move/convert data into secret fields, YOU must read the current note text/HTML, infer the values from natural language, remove open plain credential lines, and create copy/secret fields with the exact extracted values. The backend will not parse those values for you.',
      'Tags/favorites/pins: use notes.tags.set, notes.favorite.set and notes.pinned.set. Tags are global lowercase labels; do not invent unrelated tags unless the user asks for autotagging.',
      'Trash/versions/templates/attachments/share links: use the corresponding tools when the user asks to delete, restore, rollback a version, create from a template, list files, or create a temporary public link.',
      'Safety: do not expose secrets unless the user explicitly asks for them and the available context/tool result contains them. Do not invent passwords, tokens, URLs or note ids.',
      'Response style: after a tool preview, briefly say what will happen. After a tool execution result, summarize the result. Do not include raw JSON unless the user asks for it.',
    ].join('\n');
  }

  getToolMode(name: string): AiToolMode {
    const tool = toolDefinitions.find((item) => item.name === name);
    if (!tool) {
      throw new BadRequestException(`AI tool ${name} is not supported`);
    }

    return tool.mode;
  }

  parseToolCalls(rawToolCalls: unknown): ParsedToolCall[] {
    if (!Array.isArray(rawToolCalls)) {
      return [];
    }

    return rawToolCalls
      .map((toolCall): ParsedToolCall | null => {
        if (!this.isToolCall(toolCall)) {
          return null;
        }

        return {
          name: this.fromProviderToolName(toolCall.function.name),
          payload: this.parsePayload(toolCall.function.arguments),
        };
      })
      .filter((toolCall): toolCall is ParsedToolCall => Boolean(toolCall));
  }

  handleToolCall(userId: number, toolCall: ParsedToolCall): AiToolResult {
    if (this.getToolMode(toolCall.name) === 'mutation') {
      return {
        message: {
          role: 'assistant',
          content: `Подтвердите действие: ${this.getActionTitle(toolCall.name)}.`,
        },
        action: this.createAction(toolCall.name, toolCall.payload),
      };
    }

    const result = this.executeReadonly(userId, toolCall.name, toolCall.payload);
    return {
      message: {
        role: 'assistant',
        content: this.stringifyResult(toolCall.name, result),
      },
    };
  }

  executeAction(
    userId: number,
    name: string,
    payload: Record<string, unknown>,
  ): AiToolExecutionResponse {
    if (this.getToolMode(name) !== 'mutation') {
      throw new BadRequestException(`AI tool ${name} does not require confirmation`);
    }

    const result = this.executeMutation(userId, name, payload);
    this.activityService.record({
      actorId: userId,
      userId,
      action: 'ai.tool.execute',
      targetType: 'ai_tool',
      targetId: typeof result.noteId === 'number' ? result.noteId : userId,
      details: { name },
    });

    return {
      message: {
        role: 'assistant',
        content: this.stringifyExecution(name, result.data),
      },
      noteId: result.noteId,
      refreshTree: result.refreshTree,
    };
  }

  private executeReadonly(userId: number, name: string, payload: Record<string, unknown>): unknown {
    switch (name) {
      case 'notes.search':
        return this.notesService.search(userId, this.readString(payload.query, 'query'));
      case 'notes.read':
        return this.notesService.getById(userId, this.readPositiveInt(payload.noteId, 'noteId'));
      case 'templates.list':
        return this.workspaceService.listTemplates(userId);
      case 'versions.list':
        return this.notesService.listVersions(
          userId,
          this.readPositiveInt(payload.noteId, 'noteId'),
        );
      case 'attachments.list': {
        const noteId = this.readOptionalPositiveInt(payload.noteId, 'noteId');
        return noteId === null
          ? this.workspaceService.listAccountAttachments(userId)
          : this.workspaceService.listAttachments(userId, noteId);
      }
      default:
        throw new BadRequestException(`AI tool ${name} is not supported`);
    }
  }

  private executeMutation(
    userId: number,
    name: string,
    payload: Record<string, unknown>,
  ): { data: unknown; noteId?: number; refreshTree: boolean } {
    switch (name) {
      case 'notes.create': {
        const note = this.notesService.create(userId, {
          name: this.readString(payload.name, 'name').slice(0, 120),
          parentId: this.readOptionalPositiveInt(payload.parentId, 'parentId'),
        });
        const updated = this.notesService.update(userId, note.id, {
          contentHtml: this.readText(payload.contentHtml, 'contentHtml', '<p></p>'),
          contentText: this.readText(payload.contentText, 'contentText', ''),
          isFavorite: this.readOptionalBoolean(payload.isFavorite),
          isPinned: this.readOptionalBoolean(payload.isPinned),
        });
        const tags = this.readStringArray(payload.tags).slice(0, 20);
        for (const tag of tags) {
          this.notesService.createTag(userId, tag);
        }
        if (tags.length > 0) {
          this.notesService.updateTags(userId, note.id, tags);
        }
        return { data: updated, noteId: note.id, refreshTree: true };
      }
      case 'notes.update': {
        const noteId = this.readPositiveInt(payload.noteId, 'noteId');
        const name =
          typeof payload.name === 'string' && payload.name.trim()
            ? payload.name.trim().slice(0, 120)
            : undefined;
        const contentHtml =
          typeof payload.contentHtml === 'string' ? payload.contentHtml : undefined;
        const contentText =
          typeof payload.contentText === 'string' ? payload.contentText : undefined;
        if (!name && contentHtml === undefined && contentText === undefined) {
          throw new BadRequestException('No note changes were provided');
        }

        const updated = this.notesService.update(userId, noteId, {
          name,
          contentHtml,
          contentText,
        });
        return { data: updated, noteId, refreshTree: true };
      }
      case 'notes.tags.set': {
        const noteId = this.readPositiveInt(payload.noteId, 'noteId');
        const tags = this.readStringArray(payload.tags).slice(0, 20);
        for (const tag of tags) {
          this.notesService.createTag(userId, tag);
        }
        const note = this.notesService.updateTags(userId, noteId, tags);
        return { data: note, noteId, refreshTree: true };
      }
      case 'notes.favorite.set': {
        const noteId = this.readPositiveInt(payload.noteId, 'noteId');
        const note = this.notesService.update(userId, noteId, {
          isFavorite: this.readBoolean(payload.value, 'value'),
        });
        return { data: note, noteId, refreshTree: true };
      }
      case 'notes.pinned.set': {
        const noteId = this.readPositiveInt(payload.noteId, 'noteId');
        const note = this.notesService.update(userId, noteId, {
          isPinned: this.readBoolean(payload.value, 'value'),
        });
        return { data: note, noteId, refreshTree: true };
      }
      case 'notes.delete': {
        const noteId = this.readPositiveInt(payload.noteId, 'noteId');
        return {
          data: this.notesService.delete(userId, noteId),
          noteId,
          refreshTree: true,
        };
      }
      case 'notes.restore': {
        const noteId = this.readPositiveInt(payload.noteId, 'noteId');
        const note = this.notesService.restore(userId, noteId);
        return { data: note, noteId, refreshTree: true };
      }
      case 'templates.createNote': {
        const note = this.workspaceService.createNoteFromTemplate(userId, {
          templateId: this.readPositiveInt(payload.templateId, 'templateId'),
          parentId: this.readOptionalPositiveInt(payload.parentId, 'parentId'),
        });
        return { data: note, noteId: note.id, refreshTree: true };
      }
      case 'versions.restore': {
        const noteId = this.readPositiveInt(payload.noteId, 'noteId');
        const note = this.notesService.restoreVersion(
          userId,
          noteId,
          this.readPositiveInt(payload.versionId, 'versionId'),
        );
        return { data: note, noteId, refreshTree: true };
      }
      case 'shareLinks.create': {
        const noteId = this.readPositiveInt(payload.noteId, 'noteId');
        return {
          data: this.workspaceService.createShareLink(userId, noteId, {
            ttlHours: this.readOptionalPositiveInt(payload.ttlHours, 'ttlHours') ?? 24,
            includeSecrets: this.readOptionalBoolean(payload.includeSecrets) ?? false,
          }),
          noteId,
          refreshTree: false,
        };
      }
      default:
        throw new BadRequestException(`AI tool ${name} is not supported`);
    }
  }

  private createAction(name: string, payload: Record<string, unknown>): AiToolAction {
    return {
      name,
      title: this.getActionTitle(name),
      description: this.describeAction(name, payload),
      payload,
      destructive: name === 'notes.delete',
    };
  }

  private getActionTitle(name: string): string {
    const titles: Record<string, string> = {
      'notes.create': 'Создать заметку',
      'notes.update': 'Изменить заметку',
      'notes.tags.set': 'Обновить теги',
      'notes.favorite.set': 'Избранное',
      'notes.pinned.set': 'Закрепление',
      'notes.delete': 'Удалить заметку',
      'notes.restore': 'Восстановить заметку',
      'templates.createNote': 'Создать из шаблона',
      'versions.restore': 'Откатить версию',
      'shareLinks.create': 'Создать ссылку доступа',
    };

    return titles[name] ?? name;
  }

  private describeAction(name: string, payload: Record<string, unknown>): string {
    if (name === 'notes.create') {
      return `Будет создана заметка "${this.readString(payload.name, 'name')}".`;
    }

    if ('noteId' in payload) {
      return `Заметка #${String(payload.noteId)}`;
    }

    return 'Действие будет выполнено после подтверждения.';
  }

  private stringifyResult(name: string, result: unknown): string {
    if (name === 'notes.read') {
      return this.stringifyNoteReadResult(result);
    }

    if (Array.isArray(result)) {
      if (result.length === 0) {
        return 'Ничего не найдено.';
      }

      return result
        .slice(0, 8)
        .map((item) => this.compactObject(item))
        .join('\n');
    }

    return this.compactObject(result);
  }

  private stringifyNoteReadResult(result: unknown): string {
    if (!result || typeof result !== 'object') {
      return this.compactObject(result);
    }

    const note = result as Record<string, unknown>;
    const contentText = typeof note.contentText === 'string' ? note.contentText.trim() : '';
    const tags = Array.isArray(note.tags)
      ? note.tags.filter((tag): tag is string => typeof tag === 'string').join(', ')
      : '';

    return [
      `id: ${String(note.id ?? '')}`,
      `name: ${String(note.name ?? '')}`,
      `tags: ${tags || '-'}`,
      `updatedAt: ${String(note.updatedAt ?? '')}`,
      'contentText:',
      contentText ? contentText.slice(0, 6000) : '(empty)',
    ].join('\n');
  }

  private stringifyExecution(name: string, result: unknown): string {
    if (name === 'notes.create') {
      return 'Заметка создана.';
    }

    if (name === 'notes.update') {
      return 'Заметка обновлена.';
    }

    if (name === 'shareLinks.create') {
      return `Ссылка создана: ${this.compactObject(result)}`;
    }

    return 'Действие выполнено.';
  }

  private compactObject(value: unknown): string {
    if (!value || typeof value !== 'object') {
      return String(value ?? '');
    }

    const record = value as Record<string, unknown>;
    const parts = ['id', 'name', 'title', 'snippet', 'url', 'updatedAt', 'createdAt']
      .filter((key) => record[key] !== undefined && record[key] !== null)
      .map((key) => `${key}: ${String(record[key]).slice(0, 160)}`);

    return parts.length > 0 ? parts.join(' | ') : JSON.stringify(value).slice(0, 500);
  }

  private isToolCall(value: unknown): value is {
    function: { name: string; arguments: unknown };
  } {
    return (
      typeof value === 'object' &&
      value !== null &&
      'function' in value &&
      typeof value.function === 'object' &&
      value.function !== null &&
      'name' in value.function &&
      typeof value.function.name === 'string'
    );
  }

  private parsePayload(value: unknown): Record<string, unknown> {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    }

    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return value.trim();
  }

  private readText(value: unknown, fieldName: string, fallback: string): string {
    if (value === undefined || value === null) {
      return fallback;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be string`);
    }

    return value;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return [
      ...new Set(
        value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
  }

  private readPositiveInt(value: unknown, fieldName: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }

    return value;
  }

  private readOptionalPositiveInt(value: unknown, fieldName: string): number | null {
    if (value === undefined || value === null) {
      return null;
    }

    return this.readPositiveInt(value, fieldName);
  }

  private readBoolean(value: unknown, fieldName: string): boolean {
    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${fieldName} must be boolean`);
    }

    return value;
  }

  private readOptionalBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private toProviderToolName(name: string): string {
    return name.replaceAll('.', '_');
  }

  private fromProviderToolName(name: string): string {
    return (
      toolDefinitions.find((tool) => this.toProviderToolName(tool.name) === name)?.name ?? name
    );
  }
}
