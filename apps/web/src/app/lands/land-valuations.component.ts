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
import { formatMoney, parseMoney } from '../budget/money';
import { ProjectService } from '../projects/project.service';
import { ButtonComponent } from '../ui/button.component';
import { ChipGroupComponent, type Chip } from '../ui/chip-group.component';
import { CurrencyPillComponent, currencySymbol } from '../ui/currency-pill.component';
import { LandService } from './land.service';

@Component({
  selector: 'app-land-valuations',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ChipGroupComponent, CurrencyPillComponent],
  templateUrl: './land-valuations.component.html',
  styleUrl: './land-valuations.component.scss',
})
export class LandValuationsComponent {
  readonly lands = inject(LandService);
  private readonly projects = inject(ProjectService);

  readonly land = input.required<LandRead>();
  readonly changed = output<void>();

  readonly rows = signal<LandValuationRead[]>([]);
  readonly lastArchived = signal<LandValuationRead | null>(null);
  readonly adding = signal(false);
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

  readonly hasPurchasePrice = computed(() => this.rows().some((row) => row.kind === 'purchase'));

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
      this.land();
      void this.load();
    });
  }

  async load(): Promise<void> {
    this.rows.set(await this.lands.valuations(this.land().id));
  }

  exponent(): number {
    const code = this.landCurrency() || this.currency();
    return this.projects.currencies().find((c) => c.code === code)?.exponent ?? 2;
  }

  amountLabel(row: LandValuationRead): string {
    return formatMoney(row.amount, row.currency_code, row.currency_exponent);
  }

  /** Percentage change from the previous entry; valid because all entries share one currency. */
  percentChange(index: number): string {
    const rows = this.rows();
    const previous = rows[index + 1];
    if (!previous || previous.amount === 0) {
      return '';
    }
    const percent = ((rows[index].amount - previous.amount) / previous.amount) * 100;
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

  async restoreLastArchived(): Promise<void> {
    const archived = this.lastArchived();
    if (!archived) {
      return;
    }
    await this.lands.restoreValuation(archived.id);
    this.lastArchived.set(null);
    await this.load();
    this.changed.emit();
  }
}
