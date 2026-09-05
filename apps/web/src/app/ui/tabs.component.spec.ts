import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TabsComponent, type Tab } from './tabs.component';

const TABS: Tab[] = [
  { value: 'pin', label: 'Pin' },
  { value: 'boundary', label: 'Boundary' },
];

@Component({
  standalone: true,
  imports: [TabsComponent],
  template: `<app-tabs
    label="Pin or boundary"
    [tabs]="tabs"
    [value]="chosen()"
    (valueChange)="chosen.set($event)"
  />`,
})
class Host {
  readonly tabs = TABS;
  readonly chosen = signal('pin');
}

describe('TabsComponent', () => {
  function render() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      host: fixture.componentInstance,
      strip: element.querySelector('[role="tablist"]') as HTMLElement,
      buttons: Array.from(element.querySelectorAll<HTMLButtonElement>('[role="tab"]')),
    };
  }

  it('renders one tab per entry', () => {
    const { buttons } = render();
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Pin', 'Boundary']);
  });

  it('marks only the chosen one as selected', () => {
    const { buttons } = render();
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
    expect(buttons[1].getAttribute('aria-selected')).toBe('false');
  });

  it('keeps only the chosen one in the tab order', () => {
    const { buttons } = render();
    expect(buttons[0].getAttribute('tabindex')).toBe('0');
    expect(buttons[1].getAttribute('tabindex')).toBe('-1');
  });

  it('points each tab at the panel it controls', () => {
    const { buttons } = render();
    expect(buttons[0].getAttribute('aria-controls')).toBe('pin-panel');
    expect(buttons[0].id).toBe('pin-tab');
  });

  it('says which one was clicked', () => {
    const { buttons, host, fixture } = render();
    buttons[1].click();
    fixture.detectChanges();
    expect(host.chosen()).toBe('boundary');
  });

  it('moves along with the arrow keys, and wraps', () => {
    const { buttons, host, fixture } = render();

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();
    expect(host.chosen()).toBe('boundary');

    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();
    expect(host.chosen()).toBe('pin');
  });

  it('jumps to the ends with Home and End', () => {
    const { buttons, host, fixture } = render();

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    fixture.detectChanges();
    expect(host.chosen()).toBe('boundary');

    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    fixture.detectChanges();
    expect(host.chosen()).toBe('pin');
  });

  it('ignores a key that means nothing here', () => {
    const { buttons, host, fixture } = render();
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    fixture.detectChanges();
    expect(host.chosen()).toBe('pin');
  });
});
