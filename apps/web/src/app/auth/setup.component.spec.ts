import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { SetupComponent } from './setup.component';
import { ToastService } from '../toast.service';

describe('SetupComponent', () => {
  let asked: unknown[][];
  let navigations: unknown[][];
  let succeeds: boolean;

  function render() {
    asked = [];
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
              asked.push(args);
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
    component.password.set('a long passphrase');
    component.confirmPassword.set('a long passphrase');
    return component;
  }

  it('wants a name and a passphrase of at least eight characters', () => {
    const component = render();
    expect(component.isValid()).toBeFalsy();

    component.name.set('Vee');
    component.password.set('short');
    component.confirmPassword.set('short');
    expect(component.isValid()).toBeFalsy();

    component.password.set('a long passphrase');
    component.confirmPassword.set('a long passphrase');
    expect(component.isValid()).toBeTruthy();
  });

  it('says when the two passphrases differ', () => {
    const component = render();
    component.password.set('a long passphrase');
    component.confirmPassword.set('another one');

    expect(component.passwordMismatch()).toBeTruthy();
    expect(component.isValid()).toBeFalsy();
  });

  it('leaves out an email nobody typed rather than sending an empty one', async () => {
    const component = filled(render());

    await component.onSubmit();

    expect(asked[0]).toEqual(['Vee', undefined, 'a long passphrase']);
    expect(navigations[0][0]).toEqual(['/']);
  });

  it('sends the email when there is one', async () => {
    const component = filled(render());
    component.email.set('  vee@example.com  ');

    await component.onSubmit();

    expect(asked[0][1]).toBe('vee@example.com');
  });

  it('stays on the screen when setting up fails', async () => {
    const component = filled(render());
    succeeds = false;

    await component.onSubmit();

    expect(navigations).toEqual([]);
  });
});
