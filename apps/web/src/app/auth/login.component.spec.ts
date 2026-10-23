import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { LoginComponent } from './login.component';
import { ToastService } from '../toast.service';

describe('LoginComponent', () => {
  let attempts: string[];
  let navigations: unknown[][];
  let toasts: string[];
  let succeeds: boolean;

  function render() {
    attempts = [];
    navigations = [];
    toasts = [];
    succeeds = true;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            loading: () => false,
            error: () => null,
            signIn: async (passphrase: string) => {
              attempts.push(passphrase);
              return succeeds;
            },
          },
        },
        { provide: ToastService, useValue: { show: (message: string) => toasts.push(message) } },
      ],
    });
    const router = TestBed.inject(Router);
    router.navigate = async (...args: unknown[]) => {
      navigations.push(args);
      return true;
    };
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('does not submit an empty passphrase', async () => {
    const component = render();

    await component.onSubmit();

    expect(attempts).toEqual([]);
    expect(navigations).toEqual([]);
  });

  it('signs in and navigates to Home', async () => {
    const component = render();
    component.passphrase.set('a passphrase');

    await component.onSubmit();

    expect(attempts).toEqual(['a passphrase']);
    expect(navigations[0][0]).toEqual(['/']);
    expect(toasts[0]).toContain('Signed in');
  });

  it('does not navigate when sign-in fails', async () => {
    const component = render();
    succeeds = false;
    component.passphrase.set('wrong');

    await component.onSubmit();

    expect(attempts).toEqual(['wrong']);
    expect(navigations).toEqual([]);
    expect(toasts).toEqual([]);
  });
});
