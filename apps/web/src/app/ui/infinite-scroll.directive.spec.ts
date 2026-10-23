import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { InfiniteScrollDirective } from './infinite-scroll.directive';

class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly watched: Element[] = [];
  disconnected = false;

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.watched.push(element);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  trigger(isIntersecting: boolean): void {
    this.callback([{ isIntersecting }] as IntersectionObserverEntry[], this as never);
  }
}

@Component({
  standalone: true,
  imports: [InfiniteScrollDirective],
  template: `<div
    (appInfiniteScroll)="reached()"
    [appInfiniteScrollDisabled]="disabled()"
    class="sentinel"
  ></div>`,
})
class Host {
  readonly disabled = signal(false);
  readonly emitCount = signal(0);
  reached(): void {
    this.emitCount.update((count) => count + 1);
  }
}

describe('InfiniteScrollDirective', () => {
  function render() {
    FakeObserver.instances = [];
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture;
  }

  it('observes the host element', () => {
    const fixture = render();
    const observer = FakeObserver.instances[0];

    expect(observer.watched.length).toBe(1);
    expect((observer.watched[0] as HTMLElement).className).toBe('sentinel');
    expect(fixture.componentInstance.emitCount()).toBe(0);
  });

  it('emits when the element intersects', () => {
    const fixture = render();

    FakeObserver.instances[0].trigger(true);

    expect(fixture.componentInstance.emitCount()).toBe(1);
  });

  it('does not emit while the element does not intersect', () => {
    const fixture = render();

    FakeObserver.instances[0].trigger(false);

    expect(fixture.componentInstance.emitCount()).toBe(0);
  });

  it('disconnects when disabled', () => {
    const fixture = render();
    const first = FakeObserver.instances[0];

    fixture.componentInstance.disabled.set(true);
    fixture.detectChanges();

    expect(first.disconnected).toBe(true);
    expect(FakeObserver.instances.length).toBe(1);
  });

  it('disconnects when the host is destroyed', () => {
    const fixture = render();
    const observer = FakeObserver.instances[0];

    fixture.destroy();

    expect(observer.disconnected).toBe(true);
  });
});
