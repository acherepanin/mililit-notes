import { BadRequestException } from '@nestjs/common';

const usernamePattern = /^[a-z0-9_]+$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function assertValidUsername(username: string): void {
  if (username.length < 2 || username.length > 32) {
    throw new BadRequestException('Username must be 2-32 characters');
  }
  if (!usernamePattern.test(username)) {
    throw new BadRequestException(
      'Username may contain only lowercase letters, numbers and underscore',
    );
  }
}

export function assertValidPassword(password: string): void {
  if (!password || password.length < 8) {
    throw new BadRequestException('Password must be at least 8 characters');
  }
}

export function assertValidEmail(email: string): void {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException('A valid email address is required');
  }
}
