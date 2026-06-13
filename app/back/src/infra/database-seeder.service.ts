import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { hashPassword } from '../auth/password';
import { NoteEntity } from '../database/entities/note.entity';
import { UserEntity } from '../database/entities/user.entity';

// Гарантирует наличие администратора и приветственной заметки на пустой БД.
// Запускается один раз при старте приложения (после готовности схемы).
@Injectable()
export class DatabaseSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSeederService.name);

  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(NoteEntity) private readonly notes: Repository<NoteEntity>,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const adminId = await this.seedAdminUser();
    await this.seedWelcomeNote(adminId);
    this.logger.log('Database seed verified');
  }

  private async seedAdminUser(): Promise<number> {
    const username = this.configService.get<string>('ADMIN_USERNAME')?.trim() || 'admin';
    const password = this.configService.get<string>('ADMIN_PASSWORD') ?? 'admin';
    const nodeEnv = this.configService.get<string>('NODE_ENV')?.trim() || 'development';
    const now = new Date().toISOString();

    const existingByUsername = await this.users
      .createQueryBuilder('user')
      .where('lower(user.username) = lower(:username)', { username })
      .getOne();

    if (existingByUsername) {
      // В dev сбрасываем пароль администратора к значению из env для удобства;
      // в production только повышаем роль, не трогая существующий пароль.
      if (nodeEnv === 'development') {
        await this.users.update(existingByUsername.id, {
          role: 'admin',
          password_hash: hashPassword(password),
          updated_at: now,
        });
      } else if (existingByUsername.role !== 'admin') {
        await this.users.update(existingByUsername.id, { role: 'admin' });
      }
      return existingByUsername.id;
    }

    const firstUser = await this.users.findOne({ where: {}, order: { id: 'ASC' } });
    if (firstUser) {
      if (firstUser.role !== 'admin') {
        await this.users.update(firstUser.id, { role: 'admin' });
      }
      return firstUser.id;
    }

    const created = await this.users.save(
      this.users.create({
        username,
        password_hash: hashPassword(password),
        role: 'admin',
        language: 'ru',
        theme: 'dark',
        created_at: now,
        updated_at: now,
      }),
    );
    return created.id;
  }

  private async seedWelcomeNote(adminId: number): Promise<void> {
    const count = await this.notes.count();
    if (count > 0) {
      return;
    }

    const now = new Date().toISOString();
    await this.notes.save(
      this.notes.create({
        user_id: adminId,
        name: 'Welcome',
        content_html:
          '<h2>Notes</h2><p>Создайте первую заметку, добавьте ссылку или поле для быстрого копирования.</p>',
        content_text: 'Notes. Создайте первую заметку.',
        parent_id: null,
        position: 0,
        created_at: now,
        updated_at: now,
      }),
    );
  }
}
