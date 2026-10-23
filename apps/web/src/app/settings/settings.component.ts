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
  readonly installService = inject(InstallService);
  readonly projects = inject(ProjectService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly notSet = '—';

  readonly name = signal('');
  readonly savingName = signal(false);

  readonly changingPassphrase = signal(false);
  readonly currentPassphrase = signal('');
  readonly newPassphrase = signal('');
  readonly confirmPassphrase = signal('');
  readonly savingPassphrase = signal(false);

  readonly savingCurrency = signal(false);

  readonly selectedBackup = signal<{ name: string; bytes: number; backup: Backup } | null>(null);
  readonly readingFile = signal(false);

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('file');

  readonly appearanceChips: Chip[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  readonly appearanceNote = computed(() => {
    if (this.theme.followsSystem()) {
      return `Theme follows the system setting, currently ${this.theme.theme()}.`;
    }
    return `Theme set to ${this.theme.choice()} on this device.`;
  });

  readonly versionChanged = computed(() => {
    const selected = this.selectedBackup();
    const installed = this.installService.install();
    if (!selected || !installed) {
      return false;
    }
    return (
      selected.backup.app_version !== installed.version ||
      selected.backup.migration !== installed.migration
    );
  });

  readonly versionWarning = computed(() => {
    const selected = this.selectedBackup();
    const installed = this.installService.install();
    if (!selected || !installed || !this.versionChanged()) {
      return null;
    }
    return (
      `This backup was created by Setout ${selected.backup.app_version} on schema ` +
      `${selected.backup.migration ?? 'unknown'}. This server runs ${installed.version} on schema ` +
      `${installed.migration ?? 'unknown'}. Restoring may fail if the schema has changed. ` +
      'No data is changed unless every row is restored.'
    );
  });

  readonly nameChanged = computed(() => {
    const current = this.auth.user()?.name ?? '';
    return this.name().trim() !== current && this.name().trim().length > 0;
  });

  readonly passphraseError = computed(() => {
    if (!this.currentPassphrase()) {
      return 'Enter the current passphrase.';
    }
    if (this.newPassphrase().length < 8) {
      return 'The new passphrase must be at least eight characters.';
    }
    if (this.newPassphrase() !== this.confirmPassphrase()) {
      return 'The new passphrases do not match.';
    }
    return null;
  });

  readonly defaultCurrency = computed(() => this.auth.user()?.base_currency ?? '');

  readonly currencyChips = computed<Chip[]>(() =>
    this.projects.currencies().map((currency) => ({
      value: currency.code,
      label: `${currency.code} ${currency.name}`,
    })),
  );

  readonly currencyNote = computed(() => {
    const code = this.defaultCurrency();
    if (!code) {
      return 'Home shows the first currency found. Select a default currency.';
    }
    return `Home shows ${code}. Projects in other currencies are totalled separately.`;
  });

  constructor() {
    queueMicrotask(() => {
      this.name.set(this.auth.user()?.name ?? '');
      void this.installService.load();
      void this.projects.loadCurrencies();
    });
  }

  async selectDefaultCurrency(code: string): Promise<void> {
    this.savingCurrency.set(true);
    const done = await this.auth.setBaseCurrency(code);
    this.savingCurrency.set(false);
    this.toast.show(
      done ? `Home shows ${code}.` : (this.auth.error() ?? 'Could not save the default currency.'),
      done ? 'info' : 'error',
    );
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  selectAppearance(choice: string): void {
    this.theme.choose(choice as ThemeChoice);
  }

  dataSize(): string {
    const size = this.installService.install()?.data_bytes;
    return size === undefined ? this.notSet : this.formatBytes(size);
  }

  lastChanged(): string {
    const at = this.installService.install()?.data_changed_at;
    if (!at) {
      return 'no changes yet';
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
      this.toast.show(this.auth.error() ?? 'Could not save the account name.', 'error');
      return;
    }
    this.toast.show('Account name saved.');
  }

  startPassphrase(): void {
    this.changingPassphrase.set(true);
    this.currentPassphrase.set('');
    this.newPassphrase.set('');
    this.confirmPassphrase.set('');
  }

  cancelPassphrase(): void {
    this.changingPassphrase.set(false);
  }

  async savePassphrase(): Promise<void> {
    if (this.passphraseError()) {
      return;
    }
    this.savingPassphrase.set(true);
    const done = await this.auth.changePassphrase(this.currentPassphrase(), this.newPassphrase());
    this.savingPassphrase.set(false);
    if (!done) {
      this.toast.show(this.auth.error() ?? 'Could not change the passphrase.', 'error');
      return;
    }
    this.changingPassphrase.set(false);
    this.toast.show('Passphrase changed. All other devices have been signed out.');
  }

  async downloadBackup(): Promise<void> {
    const backup = await this.installService.export();
    if (!backup) {
      this.toast.show(this.installService.error() ?? 'Could not create the backup.', 'error');
      return;
    }
    this.downloadFile(JSON.stringify(backup, null, 2), this.backupFileName(backup));
    this.toast.show('Backup downloaded. Store it on a different machine as well.');
  }

  chooseFile(): void {
    this.fileInput()?.nativeElement.click();
  }

  async readSelectedFile(event: Event): Promise<void> {
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
        this.toast.show('This file is not a Setout backup.', 'error');
        return;
      }
      this.selectedBackup.set({ name: file.name, bytes: file.size, backup });
    } catch {
      this.toast.show('Could not read the file as a Setout backup.', 'error');
    } finally {
      this.readingFile.set(false);
    }
  }

  cancelRestore(): void {
    this.selectedBackup.set(null);
  }

  selectedBackupSummary(): string {
    const selected = this.selectedBackup();
    if (!selected) {
      return '';
    }
    return `${selected.name} · ${this.formatBytes(selected.bytes)} · created ${this.formatDate(selected.backup.exported_at)}`;
  }

  selectedBackupRowCount(): string {
    const counts = this.selectedBackup()?.backup.row_counts ?? {};
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return `${total} ${total === 1 ? 'row' : 'rows'} across ${Object.keys(counts).length} tables`;
  }

  async restoreBackup(): Promise<void> {
    const selected = this.selectedBackup();
    if (!selected) {
      return;
    }
    const done = await this.installService.restore(selected.backup, this.versionChanged());
    if (!done) {
      this.toast.show(this.installService.error() ?? 'Could not restore the backup.', 'error');
      return;
    }
    this.selectedBackup.set(null);
    this.toast.show('Data restored. Sign in with the passphrase from the backup.');
    await this.auth.checkStatus();
    await this.router.navigate(['/login']);
  }

  private downloadFile(body: string, name: string): void {
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  private backupFileName(backup: Backup): string {
    const stamp = backup.exported_at.replace(/[-:]/g, '').slice(0, 15);
    return `setout-${stamp}Z-v${backup.app_version}.json`;
  }

  private formatBytes(size: number): string {
    if (size < 1024) {
      return `${size} B`;
    }
    const units = ['KiB', 'MiB', 'GiB'];
    let value = size / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(1)} ${units[unit]}`;
  }

  private formatDate(at: string): string {
    return new Date(at).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
