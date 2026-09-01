import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { ProjectRead, ProjectStatus } from '@setout/api-client';
import { formatMoney } from '../budget/money';
import { ButtonComponent } from '../ui/button.component';
import { ChipGroupComponent, type Chip } from '../ui/chip-group.component';
import { CurrencyPillComponent } from '../ui/currency-pill.component';
import { InfiniteScrollDirective } from '../ui/infinite-scroll.directive';
import { ToggleComponent } from '../ui/toggle.component';
import { TopbarComponent } from '../ui/topbar.component';
import { ToastService } from '../toast.service';
import { LandService } from '../lands/land.service';
import { whereLabel } from '../lands/land-labels';
import { ProjectService } from './project.service';

const STATUS_LINES: Record<ProjectStatus, string> = {
  active: 'Active.',
  on_hold: 'On hold.',
  completed: 'Completed.',
  archived: 'Archived. It can be deleted.',
};

@Component({
  selector: 'app-projects',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonComponent,
    ChipGroupComponent,
    CurrencyPillComponent,
    InfiniteScrollDirective,
    ToggleComponent,
    TopbarComponent,
  ],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss',
})
export class ProjectsComponent {
  readonly projects = inject(ProjectService);
  readonly lands = inject(LandService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly notSet = '—';

  readonly subtitle = computed(() => 'No project open');

  readonly summaryLine = computed(() => {
    const summary = this.projects.summary();
    if (!summary) {
      return '';
    }
    const parts = [`${summary.total} ${summary.total === 1 ? 'project' : 'projects'}`];
    if (summary.archived) {
      parts.push(`${summary.archived} archived`);
    }
    if (summary.deleted) {
      parts.push(`${summary.deleted} deleted`);
    }
    return parts.join(' · ');
  });

  readonly summaryFigure = computed(() => {
    const codes = this.projects.summary()?.currency_codes ?? [];
    if (codes.length === 0) {
      return '';
    }
    return codes.length === 1 ? `All in ${codes[0]}` : `${codes.length} currencies`;
  });

  readonly pending = signal<{ id: string; action: 'archive' | 'delete' } | null>(null);

  readonly add = input('');
  readonly showForm = signal(false);
  readonly includeDeleted = signal(false);
  readonly name = signal('');
  readonly currencyCode = signal('NGN');
  readonly notes = signal('');
  readonly landId = signal('');

  readonly landChips = computed<Chip[]>(() => [
    { value: '', label: 'No land' },
    ...this.lands
      .choices()
      .map((land) => ({ value: land.id, label: land.name, detail: whereLabel(land) })),
  ]);

  constructor() {
    void this.projects.load();
    void this.projects.loadCurrencies();
    void this.lands.loadChoices();
    effect(() => {
      if (this.add()) {
        this.showForm.set(true);
      }
    });
  }

  async loadMore(): Promise<void> {
    await this.projects.loadMore();
  }

  open(id: string): void {
    void this.router.navigate(['/projects', id]);
  }

  addExpense(id: string): void {
    void this.router.navigate(['/projects', id, 'expense']);
  }

  importSheet(): void {
    void this.router.navigate(['/import']);
  }

  budget(project: ProjectRead): string {
    if (!project.planned_amount) {
      return 'Not set';
    }
    return formatMoney(project.planned_amount, project.currency_code, project.currency_exponent);
  }

  initials(name: string): string {
    return name
      .split(/[\s,]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('');
  }

  statusLine(project: ProjectRead): string {
    if (project.deleted_at) {
      return 'Deleted. Restore it to bring it back.';
    }
    if (project.status === 'active' && !project.planned_amount) {
      return 'Active. No budget set yet.';
    }
    return STATUS_LINES[project.status];
  }

  isValid(): boolean {
    return this.name().trim().length > 0 && this.currencyCode().length === 3;
  }

  openForm(): void {
    this.showForm.set(true);
  }

  cancel(): void {
    this.showForm.set(false);
    this.name.set('');
    this.notes.set('');
    this.landId.set('');
  }

  async save(): Promise<void> {
    if (!this.isValid()) {
      return;
    }
    const created = await this.projects.create({
      name: this.name().trim(),
      currency_code: this.currencyCode(),
      land_id: this.landId() || null,
      notes: this.notes().trim() || null,
    });
    if (created) {
      this.cancel();
      this.toast.show(`${created.name} created.`);
    }
  }

  async setIncludeDeleted(value: boolean): Promise<void> {
    this.pending.set(null);
    this.includeDeleted.set(value);
    await this.projects.load(value);
  }

  // Budgets arrive with the next slice. Until a project has one, there is
  // nothing spent against it, so the remainder is what is left.
  spent(project: ProjectRead): string {
    return formatMoney(project.spent_amount, project.currency_code, project.currency_exponent);
  }

  isOver(project: ProjectRead): boolean {
    return project.planned_amount > 0 && project.spent_amount > project.planned_amount;
  }

  varianceLabel(project: ProjectRead): string {
    return this.isOver(project) ? 'Over by' : 'Left';
  }

  // Nothing to be left of, and nothing to be over, without a budget.
  variance(project: ProjectRead): string {
    if (!project.planned_amount) {
      return this.notSet;
    }
    const difference = Math.abs(project.planned_amount - project.spent_amount);
    return formatMoney(difference, project.currency_code, project.currency_exponent);
  }

  usedPercent(project: ProjectRead): number {
    if (!project.planned_amount) {
      return 0;
    }
    return Math.min(100, (project.spent_amount / project.planned_amount) * 100);
  }

  overPercent(project: ProjectRead): number {
    if (!project.planned_amount || project.spent_amount <= project.planned_amount) {
      return 0;
    }
    const over = project.spent_amount - project.planned_amount;
    return Math.min(100 - this.usedPercent(project), (over / project.planned_amount) * 100);
  }

  ask(id: string, action: 'archive' | 'delete'): void {
    this.pending.set({ id, action });
  }

  cancelPending(): void {
    this.pending.set(null);
  }

  isPending(id: string, action: 'archive' | 'delete'): boolean {
    const pending = this.pending();
    return pending?.id === id && pending.action === action;
  }

  async archive(id: string): Promise<void> {
    await this.projects.update(id, { status: 'archived' });
    this.pending.set(null);
    this.toast.show('Project archived. It can be unarchived or deleted.');
  }

  async unarchive(id: string): Promise<void> {
    await this.projects.update(id, { status: 'active' });
    this.toast.show('Project unarchived.');
  }

  async remove(id: string): Promise<void> {
    await this.projects.remove(id);
    this.pending.set(null);
    this.toast.show('Project deleted. Show deleted to restore it.');
  }

  async restore(id: string): Promise<void> {
    await this.projects.restore(id);
    this.toast.show('Project restored.');
  }
}
