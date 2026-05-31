export const ADMIN_TABS = [
  'users',
  'monitoring',
  'stats',
  'integrations',
  'subscriptions',
] as const;

export type AdminTab = (typeof ADMIN_TABS)[number];

export function parseAdminTab(value: string | undefined): AdminTab | null {
  if (!value) {
    return null;
  }

  return ADMIN_TABS.includes(value as AdminTab) ? (value as AdminTab) : null;
}

export const ADMIN_REFRESH_TABS: ReadonlySet<AdminTab> = new Set(['monitoring', 'stats']);
