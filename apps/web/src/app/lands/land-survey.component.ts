import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import type { LandBoundary } from '@setout/api-client';
import { ButtonComponent } from '../ui/button.component';
import { debounce } from '../ui/debounce';
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
  readonly boundaryChange = output<LandBoundary | null>();

  readonly grid = signal('minna31');
  readonly northing = signal('');
  readonly easting = signal('');
  readonly legs = signal<ReturnType<typeof emptyLeg>[]>([
    emptyLeg(),
    emptyLeg(),
    emptyLeg(),
    emptyLeg(),
  ]);
  readonly areaSqm = signal<number | null>(null);

  // Typing a leg reprojects through proj4, so wait for a pause in typing.
  private readonly redrawSoon = debounce<void>(() => void this.redraw());

  constructor() {
    inject(DestroyRef).onDestroy(() => this.redrawSoon.cancel());
  }

  readonly gridOptions: Option[] = GRIDS.map((g) => ({ value: g.value, label: g.label }));

  readonly validLegs = computed(() =>
    this.legs()
      .map((leg) => ({
        degrees: numeric(leg.degrees),
        minutes: numeric(leg.minutes),
        seconds: leg.seconds.trim() ? numeric(leg.seconds) : 0,
        distance: numeric(leg.distance),
      }))
      .filter(isValidLeg),
  );

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

  areaText(): string {
    const sqm = this.areaSqm();
    return sqm === null ? '' : `${Math.round(sqm * 10) / 10} sqm calculated from the traverse.`;
  }

  setLeg(index: number, field: keyof Leg, raw: string): void {
    const next = [...this.legs()];
    next[index] = { ...next[index], [field]: raw };
    this.legs.set(next);
    this.redrawSoon.call();
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

  private revision = 0;

  async redraw(): Promise<void> {
    this.redrawSoon.cancel();
    const revision = ++this.revision;
    const start = this.firstBeacon();
    const legs = this.validLegs();
    if (!start || legs.length < 3) {
      this.boundaryChange.emit(null);
      this.areaSqm.set(null);
      return;
    }
    const grid = gridOf(this.grid());
    // Centre a local metric projection on the geographic first beacon.
    const local = !grid.definition;
    const projection = local
      ? {
          ...grid,
          definition: `+proj=aeqd +lat_0=${start.northing} +lon_0=${start.easting} +datum=WGS84 +units=m`,
        }
      : grid;
    const origin = local ? { northing: 0, easting: 0 } : start;
    const ring = await toPositions(projection, runTraverse(origin, legs).beacons);
    if (revision !== this.revision) return;
    this.areaSqm.set(polygonAreaSqm(ring));
    this.boundaryChange.emit(boundaryOf(ring));
  }
}

function numeric(raw: string): number {
  return raw.trim() ? Number(raw) : NaN;
}

function emptyLeg() {
  return { degrees: '', minutes: '', seconds: '', distance: '' };
}
