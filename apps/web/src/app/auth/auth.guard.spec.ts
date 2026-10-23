import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard, guestGuard } from './auth.guard';

describe('auth guards', () => {
  function configure(state: { setUp: boolean; authenticated: boolean; loading?: boolean }) {
    TestBed.resetTestingModule();
    const auth = {
      isSetUp: () => state.setUp,
      isAuthenticated: () => state.authenticated,
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

  it('redirects a signed-out visitor to /login', async () => {
    configure({ setUp: true, authenticated: false });
    const result = await run(authGuard);
    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('redirects to /setup when the server is not set up', async () => {
    configure({ setUp: false, authenticated: false });
    const result = await run(authGuard);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/setup');
  });

  it('allows an authenticated user', async () => {
    configure({ setUp: true, authenticated: true });
    expect(await run(authGuard)).toBe(true);
  });

  it('redirects an authenticated user away from the sign-in page', async () => {
    configure({ setUp: true, authenticated: true });
    const result = await run(guestGuard);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/');
  });

  it('allows a signed-out visitor to reach the sign-in page', async () => {
    configure({ setUp: true, authenticated: false });
    expect(await run(guestGuard)).toBe(true);
  });
});
