import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { hashPassword } from '../auth/password';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db?: Database.Database;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const dbPath =
      this.configService.get<string>('DB_PATH')?.trim() || join(process.cwd(), 'notes.sqlite');

    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
    this.seedIfEmpty();

    this.logger.log(`SQLite database is ready at ${dbPath}`);
  }

  onModuleDestroy(): void {
    this.db?.close();
  }

  get connection(): Database.Database {
    if (!this.db) {
      throw new Error('Database connection is not initialized');
    }

    return this.db;
  }

  private migrate(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        language TEXT NOT NULL DEFAULT 'ru',
        theme TEXT NOT NULL DEFAULT 'dark',
        last_login_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        content_html TEXT NOT NULL DEFAULT '',
        content_text TEXT NOT NULL DEFAULT '',
        parent_id INTEGER REFERENCES notes(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        is_pinned INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        delete_reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, name)
      );

      CREATE TABLE IF NOT EXISTS note_tags (
        note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY(note_id, tag_id)
      );

      CREATE INDEX IF NOT EXISTS idx_tags_user_name ON tags(user_id, lower(name));
      CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id, note_id);

      CREATE TABLE IF NOT EXISTS note_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        content_html TEXT NOT NULL DEFAULT '',
        content_text TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_note_versions_note ON note_versions(note_id, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS note_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        content_html TEXT NOT NULL DEFAULT '',
        content_text TEXT NOT NULL DEFAULT '',
        is_system INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_note_templates_user ON note_templates(user_id, is_system, lower(name));

      CREATE TABLE IF NOT EXISTS attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        size INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_attachments_note ON attachments(note_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_attachments_user ON attachments(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS share_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        public_url TEXT,
        expires_at TEXT NOT NULL,
        include_secrets INTEGER NOT NULL DEFAULT 0,
        max_access_count INTEGER,
        access_count INTEGER NOT NULL DEFAULT 0,
        revoked_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_accessed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_share_links_note ON share_links(note_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS share_link_access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        share_link_id INTEGER NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
        accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
        user_agent TEXT,
        ip_address TEXT
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id INTEGER,
        details TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS ai_user_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        enabled INTEGER NOT NULL DEFAULT 0,
        allow_read_secrets INTEGER NOT NULL DEFAULT 0,
        require_action_confirmation INTEGER NOT NULL DEFAULT 1,
        daily_request_limit INTEGER,
        daily_token_limit INTEGER,
        provider_name TEXT NOT NULL DEFAULT 'OpenAI-compatible',
        base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
        model TEXT,
        api_key_encrypted TEXT,
        api_key_hint TEXT,
        api_key_updated_at TEXT,
        last_connection_check_at TEXT,
        last_connection_check_status TEXT,
        last_models_sync_at TEXT,
        models_sync_status TEXT,
        models_sync_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ai_provider_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        model TEXT,
        api_key_encrypted TEXT,
        api_key_hint TEXT,
        api_key_updated_at TEXT,
        last_connection_check_at TEXT,
        last_connection_check_status TEXT,
        last_models_sync_at TEXT,
        models_sync_status TEXT,
        models_sync_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, provider_name, base_url)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_provider_settings_user
        ON ai_provider_settings(user_id, provider_name, base_url);

      CREATE TABLE IF NOT EXISTS ai_provider_models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_name TEXT NOT NULL,
        model_id TEXT NOT NULL,
        label TEXT NOT NULL,
        tier TEXT NOT NULL DEFAULT 'unknown',
        quality TEXT NOT NULL DEFAULT 'unknown',
        speed TEXT NOT NULL DEFAULT 'unknown',
        cost TEXT NOT NULL DEFAULT 'unknown',
        input_price_per_1m REAL,
        cached_input_price_per_1m REAL,
        output_price_per_1m REAL,
        capabilities TEXT NOT NULL DEFAULT '[]',
        is_deprecated INTEGER NOT NULL DEFAULT 0,
        provider_created_at INTEGER,
        last_seen_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, provider_name, model_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_provider_models_user
        ON ai_provider_models(user_id, provider_name, is_deprecated, lower(label));

      CREATE TABLE IF NOT EXISTS ai_model_catalog (
        model_id TEXT PRIMARY KEY,
        label TEXT,
        tier TEXT NOT NULL DEFAULT 'unknown',
        quality TEXT NOT NULL DEFAULT 'unknown',
        speed TEXT NOT NULL DEFAULT 'unknown',
        cost TEXT NOT NULL DEFAULT 'unknown',
        score INTEGER NOT NULL DEFAULT 50,
        speed_score INTEGER NOT NULL DEFAULT 50,
        value_score INTEGER NOT NULL DEFAULT 50,
        sort_rank INTEGER NOT NULL DEFAULT 0,
        input_price_per_1m REAL,
        cached_input_price_per_1m REAL,
        output_price_per_1m REAL,
        capabilities TEXT NOT NULL DEFAULT '[]',
        is_deprecated INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'builtin',
        last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ai_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id INTEGER,
        details TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_user
        ON ai_audit_logs(user_id, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider_name TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user
        ON ai_usage_logs(user_id, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS ai_note_embeddings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        provider_name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        model TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        vector_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, note_id, provider_name, base_url, model)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_note_embeddings_user
        ON ai_note_embeddings(user_id, provider_name, base_url, model, note_id);

      CREATE TABLE IF NOT EXISTS ai_bot_admin_settings (
        provider TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        webhook_url TEXT,
        bot_token_encrypted TEXT,
        access_token_encrypted TEXT,
        secret_encrypted TEXT,
        group_id TEXT,
        confirmation_code TEXT,
        allow_secrets INTEGER NOT NULL DEFAULT 0,
        require_confirmation INTEGER NOT NULL DEFAULT 1,
        daily_request_limit INTEGER,
        daily_read_limit INTEGER,
        daily_write_limit INTEGER,
        last_check_at TEXT,
        last_check_status TEXT,
        last_check_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ai_bot_user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0,
        access_mode TEXT NOT NULL DEFAULT 'read',
        allow_secrets INTEGER NOT NULL DEFAULT 0,
        allow_note_read INTEGER NOT NULL DEFAULT 1,
        allow_note_write INTEGER NOT NULL DEFAULT 0,
        allow_note_delete INTEGER NOT NULL DEFAULT 0,
        allow_tags INTEGER NOT NULL DEFAULT 0,
        allow_templates INTEGER NOT NULL DEFAULT 0,
        allow_versions INTEGER NOT NULL DEFAULT 0,
        allow_attachments INTEGER NOT NULL DEFAULT 0,
        allow_share_links INTEGER NOT NULL DEFAULT 0,
        daily_request_limit INTEGER,
        daily_read_limit INTEGER,
        daily_write_limit INTEGER,
        linked_external_id TEXT,
        linked_username TEXT,
        linked_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, provider)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_bot_user_settings_provider
        ON ai_bot_user_settings(provider, linked_external_id);

      CREATE TABLE IF NOT EXISTS ai_bot_link_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ai_bot_link_codes_user
        ON ai_bot_link_codes(user_id, provider, expires_at DESC);

      CREATE TABLE IF NOT EXISTS ai_bot_pending_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        action_name TEXT NOT NULL,
        action_payload TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ai_bot_pending_actions_user
        ON ai_bot_pending_actions(user_id, provider, external_id, expires_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS ai_bot_usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        kind TEXT NOT NULL,
        action_name TEXT,
        usage_count INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_ai_bot_usage_logs_user
        ON ai_bot_usage_logs(user_id, provider, kind, created_at DESC, id DESC);
    `);
    this.ensureColumn(
      'users',
      'role',
      "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'",
    );
    this.ensureColumn(
      'ai_provider_models',
      'provider_created_at',
      'ALTER TABLE ai_provider_models ADD COLUMN provider_created_at INTEGER',
    );
    this.ensureColumn(
      'ai_provider_models',
      'input_price_per_1m',
      'ALTER TABLE ai_provider_models ADD COLUMN input_price_per_1m REAL',
    );
    this.ensureColumn(
      'ai_provider_models',
      'cached_input_price_per_1m',
      'ALTER TABLE ai_provider_models ADD COLUMN cached_input_price_per_1m REAL',
    );
    this.ensureColumn(
      'ai_provider_models',
      'output_price_per_1m',
      'ALTER TABLE ai_provider_models ADD COLUMN output_price_per_1m REAL',
    );
    this.ensureColumn(
      'ai_user_settings',
      'allow_read_secrets',
      'ALTER TABLE ai_user_settings ADD COLUMN allow_read_secrets INTEGER NOT NULL DEFAULT 0',
    );
    this.ensureColumn(
      'ai_user_settings',
      'require_action_confirmation',
      'ALTER TABLE ai_user_settings ADD COLUMN require_action_confirmation INTEGER NOT NULL DEFAULT 1',
    );
    this.ensureColumn(
      'ai_user_settings',
      'daily_request_limit',
      'ALTER TABLE ai_user_settings ADD COLUMN daily_request_limit INTEGER',
    );
    this.ensureColumn(
      'ai_user_settings',
      'daily_token_limit',
      'ALTER TABLE ai_user_settings ADD COLUMN daily_token_limit INTEGER',
    );
    this.ensureColumn(
      'ai_bot_user_settings',
      'allow_note_read',
      'ALTER TABLE ai_bot_user_settings ADD COLUMN allow_note_read INTEGER NOT NULL DEFAULT 1',
    );
    this.ensureColumn(
      'ai_bot_user_settings',
      'allow_note_write',
      'ALTER TABLE ai_bot_user_settings ADD COLUMN allow_note_write INTEGER NOT NULL DEFAULT 0',
    );
    this.ensureColumn(
      'ai_bot_user_settings',
      'allow_note_delete',
      'ALTER TABLE ai_bot_user_settings ADD COLUMN allow_note_delete INTEGER NOT NULL DEFAULT 0',
    );
    this.ensureColumn(
      'ai_bot_user_settings',
      'allow_tags',
      'ALTER TABLE ai_bot_user_settings ADD COLUMN allow_tags INTEGER NOT NULL DEFAULT 0',
    );
    this.ensureColumn(
      'ai_bot_user_settings',
      'allow_templates',
      'ALTER TABLE ai_bot_user_settings ADD COLUMN allow_templates INTEGER NOT NULL DEFAULT 0',
    );
    this.ensureColumn(
      'ai_bot_user_settings',
      'allow_versions',
      'ALTER TABLE ai_bot_user_settings ADD COLUMN allow_versions INTEGER NOT NULL DEFAULT 0',
    );
    this.ensureColumn(
      'ai_bot_user_settings',
      'allow_attachments',
      'ALTER TABLE ai_bot_user_settings ADD COLUMN allow_attachments INTEGER NOT NULL DEFAULT 0',
    );
    this.ensureColumn(
      'ai_bot_user_settings',
      'allow_share_links',
      'ALTER TABLE ai_bot_user_settings ADD COLUMN allow_share_links INTEGER NOT NULL DEFAULT 0',
    );
    this.ensureColumn(
      'ai_bot_admin_settings',
      'daily_read_limit',
      'ALTER TABLE ai_bot_admin_settings ADD COLUMN daily_read_limit INTEGER',
    );
    this.ensureColumn(
      'ai_bot_admin_settings',
      'daily_write_limit',
      'ALTER TABLE ai_bot_admin_settings ADD COLUMN daily_write_limit INTEGER',
    );
    this.ensureColumn(
      'ai_bot_user_settings',
      'daily_read_limit',
      'ALTER TABLE ai_bot_user_settings ADD COLUMN daily_read_limit INTEGER',
    );
    this.ensureColumn(
      'ai_bot_user_settings',
      'daily_write_limit',
      'ALTER TABLE ai_bot_user_settings ADD COLUMN daily_write_limit INTEGER',
    );
    this.backfillAiProviderSettings();
    this.ensureColumn('users', 'last_login_at', 'ALTER TABLE users ADD COLUMN last_login_at TEXT');
    this.ensureColumn(
      'notes',
      'user_id',
      'ALTER TABLE notes ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE',
    );
    this.ensureColumn(
      'notes',
      'is_favorite',
      'ALTER TABLE notes ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0',
    );
    this.ensureColumn(
      'notes',
      'is_pinned',
      'ALTER TABLE notes ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0',
    );
    this.ensureColumn('notes', 'deleted_at', 'ALTER TABLE notes ADD COLUMN deleted_at TEXT');
    this.ensureColumn(
      'notes',
      'deleted_by',
      'ALTER TABLE notes ADD COLUMN deleted_by INTEGER REFERENCES users(id) ON DELETE SET NULL',
    );
    this.ensureColumn('notes', 'delete_reason', 'ALTER TABLE notes ADD COLUMN delete_reason TEXT');
    this.ensureColumn(
      'share_links',
      'public_url',
      'ALTER TABLE share_links ADD COLUMN public_url TEXT',
    );
    this.ensureColumn(
      'share_links',
      'max_access_count',
      'ALTER TABLE share_links ADD COLUMN max_access_count INTEGER',
    );
    this.ensureColumn(
      'share_links',
      'access_count',
      'ALTER TABLE share_links ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0',
    );
    this.ensureAttachmentsDetachOnNoteDelete();
    this.dropRemovedColumn('users', 'totp_secret');
    this.dropRemovedColumn('users', 'totp_enabled');
    this.dropRemovedColumn('users', 'totp_recovery_codes_hash');
    this.createNotesIndexes();
    this.createQueryIndexes();
    this.createFtsTable();
  }

  private seedIfEmpty(): void {
    const adminId = this.seedAdminUser();
    this.connection
      .prepare('UPDATE notes SET user_id = @adminId WHERE user_id IS NULL')
      .run({ adminId });
    const row = this.connection.prepare('SELECT COUNT(*) as count FROM notes').get() as {
      count: number;
    };

    if (row.count > 0) {
      return;
    }

    const now = new Date().toISOString();
    this.connection
      .prepare(
        `
          INSERT INTO notes (user_id, name, content_html, content_text, parent_id, position, created_at, updated_at)
          VALUES (@userId, @name, @contentHtml, @contentText, NULL, 0, @now, @now)
        `,
      )
      .run({
        userId: adminId,
        name: 'Welcome',
        contentHtml:
          '<h2>Notes</h2><p>Создайте первую заметку, добавьте ссылку или поле для быстрого копирования.</p>',
        contentText: 'Notes. Создайте первую заметку.',
        now,
      });
  }

  private seedAdminUser(): number {
    const existing = this.connection
      .prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1')
      .get() as { id: number } | undefined;

    if (existing) {
      this.connection
        .prepare("UPDATE users SET role = 'admin' WHERE id = @id AND role != 'admin'")
        .run({
          id: existing.id,
        });
      return existing.id;
    }

    const username = this.configService.get<string>('ADMIN_USERNAME')?.trim() || 'admin';
    const password = this.configService.get<string>('ADMIN_PASSWORD') ?? 'admin';
    const now = new Date().toISOString();

    this.connection
      .prepare(
        `
          INSERT INTO users (username, password_hash, role, language, theme, created_at, updated_at)
          VALUES (@username, @passwordHash, 'admin', 'ru', 'dark', @now, @now)
        `,
      )
      .run({
        username,
        passwordHash: hashPassword(password),
        now,
      });

    const row = this.connection
      .prepare('SELECT id FROM users WHERE lower(username) = lower(?)')
      .get(username) as {
      id: number;
    };

    return row.id;
  }

  private ensureColumn(tableName: string, columnName: string, sql: string): void {
    const columns = this.connection.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      name: string;
    }>;

    if (!columns.some((column) => column.name === columnName)) {
      this.connection.exec(sql);
    }
  }

  private dropRemovedColumn(tableName: string, columnName: string): void {
    const columns = this.connection.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
      name: string;
    }>;

    if (!columns.some((column) => column.name === columnName)) {
      return;
    }

    try {
      this.connection.exec(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`);
    } catch (caught) {
      this.logger.warn(
        `Could not drop removed column ${tableName}.${columnName}: ${(caught as Error).message}`,
      );
    }
  }

  private backfillAiProviderSettings(): void {
    this.connection.exec(`
      INSERT INTO ai_provider_settings (
        user_id,
        provider_name,
        base_url,
        model,
        api_key_encrypted,
        api_key_hint,
        api_key_updated_at,
        last_connection_check_at,
        last_connection_check_status,
        last_models_sync_at,
        models_sync_status,
        models_sync_error,
        created_at,
        updated_at
      )
      SELECT
        user_id,
        provider_name,
        base_url,
        model,
        api_key_encrypted,
        api_key_hint,
        api_key_updated_at,
        last_connection_check_at,
        last_connection_check_status,
        last_models_sync_at,
        models_sync_status,
        models_sync_error,
        created_at,
        updated_at
      FROM ai_user_settings
      WHERE NOT EXISTS (
        SELECT 1
        FROM ai_provider_settings
        WHERE ai_provider_settings.user_id = ai_user_settings.user_id
          AND ai_provider_settings.provider_name = ai_user_settings.provider_name
          AND ai_provider_settings.base_url = ai_user_settings.base_url
      );
    `);
  }

  private createFtsTable(): void {
    try {
      this.connection.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
          name,
          content_text,
          tags,
          user_id UNINDEXED,
          note_id UNINDEXED
        );
      `);
    } catch (caught) {
      this.logger.warn(`SQLite FTS5 is unavailable: ${(caught as Error).message}`);
    }
  }

  private ensureAttachmentsDetachOnNoteDelete(): void {
    const columns = this.connection.prepare('PRAGMA table_info(attachments)').all() as Array<{
      name: string;
      notnull: 0 | 1;
    }>;
    const foreignKeys = this.connection
      .prepare('PRAGMA foreign_key_list(attachments)')
      .all() as Array<{
      from: string;
      table: string;
      on_delete: string;
    }>;
    const noteIdColumn = columns.find((column) => column.name === 'note_id');
    const noteForeignKey = foreignKeys.find(
      (foreignKey) => foreignKey.from === 'note_id' && foreignKey.table === 'notes',
    );

    if (noteIdColumn?.notnull === 0 && noteForeignKey?.on_delete.toUpperCase() === 'SET NULL') {
      return;
    }

    this.connection.exec(`
      PRAGMA foreign_keys = OFF;

      DROP TABLE IF EXISTS attachments_next;

      CREATE TABLE IF NOT EXISTS attachments_next (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id INTEGER REFERENCES notes(id) ON DELETE SET NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
        size INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO attachments_next (id, note_id, user_id, file_name, mime_type, size, storage_path, created_at)
      SELECT id, note_id, user_id, file_name, mime_type, size, storage_path, created_at
      FROM attachments;

      DROP TABLE attachments;
      ALTER TABLE attachments_next RENAME TO attachments;
      CREATE INDEX IF NOT EXISTS idx_attachments_note ON attachments(note_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_attachments_user ON attachments(user_id, created_at DESC);

      PRAGMA foreign_keys = ON;
    `);
  }

  private createNotesIndexes(): void {
    this.connection.exec(`
      CREATE INDEX IF NOT EXISTS idx_notes_user_parent ON notes(user_id, parent_id);
      CREATE INDEX IF NOT EXISTS idx_notes_user_deleted ON notes(user_id, deleted_at);
      CREATE INDEX IF NOT EXISTS idx_notes_position ON notes(user_id, parent_id, position, name);
    `);
  }

  private createQueryIndexes(): void {
    this.connection.exec(`
      CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_logs(actor_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_action_created
        ON activity_logs(action, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_user
        ON ai_usage_logs(created_at DESC, user_id, provider_name, model);
      CREATE INDEX IF NOT EXISTS idx_ai_bot_usage_logs_created
        ON ai_bot_usage_logs(created_at DESC, provider, kind);
      CREATE INDEX IF NOT EXISTS idx_share_links_active ON share_links(revoked_at, expires_at);
    `);
  }
}
