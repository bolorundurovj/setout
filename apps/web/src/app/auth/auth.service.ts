import { Injectable, computed, signal, inject } from '@angular/core';
import {
  Api,
  AuthStatus,
  changePassphrase,
  getAuthStatus,
  setupAdmin,
  signIn,
  signOut,
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

  readonly isSetUp = computed(() => this.state().status?.is_setup ?? false);
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
      this.error.set(detailOf(e) ?? 'Could not save the account name.');
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
      this.error.set(detailOf(e) ?? 'Could not save the base currency.');
      return false;
    }
  }

  async changePassphrase(current: string, next: string): Promise<boolean> {
    this.error.set(null);
    try {
      await this.api.invoke(changePassphrase, {
        body: { current_passphrase: current, new_passphrase: next },
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

  async signIn(passphrase: string): Promise<boolean> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.api.invoke(signIn, {
        body: { passphrase },
      });
      await this.checkStatus();
      this.loading.set(false);
      return true;
    } catch (e: unknown) {
      this.loading.set(false);
      const status =
        typeof e === 'object' && e !== null && 'status' in e ? (e as { status: number }).status : 0;
      if (status === 401) {
        this.error.set('Incorrect passphrase.');
      } else if (status === 429) {
        this.error.set('Too many failed attempts. Try again later.');
      } else {
        this.error.set('Could not sign in.');
      }
      return false;
    }
  }

  async setup(name: string, email: string | undefined, passphrase: string): Promise<boolean> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.api.invoke(setupAdmin, {
        body: { name, email, passphrase },
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
        this.error.set('Could not set up the server.');
      }
      return false;
    }
  }

  async logout(): Promise<boolean> {
    try {
      await this.api.invoke(signOut);
      await this.checkStatus();
      return true;
    } catch {
      return false;
    }
  }
}
