import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Api, exportProject } from '@setout/api-client';
import type { ProjectRead, ProjectStatus, CategoryRead } from '@setout/api-client';
import { BudgetService } from '../budget/budget.service';
import { currencyShape } from '../budget/currency-shape';
import { formatMoney } from '../budget/money';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { ChipGroupComponent, type Chip } from '../ui/chip-group.component';
import { LandService } from '../lands/land.service';
import { whereLabel } from '../lands/land-labels';
import { ProjectService } from './project.service';

const TINTS = 5;

const SAMPLE = 4_889_300;

interface StatusChoice {
  value: ProjectStatus;
  name: string;
}

@Component({
  selector: 'app-project-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ChipGroupComponent],
  templateUrl: './project-settings.component.html',
  styleUrl: './project-settings.component.scss',
})
export class ProjectSettingsComponent {
  readonly project = input.required<ProjectRead>();

  readonly changed = output<void>();

  readonly projects = inject(ProjectService);
  private readonly router = inject(Router);
  private readonly api = inject(Api);
  readonly budget = inject(BudgetService);
  readonly lands = inject(LandService);
  private readonly toast = inject(ToastService);

  readonly name = signal('');
  readonly status = signal<ProjectStatus>('active');
  readonly notes = signal('');
  readonly landId = signal('');
  readonly saving = signal(false);

  readonly renaming = signal<string | null>(null);
  readonly newName = signal('');
  readonly removing = signal<string | null>(null);
  readonly justRemoved = signal<CategoryRead | null>(null);

  readonly statuses: StatusChoice[] = [
    { value: 'active', name: 'In progress' },
    { value: 'on_hold', name: 'On hold' },
    { value: 'completed', name: 'Finished' },
    { value: 'archived', name: 'Archived' },
  ];

  readonly shape = computed(() =>
    currencyShape(this.project().currency_code, this.project().currency_exponent),
  );

  readonly preview = computed(() =>
    formatMoney(SAMPLE, this.project().currency_code, this.project().currency_exponent),
  );

  readonly dirty = computed(() => {
    const project = this.project();
    return (
      this.name().trim() !== project.name ||
      this.status() !== project.status ||
      this.notes() !== (project.notes ?? '') ||
      this.landId() !== (project.land_id ?? '')
    );
  });

  readonly canSave = computed(() => this.dirty() && this.name().trim().length > 0);

  readonly landChips = computed<Chip[]>(() => [
    { value: '', label: 'No land' },
    ...this.lands
      .choices()
      .map((land) => ({ value: land.id, label: land.name, detail: whereLabel(land) })),
  ]);

  constructor() {
    queueMicrotask(() => {
      const project = this.project();
      this.name.set(project.name);
      this.status.set(project.status);
      this.notes.set(project.notes ?? '');
      this.landId.set(project.land_id ?? '');
      void this.budget.load(project.id);
      void this.lands.loadChoices();
    });
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  setStatus(event: Event): void {
    this.status.set(this.value(event) as ProjectStatus);
  }

  async save(): Promise<void> {
    this.saving.set(true);
    const saved = await this.projects.update(this.project().id, {
      name: this.name().trim(),
      status: this.status(),
      land_id: this.landId() || null,
      notes: this.notes().trim() || null,
    });
    this.saving.set(false);
    if (!saved) {
      this.toast.show(this.projects.error() ?? 'Could not save the project.', 'error');
      return;
    }
    this.changed.emit();
    this.toast.show('Project saved.');
  }

  tint(category: CategoryRead): string {
    const roots = this.budget.categories().filter((row) => row.parent_id === null);
    const at = roots.findIndex((row) => row.id === (category.parent_id ?? category.id));
    return at < 0 ? 'tint-uncategorized' : `tint-${(at % TINTS) + 1}`;
  }

  countLabel(category: CategoryRead): string {
    if (!category.expense_count) {
      return 'no expenses';
    }
    return `${category.expense_count} ${category.expense_count === 1 ? 'expense' : 'expenses'}`;
  }

  canRemove(category: CategoryRead): boolean {
    return category.expense_count === 0;
  }

  startRename(category: CategoryRead): void {
    this.removing.set(null);
    this.renaming.set(category.id);
    this.newName.set(category.name);
  }

  cancelRename(): void {
    this.renaming.set(null);
    this.newName.set('');
  }

  async rename(category: CategoryRead): Promise<void> {
    const name = this.newName().trim();
    if (!name || name === category.name) {
      this.cancelRename();
      return;
    }
    const done = await this.budget.renameCategory(this.project().id, category.id, name);
    this.cancelRename();
    this.toast.show(
      done ? `Renamed to ${name}.` : (this.budget.error() ?? 'Could not rename the category.'),
      done ? 'success' : 'error',
    );
  }

  exportUrl(): string {
    const path = exportProject.PATH.replace('{project_id}', this.project().id);
    return `${this.api.rootUrl}${path}`;
  }

  exportSheet(): void {
    const link = document.createElement('a');
    link.href = this.exportUrl();
    link.click();
    this.toast.show('Workbook written. It reads back into Setout as it stands.');
  }

  importSheet(): void {
    void this.router.navigate(['/import'], { queryParams: { project: this.project().id } });
  }

  ask(category: CategoryRead): void {
    this.renaming.set(null);
    this.removing.set(category.id);
  }

  cancelRemove(): void {
    this.removing.set(null);
  }

  async putCategoryBack(): Promise<void> {
    const gone = this.justRemoved();
    if (!gone) {
      return;
    }
    const done = await this.budget.putCategoryBack(this.project().id, gone.id);
    this.justRemoved.set(null);
    this.toast.show(
      done ? `${gone.name} is back.` : (this.budget.error() ?? 'Could not restore the category.'),
      done ? 'success' : 'error',
    );
  }

  async remove(category: CategoryRead): Promise<void> {
    const done = await this.budget.removeCategory(this.project().id, category.id);
    this.removing.set(null);
    this.justRemoved.set(done ? category : null);
    this.toast.show(
      done
        ? `${category.name} removed.`
        : (this.budget.error() ?? 'Could not remove the category.'),
      done ? 'success' : 'error',
    );
  }
}
