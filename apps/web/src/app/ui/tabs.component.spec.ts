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
    [value]="selected()"
    (valueChange)="selected.set($event)"
  />`,
})
class Host {
  readonly tabs = TABS;
  readonly selected = signal('pin');
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

  it('sets aria-selected only on the selected tab', () => {
    const { buttons } = render();
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
    expect(buttons[1].getAttribute('aria-selected')).toBe('false');
  });

  it('puts only the selected tab in the tab order', () => {
    const { buttons } = render();
    expect(buttons[0].getAttribute('tabindex')).toBe('0');
    expect(buttons[1].getAttribute('tabindex')).toBe('-1');
  });

  it('sets aria-controls on each tab', () => {
    const { buttons } = render();
    expect(buttons[0].getAttribute('aria-controls')).toBe('pin-panel');
    expect(buttons[0].id).toBe('pin-tab');
  });

  it('emits the clicked tab', () => {
    const { buttons, host, fixture } = render();
    buttons[1].click();
    fixture.detectChanges();
    expect(host.selected()).toBe('boundary');
  });

  it('moves selection with the arrow keys and wraps', () => {
    const { buttons, host, fixture } = render();

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();
    expect(host.selected()).toBe('boundary');

    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();
    expect(host.selected()).toBe('pin');
  });

  it('moves to the first and last tabs with Home and End', () => {
    const { buttons, host, fixture } = render();

    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    fixture.detectChanges();
    expect(host.selected()).toBe('boundary');

    buttons[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    fixture.detectChanges();
    expect(host.selected()).toBe('pin');
  });

  it('ignores unhandled keys', () => {
    const { buttons, host, fixture } = render();
    buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    fixture.detectChanges();
    expect(host.selected()).toBe('pin');
  });
});
