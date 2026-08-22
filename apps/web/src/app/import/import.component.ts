import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import type { Decision, ImportReport, ImportResult, SampleRow } from '@setout/api-client';
import { formatMoney } from '../budget/money';
import { ProjectService } from '../projects/project.service';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { Chip, ChipGroupComponent } from '../ui/chip-group.component';
import { TopbarComponent } from '../ui/topbar.component';
import { ImportService } from './import.service';

interface Step {
  key: string;
  label: string;
}

@Component({
  selector: 'app-import',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ChipGroupComponent, TopbarComponent],
  templateUrl: './import.component.html',
  styleUrl: './import.component.scss',
})
export class ImportComponent {
  readonly project = input('');

  readonly projects = inject(ProjectService);
  readonly sheets = inject(ImportService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  private readonly picker = viewChild.required<ElementRef<HTMLInputElement>>('sheet');

  readonly steps: Step[] = [
    { key: 'file', label: 'The file' },
    { key: 'review', label: 'Review' },
    { key: 'done', label: 'Done' },
  ];

  readonly step = signal('file');
  readonly file = signal<File | null>(null);
  readonly projectId = signal('');
  readonly name = signal('');
  readonly currencyCode = signal('NGN');
  readonly report = signal<ImportReport | null>(null);
  readonly result = signal<ImportResult | null>(null);

  readonly createMissingScopes = signal(true);
  readonly skipDuplicates = signal(true);
  readonly takeUnpaid = signal(true);
  readonly severalCodes = signal('first');

  readonly intoNew = computed(() => this.projectId() === '');

  readonly targetName = computed(() => {
    const chosen = this.projects.projects().find((p) => p.id === this.projectId());
    return chosen ? chosen.name : this.name();
  });

  readonly blocking = computed(
    () => this.report()?.decisions.some((decision) => decision.blocking) ?? false,
  );

  readonly canRead = computed(() => {
    if (!this.file()) {
      return false;
    }
    return this.intoNew() ? this.name().trim().length > 0 : true;
  });

  constructor() {
    queueMicrotask(() => {
      void this.projects.load();
      void this.projects.loadCurrencies();
    });
    effect(() => {
      const asked = this.project();
      if (asked) {
        this.projectId.set(asked);
      }
    });
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  at(key: string): boolean {
    return this.step() === key;
  }

  reached(key: string): boolean {
    const order = this.steps.findIndex((step) => step.key === key);
    return order <= this.steps.findIndex((step) => step.key === this.step());
  }

  readonly samples = [
    { kind: 'blank', name: 'Blank workbook', detail: 'Every sheet, headings only, ready to fill' },
    { kind: 'example', name: 'Filled example', detail: 'The same shape with rows to copy' },
    { kind: 'budget-csv', name: 'Budget as a CSV', detail: 'One sheet, for a plan on its own' },
    {
      kind: 'spending-csv',
      name: 'Spending as a CSV',
      detail: 'One sheet, for invoices on their own',
    },
  ];

  sampleUrl(kind: string): string {
    return this.sheets.sampleUrl(kind);
  }

  pick(): void {
    this.picker().nativeElement.click();
  }

  onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const chosen = input.files?.[0] ?? null;
    if (!chosen) {
      return;
    }
    input.value = '';
    this.file.set(chosen);
    this.report.set(null);
  }

  clearFile(): void {
    this.file.set(null);
    this.report.set(null);
  }

  fileNote(): string {
    const chosen = this.file();
    if (!chosen) {
      return '';
    }
    const size =
      chosen.size < 1024 * 1024
        ? `${Math.round(chosen.size / 1024)} KB`
        : `${(chosen.size / (1024 * 1024)).toFixed(1)} MB`;
    return `${size} · read where Setout runs, never sent anywhere else`;
  }

  money(minor: number): string {
    const report = this.report();
    if (!report) {
      return String(minor);
    }
    return formatMoney(minor, report.currency_code, report.currency_exponent);
  }

  sheetNote(holds: string, rows: number): string {
    const what = rows === 1 ? 'row' : 'rows';
    return `${rows} ${what} of ${holds}`;
  }

  scopeMatch(matchedTo: string | null | undefined): string {
    return matchedTo ? `into ${matchedTo}` : 'new scope';
  }

  sampleDay(row: SampleRow): string {
    if (!row.spent_on) {
      return 'no date';
    }
    return new Date(row.spent_on).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  choicesFor(decision: Decision): Chip[] {
    switch (decision.kind) {
      case 'new_scopes':
        return [
          { value: 'yes', label: 'Create them' },
          { value: 'no', label: 'Leave them out' },
        ];
      case 'duplicates':
        return [
          { value: 'yes', label: 'Skip them' },
          { value: 'no', label: 'Bring them in again' },
        ];
      case 'unpaid':
        return [
          { value: 'yes', label: 'Bring them in' },
          { value: 'no', label: 'Leave them out' },
        ];
      case 'several_codes':
        return [
          { value: 'first', label: 'File under the first' },
          { value: 'unfiled', label: 'Leave unfiled' },
        ];
      default:
        return [];
    }
  }

  answerFor(decision: Decision): string {
    switch (decision.kind) {
      case 'new_scopes':
        return this.createMissingScopes() ? 'yes' : 'no';
      case 'duplicates':
        return this.skipDuplicates() ? 'yes' : 'no';
      case 'unpaid':
        return this.takeUnpaid() ? 'yes' : 'no';
      case 'several_codes':
        return this.severalCodes();
      default:
        return '';
    }
  }

  answer(decision: Decision, chosen: string): void {
    switch (decision.kind) {
      case 'new_scopes':
        this.createMissingScopes.set(chosen === 'yes');
        break;
      case 'duplicates':
        this.skipDuplicates.set(chosen === 'yes');
        break;
      case 'unpaid':
        this.takeUnpaid.set(chosen === 'yes');
        break;
      case 'several_codes':
        this.severalCodes.set(chosen);
        break;
    }
  }

  hasAnswer(decision: Decision): boolean {
    return this.choicesFor(decision).length > 0;
  }

  consequenceFor(decision: Decision): string {
    switch (decision.kind) {
      case 'new_scopes':
        return this.createMissingScopes()
          ? 'The plan comes in against these scopes.'
          : 'No budget is written at all, and the spending arrives unfiled.';
      case 'duplicates':
        return this.skipDuplicates()
          ? 'Left alone, so the spend is not doubled.'
          : 'Filed a second time, doubling the spend.';
      case 'unpaid':
        return this.takeUnpaid()
          ? 'Counted as spent, since the invoice exists.'
          : 'Left out until they are paid.';
      case 'several_codes':
        return this.severalCodes() === 'first'
          ? 'One amount cannot be split, so it lands under the first code named.'
          : 'Left against no scope, to be filed by hand.';
      default:
        return '';
    }
  }

  async read(): Promise<void> {
    const chosen = this.file();
    if (!chosen || !this.canRead()) {
      return;
    }
    const found = await this.sheets.look(chosen, this.target());
    if (!found) {
      this.toast.show(this.sheets.error() ?? 'That file could not be read.', 'error');
      return;
    }
    this.report.set(found);
    this.step.set('review');
  }

  back(): void {
    this.step.set('file');
  }

  async bringIn(): Promise<void> {
    const chosen = this.file();
    if (!chosen) {
      return;
    }
    const done = await this.sheets.bringIn(chosen, this.target(), {
      createMissingScopes: this.createMissingScopes(),
      skipDuplicates: this.skipDuplicates(),
      takeUnpaid: this.takeUnpaid(),
      severalCodes: this.severalCodes(),
    });
    if (!done) {
      this.toast.show(this.sheets.error() ?? 'Nothing was brought in.', 'error');
      return;
    }
    this.result.set(done);
    this.step.set('done');
    await this.projects.load();
    this.toast.show(`${done.project_name} has the sheet in it.`);
  }

  openProject(): void {
    const done = this.result();
    if (done) {
      void this.router.navigate(['/projects', done.project_id]);
    }
  }

  leave(): void {
    void this.router.navigate(['/projects']);
  }

  private target(): { projectId: string | null; name: string; currencyCode: string } {
    return {
      projectId: this.projectId() || null,
      name: this.name().trim(),
      currencyCode: this.currencyCode(),
    };
  }
}
