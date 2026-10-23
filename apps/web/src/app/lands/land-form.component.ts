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
import type { GeocodedPlace, LandBoundary, LandSizeUnit } from '@setout/api-client';
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
  boundaryPointsText,
  parseBoundaryPoints,
  pointInRing,
  ringOf,
} from './land-geo';
import { findLocationMismatch, locationMismatchMessage } from './land-place';

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
  readonly statedArea = signal('');
  readonly areaUnit = signal('');
  readonly notes = signal('');
  readonly pin = signal<LandPoint | null>(null);
  readonly boundary = signal<LandBoundary | null>(null);
  readonly editingPoints = signal(false);
  readonly pointsText = signal('');
  readonly pointsError = signal('');

  private boundaryFromText = false;

  readonly geocodedAddress = signal('');
  readonly geocoded = signal<GeocodedPlace | null>(null);
  private latestGeocodeRequest = 0;

  readonly mapTab = signal<'pin' | 'boundary'>('pin');

  readonly mapTabs: Tab[] = [
    { value: 'pin', label: 'Location Pin' },
    { value: 'boundary', label: 'Boundary' },
  ];

  readonly boundaryMethod = signal('draw');

  readonly boundaryMethods: Chip[] = [
    { value: 'draw', label: 'Draw on Map' },
    { value: 'points', label: 'Enter Boundary Points' },
    { value: 'survey', label: 'Bearings and Distances' },
  ];

  readonly countryChips = computed<Chip[]>(() =>
    this.countries.all().map((country) => ({ value: country.code, label: country.name })),
  );

  readonly stateChips = computed<Chip[]>(() =>
    this.countries
      .states(this.country())
      .map((state) => ({ value: state.name, label: state.name })),
  );

  readonly pinIsOutside = computed(() => {
    const pin = this.pin();
    const ring = ringOf(this.boundary());
    return pin !== null && ring.length >= 3 && !pointInRing([pin.lon, pin.lat], ring);
  });

  readonly mismatchMessage = computed<string>(() => {
    const geocoded = this.geocoded();
    if (!geocoded) {
      return '';
    }
    const mismatch = findLocationMismatch(geocoded, {
      city: this.city(),
      state: this.state(),
      countryCode: this.country(),
    });
    const countryName = (code: string) =>
      this.countries.all().find((country) => country.code === code)?.name ?? code;
    return mismatch ? locationMismatchMessage(mismatch, geocoded, countryName) : '';
  });

  readonly unitChips: Chip[] = [
    { value: 'sqm', label: 'Square Metres' },
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
    // Syncs boundary point text with map edits; untracked so pointsText() writes do not retrigger.
    effect(() => {
      const pointsFromMap = boundaryPointsText(this.boundary());
      untracked(() => this.syncPointsText(pointsFromMap));
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
      this.statedArea.set(land.size_value ?? '');
      this.areaUnit.set(land.size_unit ?? '');
      this.notes.set(land.notes ?? '');
      this.pin.set(
        land.latitude !== null && land.longitude !== null
          ? { lat: Number(land.latitude), lon: Number(land.longitude) }
          : null,
      );
      this.boundary.set(land.boundary ?? null);
      this.geocodedAddress.set(land.geocoded_address ?? '');
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
    // The server rejects a state that is not in the selected country's list.
    const currentState = this.state().trim().toLowerCase();
    const stateInCountry = this.countries
      .states(code)
      .some((state) => state.name.toLowerCase() === currentState);
    if (!stateInCountry) {
      this.state.set('');
    }
  }

  /** No-op when the centroid of a concave boundary falls outside it. */
  centrePin(): void {
    const ring = ringOf(this.boundary());
    const middle = centroidOf(ring);
    if (!middle || !pointInRing(middle, ring)) {
      return;
    }
    void this.setPin({ lat: middle[1], lon: middle[0] });
  }

  async setPin(pin: LandPoint | null): Promise<void> {
    this.pin.set(pin);
    await this.reverseGeocodePin(pin);
  }

  /** Discards responses from superseded requests so a dragged pin shows no stale address. */
  private async reverseGeocodePin(pin: LandPoint | null): Promise<void> {
    if (!pin) {
      this.geocoded.set(null);
      return;
    }
    const requestId = ++this.latestGeocodeRequest;
    const geocoded = await this.lands.reverseGeocode(pin.lat, pin.lon);
    if (requestId !== this.latestGeocodeRequest) {
      return;
    }
    this.geocoded.set(geocoded);
    if (geocoded?.address) {
      this.geocodedAddress.set(geocoded.address);
    }
  }

  useMapAddress(): void {
    const geocoded = this.geocoded();
    if (!geocoded) {
      return;
    }
    if (geocoded.address) {
      this.address.set(geocoded.address);
    }
    if (geocoded.city) {
      this.city.set(geocoded.city);
    }
    if (geocoded.country_code) {
      void this.pickCountry(geocoded.country_code).then(() => {
        if (geocoded.state) {
          this.state.set(geocoded.state);
        }
      });
      return;
    }
    if (geocoded.state) {
      this.state.set(geocoded.state);
    }
  }

  openPointsEditor(): void {
    this.editingPoints.set(true);
    this.pointsText.set(boundaryPointsText(this.boundary()));
    this.pointsError.set('');
  }

  /** Redraws on each keystroke so swapped coordinates are visible immediately. */
  onPointsInput(text: string): void {
    this.pointsText.set(text);
    const { boundary, error } = parseBoundaryPoints(text);
    this.pointsError.set(error ?? '');
    if (!error) {
      // Stops syncPointsText from replacing the pointsText text with reformatted output.
      this.boundaryFromText = true;
      this.boundary.set(boundary ?? null);
    }
  }

  private syncPointsText(pointsFromMap: string): void {
    if (this.boundaryFromText) {
      this.boundaryFromText = false;
      return;
    }
    if (
      this.editingPoints() &&
      !this.pointsText().trim().startsWith('{') &&
      pointsFromMap !== this.pointsText()
    ) {
      this.pointsText.set(pointsFromMap);
      this.pointsError.set('');
    }
  }

  showGeoJson(): void {
    this.pointsText.set(boundaryText(this.boundary()));
    this.pointsError.set('');
  }

  title(): string {
    return this.isEdit() ? 'Edit Land Record' : 'New Land Record';
  }

  subtitle(): string {
    return this.isEdit()
      ? 'Changes here apply to every project that references this land record.'
      : 'Only the name is required. The area and documents can be added later.';
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  textareaValue(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  isValid(): boolean {
    if (this.name().trim().length === 0) {
      return false;
    }
    return this.statedAreaError() === '';
  }

  statedAreaError(): string {
    const value = this.statedArea().trim();
    const unit = this.areaUnit();
    if (value && !unit) {
      return 'Select a unit for the area.';
    }
    if (unit && !value) {
      return 'Enter an area, or clear the unit.';
    }
    if (value && Number(value) <= 0) {
      return 'The area must be greater than zero.';
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
    const statedArea = this.statedArea().trim();
    const body = {
      name: this.name().trim(),
      address: this.address().trim() || null,
      city: this.city().trim() || null,
      state: this.state().trim() || null,
      country_code: this.country() || null,
      purchased_on: this.purchasedOn() || null,
      size_value: statedArea || null,
      size_unit: statedArea ? (this.areaUnit() as LandSizeUnit) : null,
      notes: this.notes().trim() || null,
      latitude: this.pin() ? String(this.pin()?.lat) : null,
      longitude: this.pin() ? String(this.pin()?.lon) : null,
      boundary: this.boundary(),
      geocoded_address: this.geocodedAddress().trim() || null,
    };
    const saved = this.isEdit()
      ? await this.lands.edit(this.id(), body)
      : await this.lands.create(body);

    if (saved) {
      this.toast.show(this.isEdit() ? 'Land record saved.' : `${saved.name} created.`);
      void this.router.navigate(['/lands', saved.id]);
    } else {
      this.toast.show(this.lands.error() ?? 'Could not save the land record.', 'error');
    }
  }
}
