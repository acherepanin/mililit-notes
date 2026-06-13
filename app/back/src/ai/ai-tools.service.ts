import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { ActivityService } from '../activity/activity.service';
import { AdminService } from '../admin/admin.service';
import { redactSecretHtml, redactSecretText } from '../common/secret-redaction.util';
import type { UserRole } from '../auth/auth.types';
import { nowIso } from '../database/db.util';
import { AiAuditLogEntity } from '../database/entities/ai.entity';
import { NotesService } from '../notes/notes.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { AiEmbeddingsService } from './ai-embeddings.service';
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

interface AiToolContext {
  allowReadSecrets: boolean;
  allowedToolNames?: ReadonlySet<string>;
  requireActionConfirmation?: boolean;
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
    name: 'notes.semanticSearch',
    mode: 'readonly',
    description:
      'Search current user notes by meaning with embeddings. Use it for natural language and conceptual queries, not only exact words.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 12 },
      },
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
      'Create a note for the current user. Use parentId to create a child note under an existing note. A note can have content and child notes at the same time. The model must build full contentHtml/contentText itself from the user request and available context. Use data field HTML for logins, passwords, tokens and URLs.',
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
        parentId: {
          type: 'integer',
          minimum: 1,
          description: 'Parent note id for a nested child note. Omit it for a root-level note.',
        },
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
            'Full replacement editor HTML. Preserve useful existing content unless the user asks to replace it. Data fields must contain real extracted data-value values.',
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
    name: 'notes.createNestedBatch',
    mode: 'mutation',
    description:
      'Create repeated child notes under many existing notes in one action. Use for requests like "create two subnotes in every existing note and one child inside each created note".',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['allActiveNotes', 'parentIds', 'recentNamedNotes'],
          description:
            'allActiveNotes uses the active note tree snapshot before creation. parentIds uses the provided parentIds. recentNamedNotes uses recent notes matching parentNames.',
        },
        parentIds: {
          type: 'array',
          items: { type: 'integer', minimum: 1 },
          description: 'Parent note ids when scope is parentIds.',
        },
        parentNames: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Exact note names for scope recentNamedNotes, for example ["Вложение 1","Вложение 2"].',
        },
        expectedParentCount: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description:
            'Optional exact amount of recent named parents expected before creating children.',
        },
        recentWithinMinutes: {
          type: 'integer',
          minimum: 1,
          maximum: 10080,
          description: 'Lookback window for scope recentNamedNotes. Default is 240 minutes.',
        },
        childCount: {
          type: 'integer',
          minimum: 1,
          maximum: 10,
          description: 'How many direct child notes to create under each parent.',
        },
        nestedChildCount: {
          type: 'integer',
          minimum: 0,
          maximum: 5,
          description: 'How many child notes to create inside each newly created direct child.',
        },
        childNamePattern: {
          type: 'string',
          description: 'Optional name pattern for direct children. Supports {index} and {parent}.',
        },
        nestedNamePattern: {
          type: 'string',
          description: 'Optional name pattern for nested children. Supports {index} and {parent}.',
        },
      },
      required: ['scope', 'childCount', 'nestedChildCount'],
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
    name: 'notes.autotag',
    mode: 'mutation',
    description:
      'Automatically choose and replace relevant lowercase tags for an existing current user note. The model must infer tags from note title, content and user intent.',
    parameters: {
      type: 'object',
      properties: {
        noteId: { type: 'integer', minimum: 1 },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Relevant lowercase tags chosen by the model. Prefer 3-8 short tags, reuse existing labels when possible.',
        },
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
    name: 'notes.deleteAll',
    mode: 'mutation',
    description:
      'Move all active current user notes to trash. Use only when the user explicitly asks to delete all notes.',
    parameters: {
      type: 'object',
      properties: {
        scope: {
          type: 'string',
          enum: ['all'],
          description: 'Must be "all" for explicit all-notes deletion.',
        },
      },
      required: ['scope'],
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
    name: 'attachments.attachToNote',
    mode: 'mutation',
    description:
      'Attach an existing current user account attachment to a note, reattach it to another note, or detach it when noteId is omitted or null.',
    parameters: {
      type: 'object',
      properties: {
        attachmentId: { type: 'integer', minimum: 1 },
        noteId: {
          type: 'integer',
          minimum: 1,
          description: 'Target note id. Omit or pass null to detach the attachment from notes.',
        },
      },
      required: ['attachmentId'],
    },
  },
  {
    name: 'shareLinks.create',
    mode: 'mutation',
    description:
      'Create temporary public link for a note. Use oneTime for messenger-safe single-use links.',
    parameters: {
      type: 'object',
      properties: {
        noteId: { type: 'integer', minimum: 1 },
        ttlHours: { type: 'integer', minimum: 1, maximum: 720 },
        includeSecrets: { type: 'boolean' },
        oneTime: { type: 'boolean' },
      },
      required: ['noteId'],
    },
  },
  {
    name: 'admin.users.list',
    mode: 'readonly',
    description:
      'Admin-only. List application users with roles, language, theme, note count and login metadata. Use only when the current user is an admin.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'admin.stats.read',
    mode: 'readonly',
    description:
      'Admin-only. Read application statistics, activity chart, storage stats and monthly Notes AI spend. Use only when the current user is an admin.',
    parameters: {
      type: 'object',
      properties: {
        range: {
          type: 'string',
          enum: ['day', 'week', 'month', 'year'],
          description: 'Activity chart range.',
        },
      },
    },
  },
];

