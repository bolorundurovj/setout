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
import { AttachmentParent } from '../attachments/attachment.service';
import { AttachmentsComponent } from '../attachments/attachments.component';
import { BudgetService } from '../budget/budget.service';
import { currencyFormat } from '../budget/currency-format';
import { formatMoney } from '../budget/money';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { ChipGroupComponent, type Chip } from '../ui/chip-group.component';
import { ToggleComponent } from '../ui/toggle.component';
import { LandService } from '../lands/land.service';
import { locationLabel } from '../lands/land-labels';
import { ProjectService } from './project.service';

const TINT_COUNT = 5;

const PREVIEW_AMOUNT = 4_889_300;

interface StatusChoice {
  value: ProjectStatus;
  name: string;
}

@Component({
  selector: 'app-project-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AttachmentsComponent, ButtonComponent, ChipGroupComponent, ToggleComponent],
  templateUrl: './project-settings.component.html',
  styleUrl: './project-settings.component.scss',
})
export class ProjectSettingsComponent {
  readonly project = input.required<ProjectRead>();
  readonly attachmentParent = computed<AttachmentParent>(() => ({
    attachedTo: 'project',
    id: this.project().id,
    projectId: this.project().id,
  }));

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
  readonly archiving = signal<string | null>(null);
  readonly lastArchived = signal<CategoryRead | null>(null);
  readonly includeArchived = signal(false);
  readonly pendingDelete = signal<string | null>(null);
  readonly deleteConfirmationText = signal('');

  readonly statuses: StatusChoice[] = [
    { value: 'active', name: 'Active' },
    { value: 'on_hold', name: 'On hold' },
    { value: 'completed', name: 'Completed' },
    { value: 'closed', name: 'Closed' },
  ];

  readonly currencyFormat = computed(() =>
    currencyFormat(this.project().currency_code, this.project().currency_exponent),
  );

  readonly preview = computed(() =>
    formatMoney(PREVIEW_AMOUNT, this.project().currency_code, this.project().currency_exponent),
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
      .map((land) => ({ value: land.id, label: land.name, detail: locationLabel(land) })),
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

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  setStatus(event: Event): void {
    this.status.set(this.inputValue(event) as ProjectStatus);
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
    const rootIndex = roots.findIndex((row) => row.id === (category.parent_id ?? category.id));
    return rootIndex < 0 ? 'tint-uncategorised' : `tint-${(rootIndex % TINT_COUNT) + 1}`;
  }

  countLabel(category: CategoryRead): string {
    if (!category.expense_count) {
      return 'no expenses';
    }
    return `${category.expense_count} ${category.expense_count === 1 ? 'expense' : 'expenses'}`;
  }

  canArchive(category: CategoryRead): boolean {
    return category.expense_count === 0;
  }

  startRename(category: CategoryRead): void {
    this.archiving.set(null);
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

  exportWorkbook(): void {
    const link = document.createElement('a');
    link.href = this.exportUrl();
    link.click();
    this.toast.show('Workbook download started.');
  }

  importWorkbook(): void {
    void this.router.navigate(['/import'], { queryParams: { project: this.project().id } });
  }

  confirmArchive(category: CategoryRead): void {
    this.renaming.set(null);
    this.archiving.set(category.id);
  }

  cancelArchive(): void {
    this.archiving.set(null);
  }

  async restoreLastArchived(): Promise<void> {
    const archived = this.lastArchived();
    if (!archived) {
      return;
    }
    await this.restore(archived);
  }

  async restore(category: CategoryRead): Promise<void> {
    const done = await this.budget.restoreCategory(this.project().id, category.id);
    this.lastArchived.set(null);
    await this.budget.load(this.project().id, this.includeArchived());
    this.toast.show(
      done
        ? `${category.name} restored.`
        : (this.budget.error() ?? 'Could not restore the category.'),
      done ? 'success' : 'error',
    );
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
    return this.deleteConfirmationText().trim() === 'DELETE';
  }

  async deletePermanently(category: CategoryRead): Promise<void> {
    if (!this.canConfirmDelete()) {
      return;
    }
    const done = await this.budget.deleteCategory(
      this.project().id,
      category.id,
      this.includeArchived(),
    );
    this.cancelDelete();
    this.toast.show(
      done
        ? `${category.name} deleted permanently.`
        : (this.budget.error() ?? 'Could not delete the category.'),
      done ? 'success' : 'error',
    );
  }

  async setIncludeArchived(on: boolean): Promise<void> {
    this.includeArchived.set(on);
    this.renaming.set(null);
    this.archiving.set(null);
    await this.budget.load(this.project().id, on);
  }

  archivedLabel(): string {
    return this.includeArchived() ? 'Hide archived' : 'Show archived';
  }

  async archive(category: CategoryRead): Promise<void> {
    const done = await this.budget.archiveCategory(
      this.project().id,
      category.id,
      this.includeArchived(),
    );
    this.archiving.set(null);
    this.lastArchived.set(done ? category : null);
    this.toast.show(
      done
        ? `${category.name} archived.`
        : (this.budget.error() ?? 'Could not archive the category.'),
      done ? 'success' : 'error',
    );
  }
}
