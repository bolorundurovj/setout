import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { PersonRead } from '@setout/api-client';
import { PeopleComponent } from './people.component';
import { PersonService } from './person.service';

function person(over: Partial<PersonRead> = {}): PersonRead {
  return {
    id: 'pe1',
    name: 'A Person',
    role: 'a role',
    phone: null,
    notes: null,
    expense_count: 2,
    totals: [
      { currency_code: 'NGN', currency_exponent: 2, expense_count: 2, spent_amount: 37_500_00 },
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

describe('PeopleComponent', () => {
  let rows: PersonRead[];
  let loads: { search?: string; archived?: boolean }[];
  let navigations: unknown[][];

  function render(initial: PersonRead[] = [person()]) {
    rows = initial;
    loads = [];
    navigations = [];

    const people = {
      people: () => rows,
      total: () => rows.length,
      page: () => 1,
      choices: () => rows,
      loading: () => false,
      saving: () => false,
      error: () => null,
      load: async (search?: string, includeArchived?: boolean) =>
        void loads.push({ search, archived: includeArchived }),
      goTo: async () => undefined,
      loadChoices: async () => undefined,
      add: async () => null,
      edit: async () => null,
      archive: async () => undefined,
      restore: async () => undefined,
      get: async () => null,
      spend: async () => null,
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PeopleComponent],
      providers: [
        { provide: Router, useValue: { navigate: (...args: unknown[]) => navigations.push(args) } },
        { provide: PersonService, useValue: people },
      ],
    });
    const fixture = TestBed.createComponent(PeopleComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('asks for the archived only when the toggle is on', async () => {
    const component = render();
    await component.setIncludeArchived(true);

    expect(loads[1]).toEqual({ search: '', archived: true });
  });

  it('opens somebody', () => {
    render().open('pe1');
    expect(navigations[0][0]).toEqual(['/people', 'pe1']);
  });

  it('counts the people', () => {
    expect(render([person()]).peopleCountLabel()).toBe('1 person');
    expect(render([person(), person({ id: 'pe2' })]).peopleCountLabel()).toBe('2 people');
  });

  it('flips the archive toggle label', async () => {
    const component = render();
    expect(component.archivedLabel()).toBe('Show archived');
    await component.setIncludeArchived(true);
    expect(component.archivedLabel()).toBe('Hide archived');
  });

  it('goes to the form screen to add somebody', () => {
    render().addSomeone();
    expect(navigations[0][0]).toEqual(['/people/new']);
  });

  it('counts purchases in words', () => {
    const component = render();
    expect(component.countLabel(person({ expense_count: 0 }))).toBe('nothing bought yet');
    expect(component.countLabel(person({ expense_count: 1 }))).toBe('1 purchase');
    expect(component.countLabel(person({ expense_count: 2 }))).toBe('2 purchases');
  });

  it('formats a total in its own currency', () => {
    const component = render();
    expect(component.money(person().totals[0])).toContain('37,500');
  });
});
