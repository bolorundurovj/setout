import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { InfiniteScrollDirective } from './infinite-scroll.directive';

class FakeObserver {
  static made: FakeObserver[] = [];
  readonly watched: Element[] = [];
  disconnected = false;

  constructor(private readonly onSeen: IntersectionObserverCallback) {
    FakeObserver.made.push(this);
  }

  observe(element: Element): void {
    this.watched.push(element);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  arriveAt(isIntersecting: boolean): void {
    this.onSeen([{ isIntersecting }] as IntersectionObserverEntry[], this as never);
  }
}

@Component({
  standalone: true,
  imports: [InfiniteScrollDirective],
  template: `<div
    (appInfiniteScroll)="reached()"
    [appInfiniteScrollDisabled]="off()"
    class="sentinel"
  ></div>`,
})
class Host {
  readonly off = signal(false);
  readonly hits = signal(0);
  reached(): void {
    this.hits.update((count) => count + 1);
  }
}

describe('InfiniteScrollDirective', () => {
  function render() {
    FakeObserver.made = [];
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    return fixture;
  }

  it('watches the element it sits on', () => {
    const fixture = render();
    const watching = FakeObserver.made[0];

    expect(watching.watched.length).toBe(1);
    expect((watching.watched[0] as HTMLElement).className).toBe('sentinel');
    expect(fixture.componentInstance.hits()).toBe(0);
  });

  it('says so when the element comes into view', () => {
    const fixture = render();

    FakeObserver.made[0].arriveAt(true);

    expect(fixture.componentInstance.hits()).toBe(1);
  });

  it('says nothing while the element is still out of view', () => {
    const fixture = render();

    FakeObserver.made[0].arriveAt(false);

    expect(fixture.componentInstance.hits()).toBe(0);
  });

  it('stops watching once it is turned off', () => {
    const fixture = render();
    const first = FakeObserver.made[0];

    fixture.componentInstance.off.set(true);
    fixture.detectChanges();

    expect(first.disconnected).toBe(true);
    expect(FakeObserver.made.length).toBe(1);
  });

  it('lets go of the element when the screen does', () => {
    const fixture = render();
    const watching = FakeObserver.made[0];

    fixture.destroy();

    expect(watching.disconnected).toBe(true);
  });
});
