import { TestBed } from '@angular/core/testing';
import type { ProjectRead } from '@setout/api-client';
import { AttachmentService } from '../attachments/attachment.service';
import { BudgetService } from '../budget/budget.service';
import { ItemService } from '../items/item.service';
import { PersonService } from '../people/person.service';
import { ToastService } from '../toast.service';
import { VendorService } from '../vendors/vendor.service';
import { AddExpenseComponent } from './add-expense.component';
import { DeliveryService } from '../deliveries/delivery.service';
import { ExpenseService } from './expense.service';

const project: ProjectRead = {
  id: 'p1',
  name: 'Jacaranda Close, Ewuru',
  currency_code: 'NGN',
  currency_exponent: 2,
  land_id: null,
  land_name: null,
  status: 'active',
  notes: null,
  planned_amount: 0,
  spent_amount: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

describe('AddExpenseComponent', () => {
  let saves: unknown[][];
  let updates: unknown[][];
  let saving: boolean;
  let owedCalls: unknown[][];
  let uploads: { expenseId: string; file: File }[];
  let dropped: string[];
  let putBack: string[];
  let held: unknown[];

  function render(editing: unknown = null, attached: unknown[] = []) {
    saves = [];
    updates = [];
    owedCalls = [];
    uploads = [];
    dropped = [];
    putBack = [];
    held = attached;
    saving = false;
    const expenses = {
      expenses: () => [],
      spend: () => null,
      total: () => 0,
      page: () => 1,
      saving: () => saving,
      error: () => null,
      load: async () => undefined,
      loadSpend: async () => undefined,
      suggestScope: async () => ({ scope_id: 's1', reason: 'Past purchases of this item' }),
      add: async (...args: unknown[]) => {
        saves.push(args);
        return { id: 'e1', description: 'Cement' };
      },
      update: async (...args: unknown[]) => {
        updates.push(args);
        return { id: 'e1', description: 'Cement' };
      },
    };
    const empty = {
      scopes: () => [],
      items: () => [],
      vendors: () => [],
      people: () => [],
      choices: () => [],
      loadChoices: async () => undefined,
      total: () => 0,
      load: async () => undefined,
      loadAll: async () => undefined,
      lastPrice: () => null,
    };
    const budget = {
      ...empty,
      scopes: () => [{ id: 's1', name: 'Concrete foundation', is_group: false }],
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AddExpenseComponent],
      providers: [
        { provide: ExpenseService, useValue: expenses },
        {
          provide: DeliveryService,
          useValue: {
            error: () => null,
            forProject: () => [],
            outstanding: () => [],
            loadForProject: async () => undefined,
            add: async (...args: unknown[]) => {
              owedCalls.push(args);
              return { id: 'd1' };
            },
          },
        },
        {
          provide: AttachmentService,
          useValue: {
            error: () => null,
            saving: () => false,
            forExpense: () => held,
            load: async () => undefined,
            size: (bytes: number) => `${bytes} B`,
            fileUrl: (id: string) => `/api/attachments/${id}/file`,
            add: async (_projectId: string, expenseId: string, file: File) => {
              uploads.push({ expenseId, file });
              return { id: 'a1', filename: file.name };
            },
            remove: async (_expenseId: string, id: string) => void dropped.push(id),
            restore: async (_expenseId: string, id: string) => {
              putBack.push(id);
              return { id, filename: 'receipt.jpg' };
            },
          },
        },
        { provide: BudgetService, useValue: budget },
        { provide: ItemService, useValue: empty },
        { provide: VendorService, useValue: empty },
        { provide: PersonService, useValue: empty },
        { provide: ToastService, useValue: { show: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(AddExpenseComponent);
    fixture.componentRef.setInput('project', project);
    fixture.componentRef.setInput('editing', editing);
    fixture.detectChanges();
    return fixture;
  }

  it('records one expense per press of save', async () => {
    const fixture = render();
    const component = fixture.componentInstance;
    component.description.set('10 bags of cement');
    component.amount.set('11000');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector('button[type="submit"]') as HTMLButtonElement;
    // Clicking a submit button also submits the form it sits in. Binding save
    // to the button as well as the form filed every purchase twice.
    button.click();
    await fixture.whenStable();

    expect(saves.length).toBe(1);
  });

  it('ignores a second press while the first is still saving', async () => {
    const fixture = render();
    const component = fixture.componentInstance;
    component.description.set('10 bags of cement');
    component.amount.set('11000');

    saving = true;
    await component.save(false);
    expect(saves.length).toBe(0);
  });

  it('will not save without a description or an amount', async () => {
    const fixture = render();
    const component = fixture.componentInstance;

    await component.save(false);
    expect(saves.length).toBe(0);

    component.description.set('Cement');
    await component.save(false);
    expect(saves.length).toBe(0);
  });

  const existing = {
    id: 'e1',
    project_id: 'p1',
    scope_id: null,
    item_id: null,
    vendor_id: null,
    paid_by_id: null,
    spent_on: '2026-02-01',
    description: '10 bags of cement',
    quantity: null,
    unit_rate: null,
    amount: 1_100_000,
    attachment_count: 0,
    cost_type: 'material',
    notes: null,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    deleted_at: null,
  };

  it('fills the form from the expense being changed', () => {
    const component = render(existing).componentInstance;
    expect(component.isEditing()).toBe(true);
    expect(component.description()).toBe('10 bags of cement');
    expect(component.amount()).toBe('11000.00');
    expect(component.spentOn()).toBe('2026-02-01');
  });

  it('changes the expense rather than recording another', async () => {
    const component = render(existing).componentInstance;
    component.amount.set('12000');
    await component.save(false);

    expect(saves.length).toBe(0);
    expect(updates.length).toBe(1);
    expect(updates[0][1]).toBe('e1');
  });

  it('records a new expense when nothing is being changed', async () => {
    const component = render().componentInstance;
    component.description.set('1 truck of sand');
    component.amount.set('50000');
    await component.save(false);

    expect(updates.length).toBe(0);
    expect(saves.length).toBe(1);
  });

  it('records what is owed only when the box is ticked', async () => {
    const component = render().componentInstance;
    component.description.set('17 bags of cement');
    component.amount.set('76500');

    await component.save(false);
    expect(owedCalls.length).toBe(0);

    component.description.set('17 bags of cement');
    component.amount.set('76500');
    component.toggleOwed();
    await component.save(false);

    expect(owedCalls.length).toBe(1);
    expect(owedCalls[0][1]).toEqual({
      expense_id: 'e1',
      description: null,
      promised: null,
    });
  });

  it('lets what is owed be named apart from the expense', async () => {
    const component = render().componentInstance;
    component.description.set('Cement plus delivery');
    component.amount.set('76500');
    component.toggleOwed();
    component.owedWhat.set('17 bags of cement');
    component.owedWhen.set('this week');

    await component.save(false);

    expect(owedCalls[0][1]).toEqual({
      expense_id: 'e1',
      description: '17 bags of cement',
      promised: 'this week',
    });
  });

  it('clears the delivery fields once the expense is filed', async () => {
    const component = render().componentInstance;
    component.description.set('Cement');
    component.amount.set('76500');
    component.toggleOwed();
    component.owedWhat.set('17 bags');

    await component.save(true);

    expect(component.owed()).toBe(false);
    expect(component.owedWhat()).toBe('');
  });

  it('holds the photo until the expense exists, then sends it up', async () => {
    const fixture = render();
    const component = fixture.componentInstance;
    const file = new File(['a receipt'], 'receipt_16aug.jpg', { type: 'image/jpeg' });

    component.chosen.set(file);
    expect(component.photoLabel()).toContain('receipt_16aug.jpg');
    expect(component.photoLabel()).toContain('on your own server');

    component.description.set('10 bags of cement');
    component.amount.set('11000');
    await component.save(false);

    // Nothing to hang a file on until the expense has been recorded.
    expect(uploads).toEqual([{ expenseId: 'e1', file }]);
  });

  it('asks for the photograph before one is chosen', () => {
    const component = render().componentInstance;
    expect(component.photoLabel()).toContain('Photograph the receipt now');
  });

  it('forgets the held photo once the expense is filed', async () => {
    const fixture = render();
    const component = fixture.componentInstance;
    component.chosen.set(new File(['x'], 'r.jpg', { type: 'image/jpeg' }));
    component.description.set('Cement');
    component.amount.set('11000');

    await component.save(true);

    // Save and add another starts clean, or the next expense inherits a receipt
    // that is not its own.
    expect(component.chosen()).toBeNull();
  });

  it('sends the photo up at once on an expense that already exists', async () => {
    const existing = { id: 'e9', description: 'Cement', amount: 1100000, spent_on: '2026-08-14' };
    const component = render(existing).componentInstance;
    const file = new File(['a receipt'], 'receipt.jpg', { type: 'image/jpeg' });

    await component.onPicked({ target: { files: [file], value: 'x' } } as unknown as Event);

    expect(uploads).toEqual([{ expenseId: 'e9', file }]);
  });

  it('takes a photo off without touching the expense', async () => {
    const existing = { id: 'e9', description: 'Cement', amount: 1100000, spent_on: '2026-08-14' };
    const file = { id: 'a1', filename: 'receipt.jpg', byte_size: 2048, content_type: 'image/jpeg' };
    const component = render(existing, [file]).componentInstance;

    expect(component.attached().length).toBe(1);
    expect(component.isImage(file as never)).toBe(true);
    expect(component.fileNote(file as never)).toContain('on your own server');

    await component.removeFile(file as never);

    expect(dropped).toEqual(['a1']);
    expect(updates).toEqual([]);

    expect(component.justRemoved()?.id).toBe('a1');
    await component.putPhotoBack();
    expect(putBack).toEqual(['a1']);
    expect(component.justRemoved()).toBeNull();
  });

  it('does nothing when the picker is closed with nothing chosen', async () => {
    const component = render().componentInstance;

    await component.onPicked({ target: { files: [], value: '' } } as unknown as Event);

    expect(component.chosen()).toBeNull();
    expect(uploads).toEqual([]);
  });

  it('suggests a scope when an item is picked', async () => {
    const fixture = render();
    const component = fixture.componentInstance;

    await component.pickItem('i1');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.scopeId()).toBe('s1');
    expect(component.suggestedScopeId()).toBe('s1');
    expect(component.scopeExplicitlyCleared()).toBe(false);
    expect(component.scopeNote()).toContain('Suggested from past purchases');
  });

  it('does not override a scope the user already chose', async () => {
    const fixture = render();
    const component = fixture.componentInstance;
    component.pickScope('s2');

    await component.pickItem('i1');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.scopeId()).toBe('s2');
    expect(component.suggestedScopeId()).toBeNull();
    expect(component.scopeExplicitlyCleared()).toBe(false);
    expect(component.scopeNote()).not.toContain('Suggested');
  });

  it('remembers when the user explicitly leaves a scope unfiled', () => {
    const component = render().componentInstance;
    component.pickScope('');

    expect(component.scopeId()).toBe('');
    expect(component.scopeExplicitlyCleared()).toBe(true);
    expect(component.suggestedScopeId()).toBeNull();
  });

  it('asks the backend to auto-assign when the scope was not explicitly cleared', async () => {
    const component = render().componentInstance;
    component.description.set('Cement');
    component.amount.set('11000');
    component.pickScope('');
    component.pickScope('s1');

    await component.save(false);

    expect(saves[0][1]).toEqual(
      expect.objectContaining({
        scope_id: 's1',
        auto_scope: true,
      }),
    );
  });

  it('asks the backend not to auto-assign when the scope was explicitly cleared', async () => {
    const component = render().componentInstance;
    component.description.set('Cement');
    component.amount.set('11000');
    component.pickScope('');

    await component.save(false);

    expect(saves[0][1]).toEqual(
      expect.objectContaining({
        scope_id: null,
        auto_scope: false,
      }),
    );
  });

  it('does not send auto_scope when changing an existing expense', async () => {
    const component = render(existing).componentInstance;
    component.amount.set('12000');

    await component.save(false);

    expect(updates[0][1]).toBe('e1');
    expect(updates[0][2]).not.toHaveProperty('auto_scope');
  });
});
