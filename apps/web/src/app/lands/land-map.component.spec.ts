import { TestBed } from '@angular/core/testing';
import type { LandBoundary } from '@setout/api-client';
import { LandMapComponent } from './land-map.component';
import { MapService } from './map.service';

const SQUARE: LandBoundary = {
  type: 'Polygon',
  coordinates: [
    [
      [3.3, 6.5],
      [3.3009, 6.5],
      [3.3009, 6.5009],
      [3.3, 6.5009],
      [3.3, 6.5],
    ],
  ],
};

describe('LandMapComponent', () => {
  function render(boundary: LandBoundary | null = null, editable = true) {
    const maps = {
      settings: () => ({ tile_url: 'http://tiles.test/{z}/{x}/{y}.png', attribution: 'test' }),
      load: async () => undefined,
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LandMapComponent],
      providers: [{ provide: MapService, useValue: maps }],
    });
    const fixture = TestBed.createComponent(LandMapComponent);
    fixture.componentRef.setInput('boundary', boundary);
    fixture.componentRef.setInput('editable', editable);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('has no boundary points without a boundary', () => {
    const { component } = render();
    expect(component.points()).toEqual([]);
  });

  it('reads boundary points from the boundary input', () => {
    const { component } = render(SQUARE);
    expect(component.points().length).toBe(4);
  });

  it('undo emits the boundary without the last point', () => {
    const { component } = render(SQUARE);
    let sent: LandBoundary | null | undefined;
    component.boundaryChange.subscribe((value) => (sent = value));

    component.undo();

    expect(component.points().length).toBe(3);
    expect(sent?.coordinates[0].length).toBe(4);
  });

  it('clear emits null rather than an empty polygon', () => {
    const { component } = render(SQUARE);
    let sent: LandBoundary | null | undefined;
    component.boundaryChange.subscribe((value) => (sent = value));

    component.clear();

    expect(component.points()).toEqual([]);
    expect(sent).toBeNull();
  });

  it('emits null with fewer than three boundary points', () => {
    const { component } = render(SQUARE);
    let sent: LandBoundary | null | undefined;
    component.boundaryChange.subscribe((value) => (sent = value));

    component.undo();
    component.undo();

    expect(sent).toBeNull();
  });

  it('clearPin emits null', () => {
    const { component } = render();
    let sent: unknown;
    component.pointChange.subscribe((value) => (sent = value));

    component.clearPin();

    expect(sent).toBeNull();
  });
});
