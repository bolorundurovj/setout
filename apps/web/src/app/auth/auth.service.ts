import { Injectable, computed, signal, inject } from '@angular/core';
import {
  Api,
  AuthStatus,
  changePassphrase,
  getAuthStatus,
  login,
  logout,
  setupAdmin,
  updateAccount,
} from '@setout/api-client';
import { detailOf } from '../api-error';

export interface AuthState {
  status: AuthStatus | null;
  loading: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private api = inject(Api);

  private state = signal<AuthState>({
    status: null,
    loading: true,
  });

  loading = signal(false);
  error = signal<string | null>(null);

  readonly isSetup = computed(() => this.state().status?.is_setup ?? false);
  readonly isAuthenticated = computed(() => this.state().status?.is_authenticated ?? false);
  readonly user = computed(() => this.state().status?.user ?? null);
  readonly isStatusLoading = computed(() => this.state().loading);

  async rename(name: string): Promise<boolean> {
    this.error.set(null);
    try {
      await this.api.invoke(updateAccount, { body: { name } });
      await this.checkStatus();
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save that name.');
      return false;
    }
  }

  async setBaseCurrency(code: string): Promise<boolean> {
    this.error.set(null);
    try {
      await this.api.invoke(updateAccount, { body: { base_currency: code } });
      await this.checkStatus();
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save that currency.');
      return false;
    }
  }

  async changePassphrase(current: string, next: string): Promise<boolean> {
    this.error.set(null);
    try {
      await this.api.invoke(changePassphrase, {
        body: { current_password: current, new_password: next },
      });
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not change the passphrase.');
      return false;
    }
  }

  async checkStatus(): Promise<void> {
    try {
      const status = await this.api.invoke(getAuthStatus);
      this.state.set({ status, loading: false });
    } catch {
      this.state.set({ status: null, loading: false });
    }
  }

  async login(password: string): Promise<boolean> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.api.invoke(login, {
        body: { password },
      });
      await this.checkStatus();
      this.loading.set(false);
      return true;
    } catch (e: unknown) {
      this.loading.set(false);
      if (
        typeof e === 'object' &&
        e !== null &&
        'status' in e &&
        (e as { status: number }).status === 401
      ) {
        this.error.set('Incorrect passphrase.');
      } else {
        this.error.set('An error occurred during sign in.');
      }
      return false;
    }
  }

  async setup(name: string, email: string | undefined, password: string): Promise<boolean> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.api.invoke(setupAdmin, {
        body: { name, email, password },
      });
      await this.checkStatus();
      this.loading.set(false);
      return true;
    } catch (e: unknown) {
      this.loading.set(false);
      if (
        typeof e === 'object' &&
        e !== null &&
        'status' in e &&
        (e as { status: number }).status === 409
      ) {
        this.error.set('This server is already set up.');
      } else {
        this.error.set('An error occurred during setup.');
      }
      return false;
    }
  }

  async logout(): Promise<boolean> {
    try {
      await this.api.invoke(logout);
      await this.checkStatus();
      return true;
    } catch {
      return false;
    }
  }
}
