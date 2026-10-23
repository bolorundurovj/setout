import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { LandBoundary } from '@setout/api-client';
import { ButtonComponent } from '../ui/button.component';
import { OptionPickerComponent, type Option } from '../ui/option-picker.component';
import { boundaryOf, polygonAreaSqm } from './land-geo';
import { GRIDS, gridOf, toPositions } from './land-grid';
import { closureNote, isValidLeg, runTraverse, type Leg } from './land-traverse';

@Component({
  selector: 'app-land-survey',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, OptionPickerComponent],
  templateUrl: './land-survey.component.html',
  styleUrl: './land-survey.component.scss',
})
export class LandSurveyComponent {
  readonly boundary = input<LandBoundary | null>(null);
  readonly boundaryChange = output<LandBoundary | null>();

  readonly grid = signal('minna31');
  readonly northing = signal('');
  readonly easting = signal('');
  readonly legs = signal<Leg[]>([emptyLeg(), emptyLeg(), emptyLeg(), emptyLeg()]);
  readonly areaSqm = signal<number | null>(null);
  readonly projecting = signal(false);

  readonly gridOptions: Option[] = GRIDS.map((g) => ({ value: g.value, label: g.label }));

  readonly validLegs = computed(() => this.legs().filter(isValidLeg));

  readonly firstBeacon = computed(() => {
    const northing = Number(this.northing().replace(/[^\d.-]/g, ''));
    const easting = Number(this.easting().replace(/[^\d.-]/g, ''));
    return this.northing().trim() && this.easting().trim() && !Number.isNaN(northing + easting)
      ? { northing, easting }
      : null;
  });

  readonly closure = computed(() => {
    const start = this.firstBeacon();
    const legs = this.validLegs();
    if (!start || legs.length < 3) {
      return '';
    }
    return closureNote(runTraverse(start, legs).misclosure, legs);
  });

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** Empty inputs are stored as NaN and render as an empty string. */
  legValueText(value: number): string {
    return Number.isFinite(value) ? String(value) : '';
  }

  areaText(): string {
    const sqm = this.areaSqm();
    return sqm === null ? '' : `${Math.round(sqm * 10) / 10} sqm calculated from the traverse.`;
  }

  setLeg(index: number, field: keyof Leg, raw: string): void {
    const next = [...this.legs()];
    next[index] = { ...next[index], [field]: raw.trim() === '' ? NaN : Number(raw) };
    this.legs.set(next);
    void this.redraw();
  }

  addLeg(): void {
    this.legs.update((legs) => [...legs, emptyLeg()]);
  }

  removeLeg(index: number): void {
    this.legs.update((legs) => legs.filter((_, at) => at !== index));
    void this.redraw();
  }

  setGrid(value: string): void {
    this.grid.set(value);
    void this.redraw();
  }

  onBeaconBlur(): void {
    void this.redraw();
  }

  async redraw(): Promise<void> {
    const start = this.firstBeacon();
    const legs = this.validLegs();
    if (!start || legs.length < 3) {
      this.areaSqm.set(null);
      return;
    }
    this.projecting.set(true);
    try {
      const ring = await toPositions(gridOf(this.grid()), runTraverse(start, legs).beacons);
      this.areaSqm.set(polygonAreaSqm(ring));
      this.boundaryChange.emit(boundaryOf(ring));
    } finally {
      this.projecting.set(false);
    }
  }
}

function emptyLeg(): Leg {
  return { degrees: NaN, minutes: NaN, distance: NaN };
}
