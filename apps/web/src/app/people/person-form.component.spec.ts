import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import type { PersonRead } from '@setout/api-client';
import { ToastService } from '../toast.service';
import { PersonFormComponent } from './person-form.component';
import { PersonService } from './person.service';

function person(over: Partial<PersonRead> = {}): PersonRead {
  return {
    id: 'pe1',
    name: 'A Person',
    role: 'a role',
    phone: '0000 000 0000',
    notes: 'a note',
    expense_count: 0,
    totals: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

describe('PersonFormComponent', () => {
  let added: unknown[];
  let edited: unknown[];
  let navigations: unknown[][];
  let toasts: { message: string; type: string }[];
  let saveResult: PersonRead | null;

  async function render(id = '', existing: PersonRead | null = person()) {
    added = [];
    edited = [];
    navigations = [];
    toasts = [];
    saveResult = person({ id: 'pe9', name: 'Saved Person' });

    const people = {
      saving: () => false,
      error: () => null,
      get: async () => existing,
      add: async (body: unknown) => {
        added.push(body);
        return saveResult;
      },
      edit: async (_id: string, body: unknown) => {
        edited.push(body);
        return saveResult;
      },
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PersonFormComponent],
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

    const fixture = TestBed.createComponent(PersonFormComponent);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    await component.load();
    return component;
  }

  it('starts empty when adding somebody', async () => {
    const component = await render();
    expect(component.isEdit()).toBe(false);
    expect(component.title()).toBe('Add Someone');
    expect(component.name()).toBe('');
  });

  it('fills itself from the person being edited', async () => {
    const component = await render('pe1');
    expect(component.isEdit()).toBe(true);
    expect(component.title()).toBe('Edit');
    expect(component.name()).toBe('A Person');
    expect(component.role()).toBe('a role');
    expect(component.phone()).toBe('0000 000 0000');
    expect(component.notes()).toBe('a note');
  });

  it('adds somebody and opens them', async () => {
    const component = await render();
    component.name.set('  A New Person  ');
    component.role.set(' a role ');

    await component.save();

    expect(added[0]).toEqual({
      name: 'A New Person',
      role: 'a role',
      phone: null,
      notes: null,
    });
    expect(edited.length).toBe(0);
    expect(navigations[0][0]).toEqual(['/people', 'pe9']);
  });

  it('saves an edit rather than adding a second person', async () => {
    const component = await render('pe1');
    component.role.set('another role');

    await component.save();

    expect(added.length).toBe(0);
    expect(edited[0]).toEqual({
      name: 'A Person',
      role: 'another role',
      phone: '0000 000 0000',
      notes: 'a note',
    });
  });

  it('will not save without a name', async () => {
    const component = await render();
    component.name.set('   ');

    expect(component.isValid()).toBe(false);
    await component.save();
    expect(added.length).toBe(0);
  });

  it('reports a save that was refused and stays put', async () => {
    const component = await render();
    saveResult = null;
    component.name.set('A Person');

    await component.save();

    expect(toasts[0].type).toBe('error');
    expect(navigations.length).toBe(0);
  });

  it('cancels back to the list when new, and to the person when editing', async () => {
    (await render()).cancel();
    expect(navigations[0][0]).toEqual(['/people']);

    (await render('pe1')).cancel();
    expect(navigations[0][0]).toEqual(['/people', 'pe1']);
  });

  it('copes with somebody who is not there', async () => {
    const component = await render('pe1', null);
    expect(component.name()).toBe('');
    expect(component.loading()).toBe(false);
  });

  it('names who is being edited in the page title', async () => {
    await render('x1', person({ name: 'Aunty Ngozi' }));
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Edit Aunty Ngozi · Setout');
  });

  it('leaves the title alone when adding a new one', async () => {
    TestBed.inject(Title).setTitle('Add · Setout');
    await render('');
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Add · Setout');
  });
});
