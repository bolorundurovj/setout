import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-logo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <img src="logo.svg" alt="Setout" [width]="size()" [height]="size()" /> `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      img {
        display: block;
      }
    `,
  ],
})
export class LogoComponent {
  readonly size = input(44);
}
