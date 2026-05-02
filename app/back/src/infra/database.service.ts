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
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_notes_user_parent ON notes(user_id, parent_id);
      CREATE INDEX IF NOT EXISTS idx_notes_position ON notes(user_id, parent_id, position, name);

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
    `);
    this.ensureColumn(
      'users',
      'role',
      "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'",
    );
    this.ensureColumn('users', 'last_login_at', 'ALTER TABLE users ADD COLUMN last_login_at TEXT');
    this.ensureColumn(
      'notes',
      'user_id',
      'ALTER TABLE notes ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE',
    );
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
}
