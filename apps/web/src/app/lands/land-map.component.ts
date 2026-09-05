import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import type { LandBoundary } from '@setout/api-client';
import { ButtonComponent } from '../ui/button.component';
import { boundaryOf, ringOf, type Position } from './land-geo';
import { MapService } from './map.service';

export interface LandPoint {
  lat: number;
  lon: number;
}

const PIN = `<svg viewBox="0 0 24 32" width="24" height="32" aria-hidden="true">
  <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z"
        fill="var(--accent, #b4530a)" stroke="white" stroke-width="1.5"/>
  <circle cx="12" cy="12" r="4.5" fill="white"/>
</svg>`;

@Component({
  selector: 'app-land-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './land-map.component.html',
  styleUrl: './land-map.component.scss',
})
export class LandMapComponent {
  private readonly maps = inject(MapService);
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('canvas');

  readonly point = input<LandPoint | null>(null);
  readonly boundary = input<LandBoundary | null>(null);
  readonly editable = input(false);

  readonly pointChange = output<LandPoint | null>();
  readonly boundaryChange = output<LandBoundary | null>();

  readonly tilesFailed = signal(false);
  readonly corners = signal<Position[]>([]);

  private map: L.Map | null = null;
  private pin: L.Marker | null = null;
  private shape: L.Polygon | null = null;
  private handles: L.Marker[] = [];

  constructor() {
    void this.maps.load();
    effect(() => {
      const settings = this.maps.settings();
      const element = this.host().nativeElement;
      if (!this.map) {
        this.map = this.build(element);
      }
      if (settings && !this.map.hasLayer(this.tiles)) {
        this.addTiles(settings.tile_url, settings.attribution);
      }
    });
    effect(() => {
      this.corners.set(ringOf(this.boundary()));
      this.draw();
    });
    effect(() => {
      this.point();
      this.draw();
    });
  }

  private tiles: L.TileLayer = L.tileLayer('');

  private build(element: HTMLElement): L.Map {
    const map = L.map(element, { attributionControl: true }).setView([9, 8], 5);
    if (this.editable()) {
      map.on('click', (event: L.LeafletMouseEvent) => this.addCorner(event.latlng));
    }
    return map;
  }

  private addTiles(url: string, attribution: string): void {
    this.tiles = L.tileLayer(url, { attribution, maxZoom: 19 });
    this.tiles.on('tileerror', () => this.tilesFailed.set(true));
    this.tiles.addTo(this.map as L.Map);
  }

  private draw(): void {
    const map = this.map;
    if (!map) {
      return;
    }
    this.pin?.remove();
    this.pin = null;
    this.shape?.remove();
    this.shape = null;
    this.handles.forEach((handle) => handle.remove());
    this.handles = [];

    const here = this.point();
    if (here) {
      this.pin = L.marker([here.lat, here.lon], {
        draggable: this.editable(),
        icon: L.divIcon({ html: PIN, className: 'pin', iconSize: [24, 32], iconAnchor: [12, 32] }),
      }).addTo(map);
      this.pin.on('dragend', () => {
        const moved = this.pin?.getLatLng();
        if (moved) {
          this.pointChange.emit({ lat: round(moved.lat), lon: round(moved.lng) });
        }
      });
    }

    const ring = this.corners();
    if (ring.length >= 3) {
      this.shape = L.polygon(
        ring.map(([lon, lat]) => [lat, lon] as L.LatLngTuple),
        { color: 'var(--accent, #b4530a)', weight: 2, fillOpacity: 0.12 },
      ).addTo(map);
    }
    if (this.editable()) {
      ring.forEach(([lon, lat], index) => this.handleAt(map, lat, lon, index));
    }
    this.frame();
  }

  private handleAt(map: L.Map, lat: number, lon: number, index: number): void {
    const handle = L.marker([lat, lon], {
      draggable: true,
      icon: L.divIcon({ className: 'corner', iconSize: [14, 14] }),
    }).addTo(map);
    handle.on('dragend', () => {
      const moved = handle.getLatLng();
      const next = [...this.corners()];
      next[index] = [round(moved.lng), round(moved.lat)];
      this.commit(next);
    });
    this.handles.push(handle);
  }

  private frame(): void {
    const map = this.map;
    if (!map) {
      return;
    }
    if (this.shape) {
      map.fitBounds(this.shape.getBounds(), { padding: [24, 24], maxZoom: 18 });
      return;
    }
    const here = this.point();
    if (here) {
      map.setView([here.lat, here.lon], 16);
    }
  }

  private addCorner(at: L.LatLng): void {
    this.commit([...this.corners(), [round(at.lng), round(at.lat)]]);
  }

  private commit(ring: Position[]): void {
    this.corners.set(ring);
    this.boundaryChange.emit(boundaryOf(ring));
    this.draw();
  }

  undo(): void {
    this.commit(this.corners().slice(0, -1));
  }

  clear(): void {
    this.commit([]);
  }

  locate(): void {
    navigator.geolocation?.getCurrentPosition((found) => {
      this.pointChange.emit({
        lat: round(found.coords.latitude),
        lon: round(found.coords.longitude),
      });
    });
  }

  dropPin(): void {
    const centre = this.map?.getCenter();
    if (centre) {
      this.pointChange.emit({ lat: round(centre.lat), lon: round(centre.lng) });
    }
  }

  clearPin(): void {
    this.pointChange.emit(null);
  }
}

/** Seven places is about a centimetre, which is the column's limit too. */
function round(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}
