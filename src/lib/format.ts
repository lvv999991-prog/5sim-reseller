/** Money is integer cents everywhere (USD-only, v1). Display as dollars. */
export function formatMoney(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

/** Markup % implied by a catalogue offer: (sell − cost) / cost × 100. */
export function markupPercent(offer: { costCents: number; sellPriceCents: number }): number | null {
  if (!offer.costCents || offer.costCents <= 0) return null;
  return ((offer.sellPriceCents - offer.costCents) / offer.costCents) * 100;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  return formatDate(iso);
}
