import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { HitGroup, SearchResults } from '@setout/api-client';
import { SearchComponent } from './search.component';
import { SearchService } from './search.service';

function group(kind: HitGroup['kind'], hits: HitGroup['hits'], total?: number): HitGroup {
  return { kind, hits, total: total ?? hits.length };
}

describe('SearchComponent', () => {
  let asked: string[];
  let navigations: unknown[][];
  let found: SearchResults | null;

  function render(query = 'cement', results: SearchResults | null = null) {
    asked = [];
    navigations = [];
    found = results;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SearchComponent],
      providers: [
        provideRouter([]),
        {
          provide: SearchService,
          useValue: {
            results: () => found,
            looking: () => false,
            error: () => null,
            look: async (wanted: string) => {
              asked.push(wanted);
            },
          },
        },
      ],
    });
    const router = TestBed.inject(Router);
    router.navigate = async (...args: unknown[]) => {
      navigations.push(args);
      return true;
    };
    const fixture = TestBed.createComponent(SearchComponent);
    fixture.componentRef.setInput('q', query);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('looks for what the address asks for', () => {
    render('cement');
    expect(asked).toEqual(['cement']);
  });

  it('counts the matches in words', () => {
    const component = render('cement', { query: 'cement', total: 4, groups: [] });
    expect(component.line()).toBe('4 matches for "cement"');

    const one = render('cement', { query: 'cement', total: 1, groups: [] });
    expect(one.line()).toBe('1 match for "cement"');
  });

  it('says when a group holds more than it lists', () => {
    const component = render();
    expect(component.heading(group('vendors', [{ id: 'v1', title: 'A', detail: '' }], 5))).toBe(
      'Vendors · showing 1 of 5',
    );
    expect(component.heading(group('items', [{ id: 'i1', title: 'A', detail: '' }]))).toBe(
      'Items · 1',
    );
  });

  it('says plainly when nothing matched', () => {
    const component = render('helicopter', { query: 'helicopter', total: 0, groups: [] });
    expect(component.empty()).toBe(true);
  });

  it('shows a figure only where the hit carries one', () => {
    const component = render();
    expect(
      component.money({
        id: 'e1',
        title: 'Cement',
        detail: '',
        amount: 76_500_00,
        currency_code: 'NGN',
        currency_exponent: 2,
      }),
    ).toContain('76,500');
    expect(component.money({ id: 'v1', title: 'A vendor', detail: '' })).toBe('');
  });

  it('opens each kind where that kind lives', () => {
    const component = render();
    const hit = { id: 'x1', title: 'A', detail: '', project_id: 'p1' };

    component.open(group('projects', [hit]), hit);
    component.open(group('expenses', [hit]), hit);
    component.open(group('vendors', [hit]), hit);
    component.open(group('people', [hit]), hit);
    component.open(group('items', [hit]), hit);

    expect(navigations.map((call) => call[0])).toEqual([
      ['/projects', 'x1'],
      ['/projects', 'p1', 'expense'],
      ['/vendors', 'x1'],
      ['/people', 'x1'],
      ['/items', 'x1'],
    ]);
  });
});
