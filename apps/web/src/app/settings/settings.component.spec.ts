import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { Backup, Install } from '@setout/api-client';
import { AuthService } from '../auth/auth.service';
import { ProjectService } from '../projects/project.service';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast.service';
import { InstallService } from './install.service';
import { SettingsComponent } from './settings.component';

function install(overrides: Partial<Install> = {}): Install {
  return {
    version: '0.4.0',
    migration: '0003_agreements_and_advances',
    data_bytes: 2_306_867,
    data_changed_at: '2026-08-17T09:14:00Z',
    ...overrides,
  };
}

function backup(overrides: Partial<Backup> = {}): Backup {
  return {
    format: 1,
    app_version: '0.4.0',
    migration: '0003_agreements_and_advances',
    exported_at: '2026-08-17T09:14:00Z',
    row_counts: { project: 2, expense: 15 },
    tables: { project: [], expense: [] },
    ...overrides,
  };
}

describe('SettingsComponent', () => {
  let toasts: { message: string; type?: string }[];
  let renamed: string[];
  let passphrases: { current: string; next: string }[];
  let appearances: string[];
  let loads: number;
  let renameResult: boolean;
  let passphraseResult: boolean;
  let exportResult: Backup | null;
  let restoreResult: { row_counts: Record<string, number>; signed_out: boolean } | null;
  let restores: { backup: Backup; accept: boolean }[];
  let navigations: unknown[][];
  let defaultCurrencies: string[];
  let defaultCurrencyResult: boolean;
  let currencies: { code: string; name: string; exponent: number }[];
  let fixture: ReturnType<typeof TestBed.createComponent<SettingsComponent>>;

  function render(
    installation: Install | null = install(),
    authError = 'Could not save the account name.',
    defaultCurrency: string | null = null,
  ) {
    toasts = [];
    renamed = [];
    passphrases = [];
    appearances = [];
    loads = 0;
    renameResult = true;
    passphraseResult = true;
    exportResult = backup();
    restoreResult = { row_counts: { project: 2 }, signed_out: true };
    restores = [];
    navigations = [];
    defaultCurrencies = [];
    defaultCurrencyResult = true;
    currencies = [
      { code: 'NGN', name: 'Nigerian naira', exponent: 2 },
      { code: 'USD', name: 'US dollar', exponent: 2 },
    ];

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: () => ({ id: 'u1', name: 'Vee', email: null, base_currency: defaultCurrency }),
            error: () => authError,
            checkStatus: async () => undefined,
            rename: async (name: string) => {
              renamed.push(name);
              return renameResult;
            },
            changePassphrase: async (current: string, next: string) => {
              passphrases.push({ current, next });
              return passphraseResult;
            },
            setBaseCurrency: async (code: string) => {
              defaultCurrencies.push(code);
              return defaultCurrencyResult;
            },
          },
        },
        {
          provide: ProjectService,
          useValue: {
            currencies: () => currencies,
            loadCurrencies: async () => undefined,
          },
        },
        {
          provide: ThemeService,
          useValue: {
            theme: () => 'dark',
            choice: () => 'system',
            followsSystem: () => true,
            choose: (choice: string) => void appearances.push(choice),
          },
        },
        {
          provide: InstallService,
          useValue: {
            install: () => installation,
            exporting: () => false,
            error: () => 'Could not create the backup.',
            loading: () => false,
            restoring: () => false,
            load: async () => void (loads += 1),
            export: async () => exportResult,
            restore: async (given: Backup, accept: boolean) => {
              restores.push({ backup: given, accept });
              return restoreResult;
            },
          },
        },
        {
          provide: ToastService,
          useValue: {
            show: (message: string, type?: string) => void toasts.push({ message, type }),
          },
        },
      ],
    });
    const router = TestBed.inject(Router);
    router.navigate = async (commands: unknown[]) => {
      navigations.push(commands);
      return true;
    };
    fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  async function ready(installation: Install | null = install()) {
    const component = render(installation);
    await Promise.resolve();
    return component;
  }

  it('loads the server details on init', async () => {
    await ready();
    expect(loads).toBe(1);
  });

  it('initialises the account name from the signed-in user', async () => {
    const component = await ready();
    expect(component.name()).toBe('Vee');
    expect(component.nameChanged()).toBe(false);
  });

  it('offers to save the name only when it changed and is not blank', async () => {
    const component = await ready();
    component.name.set('  Vee  ');
    expect(component.nameChanged()).toBe(false);

    component.name.set('  ');
    expect(component.nameChanged()).toBe(false);

    component.name.set('Bolu');
    expect(component.nameChanged()).toBe(true);
  });

  it('saves the name trimmed', async () => {
    const component = await ready();
    component.name.set('  Bolu  ');

    await component.saveName();

    expect(renamed).toEqual(['Bolu']);
    expect(toasts[0].message).toBe('Account name saved.');
  });

  it('shows the error when the name fails to save', async () => {
    const component = await ready();
    renameResult = false;
    component.name.set('Bolu');

    await component.saveName();

    expect(toasts[0]).toEqual({ message: 'Could not save the account name.', type: 'error' });
  });

  it('describes the appearance setting when following the system', async () => {
    const component = await ready();
    expect(component.appearanceNote()).toContain('Theme follows the system setting');
    expect(component.appearanceNote()).toContain('dark');
  });

  it('passes the appearance choice to the theme', async () => {
    const component = await ready();
    component.selectAppearance('light');
    expect(appearances).toEqual(['light']);
  });

  it('blocks the passphrase change until all three fields are valid', async () => {
    const component = await ready();
    component.startPassphrase();
    expect(component.passphraseError()).toBe('Enter the current passphrase.');

    component.currentPassphrase.set('password123');
    component.newPassphrase.set('short');
    expect(component.passphraseError()).toContain('at least eight');

    component.newPassphrase.set('a longer secret');
    component.confirmPassphrase.set('a longer secre');
    expect(component.passphraseError()).toBe('The new passphrases do not match.');

    component.confirmPassphrase.set('a longer secret');
    expect(component.passphraseError()).toBeNull();
  });

  it('does not send the change while the fields are invalid', async () => {
    const component = await ready();
    component.startPassphrase();
    component.currentPassphrase.set('password123');
    component.newPassphrase.set('short');

    await component.savePassphrase();

    expect(passphrases).toEqual([]);
  });

  it('changes the passphrase and reports that other devices were signed out', async () => {
    const component = await ready();
    component.startPassphrase();
    component.currentPassphrase.set('password123');
    component.newPassphrase.set('a longer secret');
    component.confirmPassphrase.set('a longer secret');

    await component.savePassphrase();

    expect(passphrases).toEqual([{ current: 'password123', next: 'a longer secret' }]);
    expect(component.changingPassphrase()).toBe(false);
    expect(toasts[0].message).toContain('signed out');
  });

  it('keeps the fields open when the change is rejected', async () => {
    const component = await ready();
    passphraseResult = false;
    component.startPassphrase();
    component.currentPassphrase.set('wrong');
    component.newPassphrase.set('a longer secret');
    component.confirmPassphrase.set('a longer secret');

    await component.savePassphrase();

    expect(component.changingPassphrase()).toBe(true);
    expect(toasts[0].type).toBe('error');
  });

  it('formats the data size in binary units', async () => {
    expect((await ready(install({ data_bytes: 512 }))).dataSize()).toBe('512 B');
    expect((await ready(install({ data_bytes: 2048 }))).dataSize()).toBe('2.0 KiB');
    expect((await ready(install({ data_bytes: 2_306_867 }))).dataSize()).toBe('2.2 MiB');
    expect((await ready(null)).dataSize()).toBe('—');
  });

  it('shows when the data last changed, or that it has not changed', async () => {
    expect((await ready()).lastChanged()).toContain('2026');
    expect((await ready(install({ data_changed_at: null }))).lastChanged()).toBe('no changes yet');
  });

  it('shows an error when the backup export fails', async () => {
    const component = await ready();
    exportResult = null;

    await component.downloadBackup();

    expect(toasts[0]).toEqual({ message: 'Could not create the backup.', type: 'error' });
  });

  it('warns when the backup has a different version or schema', async () => {
    const component = await ready();
    component.selectedBackup.set({ name: 'backup.json', bytes: 2048, backup: backup() });
    expect(component.versionChanged()).toBe(false);
    expect(component.versionWarning()).toBeNull();

    component.selectedBackup.set({
      name: 'backup.json',
      bytes: 2048,
      backup: backup({ app_version: '0.2.0' }),
    });
    expect(component.versionChanged()).toBe(true);
    expect(component.versionWarning()).toContain('may fail if the schema has changed');

    component.selectedBackup.set({
      name: 'backup.json',
      bytes: 2048,
      backup: backup({ migration: '0001_initial' }),
    });
    expect(component.versionChanged()).toBe(true);
    expect(component.versionWarning()).toContain('0001_initial');
  });

  it('restores the backup and accepts the version change', async () => {
    const component = await ready();
    component.selectedBackup.set({
      name: 'backup.json',
      bytes: 2048,
      backup: backup({ app_version: '0.2.0' }),
    });

    await component.restoreBackup();

    expect(restores).toEqual([{ backup: backup({ app_version: '0.2.0' }), accept: true }]);
    expect(component.selectedBackup()).toBeNull();
    expect(toasts[0].message).toContain('Sign in with the passphrase');
    expect(navigations).toEqual([['/login']]);
  });

  it('keeps the selected backup when the restore fails', async () => {
    const component = await ready();
    restoreResult = null;
    component.selectedBackup.set({ name: 'backup.json', bytes: 2048, backup: backup() });

    await component.restoreBackup();

    expect(component.selectedBackup()).not.toBeNull();
    expect(toasts[0].type).toBe('error');
  });

  it('summarises the selected backup', async () => {
    const component = await ready();
    component.selectedBackup.set({ name: 'backup.json', bytes: 2048, backup: backup() });

    expect(component.selectedBackupSummary()).toContain('backup.json');
    expect(component.selectedBackupSummary()).toContain('2.0 KiB');
    expect(component.selectedBackupRowCount()).toBe('17 rows across 2 tables');
  });

  it('renders both backup buttons compact and opens the file picker', async () => {
    const component = await ready();
    const element = fixture.nativeElement as HTMLElement;
    const buttons = element.querySelectorAll('app-button .btn');
    expect(buttons.length).toBe(2);
    expect([...buttons].map((b) => b.className.includes('btn-compact'))).toEqual([true, true]);

    const input = element.querySelector<HTMLInputElement>('input[type="file"]');
    let opened = 0;
    input!.click = () => void (opened += 1);
    component.chooseFile();
    expect(opened).toBe(1);
  });

  it('clears the selected backup when the restore is cancelled', async () => {
    const component = await ready();
    component.selectedBackup.set({ name: 'backup.json', bytes: 2048, backup: backup() });

    component.cancelRestore();

    expect(component.selectedBackup()).toBeNull();
    expect(restores).toEqual([]);
  });

  it('offers every known currency as the default currency', () => {
    const component = render();

    expect(component.currencyChips().map((chip) => chip.value)).toEqual(['NGN', 'USD']);
    expect(component.currencyChips()[0].label).toBe('NGN Nigerian naira');
    expect(component.defaultCurrency()).toBe('');
    expect(component.currencyNote()).toContain('first currency found');
  });

  it('saves the selected default currency and confirms it', async () => {
    const component = render();

    await component.selectDefaultCurrency('USD');

    expect(defaultCurrencies).toEqual(['USD']);
    expect(toasts.at(-1)).toEqual({ message: 'Home shows USD.', type: 'info' });
  });

  it('describes the default currency once one is set', () => {
    const component = render(install(), 'Could not save the account name.', 'NGN');

    expect(component.defaultCurrency()).toBe('NGN');
    expect(component.currencyNote()).toContain('Home shows NGN');
  });

  it('shows an error when the default currency fails to save', async () => {
    const component = render();
    defaultCurrencyResult = false;

    await component.selectDefaultCurrency('USD');

    expect(toasts.at(-1)?.type).toBe('error');
  });
});
