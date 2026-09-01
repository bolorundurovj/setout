import { TestBed } from '@angular/core/testing';
import type { ExpenseRead, ProjectRead, ScopeRead } from '@setout/api-client';
import { BudgetService } from '../budget/budget.service';
import { ToastService } from '../toast.service';
import { ExpenseService, UNFILED } from './expense.service';
import { ExpensesComponent } from './expenses.component';

function expense(id: string, over: Partial<ExpenseRead> = {}): ExpenseRead {
  return {
    id,
    project_id: 'p1',
    scope_id: null,
    item_id: null,
    vendor_id: null,
    agreement_id: null,
    paid_by_id: null,
    spent_on: '2026-08-01',
    description: 'Cement',
    quantity: null,
    unit_rate: null,
    amount: 10_000_00,
    attachment_count: 0,
    cost_type: 'material',
    notes: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

function scope(id: string, name: string, isGroup = false): ScopeRead {
  return {
    id,
    project_id: 'p1',
    code: null,
    name,
    parent_id: null,
    sort_order: 0,
    is_group: isGroup,
    planned_amount: 0,
    own_planned_amount: 0,
    spent_amount: 0,
    own_spent_amount: 0,
    expense_count: 0,
    own_expense_count: 0,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    deleted_at: null,
  };
}

describe('ExpensesComponent', () => {
  const project: ProjectRead = {
    id: 'p1',
    name: 'Jacaranda Close',
    currency_code: 'NGN',
    currency_exponent: 2,
    land_id: null,
    land_name: null,
    notes: null,
    planned_amount: 0,
    spent_amount: 15_000_00,
    status: 'active',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    deleted_at: null,
  };

  let expenses: ExpenseRead[];
  let unfiled: ExpenseRead[];
  let scopes: ScopeRead[];
  let filed: { projectId: string; body: { expense_ids: string[]; scope_id: string } } | null;
  let loaded: string[];
  let unfiledPages: number[];
  let toasts: { message: string; type: string }[];
  let fileResult: number | null;

  function render() {
    expenses = [expense('e1'), expense('e2', { description: 'Sand' })];
    unfiled = [...expenses];
    scopes = [scope('s1', 'Concrete foundation')];
    filed = null;
    loaded = [];
    unfiledPages = [];
    toasts = [];
    fileResult = 2;

    const expenseService = {
      expenses: () => expenses,
      total: () => expenses.length,
      page: () => 1,
      byScope: () => ({
        [UNFILED]: { rows: unfiled, total: unfiled.length, page: unfiledPages.at(-1) ?? 1 },
      }),
      spend: () => ({
        project_id: 'p1',
        currency_code: 'NGN',
        currency_exponent: 2,
        planned_amount: 0,
        spent_amount: 15_000_00,
        unfiled_amount: 15_000_00,
        unfiled_count: 2,
        removed_count: 0,
        variance_percent: null,
      }),
      saving: () => false,
      error: () => null,
      load: async (projectId: string) => void loaded.push(projectId),
      goTo: async (projectId: string) => void loaded.push(projectId),
      loadForScope: async (projectId: string, scopeId: string, page = 1) => {
        loaded.push(projectId);
        unfiledPages.push(page);
      },
      file: async (projectId: string, body: { expense_ids: string[]; scope_id: string }) => {
        filed = { projectId, body };
        return fileResult;
      },
      remove: async () => undefined,
    };

    const budgetService = {
      scopes: () => scopes,
      load: async () => undefined,
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ExpensesComponent],
      providers: [
        { provide: ExpenseService, useValue: expenseService },
        { provide: BudgetService, useValue: budgetService },
        {
          provide: ToastService,
          useValue: { show: (message: string, type = 'success') => toasts.push({ message, type }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(ExpensesComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('loads expenses and budget for the project', async () => {
    render();
    await Promise.resolve();
    expect(loaded).toContain('p1');
  });

  it('starts bulk filing and loads the unfiled list', async () => {
    const component = render();
    component.startFiling();

    expect(component.filing()).toBe(true);
    expect(loaded).toContain('p1');
    expect(unfiledPages).toContain(1);
  });

  it('selects and deselects individual expenses', () => {
    const component = render();
    component.startFiling();

    component.toggleOne('e1');
    expect(component.selected().has('e1')).toBe(true);
    expect(component.selectedCount()).toBe(1);

    component.toggleOne('e1');
    expect(component.selected().has('e1')).toBe(false);
  });

  it('selects all visible unfiled expenses at once', () => {
    const component = render();
    component.startFiling();

    component.toggleAll();
    expect(component.allSelected()).toBe(true);
    expect(component.selectedCount()).toBe(2);

    component.toggleAll();
    expect(component.allSelected()).toBe(false);
    expect(component.selectedCount()).toBe(0);
  });

  it('files selected expenses to the chosen scope', async () => {
    const component = render();
    component.startFiling();
    component.toggleOne('e1');
    component.bulkScopeId.set('s1');

    await component.fileSelected();

    expect(filed?.body).toEqual({ expense_ids: ['e1'], scope_id: 's1' });
    expect(toasts[0].type).toBe('success');
  });

  it('does not file when no scope is chosen', async () => {
    const component = render();
    component.startFiling();
    component.toggleOne('e1');

    await component.fileSelected();

    expect(filed).toBeNull();
  });

  it('shows an error when bulk filing fails', async () => {
    const component = render();
    fileResult = null;
    component.startFiling();
    component.toggleOne('e1');
    component.bulkScopeId.set('s1');

    await component.fileSelected();

    expect(filed?.body).toEqual({ expense_ids: ['e1'], scope_id: 's1' });
    expect(toasts[0].type).toBe('error');
  });

  it('stops filing when the last unfiled expense is gone', async () => {
    const component = render();
    unfiled = [];
    component.startFiling();
    component.toggleOne('e1');
    component.bulkScopeId.set('s1');

    await component.fileSelected();

    expect(component.filing()).toBe(false);
  });

  it('only offers leaf scopes in the bulk filing picker', () => {
    const component = render();
    scopes = [scope('s1', 'Structure', true), scope('s2', 'Blockwork')];

    expect(component.fileableScopes().map((s) => s.id)).toEqual(['s2']);
  });
});
