import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import type { PersonRead, PersonSpend } from '@setout/api-client';
import { ToastService } from '../toast.service';
import { PersonDetailComponent } from './person-detail.component';
import { PersonService } from './person.service';

function person(over: Partial<PersonRead> = {}): PersonRead {
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
    deleted_at: null,
    ...over,
  };
}

const spend: PersonSpend = {
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
      spend: async () => (current ? spend : null),
      edit: async (_id: string, body: unknown) => void edits.push(body),
      archive: async (id: string) => void archived.push(id),
      restore: async (id: string) => void restored.push(id),
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

  it('reads the person and what they spent', async () => {
    const component = await render();
    expect(component.person()?.name).toBe('A Person');
    expect(component.spend()?.projects.length).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('goes to the form screen to edit', async () => {
    (await render()).edit();
    expect(navigations[0][0]).toEqual(['/people', 'pe1', 'edit']);
  });

  it('counts purchases in words', async () => {
    const component = await render();
    expect(component.countLabel(person({ expense_count: 0 }))).toBe('nothing recorded yet');
    expect(component.countLabel(person({ expense_count: 1 }))).toBe('1 purchase');
    expect(component.countLabel(person({ expense_count: 2 }))).toBe('2 purchases');
  });

  it('totals what they spent per currency', async () => {
    const component = await render();
    const totals = component.spentTotals(spend);
    expect(totals.length).toBe(1);
    expect(totals[0].spent_amount).toBe(37_500_00);
    expect(component.total(totals[0])).toContain('37,500');
  });

  it('archives and restores', async () => {
    const component = await render();
    await component.archive();
    await component.restore();

    expect(archived).toEqual(['pe1']);
    expect(restored).toEqual(['pe1']);
  });

  it('formats spend in the project currency', async () => {
    const component = await render();
    expect(component.money(spend.projects[0])).toContain('37,500');
  });

  it('copes with somebody who is not there', async () => {
    const component = await render(null);
    expect(component.person()).toBeNull();
  });

  it('names the person in the page title', async () => {
    await render(person({ name: 'Aunty Ngozi' }));
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Aunty Ngozi · Setout');
  });

  it('leaves the title alone for someone who is not there', async () => {
    TestBed.inject(Title).setTitle('Person · Setout');
    await render(null);
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Person · Setout');
  });
});
