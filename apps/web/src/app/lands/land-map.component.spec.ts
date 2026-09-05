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

  it('starts with no corners when the plot has no edge', () => {
    const { component } = render();
    expect(component.corners()).toEqual([]);
  });

  it('takes its corners from the boundary it was given', () => {
    const { component } = render(SQUARE);
    expect(component.corners().length).toBe(4);
  });

  it('drops the last corner and says so', () => {
    const { component } = render(SQUARE);
    let sent: LandBoundary | null | undefined;
    component.boundaryChange.subscribe((value) => (sent = value));

    component.undo();

    expect(component.corners().length).toBe(3);
    expect(sent?.coordinates[0].length).toBe(4);
  });

  it('clearing the edge sends nothing rather than an empty shape', () => {
    const { component } = render(SQUARE);
    let sent: LandBoundary | null | undefined;
    component.boundaryChange.subscribe((value) => (sent = value));

    component.clear();

    expect(component.corners()).toEqual([]);
    expect(sent).toBeNull();
  });

  it('two corners are not yet a shape', () => {
    const { component } = render(SQUARE);
    let sent: LandBoundary | null | undefined;
    component.boundaryChange.subscribe((value) => (sent = value));

    component.undo();
    component.undo();

    expect(sent).toBeNull();
  });

  it('taking the pin off sends nothing', () => {
    const { component } = render();
    let sent: unknown;
    component.pointChange.subscribe((value) => (sent = value));

    component.clearPin();

    expect(sent).toBeNull();
  });
});
