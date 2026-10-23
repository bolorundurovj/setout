import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const user = { id: 'u1', name: 'Admin', email: null };

  function configure(invoke: (...args: unknown[]) => Promise<unknown>) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: Api, useValue: { invoke } }],
    });
    return TestBed.inject(AuthService);
  }

  it('starts signed out and not set up', () => {
    const service = configure(async () => ({}));
    expect(service.isAuthenticated()).toBe(false);
    expect(service.isSetUp()).toBe(false);
  });

  it('reflects the fetched auth status', async () => {
    const service = configure(async () => ({
      is_setup: true,
      is_authenticated: true,
      user,
    }));
    await service.checkStatus();
    expect(service.isSetUp()).toBe(true);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()?.name).toBe('Admin');
  });

  it('reports an incorrect passphrase on 401', async () => {
    const service = configure(async () => {
      throw { status: 401 };
    });
    expect(await service.signIn('wrong')).toBe(false);
    expect(service.error()).toBe('Incorrect passphrase.');
    expect(service.loading()).toBe(false);
  });

  it('reports rate limiting on 429', async () => {
    const service = configure(async () => {
      throw { status: 429 };
    });
    expect(await service.signIn('wrong')).toBe(false);
    expect(service.error()).toBe('Too many failed attempts. Try again later.');
  });

  it('reports an already set-up server on 409', async () => {
    const service = configure(async () => {
      throw { status: 409 };
    });
    expect(await service.setup('Admin', undefined, 'passphrase123')).toBe(false);
    expect(service.error()).toBe('This server is already set up.');
  });

  it('signs in and reloads the auth status', async () => {
    let calls = 0;
    const service = configure(async () => {
      calls += 1;
      return { is_setup: true, is_authenticated: true, user };
    });
    expect(await service.signIn('passphrase123')).toBe(true);
    expect(calls).toBe(2);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('saves the base currency and reloads the auth status', async () => {
    const sent: unknown[] = [];
    const service = configure(async (_fn: unknown, params: unknown) => {
      sent.push(params);
      return { is_setup: true, is_authenticated: true, user: { ...user, base_currency: 'USD' } };
    });

    expect(await service.setBaseCurrency('USD')).toBe(true);
    expect(sent[0]).toEqual({ body: { base_currency: 'USD' } });
    expect(service.user()?.base_currency).toBe('USD');
  });

  it('surfaces the error when the base currency is rejected', async () => {
    const service = configure(async () => {
      throw { status: 422, error: { detail: 'Unknown currency: ZZZ' } };
    });

    expect(await service.setBaseCurrency('ZZZ')).toBe(false);
    expect(service.error()).toBe('Unknown currency: ZZZ');
  });
});