const actionTitles: Record<string, string> = {
  'notes.create': 'Создать заметку',
  'notes.createNestedBatch': 'Создать вложенные заметки',
  'notes.update': 'Изменить заметку',
  'notes.tags.set': 'Обновить теги',
  'notes.autotag': 'Подобрать теги',
  'notes.favorite.set': 'Избранное',
  'notes.pinned.set': 'Закрепление',
  'notes.delete': 'Удалить заметку',
  'notes.deleteAll': 'Удалить все заметки',
  'notes.restore': 'Восстановить заметку',
  'templates.createNote': 'Создать из шаблона',
  'versions.restore': 'Откатить версию',
  'attachments.attachToNote': 'Привязать файл к заметке',
  'shareLinks.create': 'Создать ссылку доступа',
};

function toProviderToolName(name: string): string {
  return name.replaceAll('.', '_');
}

const toolDefinitionByName = new Map(toolDefinitions.map((tool) => [tool.name, tool]));
const toolNameByProviderToolName = new Map(
  toolDefinitions.map((tool) => [toProviderToolName(tool.name), tool.name]),
);

@Injectable()
export class AiToolsService {
  constructor(
    @InjectRepository(AiAuditLogEntity)
    private readonly auditRepo: Repository<AiAuditLogEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(NotesService) private readonly notesService: NotesService,
    @Inject(WorkspaceService) private readonly workspaceService: WorkspaceService,
    @Inject(AdminService) private readonly adminService: AdminService,
    @Inject(ActivityService) private readonly activityService: ActivityService,
    @Inject(AiEmbeddingsService) private readonly aiEmbeddingsService: AiEmbeddingsService,
  ) {}

  getOpenAiTools(allowedToolNames?: ReadonlySet<string>): Array<Record<string, unknown>> {
    return toolDefinitions
      .filter((tool) => this.isToolAllowed(tool.name, allowedToolNames))
      .map((tool) => ({
        type: 'function',
        function: {
          name: toProviderToolName(tool.name),
          description: tool.description,
          parameters: {
            ...tool.parameters,
            additionalProperties: false,
          },
        },
      }));
  }

