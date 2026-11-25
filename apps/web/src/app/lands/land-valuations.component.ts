import { ArchiveConfirmComponent } from '../ui/archive-confirm.component';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { LandRead, LandValuationKind, LandValuationRead } from '@setout/api-client';
import { formatAmountInput, formatMoney, parseMoney } from '../budget/money';
import { ProjectService } from '../projects/project.service';
import { ButtonComponent } from '../ui/button.component';
import { ChipGroupComponent, type Chip } from '../ui/chip-group.component';
import { CurrencyPillComponent, currencySymbol } from '../ui/currency-pill.component';
import { DeleteConfirmDirective, isDeleteConfirmed } from '../ui/delete-confirm.directive';
import { MoneyHintComponent } from '../ui/money-hint.component';
import { LoadTracker } from '../ui/request-status';
import { ToggleComponent } from '../ui/toggle.component';
import { LandService } from './land.service';

@Component({
  selector: 'app-land-valuations',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ArchiveConfirmComponent,
    ButtonComponent,
    ChipGroupComponent,
    CurrencyPillComponent,
    DeleteConfirmDirective,
    MoneyHintComponent,
    ToggleComponent,
  ],
  templateUrl: './land-valuations.component.html',
  styleUrl: './land-valuations.component.scss',
})
export class LandValuationsComponent {
  readonly lands = inject(LandService);
  private readonly projects = inject(ProjectService);

  readonly land = input.required<LandRead>();
  readonly changed = output<void>();

  private readonly tracker = new LoadTracker();
  private loadedLandId = '';

  readonly rows = signal<LandValuationRead[]>([]);
  readonly status = this.tracker.status;
  readonly includeArchived = signal(false);
  readonly pendingDelete = signal<string | null>(null);
  readonly deleteConfirmationText = signal('');
  readonly lastArchived = signal<LandValuationRead | null>(null);
  readonly adding = signal(false);
  readonly editing = signal<string | null>(null);
  readonly editAmount = signal('');
  readonly editValuedOn = signal('');
  readonly editNotes = signal('');
  readonly amount = signal('');
  readonly currency = signal('');
  readonly valuedOn = signal('');
  readonly notes = signal('');
  readonly kind = signal<LandValuationKind>('valuation');

  readonly currencyChips = computed<Chip[]>(() =>
    this.projects.currencies().map((currency) => ({
      value: currency.code,
      label: `${currency.code} ${currency.name}`,
    })),
  );

  readonly landCurrency = computed(() => this.land().currency_code ?? '');

  readonly symbol = computed(() => currencySymbol(this.landCurrency() || this.currency()));

  readonly hasPurchasePrice = computed(() =>
    this.rows().some((row) => row.kind === 'purchase' && !row.archived_at),
  );

  readonly kindChips = computed<Chip[]>(() => {
    const chips: Chip[] = [{ value: 'valuation', label: 'Valuation' }];
    if (!this.hasPurchasePrice()) {
      chips.unshift({ value: 'purchase', label: 'Purchase Price' });
    }
    return chips;
  });

  constructor() {
    void this.projects.loadCurrencies();
    effect(() => {
      const landId = this.land().id;
      if (landId === this.loadedLandId) {
        return;
      }
      this.loadedLandId = landId;
      void this.load();
    });
  }

  archivedLabel(): string {
    return this.includeArchived() ? 'Hide archived' : 'Show archived';
  }

  async setIncludeArchived(on: boolean): Promise<void> {
    this.includeArchived.set(on);
    this.cancelDelete();
    await this.load();
  }

  async load(): Promise<void> {
    const requestId = this.tracker.start(true);
    const rows = await this.lands.valuations(this.land().id, this.includeArchived());
    if (this.tracker.settle(requestId, rows ? 'ready' : 'error') && rows) {
      this.rows.set(rows);
    }
  }

  exponent(): number {
    const code = this.landCurrency() || this.currency();
    return this.projects.currencies().find((c) => c.code === code)?.exponent ?? 2;
  }

  amountLabel(row: LandValuationRead): string {
    return formatMoney(row.amount, row.currency_code, row.currency_exponent);
  }

