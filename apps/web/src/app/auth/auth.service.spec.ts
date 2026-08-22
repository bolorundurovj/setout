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

  it('starts signed out', () => {
    const service = configure(async () => ({}));
    expect(service.isAuthenticated()).toBe(false);
    expect(service.isSetup()).toBe(false);
  });

  it('reflects the status it fetched', async () => {
    const service = configure(async () => ({
      is_setup: true,
      is_authenticated: true,
      user,
    }));
    await service.checkStatus();
    expect(service.isSetup()).toBe(true);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()?.name).toBe('Admin');
  });

  it('explains a wrong passphrase rather than throwing', async () => {
    const service = configure(async () => {
      throw { status: 401 };
    });
    expect(await service.login('wrong')).toBe(false);
    expect(service.error()).toBe('Incorrect passphrase.');
    expect(service.loading()).toBe(false);
  });

  it('explains a server that is already set up', async () => {
    const service = configure(async () => {
      throw { status: 409 };
    });
    expect(await service.setup('Admin', undefined, 'password123')).toBe(false);
    expect(service.error()).toBe('This server is already set up.');
  });

  it('signs in and refreshes the status', async () => {
    let calls = 0;
    const service = configure(async () => {
      calls += 1;
      return { is_setup: true, is_authenticated: true, user };
    });
    expect(await service.login('password123')).toBe(true);
    expect(calls).toBe(2);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('sends the currency Home should open on and re-reads the account', async () => {
    const sent: unknown[] = [];
    const service = configure(async (_fn: unknown, params: unknown) => {
      sent.push(params);
      return { is_setup: true, is_authenticated: true, user: { ...user, base_currency: 'USD' } };
    });

    expect(await service.setBaseCurrency('USD')).toBe(true);
    expect(sent[0]).toEqual({ body: { base_currency: 'USD' } });
    expect(service.user()?.base_currency).toBe('USD');
  });

  it('says the currency would not save rather than throwing', async () => {
    const service = configure(async () => {
      throw { status: 422, error: { detail: 'Unknown currency: ZZZ' } };
    });

    expect(await service.setBaseCurrency('ZZZ')).toBe(false);
    expect(service.error()).toBe('Unknown currency: ZZZ');
  });
});
