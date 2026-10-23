import { TestBed } from '@angular/core/testing';
import { IconComponent, type IconName } from './icon.component';

const NAMES: IconName[] = ['home', 'projects', 'vendors', 'items', 'people', 'settings'];

describe('IconComponent', () => {
  function render(name: IconName, size?: number) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [IconComponent] });
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', name);
    if (size !== undefined) {
      fixture.componentRef.setInput('size', size);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it.each(NAMES)('renders an SVG for %s', (name) => {
    const svg = render(name).querySelector('svg');

    expect(svg?.querySelectorAll('path, circle').length).toBeGreaterThan(0);
  });

  it('uses the size input and currentColor', () => {
    const svg = render('home', 20).querySelector('svg');

    expect(svg?.getAttribute('width')).toBe('20');
    expect(svg?.getAttribute('height')).toBe('20');
    expect(svg?.getAttribute('stroke')).toBe('currentColor');
  });

  it('is hidden from assistive technology', () => {
    const svg = render('people').querySelector('svg');

    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
  });
});
