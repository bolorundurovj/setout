import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from './auth.service';
import { ButtonComponent } from '../ui/button.component';
import { ToastService } from '../toast.service';

@Component({
  selector: 'app-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ButtonComponent],
  template: `
    <div class="setup-container">
      <div class="setup-box">
        <div class="header">
          <div class="t-display">Welcome to Setout</div>
          <div class="t-body" style="color: var(--ink-2)">Set up your private server.</div>
        </div>

        <div class="form-section">
          <div class="form-group">
            <div class="t-micro">Account Name</div>
            <input type="text" [(ngModel)]="name" placeholder="Your name" class="input-field" />
          </div>
          <div class="form-group">
            <div class="t-micro">Email (Optional)</div>
            <input
              type="email"
              [(ngModel)]="email"
              placeholder="you@example.com"
              class="input-field"
              autocomplete="email"
            />
          </div>
          <div class="form-group">
            <div class="t-micro">Passphrase</div>
            <input
              type="password"
              [(ngModel)]="passphrase"
              placeholder="••••••••••"
              class="input-field"
            />
          </div>
          <div class="form-group">
            <div class="t-micro">Confirm Passphrase</div>
            <input
              type="password"
              [(ngModel)]="confirmPassphrase"
              placeholder="••••••••••"
              class="input-field"
              (keyup.enter)="onSubmit()"
            />
          </div>

          <div class="info-box t-small">
            Setup stores a session cookie on this device. The cookie is not used for tracking. Use
            this passphrase to sign in on other devices.
          </div>
        </div>
        <app-button
          size="large"
          class="block"
          [disabled]="!isValid()"
          [loading]="authService.loading()"
          (pressed)="onSubmit()"
        >
          {{ authService.loading() ? 'Setting up…' : 'Continue' }}
        </app-button>

        @if (authService.error()) {
          <div class="error-msg t-small">
            {{ authService.error() }}
          </div>
        }
        @if (passphraseMismatch()) {
          <div class="error-msg t-small">Passphrases do not match.</div>
        }

        <div class="footer">
          <div class="t-small">
            Server already set up?
            <a routerLink="/login" class="link">Sign in</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        flex: 1;
        display: flex;
      }
      .setup-container {
        flex: 1;
        display: flex;
        justify-content: center;
        padding: 48px 24px;
      }
      /* Auto margins centre the box without clipping its top when it is taller than the
         viewport, which align-items: center does not. */
      .setup-box {
        width: 100%;
        max-width: 560px;
        margin: auto 0;
        display: flex;
        flex-direction: column;
        gap: 22px;
      }
      .header {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .form-section {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }
      .info-box {
        border: 1px solid var(--rule);
        background: var(--field);
        border-radius: 12px;
        padding: 14px 16px;
        color: var(--ink-2);
      }
      .error-msg {
        color: var(--over);
        text-align: center;
      }
      @media (max-width: 599px) {
        .setup-container {
          padding: 24px 16px;
        }
      }
      .footer {
        border-top: 1px solid var(--hairline);
        padding-top: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
    `,
  ],
})
export class SetupComponent {
  name = signal('');
  email = signal('');
  passphrase = signal('');
  confirmPassphrase = signal('');

  authService = inject(AuthService);
  router = inject(Router);

  toast = inject(ToastService);

  passphraseMismatch() {
    return (
      this.passphrase() &&
      this.confirmPassphrase() &&
      this.passphrase() !== this.confirmPassphrase()
    );
  }

  isValid() {
    return (
      this.name() &&
      this.passphrase() &&
      this.passphrase().length >= 8 &&
      !this.passphraseMismatch()
    );
  }

  async onSubmit() {
    if (!this.isValid()) return;

    const success = await this.authService.setup(
      this.name(),
      this.email().trim() || undefined,
      this.passphrase(),
    );
    if (success) {
      this.toast.show('Server set up.');
      await this.router.navigate(['/']);
    }
  }
}