  /** Percentage change from the previous active entry; valid because all entries share one currency. */
  percentChange(index: number): string {
    const rows = this.rows();
    const current = rows[index];
    if (!current || current.archived_at) {
      return '';
    }
    const previous = rows.slice(index + 1).find((row) => !row.archived_at);
    if (!previous || previous.amount === 0) {
      return '';
    }
    const percent = ((current.amount - previous.amount) / previous.amount) * 100;
    const rounded = Math.round(percent * 10) / 10;
    return `${rounded > 0 ? '+' : ''}${rounded}%`;
  }

  label(row: LandValuationRead): string {
    return row.kind === 'purchase' ? 'Purchase Price' : 'Valuation';
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  open(): void {
    this.adding.set(true);
    this.kind.set(this.hasPurchasePrice() ? 'valuation' : 'purchase');
    this.currency.set(this.landCurrency());
    this.amount.set('');
    this.notes.set('');
    this.valuedOn.set('');
  }

  cancel(): void {
    this.adding.set(false);
  }

  startEdit(row: LandValuationRead): void {
    this.adding.set(false);
    this.editing.set(row.id);
    this.editAmount.set(formatAmountInput(row.amount, row.currency_exponent));
    this.editValuedOn.set(row.valued_on);
    this.editNotes.set(row.notes ?? '');
  }

  cancelEdit(): void {
    this.editing.set(null);
  }

  canSaveEdit(row: LandValuationRead): boolean {
    return (
      this.editValuedOn().length > 0 &&
      parseMoney(this.editAmount(), row.currency_exponent) !== null
    );
  }

  async saveEdit(row: LandValuationRead): Promise<void> {
    if (!this.canSaveEdit(row)) {
      return;
    }
    const minor = parseMoney(this.editAmount(), row.currency_exponent);
    if (minor === null) {
      return;
    }
    const saved = await this.lands.editValuation(row.id, {
      amount: minor,
      valued_on: this.editValuedOn(),
      notes: this.editNotes().trim() || null,
    });
    if (saved) {
      this.editing.set(null);
      await this.load();
      this.changed.emit();
    }
  }

  isValid(): boolean {
    const code = this.landCurrency() || this.currency();
    return (
      code.length > 0 &&
      this.valuedOn().length > 0 &&
      parseMoney(this.amount(), this.exponent()) !== null
    );
  }

  async save(): Promise<void> {
    if (!this.isValid()) {
      return;
    }
    // The exponent depends on the currency selected at save time.
    const minor = parseMoney(this.amount(), this.exponent());
    if (minor === null) {
      return;
    }
    const saved = await this.lands.createValuation(this.land().id, {
      kind: this.kind(),
      amount: minor,
      currency_code: this.landCurrency() || this.currency(),
      valued_on: this.valuedOn(),
      notes: this.notes().trim() || null,
    });
    if (saved) {
      this.adding.set(false);
      await this.load();
      this.changed.emit();
    }
  }

  async archive(row: LandValuationRead): Promise<void> {
    await this.lands.archiveValuation(row.id);
    this.lastArchived.set(row);
    await this.load();
    this.changed.emit();
  }

  async restore(row: LandValuationRead): Promise<void> {
    await this.lands.restoreValuation(row.id);
    if (this.lastArchived()?.id === row.id) {
      this.lastArchived.set(null);
    }
    await this.load();
    this.changed.emit();
  }

  async restoreLastArchived(): Promise<void> {
    const archived = this.lastArchived();
    if (!archived) {
      return;
    }
    await this.restore(archived);
  }

  requestDelete(id: string): void {
    this.pendingDelete.set(id);
    this.deleteConfirmationText.set('');
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
    this.deleteConfirmationText.set('');
  }

  canConfirmDelete(): boolean {
    return isDeleteConfirmed(this.deleteConfirmationText());
  }

  async deletePermanently(row: LandValuationRead): Promise<void> {
    if (!this.canConfirmDelete()) {
      return;
    }
    await this.lands.deleteValuation(row.id);
    this.cancelDelete();
    await this.load();
    this.changed.emit();
  }
}
