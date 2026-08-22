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
            login: async (password: string) => {
              attempts.push(password);
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

  it('does not try an empty passphrase', async () => {
    const component = render();

    await component.onSubmit();

    expect(attempts).toEqual([]);
    expect(navigations).toEqual([]);
  });

  it('unlocks and goes to the dashboard', async () => {
    const component = render();
    component.password.set('a passphrase');

    await component.onSubmit();

    expect(attempts).toEqual(['a passphrase']);
    expect(navigations[0][0]).toEqual(['/']);
    expect(toasts[0]).toContain('unlocked');
  });

  it('stays where it is when the passphrase is wrong', async () => {
    const component = render();
    succeeds = false;
    component.password.set('wrong');

    await component.onSubmit();

    expect(attempts).toEqual(['wrong']);
    expect(navigations).toEqual([]);
    expect(toasts).toEqual([]);
  });
});
