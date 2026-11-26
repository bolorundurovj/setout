export interface Tint {
  readonly fill: string;
  readonly ink: string;
}

// CSS variables, so the tints follow the light and dark themes.
const TINTS: Tint[] = [1, 3, 5, 2, 4].map((n) => ({
  fill: `var(--tint-${n})`,
  ink: `var(--tint-${n}-ink)`,
}));

/** Hashes the category id, so it differs from the budget-order --tint-* tokens in styles.scss. */
export function tintFor(id: string): Tint {
  let sum = 0;
  for (let index = 0; index < id.length; index += 1) {
    sum = (sum + id.charCodeAt(index) * (index + 1)) % 4093;
  }
  return TINTS[sum % TINTS.length];
}
