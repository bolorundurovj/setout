export interface Tint {
  readonly fill: string;
  readonly ink: string;
}

const TINTS: Tint[] = [
  { fill: '#dde2f2', ink: '#4e5a86' },
  { fill: '#d8e5ef', ink: '#3d6480' },
  { fill: '#dbe8de', ink: '#416b55' },
  { fill: '#e7dff0', ink: '#6a5188' },
  { fill: '#f0ded7', ink: '#8b503c' },
];

/** The same scope keeps the same colour everywhere it is drawn. */
export function tintFor(id: string): Tint {
  let sum = 0;
  for (let index = 0; index < id.length; index += 1) {
    sum = (sum + id.charCodeAt(index) * (index + 1)) % 4093;
  }
  return TINTS[sum % TINTS.length];
}
