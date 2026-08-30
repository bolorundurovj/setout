import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import type { PersonRead } from '@setout/api-client';
import { routeInputBinding } from './app.config';
import { PersonFormComponent } from './people/person-form.component';
import { PersonService } from './people/person.service';
import { SearchComponent } from './search/search.component';
import { SearchService } from './search/search.service';
import { ToastService } from './toast.service';

@Component({
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
class Shell {}

function person(): PersonRead {
  return {
    id: 'pe1',
    name: 'A Person',
    role: 'a role',
    phone: null,
    notes: null,
    expense_count: 0,
    totals: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  };
}

describe('inputs on routes that carry no such param', () => {
  let asked: string[];

  function setUp() {
    asked = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [
        provideRouter(
          [
            { path: 'people/new', component: PersonFormComponent },
            { path: 'people/:id/edit', component: PersonFormComponent },
            { path: 'search', component: SearchComponent },
          ],
          routeInputBinding,
        ),
        {
          provide: PersonService,
          useValue: {
            saving: () => false,
            error: () => null,
            get: async () => person(),
            add: async () => person(),
            edit: async () => person(),
          },
        },
        {
          provide: SearchService,
          useValue: {
            results: () => null,
            looking: () => false,
            error: () => null,
            look: async (wanted: string) => {
              asked.push(wanted);
            },
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    return fixture;
  }

  async function settle(fixture: ReturnType<typeof setUp>) {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      fixture.detectChanges();
    }
  }

  it('opens the add-a-person page with no id at all', async () => {
    const fixture = setUp();
    await TestBed.inject(Router).navigateByUrl('/people/new');
    await settle(fixture);

    const form = fixture.debugElement.query(By.directive(PersonFormComponent))
      .componentInstance as PersonFormComponent;
    expect(form.id()).toBe('');
    expect(form.isEdit()).toBe(false);
    expect(form.title()).toBe('Add Someone');
  });

  it('drops the id when leaving an edit for the add page', async () => {
    const fixture = setUp();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/people/pe1/edit');
    await settle(fixture);

    await router.navigateByUrl('/people/new');
    await settle(fixture);

    const form = fixture.debugElement.query(By.directive(PersonFormComponent))
      .componentInstance as PersonFormComponent;
    expect(form.id()).toBe('');
    expect(form.isEdit()).toBe(false);
  });

  it('opens search from a bare address with no query', async () => {
    const fixture = setUp();
    await TestBed.inject(Router).navigateByUrl('/search');
    await settle(fixture);

    const search = fixture.debugElement.query(By.directive(SearchComponent))
      .componentInstance as SearchComponent;
    expect(search.q()).toBe('');
    expect(search.empty()).toBe(false);
    expect(asked).toEqual(['']);
  });
});
