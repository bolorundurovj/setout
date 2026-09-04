import type { LandDocumentKind, LandRead, LandSizeUnit } from '@setout/api-client';

const KIND_NAMES: Record<string, string> = {
  certificate_of_occupancy: 'Certificate of Occupancy',
  survey_plan: 'Survey plan',
  deed: 'Deed',
  architectural_plan: 'Architectural plan',
  receipt: 'Receipt',
  other: 'Other',
};

const UNIT_NAMES: Record<string, [string, string]> = {
  sqm: ['sqm', 'sqm'],
  hectare: ['hectare', 'hectares'],
  acre: ['acre', 'acres'],
  plot: ['plot', 'plots'],
};

export const DOCUMENT_KINDS: LandDocumentKind[] = [
  'certificate_of_occupancy',
  'survey_plan',
  'deed',
  'architectural_plan',
  'receipt',
  'other',
];

export function kindName(kind: string): string {
  return KIND_NAMES[kind] ?? kind;
}

export function unitName(unit: LandSizeUnit, value: string): string {
  const names = UNIT_NAMES[unit];
  if (!names) {
    return unit;
  }
  return Number(value) === 1 ? names[0] : names[1];
}

export function sizeLabel(land: Pick<LandRead, 'size_value' | 'size_unit'>): string {
  const value = land.size_value;
  const unit = land.size_unit;
  if (!value || !unit) {
    return '';
  }
  return `${value} ${unitName(unit, value)}`;
}

export function whereLabel(
  land: Pick<LandRead, 'city' | 'state' | 'address'> & Partial<Pick<LandRead, 'country_name'>>,
): string {
  const parts = [land.city, land.state, land.country_name].filter((part): part is string => !!part);
  if (parts.length) {
    return parts.join(', ');
  }
  return land.address ?? '';
}
