import { BadRequestException } from '@nestjs/common';

const usernamePattern = /^[a-z0-9_]+$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function assertValidUsername(username: string): void {
  if (username.length < 2 || username.length > 32) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Username must be 2-32 characters',
      code: 'USERNAME_INVALID',
    });
  }
  if (!usernamePattern.test(username)) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Username may contain only lowercase letters, numbers and underscore',
      code: 'USERNAME_INVALID',
    });
  }
}

export function assertValidPassword(password: string): void {
  if (!password || password.length < 8) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'Password must be at least 8 characters',
      code: 'PASSWORD_TOO_SHORT',
    });
  }
}

export function assertValidEmail(email: string): void {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException({
      statusCode: 400,
      message: 'A valid email address is required',
      code: 'EMAIL_INVALID',
    });
  }
}
