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
  readonly adding = signal(false);
  readonly amount = signal('');
  readonly currency = signal('');
  readonly valuedOn = signal('');
  readonly note = signal('');
  readonly kind = signal<LandValuationKind>('valuation');

  readonly currencyChips = computed<Chip[]>(() =>
    this.projects.currencies().map((currency) => ({
      value: currency.code,
      label: `${currency.code} ${currency.name}`,
    })),
  );

  readonly pinned = computed(() => this.land().currency_code ?? '');

  readonly symbol = computed(() => currencySymbol(this.pinned() || this.currency()));

  readonly bought = computed(() => this.rows().some((row) => row.kind === 'purchase'));

  readonly kindChips = computed<Chip[]>(() => {
    const chips: Chip[] = [{ value: 'valuation', label: 'Valued at' }];
    if (!this.bought()) {
      chips.unshift({ value: 'purchase', label: 'Bought for' });
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
    const code = this.pinned() || this.currency();
    return this.projects.currencies().find((c) => c.code === code)?.exponent ?? 2;
  }

  money(row: LandValuationRead): string {
    return formatMoney(row.amount, row.currency_code, row.currency_exponent);
  }

  /** What it moved by since the entry before it, which only reads because the currency is fixed. */
  change(index: number): string {
    const rows = this.rows();
    const older = rows[index + 1];
    if (!older || older.amount === 0) {
      return '';
    }
    const shift = ((rows[index].amount - older.amount) / older.amount) * 100;
    const rounded = Math.round(shift * 10) / 10;
    return `${rounded > 0 ? '+' : ''}${rounded}%`;
  }

  label(row: LandValuationRead): string {
    return row.kind === 'purchase' ? 'Bought for' : 'Valued at';
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  open(): void {
    this.adding.set(true);
    this.kind.set(this.bought() ? 'valuation' : 'purchase');
    this.currency.set(this.pinned());
    this.amount.set('');
    this.note.set('');
    this.valuedOn.set('');
  }

  cancel(): void {
    this.adding.set(false);
  }

  isValid(): boolean {
    const code = this.pinned() || this.currency();
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
    // Read the exponent now: it belongs to the currency picked at this moment.
    const minor = parseMoney(this.amount(), this.exponent());
    if (minor === null) {
      return;
    }
    const saved = await this.lands.addValuation(this.land().id, {
      kind: this.kind(),
      amount: minor,
      currency_code: this.pinned() || this.currency(),
      valued_on: this.valuedOn(),
      note: this.note().trim() || null,
    });
    if (saved) {
      this.adding.set(false);
      await this.load();
      this.changed.emit();
    }
  }

  async remove(row: LandValuationRead): Promise<void> {
    await this.lands.removeValuation(row.id);
    await this.load();
    this.changed.emit();
  }
}
