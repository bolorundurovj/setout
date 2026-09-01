import { TestBed } from '@angular/core/testing';
import type { BudgetItemRead, ProjectRead, ScopeRead } from '@setout/api-client';
import { ToastService } from '../toast.service';
import { BudgetComponent } from './budget.component';
import { BudgetService } from './budget.service';

const project: ProjectRead = {
  id: 'p1',
  name: 'Jacaranda Close, Ewuru',
  currency_code: 'NGN',
  currency_exponent: 2,
  land_id: null,
  land_name: null,
  planned_amount: 0,
  spent_amount: 0,
  status: 'active',
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

function scope(over: Partial<ScopeRead> = {}): ScopeRead {
  return {
    id: 's1',
    project_id: 'p1',
    code: null,
    name: 'Concrete foundation',
    parent_id: null,
    sort_order: 0,
    is_group: false,
    planned_amount: 0,
    own_planned_amount: 0,
    spent_amount: 0,
    own_spent_amount: 0,
    expense_count: 0,
    own_expense_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

function item(over: Partial<BudgetItemRead> = {}): BudgetItemRead {
  return {
    id: 'i1',
    scope_id: 's1',
    description: 'Blocks',
    planned_amount: 100_00,
    cost_type: null,
    set_at: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

describe('BudgetComponent', () => {
  let added: unknown[];
  let updated: unknown[];
  let toasts: { message: string; type: string }[];

  function render(scopes: ScopeRead[], items: BudgetItemRead[]) {
    added = [];
    updated = [];
    toasts = [];
    const budget = {
      scopes: () => scopes,
      items: () => ({ s1: items }),
      presetNames: () => [],
      plannedTotal: () => scopes.reduce((t, s) => t + s.own_planned_amount, 0),
      error: () => null,
      loading: () => false,
      load: async () => undefined,
      loadItems: async () => undefined,
      loadPresets: async () => undefined,
      addScope: async () => undefined,
      addItem: async (...args: unknown[]) => void added.push(args),
      updateItem: async (...args: unknown[]) => void updated.push(args),
      removeItem: async () => undefined,
    };
    const toast = { show: (message: string, type = 'success') => toasts.push({ message, type }) };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [BudgetComponent],
      providers: [
        { provide: BudgetService, useValue: budget },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(BudgetComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('creates the first item when a scope has none', async () => {
    const component = render([scope()], []);
    component.onAmountInput('s1', { target: { value: '11000' } } as unknown as Event);
    await component.commit(scope());

    expect(added.length).toBe(1);
    expect(added[0]).toEqual(['p1', 's1', 'Concrete foundation', 1_100_000]);
    expect(updated.length).toBe(0);
  });

  it('updates the single item a scope already has', async () => {
    const only = item();
    const component = render([scope({ own_planned_amount: 100_00 })], [only]);
    component.onAmountInput('s1', { target: { value: '250' } } as unknown as Event);
    await component.commit(scope({ own_planned_amount: 100_00 }));

    expect(updated[0]).toEqual(['p1', 's1', 'i1', 25_000]);
    expect(added.length).toBe(0);
  });

  it('refuses to guess when a scope has several items', async () => {
    const scopes = [scope({ own_planned_amount: 300_00 })];
    const component = render(scopes, [item(), item({ id: 'i2', planned_amount: 200_00 })]);
    component.onAmountInput('s1', { target: { value: '999' } } as unknown as Event);
    await component.commit(scopes[0]);

    expect(added.length).toBe(0);
    expect(updated.length).toBe(0);
    expect(toasts[0].message).toContain('several planned items');
  });

  it('rejects something that is not an amount', async () => {
    const component = render([scope()], []);
    component.onAmountInput('s1', { target: { value: 'abc' } } as unknown as Event);
    await component.commit(scope());

    expect(added.length).toBe(0);
    expect(toasts[0].type).toBe('error');
  });

  it('writes nothing when the number has not changed', async () => {
    const scopes = [scope({ own_planned_amount: 100_00 })];
    const component = render(scopes, [item()]);
    component.onAmountInput('s1', { target: { value: '100.00' } } as unknown as Event);
    await component.commit(scopes[0]);

    expect(added.length).toBe(0);
    expect(updated.length).toBe(0);
  });

  it('writes nothing for an empty box', async () => {
    const component = render([scope()], []);
    component.onAmountInput('s1', { target: { value: '  ' } } as unknown as Event);
    await component.commit(scope());
    expect(added.length).toBe(0);
  });

  it('adds a line item under the scope', async () => {
    const component = render([scope()], []);
    component.itemDescription.set('600 nine inch blocks');
    component.itemAmount.set('150000');
    expect(component.canAddItem()).toBe(true);

    await component.addLineItem(scope());
    expect(added[0]).toEqual(['p1', 's1', '600 nine inch blocks', 15_000_000, null]);
    expect(component.itemDescription()).toBe('');
  });

  it('files a planned line under labour, material or fixed when told which', async () => {
    const component = render([scope()], []);
    component.itemDescription.set('Block work');
    component.itemAmount.set('150000');
    component.itemCostType.set('labour');

    await component.addLineItem(scope());

    expect(added[0]).toEqual(['p1', 's1', 'Block work', 15_000_000, 'labour']);
    // The next line starts unsplit rather than inheriting the last choice.
    expect(component.itemCostType()).toBe('');
  });

  it('will not add a line item without a description', () => {
    const component = render([scope()], []);
    component.itemAmount.set('1000');
    expect(component.canAddItem()).toBe(false);
  });

  it('will not add a line item without an amount', () => {
    const component = render([scope()], []);
    component.itemDescription.set('Blocks');
    component.itemAmount.set('abc');
    expect(component.canAddItem()).toBe(false);
  });

  it('adds a second item rather than replacing the first', async () => {
    const component = render([scope({ own_planned_amount: 100_00 })], [item()]);
    component.itemDescription.set('Cement');
    component.itemAmount.set('50');
    await component.addLineItem(scope({ own_planned_amount: 100_00 }));

    expect(added.length).toBe(1);
    expect(updated.length).toBe(0);
  });
});
