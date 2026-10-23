import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import type { PersonExpenseSummary, PersonRead } from '@setout/api-client';
import { ToastService } from '../toast.service';
import { PersonDetailComponent } from './person-detail.component';
import { PersonService } from './person.service';

function person(overrides: Partial<PersonRead> = {}): PersonRead {
  return {
    id: 'pe1',
    name: 'A Person',
    role: 'a role',
    phone: '0000 000 0000',
    notes: null,
    expense_count: 2,
    totals: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    archived_at: null,
    ...overrides,
  };
}

const summary: PersonExpenseSummary = {
  person_id: 'pe1',
  name: 'A Person',
  projects: [
    {
      project_id: 'p1',
      project_name: 'First project',
      currency_code: 'NGN',
      currency_exponent: 2,
      expense_count: 2,
      spent_amount: 37_500_00,
    },
  ],
};

describe('PersonDetailComponent', () => {
  let edits: unknown[];
  let archived: string[];
  let restored: string[];
  let toasts: { message: string; type: string }[];
  let navigations: unknown[][];

  async function render(current: PersonRead | null = person()) {
    edits = [];
    archived = [];
    restored = [];
    toasts = [];
    navigations = [];

    const people = {
      error: () => null,
      get: async () => current,
      expenseSummary: async () => (current ? summary : null),
      edit: async (_id: string, body: unknown) => void edits.push(body),
      archive: async (id: string) => void archived.push(id),
      restore: async (id: string) => void restored.push(id),
      delete: async () => undefined,
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PersonDetailComponent],
      providers: [
        provideRouter([]),
        { provide: PersonService, useValue: people },
        {
          provide: ToastService,
          useValue: { show: (message: string, type = 'success') => toasts.push({ message, type }) },
        },
      ],
    });
    const router = TestBed.inject(Router);
    router.navigate = (...args: unknown[]) => {
      navigations.push(args);
      return Promise.resolve(true);
    };

    const fixture = TestBed.createComponent(PersonDetailComponent);
    fixture.componentRef.setInput('id', 'pe1');
    fixture.detectChanges();
    const component = fixture.componentInstance;
    await component.load();
    return component;
  }

  it('loads the person and their expense summary', async () => {
    const component = await render();
    expect(component.person()?.name).toBe('A Person');
    expect(component.expenseSummary()?.projects.length).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('opens the edit form', async () => {
    (await render()).edit();
    expect(navigations[0][0]).toEqual(['/people', 'pe1', 'edit']);
  });

  it('describes the expense count in words', async () => {
    const component = await render();
    expect(component.countLabel(person({ expense_count: 0 }))).toBe('no expenses yet');
    expect(component.countLabel(person({ expense_count: 1 }))).toBe('1 expense');
    expect(component.countLabel(person({ expense_count: 2 }))).toBe('2 expenses');
  });

  it('totals the spent amount per currency', async () => {
    const component = await render();
    const totals = component.spentTotals(summary);
    expect(totals.length).toBe(1);
    expect(totals[0].spent_amount).toBe(37_500_00);
    expect(component.formatTotal(totals[0])).toContain('37,500');
  });

  it('archives and restores', async () => {
    const component = await render();
    await component.archive();
    await component.restore();

    expect(archived).toEqual(['pe1']);
    expect(restored).toEqual(['pe1']);
  });

  it('formats a project row in the project currency', async () => {
    const component = await render();
    expect(component.formatSpent(summary.projects[0])).toContain('37,500');
  });

  it('shows no person when the person is not found', async () => {
    const component = await render(null);
    expect(component.person()).toBeNull();
  });

  it('shows the person name in the page title', async () => {
    await render(person({ name: 'Aunty Ngozi' }));
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Aunty Ngozi · Setout');
  });

  it('keeps the page title when the person is not found', async () => {
    TestBed.inject(Title).setTitle('Person · Setout');
    await render(null);
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Person · Setout');
  });
});
