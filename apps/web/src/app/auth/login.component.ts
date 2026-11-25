import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from './auth.service';
import { ButtonComponent } from '../ui/button.component';
import { LogoComponent } from '../ui/logo.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, ButtonComponent, LogoComponent],
  template: `
    <div class="auth-container">
      <form class="auth-box" (ngSubmit)="onSubmit()">
        <div class="header">
          <app-logo [size]="44" />
          <div class="header-text">
            <div class="t-display">Setout</div>
            <h1 class="t-small">Sign In</h1>
          </div>
        </div>

        <div class="form-group">
          <label class="t-micro" for="login-passphrase">Passphrase</label>
          <input
            type="password"
            id="login-passphrase"
            name="passphrase"
            autocomplete="current-password"
            [(ngModel)]="passphrase"
            placeholder="••••••••••"
            class="input-field"
          />
        </div>

        <app-button
          size="large"
          class="block"
          [disabled]="!passphrase()"
          [loading]="authService.loading()"
          type="submit"
        >
          {{ authService.loading() ? 'Signing in…' : 'Sign In' }}
        </app-button>

        @if (authService.error()) {
          <div role="alert" class="error-msg t-small">
            {{ authService.error() }}
          </div>
        }

        <div class="footer">
          <div class="t-small">
            First time using Setout? <a routerLink="/setup" class="link">Set Up Setout</a>
          </div>
        </div>
      </form>
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
      /* Auto margins centre the box without clipping its top when it is taller than the
         viewport, which align-items: center does not. */
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
      h1 {
        margin: 0;
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
  passphrase = signal('');

  authService = inject(AuthService);
  router = inject(Router);

  async onSubmit() {
    if (!this.passphrase()) return;
    const success = await this.authService.signIn(this.passphrase());
    if (success) {
      await this.router.navigate(['/']);
    }
  }
}