  getToolInstructions(context: AiToolContext = { allowReadSecrets: false }): string {
    const allowedTools = this.describeAllowedTools(context.allowedToolNames);
    return [
      'STARTER PROMPT FOR NOTES AI.',
      'Role: you are Notes AI, an assistant embedded into a private notebook application. Be concise in chat, but use tools whenever the user asks you to work with notes or account data.',
      'Authority: tools are the only way to read or change application data. Never say that you cannot create or edit notes if a matching tool exists. Return a tool action instead.',
      'There are no hidden backend shortcuts or local command parsers. You must select the correct tool and prepare the exact payload yourself from the user request and available note context.',
      context.requireActionConfirmation === false
        ? 'Execution model: readonly tools run immediately. Mutation tools are prepared as actions and the web app is configured to execute them automatically without an extra confirmation card. Do not ask the user to press a confirmation button.'
        : 'Execution model: readonly tools run immediately. Mutation tools are only previews; the app will show a confirmation card and execute the action after the user confirms it.',
      'Messenger runtime: the same tools can be used from Telegram/VK bots. In messenger chats there may be no current note and no UI button; prepare normal tool actions anyway, and the bot runtime may ask for text confirmation depending on admin settings.',
      'Messenger voice: Telegram/VK voice messages are transcribed by the backend before you receive the command. Treat the transcript as the user request and use the same tools; do not mention audio unless the text is ambiguous.',
      allowedTools,
      'Current note: if a current selected note is provided, use its noteId for phrases like current note, selected note, opened note, this note, already created note. If no current note is provided and the user names a note, use notes.search first, then notes.read if you need exact content.',
      'Note tree model: every note may contain text and also have child notes. There is no separate folder-only entity. If the user asks to create a note inside/under/below/within the current selected note, под текущей заметкой, в подзаметке, дочернюю заметку or go deeper in the tree, call notes.create with parentId equal to the selected/current noteId. If the user names a parent note, find that parent with notes.search and use its id as parentId. If several parents match and there is no current note, ask a short clarification instead of creating in the wrong place.',
      'Search: use notes.search for questions about where something is stored, passwords, deploy notes, tags, or any phrase that may exist in note titles/text. Use notes.read after search when you need full note content or must edit a specific note.',
      'Semantic search: use notes.semanticSearch when the user searches by meaning, asks broad natural-language questions, or uses words that may not exactly match note text. If semantic search returns weak or no results, use notes.search as a fallback.',
      'Reading: after notes.read, answer from the returned note content. If the content does not contain the requested data, say that clearly and suggest a narrower query.',
      'Creating notes: use notes.create with name, contentHtml and contentText. For root notes omit parentId. For child/subnotes set parentId to the parent note id; do not modify the parent content just to create a child. If the user gives credentials, access data, URLs, tokens or passwords, represent them as data fields, not as plain paragraphs.',
      'Batch nested creation: if the user asks to create child/subnotes in all existing notes, in every note, во всех существующих заметках, or asks for repeated nested structure across many parents, use notes.createNestedBatch. For "Во всех существующих заметках создай по 2 заметки вложения. А внутри каждой из 2-х созданных - еще по 1" use scope="allActiveNotes", childCount=2, nestedChildCount=1. Do not call notes.search with an empty query for all notes.',
      'Continuing a previous batch: if the user then says "inside each of the new two notes create more" / "внутри каждой из новых двух заметок" and clarifies a total count such as 20, use notes.createNestedBatch with scope="recentNamedNotes", parentNames=["Вложение 1","Вложение 2"], expectedParentCount=20, childCount equal to the requested new count, and nestedChildCount=0. This targets the recent first-level notes from the previous batch, not every note in the tree.',
      'Editing notes: use notes.update. contentHtml/contentText are replacements, so when changing note content send the full new content, not a tiny patch. Preserve useful existing text unless the user asks to replace it. For rename-only requests send only name.',
      'Formatting: contentHtml should be clean editor HTML. Prefer p, h2, h3, ul, ol, li, blockquote, strong, em, u, a[href], pre/code. For code use pre/code and set language class when useful, for example <pre><code class="language-json">...</code></pre>. Keep contentText as readable plain text equivalent for search.',
      'Data fields: the UI has one editor button named "Поле данных" / "Data field"; it replaced the old separate copy-field and secret-field buttons. A new data field starts as data-kind="text" by default, then its type controls behavior. Use <div data-copy-field="" data-label="Label" data-value="Value" data-kind="login|password|token|url|text" data-secret="true|false"></div>. Use data-secret="true" for password and token. Use data-kind="url" for links that should open in preview mode. Labels should be human-readable in Russian when the user writes Russian.',
      'Moving existing credentials to data fields: when the user asks to move/convert data into fields, secret values, password fields, credential fields or uses old wording like "секретные поля", YOU must read the current note text/HTML, infer the values from natural language, remove open plain credential lines, and create data fields with the exact extracted values. The backend will not parse those values for you.',
      'Tags/favorites/pins: use notes.tags.set, notes.autotag, notes.favorite.set and notes.pinned.set. Tags are global lowercase labels. Use notes.autotag when the user asks to auto-tag a note, подобрать теги, проставить теги автоматически, classify or organize by tags. For autotagging, read the current note first if you do not have enough content, infer 3-8 relevant lowercase tags, reuse existing labels when possible, then call notes.autotag.',
      'Deleting notes: use notes.delete with noteId for one specific note. Use notes.deleteAll with scope="all" only when the user explicitly asks to delete/remove all notes in the current account; it moves active notes to trash and does not permanently erase account files.',
      'Trash/versions/templates/attachments/share links: use the corresponding tools when the user asks to delete, restore, rollback a version, create from a template, list files, attach an existing account file to a note, or create a temporary public link. For messenger answers with found notes, prefer oneTime share links unless the user asks for reusable access.',
      'Admin tools: admin.users.list and admin.stats.read are available only for users whose backend role is admin. Use them for admin questions about users or system statistics; never use them for ordinary user note work.',
      context.allowReadSecrets
        ? 'Secret access: the user enabled AI access to secret values stored in data fields. You may read and transform secret values only when the user explicitly asks for it, and you must not reveal them casually.'
        : 'Secret access: the user did not enable AI access to secret values stored in data fields. Secret/password/token values are redacted in note context and readonly tool results. Do not try to reveal or reconstruct them.',
      'Safety: do not expose secrets unless the user explicitly asks for them and the available context/tool result contains them. Do not invent passwords, tokens, URLs or note ids.',
      'Response style: after a tool preview, briefly say what will happen. After a tool execution result, summarize the result. Do not include raw JSON unless the user asks for it.',
    ].join('\n');
  }

