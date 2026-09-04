import { Injectable, inject, signal } from '@angular/core';
import { Api, CountryRead, StateRead, listCountries, listStates } from '@setout/api-client';

@Injectable({
  providedIn: 'root',
})
export class CountryService {
  private readonly api = inject(Api);

  private readonly countryState = signal<CountryRead[]>([]);
  // Fetched a country at a time. All of them at once is thousands of rows to
  // fill one picker.
  private readonly statesByCountry = signal<Record<string, StateRead[]>>({});

  readonly all = this.countryState.asReadonly();

  async load(): Promise<void> {
    if (this.countryState().length > 0) {
      return;
    }
    try {
      this.countryState.set(await this.api.invoke(listCountries));
    } catch {
      this.countryState.set([]);
    }
  }

  states(countryCode: string): StateRead[] {
    return this.statesByCountry()[countryCode] ?? [];
  }

  async loadStates(countryCode: string): Promise<void> {
    if (!countryCode || this.statesByCountry()[countryCode]) {
      return;
    }
    try {
      const rows = await this.api.invoke(listStates, { country_code: countryCode });
      this.statesByCountry.update((all) => ({ ...all, [countryCode]: rows }));
    } catch {
      this.statesByCountry.update((all) => ({ ...all, [countryCode]: [] }));
    }
  }
}
