import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { SetupComponent } from './setup.component';
import { ToastService } from '../toast.service';

describe('SetupComponent', () => {
  let setupCalls: unknown[][];
  let navigations: unknown[][];
  let succeeds: boolean;

  function render() {
    setupCalls = [];
    navigations = [];
    succeeds = true;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SetupComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            loading: () => false,
            error: () => null,
            setup: async (...args: unknown[]) => {
              setupCalls.push(args);
              return succeeds;
            },
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
      ],
    });
    const router = TestBed.inject(Router);
    router.navigate = async (...args: unknown[]) => {
      navigations.push(args);
      return true;
    };
    const fixture = TestBed.createComponent(SetupComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  function filled(component: SetupComponent) {
    component.name.set('Vee');
    component.passphrase.set('a long passphrase');
    component.confirmPassphrase.set('a long passphrase');
    return component;
  }

  it('requires a name and a passphrase of at least eight characters', () => {
    const component = render();
    expect(component.isValid()).toBeFalsy();

    component.name.set('Vee');
    component.passphrase.set('short');
    component.confirmPassphrase.set('short');
    expect(component.isValid()).toBeFalsy();

    component.passphrase.set('a long passphrase');
    component.confirmPassphrase.set('a long passphrase');
    expect(component.isValid()).toBeTruthy();
  });

  it('flags a passphrase mismatch as invalid', () => {
    const component = render();
    component.passphrase.set('a long passphrase');
    component.confirmPassphrase.set('another one');

    expect(component.passphraseMismatch()).toBeTruthy();
    expect(component.isValid()).toBeFalsy();
  });

  it('omits a blank email', async () => {
    const component = filled(render());

    await component.onSubmit();

    expect(setupCalls[0]).toEqual(['Vee', undefined, 'a long passphrase']);
    expect(navigations[0][0]).toEqual(['/']);
  });

  it('sends the trimmed email when one is entered', async () => {
    const component = filled(render());
    component.email.set('  vee@example.com  ');

    await component.onSubmit();

    expect(setupCalls[0][1]).toBe('vee@example.com');
  });

  it('does not navigate when setup fails', async () => {
    const component = filled(render());
    succeeds = false;

    await component.onSubmit();

    expect(navigations).toEqual([]);
  });
});
