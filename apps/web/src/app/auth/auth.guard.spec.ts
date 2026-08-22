import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard, guestGuard } from './auth.guard';

describe('auth guards', () => {
  function configure(state: { setup: boolean; authed: boolean; loading?: boolean }) {
    TestBed.resetTestingModule();
    const auth = {
      isSetup: () => state.setup,
      isAuthenticated: () => state.authed,
      isStatusLoading: () => state.loading ?? false,
      checkStatus: async () => undefined,
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
  }

  function run(guard: typeof authGuard) {
    return TestBed.runInInjectionContext(
      () => guard(null as never, null as never) as Promise<boolean | UrlTree>,
    );
  }

  it('sends a signed out visitor to login', async () => {
    configure({ setup: true, authed: false });
    const result = await run(authGuard);
    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('sends a fresh server to setup', async () => {
    configure({ setup: false, authed: false });
    const result = await run(authGuard);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/setup');
  });

  it('lets a signed in user through', async () => {
    configure({ setup: true, authed: true });
    expect(await run(authGuard)).toBe(true);
  });

  it('keeps a signed in user off the login page', async () => {
    configure({ setup: true, authed: true });
    const result = await run(guestGuard);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/');
  });

  it('lets a signed out visitor reach login', async () => {
    configure({ setup: true, authed: false });
    expect(await run(guestGuard)).toBe(true);
  });
});
