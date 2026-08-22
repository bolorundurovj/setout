import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import type { Backup } from '@setout/api-client';
import { AuthService } from '../auth/auth.service';
import { ProjectService } from '../projects/project.service';
import { ThemeService, type ThemeChoice } from '../theme.service';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { Chip, ChipGroupComponent } from '../ui/chip-group.component';
import { TopbarComponent } from '../ui/topbar.component';
import { InstallService } from './install.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ChipGroupComponent, TopbarComponent],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly server = inject(InstallService);
  readonly projects = inject(ProjectService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly notSet = '—';

  readonly name = signal('');
  readonly savingName = signal(false);

  readonly changingPassphrase = signal(false);
  readonly current = signal('');
  readonly next = signal('');
  readonly again = signal('');
  readonly savingPassphrase = signal(false);

  readonly savingCurrency = signal(false);

  readonly picked = signal<{ name: string; bytes: number; backup: Backup } | null>(null);
  readonly readingFile = signal(false);

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('file');

  readonly appearanceChips: Chip[] = [
    { value: 'system', label: 'Follow device' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  readonly appearanceNote = computed(() => {
    if (this.theme.followsDevice()) {
      return `Following the device, which is asking for ${this.theme.theme()} at the moment.`;
    }
    return `Held at ${this.theme.choice()} on this device, whatever the device asks for.`;
  });

  readonly versionChanged = computed(() => {
    const chosen = this.picked();
    const here = this.server.install();
    if (!chosen || !here) {
      return false;
    }
    return chosen.backup.app_version !== here.version || chosen.backup.migration !== here.migration;
  });

  readonly versionWarning = computed(() => {
    const chosen = this.picked();
    const here = this.server.install();
    if (!chosen || !here || !this.versionChanged()) {
      return null;
    }
    return (
      `That copy was written by Setout ${chosen.backup.app_version} on schema ` +
      `${chosen.backup.migration ?? 'unknown'}. This server is ${here.version} on ` +
      `${here.migration ?? 'unknown'}. Restoring may fail if the schema has changed. ` +
      'Nothing is written unless every row fits.'
    );
  });

  readonly nameChanged = computed(() => {
    const current = this.auth.user()?.name ?? '';
    return this.name().trim() !== current && this.name().trim().length > 0;
  });

  readonly passphraseProblem = computed(() => {
    if (!this.current()) {
      return 'The passphrase in use is needed first.';
    }
    if (this.next().length < 8) {
      return 'A new passphrase runs to at least eight characters.';
    }
    if (this.next() !== this.again()) {
      return 'The two new ones do not match.';
    }
    return null;
  });

  readonly baseCurrency = computed(() => this.auth.user()?.base_currency ?? '');

  readonly currencyChips = computed<Chip[]>(() =>
    this.projects.currencies().map((currency) => ({
      value: currency.code,
      label: `${currency.code} ${currency.name}`,
    })),
  );

  readonly currencyNote = computed(() => {
    const code = this.baseCurrency();
    if (!code) {
      return 'Home opens on whichever currency it finds first. Pick one to settle it.';
    }
    return `Home opens on ${code}. Projects kept in another currency are still read on their own.`;
  });

  constructor() {
    queueMicrotask(() => {
      this.name.set(this.auth.user()?.name ?? '');
      void this.server.load();
      void this.projects.loadCurrencies();
    });
  }

  async pickBaseCurrency(code: string): Promise<void> {
    this.savingCurrency.set(true);
    const done = await this.auth.setBaseCurrency(code);
    this.savingCurrency.set(false);
    this.toast.show(
      done ? `Home opens on ${code}.` : (this.auth.error() ?? 'Could not save that currency.'),
      done ? 'info' : 'error',
    );
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  pickAppearance(choice: string): void {
    this.theme.choose(choice as ThemeChoice);
  }

  recordSize(): string {
    const size = this.server.install()?.record_bytes;
    return size === undefined ? this.notSet : this.bytes(size);
  }

  lastChanged(): string {
    const at = this.server.install()?.record_changed_at;
    if (!at) {
      return 'nothing written yet';
    }
    return new Date(at).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  async saveName(): Promise<void> {
    this.savingName.set(true);
    const done = await this.auth.rename(this.name().trim());
    this.savingName.set(false);
    if (!done) {
      this.toast.show(this.auth.error() ?? 'Could not save that name.', 'error');
      return;
    }
    this.toast.show('Account name saved.');
  }

  startPassphrase(): void {
    this.changingPassphrase.set(true);
    this.current.set('');
    this.next.set('');
    this.again.set('');
  }

  cancelPassphrase(): void {
    this.changingPassphrase.set(false);
  }

  async savePassphrase(): Promise<void> {
    if (this.passphraseProblem()) {
      return;
    }
    this.savingPassphrase.set(true);
    const done = await this.auth.changePassphrase(this.current(), this.next());
    this.savingPassphrase.set(false);
    if (!done) {
      this.toast.show(this.auth.error() ?? 'Could not change the passphrase.', 'error');
      return;
    }
    this.changingPassphrase.set(false);
    this.toast.show('Passphrase changed. Every other device has been signed out.');
  }

  async writeCopy(): Promise<void> {
    const backup = await this.server.export();
    if (!backup) {
      this.toast.show(this.server.error() ?? 'Could not write a copy.', 'error');
      return;
    }
    this.save(JSON.stringify(backup, null, 2), this.archiveName(backup));
    this.toast.show('Copy written. Keep one off this machine as well.');
  }

  chooseFile(): void {
    this.fileInput()?.nativeElement.click();
  }

  async pickFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    this.readingFile.set(true);
    try {
      const backup = JSON.parse(await file.text()) as Backup;
      if (typeof backup?.format !== 'number' || !backup?.tables) {
        this.toast.show('That is not a Setout copy.', 'error');
        return;
      }
      this.picked.set({ name: file.name, bytes: file.size, backup });
    } catch {
      this.toast.show('That file could not be read as a Setout copy.', 'error');
    } finally {
      this.readingFile.set(false);
    }
  }

  cancelRestore(): void {
    this.picked.set(null);
  }

  pickedLine(): string {
    const chosen = this.picked();
    if (!chosen) {
      return '';
    }
    return `${chosen.name} · ${this.bytes(chosen.bytes)} · written ${this.day(chosen.backup.exported_at)}`;
  }

  pickedRows(): string {
    const counts = this.picked()?.backup.row_counts ?? {};
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return `${total} ${total === 1 ? 'row' : 'rows'} across ${Object.keys(counts).length} tables`;
  }

  async doRestore(): Promise<void> {
    const chosen = this.picked();
    if (!chosen) {
      return;
    }
    const done = await this.server.restore(chosen.backup, this.versionChanged());
    if (!done) {
      this.toast.show(this.server.error() ?? 'Could not read that file back.', 'error');
      return;
    }
    this.picked.set(null);
    this.toast.show('Record replaced. Sign in with the passphrase from that copy.');
    await this.auth.checkStatus();
    await this.router.navigate(['/login']);
  }

  private save(body: string, name: string): void {
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  private archiveName(backup: Backup): string {
    const stamp = backup.exported_at.replace(/[-:]/g, '').slice(0, 15);
    return `setout-${stamp}Z-v${backup.app_version}.json`;
  }

  private bytes(size: number): string {
    if (size < 1024) {
      return `${size} B`;
    }
    const units = ['kB', 'MB', 'GB'];
    let value = size / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(1)} ${units[unit]}`;
  }

  private day(at: string): string {
    return new Date(at).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
