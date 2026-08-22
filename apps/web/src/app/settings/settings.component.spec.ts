import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { Backup, Install } from '@setout/api-client';
import { AuthService } from '../auth/auth.service';
import { ProjectService } from '../projects/project.service';
import { ThemeService } from '../theme.service';
import { ToastService } from '../toast.service';
import { InstallService } from './install.service';
import { SettingsComponent } from './settings.component';

function install(over: Partial<Install> = {}): Install {
  return {
    version: '0.4.0',
    migration: '0003_agreements_and_advances',
    record_bytes: 2_306_867,
    record_changed_at: '2026-08-17T09:14:00Z',
    ...over,
  };
}

function backup(over: Partial<Backup> = {}): Backup {
  return {
    format: 1,
    app_version: '0.4.0',
    migration: '0003_agreements_and_advances',
    exported_at: '2026-08-17T09:14:00Z',
    row_counts: { project: 2, expense: 15 },
    tables: { project: [], expense: [] },
    ...over,
  };
}

describe('SettingsComponent', () => {
  let toasts: { message: string; type?: string }[];
  let renamed: string[];
  let passphrases: { current: string; next: string }[];
  let chosen: string[];
  let loads: number;
  let renameResult: boolean;
  let passphraseResult: boolean;
  let exportResult: Backup | null;
  let restoreResult: { row_counts: Record<string, number>; signed_out: boolean } | null;
  let restores: { backup: Backup; accept: boolean }[];
  let went: unknown[][];
  let bases: string[];
  let baseResult: boolean;
  let currencies: { code: string; name: string; exponent: number }[];
  let fixture: ReturnType<typeof TestBed.createComponent<SettingsComponent>>;

  function render(
    facts: Install | null = install(),
    authError = 'Could not save that name.',
    baseCurrency: string | null = null,
  ) {
    toasts = [];
    renamed = [];
    passphrases = [];
    chosen = [];
    loads = 0;
    renameResult = true;
    passphraseResult = true;
    exportResult = backup();
    restoreResult = { row_counts: { project: 2 }, signed_out: true };
    restores = [];
    went = [];
    bases = [];
    baseResult = true;
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
            user: () => ({ id: 'u1', name: 'Vee', email: null, base_currency: baseCurrency }),
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
              bases.push(code);
              return baseResult;
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
            followsDevice: () => true,
            choose: (choice: string) => void chosen.push(choice),
          },
        },
        {
          provide: InstallService,
          useValue: {
            install: () => facts,
            checking: () => false,
            writing: () => false,
            error: () => 'Could not write a copy.',
            reading: () => false,
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
      went.push(commands);
      return true;
    };
    fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  async function ready(facts: Install | null = install()) {
    const component = render(facts);
    await Promise.resolve();
    return component;
  }

  it('asks the server what it is on the way in', async () => {
    await ready();
    expect(loads).toBe(1);
  });

  it('starts on the account name already set', async () => {
    const component = await ready();
    expect(component.name()).toBe('Vee');
    expect(component.nameChanged()).toBe(false);
  });

  it('only offers to save a name that changed to something', async () => {
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

  it('passes on why a name would not save', async () => {
    const component = await ready();
    renameResult = false;
    component.name.set('Bolu');

    await component.saveName();

    expect(toasts[0]).toEqual({ message: 'Could not save that name.', type: 'error' });
  });

  it('says what the appearance choice means, following the device or not', async () => {
    const component = await ready();
    expect(component.appearanceNote()).toContain('Following the device');
    expect(component.appearanceNote()).toContain('dark');
  });

  it('hands the appearance choice to the theme', async () => {
    const component = await ready();
    component.pickAppearance('light');
    expect(chosen).toEqual(['light']);
  });

  it('will not change a passphrase until all three boxes agree', async () => {
    const component = await ready();
    component.startPassphrase();
    expect(component.passphraseProblem()).toBe('The passphrase in use is needed first.');

    component.current.set('password123');
    component.next.set('short');
    expect(component.passphraseProblem()).toContain('at least eight');

    component.next.set('a longer secret');
    component.again.set('a longer secre');
    expect(component.passphraseProblem()).toBe('The two new ones do not match.');

    component.again.set('a longer secret');
    expect(component.passphraseProblem()).toBeNull();
  });

  it('sends nothing while there is a problem with what was typed', async () => {
    const component = await ready();
    component.startPassphrase();
    component.current.set('password123');
    component.next.set('short');

    await component.savePassphrase();

    expect(passphrases).toEqual([]);
  });

  it('changes the passphrase and says what it did to other devices', async () => {
    const component = await ready();
    component.startPassphrase();
    component.current.set('password123');
    component.next.set('a longer secret');
    component.again.set('a longer secret');

    await component.savePassphrase();

    expect(passphrases).toEqual([{ current: 'password123', next: 'a longer secret' }]);
    expect(component.changingPassphrase()).toBe(false);
    expect(toasts[0].message).toContain('signed out');
  });

  it('keeps the boxes open when the server refuses the change', async () => {
    const component = await ready();
    passphraseResult = false;
    component.startPassphrase();
    component.current.set('wrong');
    component.next.set('a longer secret');
    component.again.set('a longer secret');

    await component.savePassphrase();

    expect(component.changingPassphrase()).toBe(true);
    expect(toasts[0].type).toBe('error');
  });

  it('sizes the record in units somebody can read', async () => {
    expect((await ready(install({ record_bytes: 512 }))).recordSize()).toBe('512 B');
    expect((await ready(install({ record_bytes: 2048 }))).recordSize()).toBe('2.0 kB');
    expect((await ready(install({ record_bytes: 2_306_867 }))).recordSize()).toBe('2.2 MB');
    expect((await ready(null)).recordSize()).toBe('—');
  });

  it('says when the record last changed, and when it never has', async () => {
    expect((await ready()).lastChanged()).toContain('2026');
    expect((await ready(install({ record_changed_at: null }))).lastChanged()).toBe(
      'nothing written yet',
    );
  });

  it('says so rather than pretending when a copy cannot be written', async () => {
    const component = await ready();
    exportResult = null;

    await component.writeCopy();

    expect(toasts[0]).toEqual({ message: 'Could not write a copy.', type: 'error' });
  });

  it('warns when a copy came from another Setout or another schema', async () => {
    const component = await ready();
    component.picked.set({ name: 'copy.json', bytes: 2048, backup: backup() });
    expect(component.versionChanged()).toBe(false);
    expect(component.versionWarning()).toBeNull();

    component.picked.set({
      name: 'copy.json',
      bytes: 2048,
      backup: backup({ app_version: '0.2.0' }),
    });
    expect(component.versionChanged()).toBe(true);
    expect(component.versionWarning()).toContain('may fail if the schema has changed');

    component.picked.set({
      name: 'copy.json',
      bytes: 2048,
      backup: backup({ migration: '0001_initial' }),
    });
    expect(component.versionChanged()).toBe(true);
    expect(component.versionWarning()).toContain('0001_initial');
  });

  it('reads the file back over the record, and accepts the version change it warned about', async () => {
    const component = await ready();
    component.picked.set({
      name: 'copy.json',
      bytes: 2048,
      backup: backup({ app_version: '0.2.0' }),
    });

    await component.doRestore();

    expect(restores).toEqual([{ backup: backup({ app_version: '0.2.0' }), accept: true }]);
    expect(component.picked()).toBeNull();
    expect(toasts[0].message).toContain('Sign in with the passphrase');
    expect(went).toEqual([['/login']]);
  });

  it('keeps the file in hand when the server would not take it', async () => {
    const component = await ready();
    restoreResult = null;
    component.picked.set({ name: 'copy.json', bytes: 2048, backup: backup() });

    await component.doRestore();

    expect(component.picked()).not.toBeNull();
    expect(toasts[0].type).toBe('error');
  });

  it('describes the file it is about to read back', async () => {
    const component = await ready();
    component.picked.set({ name: 'copy.json', bytes: 2048, backup: backup() });

    expect(component.pickedLine()).toContain('copy.json');
    expect(component.pickedLine()).toContain('2.0 kB');
    expect(component.pickedRows()).toBe('17 rows across 2 tables');
  });

  it('opens the file picker from the button, so both read the same size', async () => {
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

  it('does nothing when the confirm box is dismissed', async () => {
    const component = await ready();
    component.picked.set({ name: 'copy.json', bytes: 2048, backup: backup() });

    component.cancelRestore();

    expect(component.picked()).toBeNull();
    expect(restores).toEqual([]);
  });

  it('offers every currency the install knows as the one Home opens on', () => {
    const component = render();

    expect(component.currencyChips().map((chip) => chip.value)).toEqual(['NGN', 'USD']);
    expect(component.currencyChips()[0].label).toBe('NGN Nigerian naira');
    expect(component.baseCurrency()).toBe('');
    expect(component.currencyNote()).toContain('whichever currency it finds first');
  });

  it('saves the currency picked and says which one Home now opens on', async () => {
    const component = render();

    await component.pickBaseCurrency('USD');

    expect(bases).toEqual(['USD']);
    expect(toasts.at(-1)).toEqual({ message: 'Home opens on USD.', type: 'info' });
  });

  it('says which currency is settled once one is', () => {
    const component = render(install(), 'Could not save that name.', 'NGN');

    expect(component.baseCurrency()).toBe('NGN');
    expect(component.currencyNote()).toContain('Home opens on NGN');
  });

  it('says so when the currency will not save', async () => {
    const component = render();
    baseResult = false;

    await component.pickBaseCurrency('USD');

    expect(toasts.at(-1)?.type).toBe('error');
  });
});
