export function generateSecurePassword(minLength = 12, maxLength = 18): string {
  const length =
    minLength + Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % (maxLength - minLength + 1));
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
  const required = [
    'ABCDEFGHJKLMNPQRSTUVWXYZ',
    'abcdefghijkmnopqrstuvwxyz',
    '23456789',
    '!@#$%^&*_-+=',
  ];
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  const chars = Array.from(random, (value) => alphabet[value % alphabet.length]);

  required.forEach((group, index) => {
    chars[index] = group[random[index] % group.length];
  });

  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swapRandom = new Uint32Array(1);
    crypto.getRandomValues(swapRandom);
    const swapIndex = swapRandom[0] % (index + 1);
    [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
  }

  return chars.join('');
}

export function isValidUsername(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized.length >= 2 && normalized.length <= 32 && /^[a-z0-9_]+$/.test(normalized);
}

export function normalizeUsernameInput(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}
