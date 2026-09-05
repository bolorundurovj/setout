import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import type { LandBoundary, LandSizeUnit } from '@setout/api-client';
import { ButtonComponent } from '../ui/button.component';
import { ChipGroupComponent, type Chip } from '../ui/chip-group.component';
import { TabsComponent, type Tab } from '../ui/tabs.component';
import { LandSurveyComponent } from './land-survey.component';
import { ToastService } from '../toast.service';
import { LandService } from './land.service';
import { CountryService } from './country.service';
import { LandMapComponent, type LandPoint } from './land-map.component';
import {
  boundaryText,
  centroidOf,
  cornerText,
  parseCorners,
  pointInRing,
  ringOf,
} from './land-geo';

@Component({
  selector: 'app-land-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    ChipGroupComponent,
    LandMapComponent,
    LandSurveyComponent,
    TabsComponent,
    RouterLink,
  ],
  templateUrl: './land-form.component.html',
  styleUrl: './land-form.component.scss',
})
export class LandFormComponent {
  readonly lands = inject(LandService);
  readonly countries = inject(CountryService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly pageTitle = inject(Title);

  readonly id = input('');

  readonly loading = signal(false);
  readonly name = signal('');
  readonly address = signal('');
  readonly city = signal('');
  readonly state = signal('');
  readonly country = signal('');
  readonly purchasedOn = signal('');
  readonly sizeValue = signal('');
  readonly sizeUnit = signal('');
  readonly notes = signal('');
  readonly place = signal<LandPoint | null>(null);
  readonly edge = signal<LandBoundary | null>(null);
  readonly typing = signal(false);
  readonly typed = signal('');
  readonly typeNote = signal('');

  private typedTheEdge = false;

  readonly mapTab = signal<'pin' | 'boundary'>('pin');

  readonly mapTabs: Tab[] = [
    { value: 'pin', label: 'Pin' },
    { value: 'boundary', label: 'Boundary' },
  ];

  readonly edgeBy = signal('draw');

  readonly edgeWays: Chip[] = [
    { value: 'draw', label: 'Draw it' },
    { value: 'corners', label: 'Type corners' },
    { value: 'survey', label: 'From a survey' },
  ];

  readonly countryChips = computed<Chip[]>(() =>
    this.countries.all().map((country) => ({ value: country.code, label: country.name })),
  );

  readonly stateChips = computed<Chip[]>(() =>
    this.countries
      .states(this.country())
      .map((state) => ({ value: state.name, label: state.name })),
  );

  /** Only a complaint when there is a pin and an edge for it to be outside of. */
  readonly pinIsOutside = computed(() => {
    const pin = this.place();
    const ring = ringOf(this.edge());
    return pin !== null && ring.length >= 3 && !pointInRing([pin.lon, pin.lat], ring);
  });

  readonly unitChips: Chip[] = [
    { value: 'sqm', label: 'Square metres' },
    { value: 'hectare', label: 'Hectares' },
    { value: 'acre', label: 'Acres' },
    { value: 'plot', label: 'Plots' },
  ];

  constructor() {
    void this.countries.load();
    effect(() => {
      this.id();
      void this.load();
    });
    // Drawing on the map while the box is open keeps the two showing the same
    // thing. Untracked, so it only ever answers the map, never its own writing.
    effect(() => {
      const drawn = cornerText(this.edge());
      untracked(() => this.matchTheMap(drawn));
    });
    effect(() => {
      const name = this.name();
      if (this.isEdit() && name) {
        this.pageTitle.setTitle(`Edit ${name} · Setout`);
      }
    });
  }

  async load(): Promise<void> {
    if (!this.isEdit()) {
      return;
    }
    this.loading.set(true);
    const land = await this.lands.get(this.id());
    if (land) {
      this.name.set(land.name);
      this.address.set(land.address ?? '');
      this.city.set(land.city ?? '');
      this.state.set(land.state ?? '');
      this.country.set(land.country_code ?? '');
      this.purchasedOn.set(land.purchased_on ?? '');
      void this.countries.loadStates(this.country());
      this.sizeValue.set(land.size_value ?? '');
      this.sizeUnit.set(land.size_unit ?? '');
      this.notes.set(land.notes ?? '');
      this.place.set(
        land.latitude !== null && land.longitude !== null
          ? { lat: Number(land.latitude), lon: Number(land.longitude) }
          : null,
      );
      this.edge.set(land.boundary ?? null);
    }
    this.loading.set(false);
  }

  isEdit(): boolean {
    return this.id().length > 0;
  }

  async pickCountry(code: string): Promise<void> {
    this.country.set(code);
    if (!code) {
      return;
    }
    await this.countries.loadStates(code);
    // A state the new country has never heard of would only be refused on save.
    const held = this.state().trim().toLowerCase();
    const known = this.countries.states(code).some((state) => state.name.toLowerCase() === held);
    if (!known) {
      this.state.set('');
    }
  }

  /** Drop the pin in the middle of the plot, unless the middle is outside it too. */
  centrePin(): void {
    const ring = ringOf(this.edge());
    const middle = centroidOf(ring);
    if (!middle || !pointInRing(middle, ring)) {
      return;
    }
    this.place.set({ lat: middle[1], lon: middle[0] });
  }

  openTyping(): void {
    this.typing.set(true);
    this.typed.set(cornerText(this.edge()));
    this.typeNote.set('');
  }

  /** Redraws as it is typed, so a coordinate in the wrong order shows itself. */
  onTyped(text: string): void {
    this.typed.set(text);
    const { boundary, error } = parseCorners(text);
    this.typeNote.set(error ?? '');
    if (!error) {
      // What was typed stays exactly as typed; only the map follows.
      this.typedTheEdge = true;
      this.edge.set(boundary ?? null);
    }
  }

  private matchTheMap(drawn: string): void {
    if (this.typedTheEdge) {
      this.typedTheEdge = false;
      return;
    }
    if (this.typing() && !this.typed().trim().startsWith('{') && drawn !== this.typed()) {
      this.typed.set(drawn);
      this.typeNote.set('');
    }
  }

  showGeoJson(): void {
    this.typed.set(boundaryText(this.edge()));
    this.typeNote.set('');
  }

  title(): string {
    return this.isEdit() ? 'Edit Land' : 'New Land';
  }

  subtitle(): string {
    return this.isEdit()
      ? 'Changing a plot here changes it on every project built on it.'
      : 'A name is enough. The survey figure and the papers can follow.';
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  area(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  isValid(): boolean {
    if (this.name().trim().length === 0) {
      return false;
    }
    return this.sizeNote() === '';
  }

  sizeNote(): string {
    const value = this.sizeValue().trim();
    const unit = this.sizeUnit();
    if (value && !unit) {
      return 'Say what the figure is measured in.';
    }
    if (unit && !value) {
      return 'Say how big it is, or clear the unit.';
    }
    if (value && Number(value) <= 0) {
      return 'A size has to be more than nothing.';
    }
    return '';
  }

  cancel(): void {
    void this.router.navigate(this.isEdit() ? ['/lands', this.id()] : ['/lands']);
  }

  async save(): Promise<void> {
    if (!this.isValid()) {
      return;
    }
    const size = this.sizeValue().trim();
    const body = {
      name: this.name().trim(),
      address: this.address().trim() || null,
      city: this.city().trim() || null,
      state: this.state().trim() || null,
      country_code: this.country() || null,
      purchased_on: this.purchasedOn() || null,
      size_value: size || null,
      size_unit: size ? (this.sizeUnit() as LandSizeUnit) : null,
      notes: this.notes().trim() || null,
      latitude: this.place() ? String(this.place()?.lat) : null,
      longitude: this.place() ? String(this.place()?.lon) : null,
      boundary: this.edge(),
    };
    const saved = this.isEdit()
      ? await this.lands.edit(this.id(), body)
      : await this.lands.add(body);

    if (saved) {
      this.toast.show(this.isEdit() ? 'Land saved.' : `${saved.name} added.`);
      void this.router.navigate(['/lands', saved.id]);
    } else {
      this.toast.show(this.lands.error() ?? 'Could not save that land.', 'error');
    }
  }
}