  getToolMode(name: string): AiToolMode {
    const tool = toolDefinitionByName.get(name);
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

  async handleToolCall(
    userId: number,
    toolCall: ParsedToolCall,
    context: AiToolContext = { allowReadSecrets: false },
  ): Promise<AiToolResult> {
    this.enforceToolAllowed(toolCall.name, context.allowedToolNames);

    if (this.getToolMode(toolCall.name) === 'mutation') {
      return {
        message: {
          role: 'assistant',
          content: `Подтвердите действие: ${this.getActionTitle(toolCall.name)}.`,
        },
        action: this.createAction(toolCall.name, toolCall.payload),
      };
    }

    const result = await this.executeReadonly(userId, toolCall.name, toolCall.payload, context);
    await this.recordAudit(userId, toolCall.name, 'readonly', this.readTargetId(toolCall.payload), {
      payloadKeys: Object.keys(toolCall.payload),
    });

    return {
      message: {
        role: 'assistant',
        content: this.stringifyResult(toolCall.name, result),
      },
    };
  }

  async executeAction(
    userId: number,
    name: string,
    payload: Record<string, unknown>,
    allowedToolNames?: ReadonlySet<string>,
  ): Promise<AiToolExecutionResponse> {
    this.enforceToolAllowed(name, allowedToolNames);

    if (this.getToolMode(name) !== 'mutation') {
      throw new BadRequestException(`AI tool ${name} does not require confirmation`);
    }

    const result = await this.executeMutation(userId, name, payload);
    await this.recordAudit(userId, name, 'mutation', result.noteId, {
      payloadKeys: Object.keys(payload),
      refreshTree: result.refreshTree,
    });
    await this.activityService.record({
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
      actionName: name,
      noteId: result.noteId,
      refreshTree: result.refreshTree,
    };
  }

  private async executeReadonly(
    userId: number,
    name: string,
    payload: Record<string, unknown>,
    context: AiToolContext,
  ): Promise<unknown> {
    switch (name) {
      case 'notes.search':
        return this.sanitizeReadonlyResult(
          await this.notesService.search(userId, this.readString(payload.query, 'query')),
          context,
        );
      case 'notes.semanticSearch':
        return this.sanitizeReadonlyResult(
          await this.aiEmbeddingsService.semanticSearch(
            userId,
            this.readString(payload.query, 'query'),
            Math.min(this.readOptionalPositiveInt(payload.limit, 'limit') ?? 8, 12),
            context.allowReadSecrets,
          ),
          context,
        );
      case 'notes.read':
        return this.sanitizeReadonlyResult(
          await this.notesService.getById(userId, this.readNoteId(payload)),
          context,
        );
      case 'templates.list':
        return this.sanitizeReadonlyResult(
          await this.workspaceService.listTemplates(userId),
          context,
        );
      case 'versions.list':
        return this.sanitizeReadonlyResult(
          await this.notesService.listVersions(userId, this.readNoteId(payload)),
          context,
        );
      case 'attachments.list': {
        const noteId = this.readOptionalNoteId(payload);
        return noteId === null
          ? await this.workspaceService.listAccountAttachments(userId)
          : await this.workspaceService.listAttachments(userId, noteId);
      }
      case 'admin.users.list':
        await this.ensureAdminUser(userId);
        return this.adminService.listUsers();
      case 'admin.stats.read':
        await this.ensureAdminUser(userId);
        return this.adminService.getStats(this.readOptionalString(payload.range));
      default:
        throw new BadRequestException(`AI tool ${name} is not supported`);
    }
  }

  private async executeMutation(
    userId: number,
    name: string,
    payload: Record<string, unknown>,
  ): Promise<{ data: unknown; noteId?: number; refreshTree: boolean }> {
    switch (name) {
      case 'notes.create': {
        const note = await this.notesService.create(userId, {
          name: this.readString(payload.name, 'name').slice(0, 120),
          parentId: this.readOptionalPositiveInt(payload.parentId, 'parentId'),
        });
        const updated = await this.notesService.update(userId, note.id, {
          contentHtml: this.readText(payload.contentHtml, 'contentHtml', '<p></p>'),
          contentText: this.readText(payload.contentText, 'contentText', ''),
          isFavorite: this.readOptionalBoolean(payload.isFavorite),
          isPinned: this.readOptionalBoolean(payload.isPinned),
        });
        const tags = this.readStringArray(payload.tags).slice(0, 20);
        for (const tag of tags) {
          await this.notesService.createTag(userId, tag);
        }
        if (tags.length > 0) {
          await this.notesService.updateTags(userId, note.id, tags);
        }
        return { data: updated, noteId: note.id, refreshTree: true };
      }
      case 'notes.createNestedBatch': {
        const result = await this.notesService.createNestedBatch(userId, {
          parentScope: this.readBatchScope(payload),
          parentIds: this.readPositiveIntArray(payload.parentIds),
          parentNames: this.readStringArray(payload.parentNames),
          expectedParentCount: this.readOptionalLimitedPositiveInt(
            payload.expectedParentCount,
            'expectedParentCount',
            100,
          ),
          recentWithinMinutes: this.readOptionalLimitedPositiveInt(
            payload.recentWithinMinutes,
            'recentWithinMinutes',
            10_080,
          ),
          childCount: this.readLimitedPositiveInt(payload.childCount, 'childCount', 10),
          nestedChildCount: this.readLimitedNonNegativeInt(
            payload.nestedChildCount,
            'nestedChildCount',
            5,
          ),
          childNamePattern: this.readOptionalString(payload.childNamePattern)?.slice(0, 100),
          nestedNamePattern: this.readOptionalString(payload.nestedNamePattern)?.slice(0, 100),
        });
        return { data: result, refreshTree: true };
      }
      case 'notes.update': {
        const noteId = this.readNoteId(payload);
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

        const updated = await this.notesService.update(userId, noteId, {
          name,
          contentHtml,
          contentText,
        });
        return { data: updated, noteId, refreshTree: true };
      }
      case 'notes.tags.set': {
        const noteId = this.readNoteId(payload);
        const tags = this.readStringArray(payload.tags).slice(0, 20);
        for (const tag of tags) {
          await this.notesService.createTag(userId, tag);
        }
        const note = await this.notesService.updateTags(userId, noteId, tags);
        return { data: note, noteId, refreshTree: true };
      }
      case 'notes.autotag': {
        const noteId = this.readNoteId(payload);
        const tags = this.readStringArray(payload.tags).slice(0, 8);
        for (const tag of tags) {
          await this.notesService.createTag(userId, tag);
        }
        const note = await this.notesService.updateTags(userId, noteId, tags);
        return { data: note, noteId, refreshTree: true };
      }
      case 'notes.favorite.set': {
        const noteId = this.readNoteId(payload);
        const note = await this.notesService.update(userId, noteId, {
          isFavorite: this.readBoolean(payload.value, 'value'),
        });
        return { data: note, noteId, refreshTree: true };
      }
      case 'notes.pinned.set': {
        const noteId = this.readNoteId(payload);
        const note = await this.notesService.update(userId, noteId, {
          isPinned: this.readBoolean(payload.value, 'value'),
        });
        return { data: note, noteId, refreshTree: true };
      }
      case 'notes.delete': {
        const noteId = this.readNoteId(payload);
        return {
          data: await this.notesService.delete(userId, noteId),
          noteId,
          refreshTree: true,
        };
      }
      case 'notes.deleteAll':
        this.ensureAllScope(payload);
        return {
          data: await this.notesService.deleteAll(userId),
          refreshTree: true,
        };
      case 'notes.restore': {
        const noteId = this.readNoteId(payload);
        const note = await this.notesService.restore(userId, noteId);
        return { data: note, noteId, refreshTree: true };
      }
      case 'templates.createNote': {
        const note = await this.workspaceService.createNoteFromTemplate(userId, {
          templateId: this.readPositiveInt(payload.templateId, 'templateId'),
          parentId: this.readOptionalPositiveInt(payload.parentId, 'parentId'),
        });
        return { data: note, noteId: note.id, refreshTree: true };
      }
      case 'versions.restore': {
        const noteId = this.readNoteId(payload);
        const note = await this.notesService.restoreVersion(
          userId,
          noteId,
          this.readPositiveInt(payload.versionId, 'versionId'),
        );
        return { data: note, noteId, refreshTree: true };
      }
      case 'attachments.attachToNote': {
        const attachmentId = this.readPositiveInt(payload.attachmentId, 'attachmentId');
        const noteId = this.readOptionalPositiveInt(payload.noteId, 'noteId');
        return {
          data: await this.workspaceService.attachAttachmentToNote(userId, attachmentId, { noteId }),
          noteId: noteId ?? undefined,
          refreshTree: false,
        };
      }
      case 'shareLinks.create': {
        const noteId = this.readNoteId(payload);
        return {
          data: await this.workspaceService.createShareLink(userId, noteId, {
            ttlHours: this.readOptionalPositiveInt(payload.ttlHours, 'ttlHours') ?? 24,
            includeSecrets: this.readOptionalBoolean(payload.includeSecrets) ?? false,
            oneTime: this.readOptionalBoolean(payload.oneTime) ?? false,
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
      destructive: name === 'notes.delete' || name === 'notes.deleteAll',
    };
  }

  private isToolAllowed(name: string, allowedToolNames?: ReadonlySet<string>): boolean {
    return !allowedToolNames || allowedToolNames.has(name);
  }

  private enforceToolAllowed(name: string, allowedToolNames?: ReadonlySet<string>): void {
    if (!this.isToolAllowed(name, allowedToolNames)) {
      throw new BadRequestException(`AI tool ${name} is not allowed in this context`);
    }
  }

  private describeAllowedTools(allowedToolNames?: ReadonlySet<string>): string {
    if (!allowedToolNames) {
      return 'Tool access: all listed tools are available in this UI context.';
    }

    const names = toolDefinitions
      .map((tool) => tool.name)
      .filter((name) => allowedToolNames.has(name));

    return `Tool access for this messenger context: only these tools are allowed: ${names.join(', ') || 'none'}. Do not ask for or call disabled tools.`;
  }

  private getActionTitle(name: string): string {
    return actionTitles[name] ?? name;
  }

  private describeAction(name: string, payload: Record<string, unknown>): string {
    if (name === 'notes.create') {
      const parentId = this.readOptionalPositiveInt(payload.parentId, 'parentId');
      const parentSuffix = parentId ? ` внутри заметки #${parentId}` : '';
      return `Будет создана заметка "${this.readString(payload.name, 'name')}"${parentSuffix}.`;
    }

    if (name === 'notes.createNestedBatch') {
      const scope = this.readBatchScope(payload);
      const childCount = this.readLimitedPositiveInt(payload.childCount, 'childCount', 10);
      const nestedChildCount = this.readLimitedNonNegativeInt(
        payload.nestedChildCount,
        'nestedChildCount',
        5,
      );
      return scope === 'allActiveNotes'
        ? `Во всех активных заметках будет создано по ${childCount} дочерних заметки, внутри каждой - по ${nestedChildCount}.`
        : scope === 'recentNamedNotes'
          ? `В последних созданных заметках с указанными именами будет создано по ${childCount} дочерних заметки, внутри каждой - по ${nestedChildCount}.`
          : `В выбранных родительских заметках будет создано по ${childCount} дочерних заметки, внутри каждой - по ${nestedChildCount}.`;
    }

    if (name === 'notes.deleteAll') {
      return 'Все активные заметки будут перемещены в корзину.';
    }

    if ('noteId' in payload) {
      return `Заметка #${String(payload.noteId)}`;
    }

    return 'Действие будет выполнено после подтверждения.';
  }

  private sanitizeReadonlyResult(result: unknown, context: AiToolContext): unknown {
    if (context.allowReadSecrets) {
      return result;
    }

    if (Array.isArray(result)) {
      return result.map((item) => this.sanitizeReadonlyResult(item, context));
    }

    if (!result || typeof result !== 'object') {
      return typeof result === 'string' ? redactSecretText(result) : result;
    }

    const source = result as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(source).map(([key, value]) => {
        if (key === 'contentHtml' && typeof value === 'string') {
          return [key, redactSecretHtml(value)];
        }

        if ((key === 'contentText' || key === 'snippet') && typeof value === 'string') {
          return [key, redactSecretText(value)];
        }

        return [key, value];
      }),
    );
  }

  private stringifyResult(name: string, result: unknown): string {
    if (name === 'notes.read') {
      return this.stringifyNoteReadResult(result);
    }

    if (name === 'admin.stats.read') {
      return this.stringifyAdminStatsResult(result);
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

  private stringifyAdminStatsResult(result: unknown): string {
    if (!result || typeof result !== 'object') {
      return this.compactObject(result);
    }

    const stats = result as Record<string, unknown>;
    const summaryKeys = [
      'usersTotal',
      'adminsTotal',
      'notesTotal',
      'attachmentsTotal',
      'attachmentsStorageBytes',
      'orphanAttachmentsTotal',
      'aiEnabledUsersTotal',
      'aiChatsLast24h',
      'aiToolExecutionsLast24h',
      'aiActiveUsersLast24h',
      'activityRange',
    ];
    const lines = summaryKeys
      .filter((key) => stats[key] !== undefined && stats[key] !== null)
      .map((key) => `${key}: ${String(stats[key])}`);

    const topStorageUsers = this.compactList(stats.topStorageUsers, 'topStorageUsers');
    const topActivityUsers = this.compactList(stats.topActivityUsers, 'topActivityUsers');
    const topAiModels = this.compactList(stats.topAiModels, 'topAiModels');
    const aiMonthlySpendUsers = this.compactList(stats.aiMonthlySpendUsers, 'aiMonthlySpendUsers');

    return [...lines, topStorageUsers, topActivityUsers, topAiModels, aiMonthlySpendUsers]
      .filter(Boolean)
      .join('\n');
  }

  private compactList(value: unknown, label: string): string {
    if (!Array.isArray(value) || value.length === 0) {
      return '';
    }

    return `${label}: ${value
      .slice(0, 5)
      .map((item) => this.compactObject(item))
      .join(' || ')}`;
  }

  private stringifyExecution(name: string, result: unknown): string {
    if (name === 'notes.create') {
      return 'Заметка создана.';
    }

    if (name === 'notes.createNestedBatch') {
      const record = result as {
        parentCount?: unknown;
        createdCount?: unknown;
        directChildIds?: unknown;
      };
      const directChildIds = Array.isArray(record.directChildIds)
        ? record.directChildIds.slice(0, 60).join(', ')
        : '';
      return [
        `Вложенные заметки созданы. Родителей: ${String(record.parentCount ?? 0)}, создано: ${String(record.createdCount ?? 0)}.`,
        directChildIds ? `ID новых прямых дочерних заметок: ${directChildIds}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
    }

    if (name === 'notes.update') {
      return 'Заметка обновлена.';
    }

    if (name === 'notes.autotag') {
      return 'Теги подобраны.';
    }

    if (name === 'notes.deleteAll') {
      const deletedCount =
        result && typeof result === 'object' && 'deletedCount' in result
          ? Number((result as { deletedCount: unknown }).deletedCount)
          : 0;
      return deletedCount > 0
        ? `В корзину перемещено заметок: ${deletedCount}.`
        : 'Активных заметок для удаления не найдено.';
    }

    if (name === 'shareLinks.create') {
      return `Ссылка создана: ${this.compactObject(result)}`;
    }

    if (name === 'attachments.attachToNote') {
      return `Файл обновлен: ${this.compactObject(result)}`;
    }

    return 'Действие выполнено.';
  }

  private compactObject(value: unknown): string {
    if (!value || typeof value !== 'object') {
      return String(value ?? '');
    }

    const record = value as Record<string, unknown>;
    const parts = [
      'id',
      'name',
      'title',
      'snippet',
      'score',
      'matchType',
      'url',
      'username',
      'role',
      'notesCount',
      'usersTotal',
      'attachmentsTotal',
      'attachmentsStorageBytes',
      'aiChatsLast24h',
      'updatedAt',
      'createdAt',
    ]
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

  private async recordAudit(
    userId: number,
    action: string,
    mode: AiToolMode,
    targetId: number | undefined,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.auditRepo.insert({
      user_id: userId,
      action,
      target_type: mode,
      target_id: targetId ?? null,
      details: JSON.stringify(details),
      created_at: nowIso(),
    });
  }

  private readTargetId(payload: Record<string, unknown>): number | undefined {
    const noteId = this.readOptionalNoteId(payload);
    return (
      noteId ?? this.readOptionalPositiveInt(payload.attachmentId, 'attachmentId') ?? undefined
    );
  }

  private readString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return value.trim();
  }

  private readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      return this.readPositiveInt(Number(value.trim()), fieldName);
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
      throw new BadRequestException(`${fieldName} must be a positive integer`);
    }

    return value;
  }

  private readLimitedPositiveInt(value: unknown, fieldName: string, max: number): number {
    const number = this.readPositiveInt(value, fieldName);
    if (number > max) {
      throw new BadRequestException(`${fieldName} must be less than or equal to ${max}`);
    }

    return number;
  }

  private readOptionalLimitedPositiveInt(
    value: unknown,
    fieldName: string,
    max: number,
  ): number | null {
    if (value === undefined || value === null) {
      return null;
    }

    return this.readLimitedPositiveInt(value, fieldName, max);
  }

  private readLimitedNonNegativeInt(value: unknown, fieldName: string, max: number): number {
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      return this.readLimitedNonNegativeInt(Number(value.trim()), fieldName, max);
    }

    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
      throw new BadRequestException(`${fieldName} must be an integer from 0 to ${max}`);
    }

    return value;
  }

  private readPositiveIntArray(value: unknown): number[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return [...new Set(value.map((item) => this.readPositiveInt(item, 'parentIds')))];
  }

  private readOptionalPositiveInt(value: unknown, fieldName: string): number | null {
    if (value === undefined || value === null) {
      return null;
    }

    return this.readPositiveInt(value, fieldName);
  }

  private readNoteId(payload: Record<string, unknown>): number {
    return this.readPositiveInt(payload.noteId ?? payload.id, 'noteId');
  }

  private readOptionalNoteId(payload: Record<string, unknown>): number | null {
    return payload.noteId === undefined && payload.id === undefined
      ? null
      : this.readNoteId(payload);
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

  private readBatchScope(
    payload: Record<string, unknown>,
  ): 'allActiveNotes' | 'parentIds' | 'recentNamedNotes' {
    if (payload.scope === 'allActiveNotes') {
      return 'allActiveNotes';
    }

    if (payload.scope === 'parentIds') {
      if (this.readPositiveIntArray(payload.parentIds).length === 0) {
        throw new BadRequestException('parentIds are required when scope is parentIds');
      }

      return 'parentIds';
    }

    if (payload.scope === 'recentNamedNotes') {
      if (this.readStringArray(payload.parentNames).length === 0) {
        throw new BadRequestException('parentNames are required when scope is recentNamedNotes');
      }

      return 'recentNamedNotes';
    }

    throw new BadRequestException(
      'scope must be "allActiveNotes", "parentIds" or "recentNamedNotes"',
    );
  }

  private ensureAllScope(payload: Record<string, unknown>): void {
    if (payload.scope !== 'all') {
      throw new BadRequestException('scope must be "all"');
    }
  }

  private async ensureAdminUser(userId: number): Promise<void> {
    const rows = (await this.dataSource.query('SELECT role FROM users WHERE id = $1', [
      userId,
    ])) as Array<{ role: UserRole }>;

    if (rows[0]?.role !== 'admin') {
      throw new ForbiddenException('Admin AI tool is available only for admins');
    }
  }

  private fromProviderToolName(name: string): string {
    return toolNameByProviderToolName.get(name) ?? name;
  }
}
