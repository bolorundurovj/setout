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
import { ImportService, type ImportTarget } from './import.service';

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
  readonly importer = inject(ImportService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  readonly steps: Step[] = [
    { key: 'file', label: 'File' },
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

  readonly createMissingCategories = signal(true);
  readonly skipDuplicates = signal(true);
  readonly includeUnpaid = signal(true);
  readonly multipleCodes = signal('first');

  readonly isNewProject = computed(() => this.projectId() === '');

  readonly targetName = computed(() => {
    const selected = this.projects.projects().find((p) => p.id === this.projectId());
    return selected ? selected.name : this.name();
  });

  readonly blocking = computed(
    () => this.report()?.decisions.some((decision) => decision.blocking) ?? false,
  );

  readonly canPreview = computed(() => {
    if (!this.file()) {
      return false;
    }
    return this.isNewProject() ? this.name().trim().length > 0 : true;
  });

  constructor() {
    queueMicrotask(() => {
      void this.projects.load();
      void this.projects.loadCurrencies();
    });
    effect(() => {
      const projectId = this.project();
      if (projectId) {
        this.projectId.set(projectId);
      }
    });
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  isStep(key: string): boolean {
    return this.step() === key;
  }

  reached(key: string): boolean {
    const order = this.steps.findIndex((step) => step.key === key);
    return order <= this.steps.findIndex((step) => step.key === this.step());
  }

  readonly templates = [
    { kind: 'blank', name: 'Blank workbook', detail: 'All sheets, with headings only' },
    { kind: 'example', name: 'Filled example', detail: 'The same layout with example rows' },
    { kind: 'budget-csv', name: 'Budget as a CSV', detail: 'A single sheet for a budget only' },
    {
      kind: 'spending-csv',
      name: 'Expenses as a CSV',
      detail: 'A single sheet for expenses only',
    },
  ];

  templateUrl(kind: string): string {
    return this.importer.templateUrl(kind);
  }

  openFilePicker(): void {
    this.fileInput().nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0] ?? null;
    if (!selected) {
      return;
    }
    input.value = '';
    this.file.set(selected);
    this.report.set(null);
  }

  clearFile(): void {
    this.file.set(null);
    this.report.set(null);
  }

  fileNote(): string {
    const file = this.file();
    if (!file) {
      return '';
    }
    const size =
      file.size < 1024 * 1024
        ? `${Math.round(file.size / 1024)} KiB`
        : `${(file.size / (1024 * 1024)).toFixed(1)} MiB`;
    return `${size} · read by your Setout server only`;
  }

  money(minor: number): string {
    const report = this.report();
    if (!report) {
      return String(minor);
    }
    return formatMoney(minor, report.currency_code, report.currency_exponent);
  }

  sheetNote(content: string, rows: number): string {
    const noun = rows === 1 ? 'row' : 'rows';
    return `${rows} ${noun} of ${content}`;
  }

  categoryMatch(matchedTo: string | null | undefined): string {
    return matchedTo ? `matches ${matchedTo}` : 'new category';
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
      case 'new_categories':
        return [
          { value: 'yes', label: 'Create them' },
          { value: 'no', label: 'Exclude them' },
        ];
      case 'duplicates':
        return [
          { value: 'yes', label: 'Skip them' },
          { value: 'no', label: 'Import them again' },
        ];
      case 'unpaid':
        return [
          { value: 'yes', label: 'Import them' },
          { value: 'no', label: 'Exclude them' },
        ];
      case 'several_codes':
        return [
          { value: 'first', label: 'Assign to the first code' },
          { value: 'uncategorised', label: 'Leave uncategorised' },
        ];
      default:
        return [];
    }
  }

  answerFor(decision: Decision): string {
    switch (decision.kind) {
      case 'new_categories':
        return this.createMissingCategories() ? 'yes' : 'no';
      case 'duplicates':
        return this.skipDuplicates() ? 'yes' : 'no';
      case 'unpaid':
        return this.includeUnpaid() ? 'yes' : 'no';
      case 'several_codes':
        return this.multipleCodes();
      default:
        return '';
    }
  }

  answer(decision: Decision, selected: string): void {
    switch (decision.kind) {
      case 'new_categories':
        this.createMissingCategories.set(selected === 'yes');
        break;
      case 'duplicates':
        this.skipDuplicates.set(selected === 'yes');
        break;
      case 'unpaid':
        this.includeUnpaid.set(selected === 'yes');
        break;
      case 'several_codes':
        this.multipleCodes.set(selected);
        break;
    }
  }

  hasAnswer(decision: Decision): boolean {
    return this.choicesFor(decision).length > 0;
  }

  consequenceFor(decision: Decision): string {
    switch (decision.kind) {
      case 'new_categories':
        return this.createMissingCategories()
          ? 'The budget is imported against these categories.'
          : 'No budget is imported, and the expenses are uncategorised.';
      case 'duplicates':
        return this.skipDuplicates()
          ? 'Skipped, so expenses are not duplicated.'
          : 'Imported a second time, duplicating expenses.';
      case 'unpaid':
        return this.includeUnpaid()
          ? 'Counted as spent although not yet paid.'
          : 'Excluded until they are paid.';
      case 'several_codes':
        return this.multipleCodes() === 'first'
          ? 'An amount cannot be split, so it is assigned to the first code listed.'
          : 'Left uncategorised for manual assignment.';
      default:
        return '';
    }
  }

  async preview(): Promise<void> {
    const file = this.file();
    if (!file || !this.canPreview()) {
      return;
    }
    const report = await this.importer.preview(file, this.target());
    if (!report) {
      this.toast.show(this.importer.error() ?? 'Could not read the file.', 'error');
      return;
    }
    this.report.set(report);
    this.step.set('review');
  }

  backToFile(): void {
    this.step.set('file');
  }

  async runImport(): Promise<void> {
    const file = this.file();
    if (!file) {
      return;
    }
    const result = await this.importer.runImport(file, this.target(), {
      createMissingCategories: this.createMissingCategories(),
      skipDuplicates: this.skipDuplicates(),
      includeUnpaid: this.includeUnpaid(),
      multipleCodes: this.multipleCodes(),
    });
    if (!result) {
      this.toast.show(this.importer.error() ?? 'Nothing was imported.', 'error');
      return;
    }
    this.result.set(result);
    this.step.set('done');
    await this.projects.load();
    this.toast.show(`Imported into ${result.project_name}.`);
  }

  openProject(): void {
    const result = this.result();
    if (result) {
      void this.router.navigate(['/projects', result.project_id]);
    }
  }

  goToProjects(): void {
    void this.router.navigate(['/projects']);
  }

  private target(): ImportTarget {
    return {
      projectId: this.projectId() || null,
      name: this.name().trim(),
      currencyCode: this.currencyCode(),
    };
  }
}
