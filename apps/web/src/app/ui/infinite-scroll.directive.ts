import { Directive, ElementRef, OnDestroy, effect, inject, input, output } from '@angular/core';

@Directive({
  selector: '[appInfiniteScroll]',
  standalone: true,
})
export class InfiniteScrollDirective implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly disabled = input(false, { alias: 'appInfiniteScrollDisabled' });
  readonly reached = output<void>({ alias: 'appInfiniteScroll' });

  private observer?: IntersectionObserver;

  constructor() {
    effect(() => {
      const disabled = this.disabled();
      this.observer?.disconnect();
      if (disabled || typeof IntersectionObserver === 'undefined') {
        return;
      }
      this.observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            this.reached.emit();
          }
        },
        { rootMargin: '200px' },
      );
      this.observer.observe(this.host.nativeElement);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
