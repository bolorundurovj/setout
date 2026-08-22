import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import type { ProjectRead } from '@setout/api-client';
import { AgreementsComponent } from '../agreements/agreements.component';
import { BudgetCompareComponent } from '../compare/budget-compare.component';
import { ProjectDashboardComponent } from '../dashboard/project-dashboard.component';
import { DeliveriesComponent } from '../deliveries/deliveries.component';
import { BudgetComponent } from '../budget/budget.component';
import { ExpensesComponent } from '../expenses/expenses.component';
import { MonthsComponent } from '../months/months.component';
import { ButtonComponent } from '../ui/button.component';
import { CurrencyPillComponent } from '../ui/currency-pill.component';
import { ProjectService } from './project.service';
import { ProjectSettingsComponent } from './project-settings.component';

interface Tab {
  key: string;
  name: string;
  ready: boolean;
}

@Component({
  selector: 'app-project-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AgreementsComponent,
    BudgetCompareComponent,
    ProjectDashboardComponent,
    DeliveriesComponent,
    ExpensesComponent,
    MonthsComponent,
    BudgetComponent,
    ButtonComponent,
    CurrencyPillComponent,
    ProjectSettingsComponent,
  ],
  templateUrl: './project-detail.component.html',
  styleUrl: './project-detail.component.scss',
})
export class ProjectDetailComponent {
  readonly projects = inject(ProjectService);
  private readonly router = inject(Router);
  private readonly title = inject(Title);

  readonly id = input.required<string>();
  readonly tab = input('');
  readonly scope = input('');

  readonly project = signal<ProjectRead | null>(null);
  readonly activeTab = signal('dashboard');

  readonly tabs: Tab[] = [
    { key: 'dashboard', name: 'Dashboard', ready: true },
    { key: 'expense', name: 'Expenses', ready: true },
    { key: 'table', name: 'Budget vs Spend', ready: true },
    { key: 'months', name: 'Month by Month', ready: true },
    { key: 'budget', name: 'Budget', ready: true },
    { key: 'agreements', name: 'Agreements', ready: true },
    { key: 'deliveries', name: 'Deliveries', ready: true },
    { key: 'psettings', name: 'Project Settings', ready: true },
  ];

  readonly activeTabName = computed(
    () => this.tabs.find((tab) => tab.key === this.activeTab())?.name ?? 'Dashboard',
  );

  constructor() {
    effect(() => {
      const requested = this.tab();
      const known = this.tabs.some((tab) => tab.key === requested && tab.ready);
      this.activeTab.set(known ? requested : 'dashboard');
    });
    effect(() => {
      const project = this.project();
      if (project) {
        this.title.setTitle(`${project.name} · ${this.activeTabName()} · Setout`);
      }
    });
    queueMicrotask(() => void this.load());
  }

  async load(): Promise<void> {
    this.project.set(await this.projects.get(this.id()));
  }

  initials(name: string): string {
    return name
      .split(/[\s,]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('');
  }

  selectTab(key: string): void {
    this.activeTab.set(key);
    void this.router.navigate(['/projects', this.id(), key]);
  }

  openScope(scopeId: string): void {
    this.activeTab.set('table');
    void this.router.navigate(['/projects', this.id(), 'table'], {
      queryParams: { scope: scopeId },
    });
  }
}
