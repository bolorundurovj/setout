/** A refusal carries a sentence; something unparseable carries a list. */
export function detailOf(e: unknown): string | null {
  const detail = (e as { error?: { detail?: unknown } })?.error?.detail;
  if (typeof detail === 'string') {
    return detail;
  }
  if (Array.isArray(detail)) {
    return (detail[0] as { msg?: string } | undefined)?.msg ?? null;
  }
  return null;
}
