import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import type { ChangeField, ChangeRead } from '@setout/api-client';
import { toMajor } from '../budget/money';
import { ChangeService, ChangeTarget } from './change.service';
import { ACTION_LABELS, MONEY_FIELDS, entityNoun, fieldLabel } from './labels';

const WHEN = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export interface ChangeLine {
  label: string;
  before: string | null;
  after: string | null;
}

@Component({
  selector: 'app-change-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './change-history.component.html',
  styleUrl: './change-history.component.scss',
})
export class ChangeHistoryComponent {
  readonly target = input.required<ChangeTarget>();
  readonly exponent = input(2);

  readonly changes = inject(ChangeService);

  readonly list = computed(() => this.changes.forTarget(this.target()));
  readonly showsRecord = computed(() => 'projectId' in this.target());
  readonly hasMore = computed(() => this.list().rows.length < this.list().total);

  constructor() {
    effect(() => {
      const target = this.target();
      untracked(() => void this.changes.load(target));
    });
  }

  loadMore(): void {
    void this.changes.loadMore(this.target());
  }

  action(change: ChangeRead): string {
    return ACTION_LABELS[change.action] ?? change.action;
  }

  record(change: ChangeRead): string {
    const noun = entityNoun(change.entity);
    return change.entity_name ? `${noun}: ${change.entity_name}` : noun;
  }

  who(change: ChangeRead): string {
    return change.user_name ?? 'Setout';
  }

  when(change: ChangeRead): string {
    return WHEN.format(new Date(change.created_at));
  }

  lines(change: ChangeRead): ChangeLine[] {
    if (change.action === 'archive' || change.action === 'restore') {
      return [];
    }
    return change.fields
      .filter((field) => field.name !== 'archived_at')
      .map((field) => ({
        label: fieldLabel(field.name),
        before: change.action === 'update' ? this.shown(field, field.before) : null,
        after:
          change.action === 'delete'
            ? this.shown(field, field.before)
            : this.shown(field, field.after),
      }));
  }

  valueText(line: ChangeLine): string {
    return line.before === null ? (line.after ?? '') : `${line.before} → ${line.after}`;
  }

  private shown(field: ChangeField, value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return 'Not set';
    }
    if (MONEY_FIELDS.has(field.name) && typeof value === 'number') {
      const digits = this.exponent();
      return new Intl.NumberFormat('en', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(toMajor(value, digits));
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      return WHEN.format(new Date(`${value}Z`));
    }
    return String(value);
  }
}
