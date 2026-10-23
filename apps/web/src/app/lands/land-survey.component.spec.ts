import { TestBed } from '@angular/core/testing';
import type { LandBoundary } from '@setout/api-client';
import { ringOf } from './land-geo';
import { LandSurveyComponent } from './land-survey.component';

// Sample plan: one beacon, then a bearing and distance per side, closing to 20mm.
const PLAN: [number, number, number][] = [
  [30, 0, 40],
  [120, 0, 90],
  [210, 0, 40],
  [300, 0, 90.02],
];

describe('LandSurveyComponent', () => {
  function render() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [LandSurveyComponent] });
    const fixture = TestBed.createComponent(LandSurveyComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  async function enterSamplePlan(component: LandSurveyComponent) {
    component.northing.set('800000');
    component.easting.set('750000');
    PLAN.forEach(([degrees, minutes, distance], index) => {
      component.setLeg(index, 'degrees', String(degrees));
      component.setLeg(index, 'minutes', String(minutes));
      component.setLeg(index, 'distance', String(distance));
    });
    await component.redraw();
  }

  it('defaults to Minna UTM 31N with four empty legs', () => {
    const component = render();
    expect(component.grid()).toBe('minna31');
    expect(component.legs().length).toBe(4);
    expect(component.validLegs()).toEqual([]);
  });

  it('renders an empty leg value as empty text, not NaN', () => {
    const component = render();
    expect(component.legValueText(NaN)).toBe('');
    expect(component.legValueText(33)).toBe('33');
  });

  it('shows no closure with fewer than three legs', () => {
    const component = render();
    component.northing.set('800000');
    component.easting.set('750000');
    component.setLeg(0, 'degrees', '30');
    component.setLeg(0, 'minutes', '0');
    component.setLeg(0, 'distance', '40');

    expect(component.closure()).toBe('');
  });

  it('emits the boundary and reports closure for the sample plan', async () => {
    const component = render();
    let sent: LandBoundary | null | undefined;
    component.boundaryChange.subscribe((value) => (sent = value));

    await enterSamplePlan(component);

    expect(component.closure()).toBe('Closes to 20mm.');
    expect(ringOf(sent).length).toBe(4);
  }, 30_000);

  it('calculates the area of the sample plan', async () => {
    const component = render();

    await enterSamplePlan(component);

    expect(component.areaSqm()).toBeCloseTo(3620, -1);
    expect(component.areaText()).toContain('sqm calculated from the traverse');
  }, 30_000);

  it('projects the first beacon to latitude and longitude', async () => {
    const component = render();
    let sent: LandBoundary | null | undefined;
    component.boundaryChange.subscribe((value) => (sent = value));

    await enterSamplePlan(component);

    const [lon, lat] = ringOf(sent)[0];
    expect(lat).toBeCloseTo(7.2329, 3);
    expect(lon).toBeCloseTo(5.2632, 3);
  }, 30_000);

  it('reports the misclosure for a wrong bearing', async () => {
    const component = render();
    await enterSamplePlan(component);

    component.setLeg(1, 'degrees', '150');

    expect(component.closure()).toContain('Check the bearings');
  }, 30_000);

  it('moves the boundary when the grid changes', async () => {
    const component = render();
    let sent: LandBoundary | null | undefined;
    component.boundaryChange.subscribe((value) => (sent = value));
    await enterSamplePlan(component);
    const onMinna = ringOf(sent)[0];

    component.setGrid('wgs31');
    await component.redraw();

    expect(ringOf(sent)[0][1]).not.toBeCloseTo(onMinna[1], 5);
  }, 30_000);

  it('adds and removes a leg', () => {
    const component = render();

    component.addLeg();
    expect(component.legs().length).toBe(5);

    component.removeLeg(4);
    expect(component.legs().length).toBe(4);
  });

  it('emits nothing without a first beacon and three legs', async () => {
    const component = render();
    component.setLeg(0, 'degrees', '30');
    await component.redraw();

    expect(component.areaSqm()).toBeNull();
    expect(component.firstBeacon()).toBeNull();
  });
});
