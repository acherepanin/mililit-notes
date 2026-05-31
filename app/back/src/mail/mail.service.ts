import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {}

  async sendVerificationEmail(to: string, verifyUrl: string, language: 'ru' | 'en' = 'ru'): Promise<void> {
    const subject =
      language === 'ru' ? 'Подтверждение регистрации в Notes' : 'Confirm your Notes registration';
    const text =
      language === 'ru'
        ? `Подтвердите регистрацию, перейдя по ссылке:\n${verifyUrl}\n\nСсылка одноразовая и действует 24 часа.`
        : `Confirm your registration using this link:\n${verifyUrl}\n\nThe link is single-use and valid for 24 hours.`;
    const html =
      language === 'ru'
        ? `<p>Подтвердите регистрацию в Notes:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>Ссылка одноразовая и действует 24 часа.</p>`
        : `<p>Confirm your Notes registration:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>The link is single-use and valid for 24 hours.</p>`;

    const from = this.configService.get<string>('SMTP_FROM')?.trim() || 'notes@localhost';
    const host = this.configService.get<string>('SMTP_HOST')?.trim();

    if (!host) {
      this.logger.warn(`SMTP is not configured. Verification link for ${to}: ${verifyUrl}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(this.configService.get<string>('SMTP_PORT') ?? 587),
      secure: this.configService.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: this.configService.get<string>('SMTP_USER')?.trim(),
        pass: this.configService.get<string>('SMTP_PASS')?.trim(),
      },
    });

    await transporter.sendMail({ from, to, subject, text, html });
  }
}
