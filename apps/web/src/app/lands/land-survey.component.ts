import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { LandBoundary } from '@setout/api-client';
import { ButtonComponent } from '../ui/button.component';
import { OptionPickerComponent } from '../ui/option-picker.component';
import type { Chip } from '../ui/chip-group.component';
import { boundaryOf, polygonAreaSqm } from './land-geo';
import { GRIDS, gridOf, toPositions } from './land-grid';
import { closureNote, isLeg, walk, type Leg } from './land-traverse';

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
  readonly legs = signal<Leg[]>([blank(), blank(), blank(), blank()]);
  readonly areaSqm = signal<number | null>(null);
  readonly working = signal(false);

  readonly gridChips: Chip[] = GRIDS.map((g) => ({ value: g.value, label: g.label }));

  readonly good = computed(() => this.legs().filter(isLeg));

  readonly beacon = computed(() => {
    const northing = Number(this.northing().replace(/[^\d.-]/g, ''));
    const easting = Number(this.easting().replace(/[^\d.-]/g, ''));
    return this.northing().trim() && this.easting().trim() && !Number.isNaN(northing + easting)
      ? { northing, easting }
      : null;
  });

  readonly closure = computed(() => {
    const start = this.beacon();
    const legs = this.good();
    if (!start || legs.length < 3) {
      return '';
    }
    return closureNote(walk(start, legs).misclosure, legs);
  });

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** An unfilled box holds NaN, which should show as nothing at all. */
  shown(value: number): string {
    return Number.isFinite(value) ? String(value) : '';
  }

  areaText(): string {
    const sqm = this.areaSqm();
    return sqm === null ? '' : `${Math.round(sqm * 10) / 10} sqm drawn from the plan.`;
  }

  setLeg(index: number, field: keyof Leg, raw: string): void {
    const next = [...this.legs()];
    next[index] = { ...next[index], [field]: raw.trim() === '' ? NaN : Number(raw) };
    this.legs.set(next);
    void this.redraw();
  }

  addLeg(): void {
    this.legs.update((legs) => [...legs, blank()]);
  }

  removeLeg(index: number): void {
    this.legs.update((legs) => legs.filter((_, at) => at !== index));
    void this.redraw();
  }

  setGrid(value: string): void {
    this.grid.set(value);
    void this.redraw();
  }

  setBeacon(): void {
    void this.redraw();
  }

  /** Walk the plan, put it on the earth, and hand the shape up. */
  async redraw(): Promise<void> {
    const start = this.beacon();
    const legs = this.good();
    if (!start || legs.length < 3) {
      this.areaSqm.set(null);
      return;
    }
    this.working.set(true);
    try {
      const ring = await toPositions(gridOf(this.grid()), walk(start, legs).corners);
      this.areaSqm.set(polygonAreaSqm(ring));
      this.boundaryChange.emit(boundaryOf(ring));
    } finally {
      this.working.set(false);
    }
  }
}

function blank(): Leg {
  return { degrees: NaN, minutes: NaN, distance: NaN };
}
