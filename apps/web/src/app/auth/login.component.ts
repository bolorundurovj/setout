import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from './auth.service';
import { ButtonComponent } from '../ui/button.component';
import { LogoComponent } from '../ui/logo.component';
import { ToastService } from '../toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ButtonComponent, LogoComponent],
  template: `
    <div class="auth-container">
      <div class="auth-box">
        <div class="header">
          <app-logo [size]="44" />
          <div class="header-text">
            <div class="t-display">SetOut</div>
            <div class="t-small">Unlock this device</div>
          </div>
        </div>

        <div class="form-group">
          <div class="t-micro">Passphrase</div>
          <input
            type="password"
            [(ngModel)]="password"
            placeholder="••••••••••"
            class="input-field"
            (keyup.enter)="onSubmit()"
          />
        </div>

        <app-button
          size="major"
          class="block"
          [disabled]="!password()"
          [loading]="authService.loading()"
          (pressed)="onSubmit()"
        >
          {{ authService.loading() ? 'Unlocking...' : 'Unlock' }}
        </app-button>

        @if (authService.error()) {
          <div class="error-msg t-small">
            {{ authService.error() }}
          </div>
        }

        <div class="footer">
          <div class="t-small">
            First time on this server? <a routerLink="/setup" class="link">Set it up</a>
          </div>
          <div class="t-small" style="color: var(--ink-3)">
            One person uses this. One passphrase, no accounts, no roles.
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
      .auth-container {
        flex: 1;
        display: flex;
        justify-content: center;
        padding: 56px 24px;
      }
      /* auto margins centre without clipping the top when the form is taller
         than the viewport, which align-items: center would do. */
      .auth-box {
        width: 100%;
        max-width: 360px;
        margin: auto 0;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .header {
        display: flex;
        align-items: center;
        gap: 13px;
      }
      .header-text {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }
      .error-msg {
        color: var(--over);
        text-align: center;
      }
      .footer {
        border-top: 1px solid var(--hairline);
        padding-top: 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      @media (max-width: 599px) {
        .auth-container {
          padding: 24px 16px;
        }
      }
    `,
  ],
})
export class LoginComponent {
  password = signal('');

  authService = inject(AuthService);
  router = inject(Router);

  toast = inject(ToastService);

  async onSubmit() {
    if (!this.password()) return;
    const success = await this.authService.login(this.password());
    if (success) {
      this.toast.show('Device unlocked successfully.');
      await this.router.navigate(['/']);
    }
  }
}
