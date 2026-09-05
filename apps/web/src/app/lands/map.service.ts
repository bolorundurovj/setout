import { Injectable, inject, signal } from '@angular/core';
import { Api, MapSettings, getMapSettings } from '@setout/api-client';

@Injectable({
  providedIn: 'root',
})
export class MapService {
  private readonly api = inject(Api);
  private readonly state = signal<MapSettings | null>(null);

  readonly settings = this.state.asReadonly();

  async load(): Promise<void> {
    if (this.state()) {
      return;
    }
    try {
      this.state.set(await this.api.invoke(getMapSettings));
    } catch {
      // A map with no tiles still draws the plot, so this is not worth a toast.
      this.state.set(null);
    }
  }
}
