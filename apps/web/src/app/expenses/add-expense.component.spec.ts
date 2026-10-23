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
  budgeted_amount: 0,
  spent_amount: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  archived_at: null,
};

describe('AddExpenseComponent', () => {
  let saves: unknown[][];
  let updates: unknown[][];
  let saving: boolean;
  let deliveryCalls: unknown[][];
  let uploads: { expenseId: string; file: File }[];
  let archived: string[];
  let restored: string[];
  let attachments: unknown[];

  function render(expenseToEdit: unknown = null, existingAttachments: unknown[] = []) {
    saves = [];
    updates = [];
    deliveryCalls = [];
    uploads = [];
    archived = [];
    restored = [];
    attachments = existingAttachments;
    saving = false;
    const expenses = {
      expenses: () => [],
      summary: () => null,
      total: () => 0,
      page: () => 1,
      saving: () => saving,
      error: () => null,
      load: async () => undefined,
      loadSummary: async () => undefined,
      suggestCategory: async () => ({ category_id: 's1', reason: 'Past expenses for this item' }),
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
      categories: () => [],
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
      categories: () => [{ id: 's1', name: 'Concrete foundation', is_group: false }],
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
            add: async (...args: unknown[]) => {
              deliveryCalls.push(args);
              return { id: 'd1' };
            },
          },
        },
        {
          provide: AttachmentService,
          useValue: {
            error: () => null,
            saving: () => false,
            forExpense: () => attachments,
            load: async () => undefined,
            formatSize: (bytes: number) => `${bytes} B`,
            fileUrl: (id: string) => `/api/attachments/${id}/file`,
            add: async (_projectId: string, expenseId: string, file: File) => {
              uploads.push({ expenseId, file });
              return { id: 'a1', filename: file.name };
            },
            archive: async (_expenseId: string, id: string) => void archived.push(id),
            restore: async (_expenseId: string, id: string) => {
              restored.push(id);
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
    fixture.componentRef.setInput('expenseToEdit', expenseToEdit);
    fixture.detectChanges();
    return fixture;
  }

  it('creates one expense per click of save', async () => {
    const fixture = render();
    const component = fixture.componentInstance;
    component.description.set('10 bags of cement');
    component.amount.set('11000');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector('button[type="submit"]') as HTMLButtonElement;
    // A submit button also fires the form submit event; binding save to both duplicates the expense.
    button.click();
    await fixture.whenStable();

    expect(saves.length).toBe(1);
  });

  it('ignores a second save while the first is in progress', async () => {
    const fixture = render();
    const component = fixture.componentInstance;
    component.description.set('10 bags of cement');
    component.amount.set('11000');

    saving = true;
    await component.save(false);
    expect(saves.length).toBe(0);
  });

  it('does not save without a description and an amount', async () => {
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
    category_id: null,
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
    archived_at: null,
  };

  it('fills the form from the expense being edited', () => {
    const component = render(existing).componentInstance;
    expect(component.isEditing()).toBe(true);
    expect(component.description()).toBe('10 bags of cement');
    expect(component.amount()).toBe('11000.00');
    expect(component.spentOn()).toBe('2026-02-01');
  });

  it('updates the edited expense instead of creating one', async () => {
    const component = render(existing).componentInstance;
    component.amount.set('12000');
    await component.save(false);

    expect(saves.length).toBe(0);
    expect(updates.length).toBe(1);
    expect(updates[0][1]).toBe('e1');
  });

  it('creates an expense when none is being edited', async () => {
    const component = render().componentInstance;
    component.description.set('1 truck of sand');
    component.amount.set('50000');
    await component.save(false);

    expect(updates.length).toBe(0);
    expect(saves.length).toBe(1);
  });

  it('creates a delivery only when Outstanding Delivery is checked', async () => {
    const component = render().componentInstance;
    component.description.set('17 bags of cement');
    component.amount.set('76500');

    await component.save(false);
    expect(deliveryCalls.length).toBe(0);

    component.description.set('17 bags of cement');
    component.amount.set('76500');
    component.toggleOutstandingDelivery();
    await component.save(false);

    expect(deliveryCalls.length).toBe(1);
    expect(deliveryCalls[0][1]).toEqual({
      expense_id: 'e1',
      description: null,
      expected: null,
    });
  });

  it('sends the delivery description and expected date', async () => {
    const component = render().componentInstance;
    component.description.set('Cement plus delivery');
    component.amount.set('76500');
    component.toggleOutstandingDelivery();
    component.deliveryDescription.set('17 bags of cement');
    component.deliveryExpected.set('this week');

    await component.save(false);

    expect(deliveryCalls[0][1]).toEqual({
      expense_id: 'e1',
      description: '17 bags of cement',
      expected: 'this week',
    });
  });

  it('clears the delivery fields after saving', async () => {
    const component = render().componentInstance;
    component.description.set('Cement');
    component.amount.set('76500');
    component.toggleOutstandingDelivery();
    component.deliveryDescription.set('17 bags');

    await component.save(true);

    expect(component.outstandingDelivery()).toBe(false);
    expect(component.deliveryDescription()).toBe('');
  });

  it('uploads the selected file after the expense is created', async () => {
    const fixture = render();
    const component = fixture.componentInstance;
    const file = new File(['a receipt'], 'receipt_16aug.jpg', { type: 'image/jpeg' });

    component.selectedFile.set(file);
    expect(component.fileLabel()).toContain('receipt_16aug.jpg');
    expect(component.fileLabel()).toContain('stored on your server');

    component.description.set('10 bags of cement');
    component.amount.set('11000');
    await component.save(false);

    expect(uploads).toEqual([{ expenseId: 'e1', file }]);
  });

  it('shows a prompt when no file is selected', () => {
    const component = render().componentInstance;
    expect(component.fileLabel()).toContain('No file selected');
  });

  it('clears the selected file after Save and Add Another', async () => {
    const fixture = render();
    const component = fixture.componentInstance;
    component.selectedFile.set(new File(['x'], 'r.jpg', { type: 'image/jpeg' }));
    component.description.set('Cement');
    component.amount.set('11000');

    await component.save(true);

    // Save and Add Another clears the selected file so it is not attached to the next expense.
    expect(component.selectedFile()).toBeNull();
  });

  it('uploads a file immediately when editing an expense', async () => {
    const existing = { id: 'e9', description: 'Cement', amount: 1100000, spent_on: '2026-08-14' };
    const component = render(existing).componentInstance;
    const file = new File(['a receipt'], 'receipt.jpg', { type: 'image/jpeg' });

    await component.onFileSelected({ target: { files: [file], value: 'x' } } as unknown as Event);

    expect(uploads).toEqual([{ expenseId: 'e9', file }]);
  });

  it('archives an attachment without updating the expense', async () => {
    const existing = { id: 'e9', description: 'Cement', amount: 1100000, spent_on: '2026-08-14' };
    const file = { id: 'a1', filename: 'receipt.jpg', byte_size: 2048, content_type: 'image/jpeg' };
    const component = render(existing, [file]).componentInstance;

    expect(component.expenseAttachments().length).toBe(1);
    expect(component.isImage(file as never)).toBe(true);
    expect(component.fileNote(file as never)).toContain('stored on your server');

    await component.archiveAttachment(file as never);

    expect(archived).toEqual(['a1']);
    expect(updates).toEqual([]);

    expect(component.lastArchived()?.id).toBe('a1');
    await component.restoreLastArchived();
    expect(restored).toEqual(['a1']);
    expect(component.lastArchived()).toBeNull();
  });

  it('does nothing when the file picker closes without a file', async () => {
    const component = render().componentInstance;

    await component.onFileSelected({ target: { files: [], value: '' } } as unknown as Event);

    expect(component.selectedFile()).toBeNull();
    expect(uploads).toEqual([]);
  });

  it('suggests a category when an item is picked', async () => {
    const fixture = render();
    const component = fixture.componentInstance;

    await component.pickItem('i1');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.categoryId()).toBe('s1');
    expect(component.suggestedCategoryId()).toBe('s1');
    expect(component.categoryExplicitlyCleared()).toBe(false);
    expect(component.categoryNote()).toContain('Suggested from past expenses');
  });

  it('does not override a category the user already chose', async () => {
    const fixture = render();
    const component = fixture.componentInstance;
    component.pickCategory('s2');

    await component.pickItem('i1');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.categoryId()).toBe('s2');
    expect(component.suggestedCategoryId()).toBeNull();
    expect(component.categoryExplicitlyCleared()).toBe(false);
    expect(component.categoryNote()).not.toContain('Suggested');
  });

  it('records when the user explicitly clears the category', () => {
    const component = render().componentInstance;
    component.pickCategory('');

    expect(component.categoryId()).toBe('');
    expect(component.categoryExplicitlyCleared()).toBe(true);
    expect(component.suggestedCategoryId()).toBeNull();
  });

  it('asks the backend to auto-assign when the category was not explicitly cleared', async () => {
    const component = render().componentInstance;
    component.description.set('Cement');
    component.amount.set('11000');
    component.pickCategory('');
    component.pickCategory('s1');

    await component.save(false);

    expect(saves[0][1]).toEqual(
      expect.objectContaining({
        category_id: 's1',
        auto_categorize: true,
      }),
    );
  });

  it('asks the backend not to auto-assign when the category was explicitly cleared', async () => {
    const component = render().componentInstance;
    component.description.set('Cement');
    component.amount.set('11000');
    component.pickCategory('');

    await component.save(false);

    expect(saves[0][1]).toEqual(
      expect.objectContaining({
        category_id: null,
        auto_categorize: false,
      }),
    );
  });

  it('does not send auto_categorize when changing an existing expense', async () => {
    const component = render(existing).componentInstance;
    component.amount.set('12000');

    await component.save(false);

    expect(updates[0][1]).toBe('e1');
    expect(updates[0][2]).not.toHaveProperty('auto_categorize');
  });
});
