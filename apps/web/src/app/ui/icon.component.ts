import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName = 'home' | 'projects' | 'vendors' | 'items' | 'people' | 'settings';

@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      @switch (name()) {
        @case ('home') {
          <path d="M2.5 6.8 8 2.5l5.5 4.3v6a.7.7 0 0 1-.7.7H3.2a.7.7 0 0 1-.7-.7Z" />
          <path d="M6.4 13.5V9.4h3.2v4.1" />
        }
        @case ('projects') {
          <path d="M1.6 13.6h12.8" />
          <path d="M2.6 13.6V7.6H7" />
          <path d="M7 13.6V3.4h6.4v10.2" />
        }
        @case ('vendors') {
          <path d="M2.2 5.6h11.6l-1 7.2a.7.7 0 0 1-.7.6H3.9a.7.7 0 0 1-.7-.6Z" />
          <path d="M5.6 5.6V4.2a2.4 2.4 0 0 1 4.8 0v1.4" />
        }
        @case ('items') {
          <path d="M8 2 13.7 5v6L8 14 2.3 11V5Z" />
          <path d="M2.3 5 8 8.1 13.7 5" />
          <path d="M8 8.1V14" />
        }
        @case ('people') {
          <circle cx="6.2" cy="5.6" r="2.4" />
          <path d="M1.9 13.6c0-2.4 1.9-3.9 4.3-3.9s4.3 1.5 4.3 3.9" />
          <path d="M11.2 4.1a2.2 2.2 0 0 1 0 4.3" />
          <path d="M12 10a3.9 3.9 0 0 1 2.4 3.6" />
        }
        @case ('settings') {
          <path d="M2.3 5h11.4" />
          <path d="M2.3 11h11.4" />
          <circle cx="6" cy="5" r="1.7" />
          <circle cx="10.6" cy="11" r="1.7" />
        }
      }
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: none;
      }

      svg {
        display: block;
      }
    `,
  ],
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(16);
}
