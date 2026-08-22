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
          <div class="t-display">Welcome to SetOut</div>
          <div class="t-body" style="color: var(--ink-2)">Let's set up your private server.</div>
        </div>

        <div class="form-section">
          <div class="form-group">
            <div class="t-micro">Account name</div>
            <input
              type="text"
              [(ngModel)]="name"
              placeholder="Your name, or this device"
              class="input-field"
            />
          </div>
          <div class="form-group">
            <div class="t-micro">Email (optional)</div>
            <input
              type="email"
              [(ngModel)]="email"
              placeholder="you@example.com"
              class="input-field"
              autocomplete="email"
            />
          </div>
          <div class="form-group">
            <div class="t-micro">Choose a passphrase</div>
            <input
              type="password"
              [(ngModel)]="password"
              placeholder="••••••••••"
              class="input-field"
            />
          </div>
          <div class="form-group">
            <div class="t-micro">Type it again</div>
            <input
              type="password"
              [(ngModel)]="confirmPassword"
              placeholder="••••••••••"
              class="input-field"
              (keyup.enter)="onSubmit()"
            />
          </div>

          <div class="info-box t-small">
            Setup puts a cookie on this device so it remembers you. We don't track you. You'll need
            this passphrase to sign in on other devices.
          </div>
        </div>
        <app-button
          size="major"
          class="block"
          [disabled]="!isValid()"
          [loading]="authService.loading()"
          (pressed)="onSubmit()"
        >
          {{ authService.loading() ? 'Creating...' : 'Continue' }}
        </app-button>

        @if (authService.error()) {
          <div class="error-msg t-small">
            {{ authService.error() }}
          </div>
        }
        @if (passwordMismatch()) {
          <div class="error-msg t-small">Passphrases do not match</div>
        }

        <div class="footer">
          <div class="t-small">
            Already set up or clicked by mistake?
            <a routerLink="/login" class="link">Go to login</a>
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
      /* auto margins centre without clipping the top when the form is taller
         than the viewport, which align-items: center would do. */
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
  password = signal('');
  confirmPassword = signal('');

  authService = inject(AuthService);
  router = inject(Router);

  toast = inject(ToastService);

  passwordMismatch() {
    return this.password() && this.confirmPassword() && this.password() !== this.confirmPassword();
  }

  isValid() {
    return (
      this.name() && this.password() && this.password().length >= 8 && !this.passwordMismatch()
    );
  }

  async onSubmit() {
    if (!this.isValid()) return;

    const success = await this.authService.setup(
      this.name(),
      this.email().trim() || undefined,
      this.password(),
    );
    if (success) {
      this.toast.show('Server ready. Welcome to SetOut.');
      await this.router.navigate(['/']);
    }
  }
}
