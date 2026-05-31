const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function transliterateChar(char: string): string {
  const lower = char.toLowerCase();
  if (CYRILLIC_TO_LATIN[lower]) {
    return CYRILLIC_TO_LATIN[lower];
  }
  return lower;
}

export function slugifyPlanName(name: string): string {
  const transliterated = [...name.trim()]
    .map((char) => transliterateChar(char))
    .join('');

  const normalized = transliterated
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48);

  return normalized || 'plan';
}

export function createUniquePlanSlug(name: string, usedSlugs: Iterable<string>): string {
  const used = new Set([...usedSlugs].map((slug) => slug.trim().toLowerCase()).filter(Boolean));
  const base = slugifyPlanName(name);
  if (!used.has(base)) {
    return base;
  }

  let index = 2;
  while (used.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}
