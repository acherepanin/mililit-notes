export function normalizePlanCurrency(currency: string | null | undefined): string {
  const normalized = (currency ?? 'rub').trim().toLowerCase();
  if (normalized === 'usd' || normalized === 'rur' || normalized === '') {
    return 'rub';
  }
  return normalized;
}
