import { TestBed } from '@angular/core/testing';
import type { LandBoundary } from '@setout/api-client';
import { ringOf } from './land-geo';
import { LandSurveyComponent } from './land-survey.component';

// An invented plan in the shape a real one comes in: one beacon, then a bearing
// and a distance per side, closing to 20mm the way a good plan does.
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

  async function enterThePlan(component: LandSurveyComponent) {
    component.northing.set('800000');
    component.easting.set('750000');
    PLAN.forEach(([degrees, minutes, distance], index) => {
      component.setLeg(index, 'degrees', String(degrees));
      component.setLeg(index, 'minutes', String(minutes));
      component.setLeg(index, 'distance', String(distance));
    });
    await component.redraw();
  }

  it('starts on Minna UTM 31N, with four empty legs', () => {
    const component = render();
    expect(component.grid()).toBe('minna31');
    expect(component.legs().length).toBe(4);
    expect(component.good()).toEqual([]);
  });

  it('shows an unfilled box as empty, not as NaN', () => {
    const component = render();
    expect(component.shown(NaN)).toBe('');
    expect(component.shown(33)).toBe('33');
  });

  it('says nothing about closure until the plan is walked round', () => {
    const component = render();
    component.northing.set('800000');
    component.easting.set('750000');
    component.setLeg(0, 'degrees', '30');
    component.setLeg(0, 'minutes', '0');
    component.setLeg(0, 'distance', '40');

    expect(component.closure()).toBe('');
  });

  it('draws the plot and reports that it closes', async () => {
    const component = render();
    let sent: LandBoundary | null | undefined;
    component.boundaryChange.subscribe((value) => (sent = value));

    await enterThePlan(component);

    expect(component.closure()).toBe('Closes to 20mm.');
    expect(ringOf(sent).length).toBe(4);
  }, 30_000);

  it('measures the plot at the size written on the plan', async () => {
    const component = render();

    await enterThePlan(component);

    expect(component.areaSqm()).toBeCloseTo(3620, -1);
    expect(component.areaText()).toContain('sqm drawn from the plan');
  }, 30_000);

  it('puts the plot where the plan says it is', async () => {
    const component = render();
    let sent: LandBoundary | null | undefined;
    component.boundaryChange.subscribe((value) => (sent = value));

    await enterThePlan(component);

    const [lon, lat] = ringOf(sent)[0];
    expect(lat).toBeCloseTo(7.2329, 3);
    expect(lon).toBeCloseTo(5.2632, 3);
  }, 30_000);

  it('says how far out a mistyped bearing puts it', async () => {
    const component = render();
    await enterThePlan(component);

    component.setLeg(1, 'degrees', '150');

    expect(component.closure()).toContain('Check the bearings');
  }, 30_000);

  it('moves the plot when the grid is changed', async () => {
    const component = render();
    let sent: LandBoundary | null | undefined;
    component.boundaryChange.subscribe((value) => (sent = value));
    await enterThePlan(component);
    const onMinna = ringOf(sent)[0];

    component.setGrid('wgs31');
    await component.redraw();

    expect(ringOf(sent)[0][1]).not.toBeCloseTo(onMinna[1], 5);
  }, 30_000);

  it('takes another leg, and gives one back', () => {
    const component = render();

    component.addLeg();
    expect(component.legs().length).toBe(5);

    component.removeLeg(4);
    expect(component.legs().length).toBe(4);
  });

  it('draws nothing at all until a beacon and three legs are in', async () => {
    const component = render();
    component.setLeg(0, 'degrees', '30');
    await component.redraw();

    expect(component.areaSqm()).toBeNull();
    expect(component.beacon()).toBeNull();
  });
});
