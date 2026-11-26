import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { HitGroup, SearchResults } from '@setout/api-client';
import { SearchComponent } from './search.component';
import { SearchService } from './search.service';

function group(kind: HitGroup['kind'], hits: HitGroup['hits'], total?: number): HitGroup {
  return { kind, hits, total: total ?? hits.length };
}

describe('SearchComponent', () => {
  let queries: string[];
  let navigations: unknown[][];
  let response: SearchResults | null;
  let searchError: string | null;

  function renderFixture(
    query = 'cement',
    results: SearchResults | null = null,
    error: string | null = null,
  ) {
    queries = [];
    navigations = [];
    response = results;
    searchError = error;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SearchComponent],
      providers: [
        provideRouter([]),
        {
          provide: SearchService,
          useValue: {
            results: () => response,
            status: () => (searchError ? 'error' : response ? 'ready' : 'idle'),
            loading: () => false,
            error: () => searchError,
            search: async (term: string) => {
              queries.push(term);
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
    return fixture;
  }

  function render(
    query = 'cement',
    results: SearchResults | null = null,
    error: string | null = null,
  ) {
    return renderFixture(query, results, error).componentInstance;
  }

  it('searches for the q parameter', () => {
    render('cement');
    expect(queries).toEqual(['cement']);
  });

  it('formats the match count', () => {
    const component = render('cement', { query: 'cement', total: 4, groups: [] });
    expect(component.summary()).toBe('4 matches for "cement"');

    const one = render('cement', { query: 'cement', total: 1, groups: [] });
    expect(one.summary()).toBe('1 match for "cement"');
  });

  it('shows "showing N of M" when a group is truncated', () => {
    const component = render();
    expect(component.heading(group('vendors', [{ id: 'v1', title: 'A', detail: '' }], 5))).toBe(
      'Vendors · showing 1 of 5',
    );
    expect(component.heading(group('items', [{ id: 'i1', title: 'A', detail: '' }]))).toBe(
      'Items · 1',
    );
  });

  it('reports no results only on a successful empty response, never alongside an error', () => {
    const component = render('helicopter', { query: 'helicopter', total: 0, groups: [] });
    expect(component.empty()).toBe(true);

    const errored = render('helicopter', null, 'Could not search.');
    expect(errored.empty()).toBe(false);
  });

  it('debounces subsequent query updates', () => {
    vi.useFakeTimers();
    try {
      const fixture = renderFixture('c');
      expect(queries).toEqual(['c']);

      fixture.componentRef.setInput('q', 'ce');
      fixture.detectChanges();
      fixture.componentRef.setInput('q', 'cem');
      fixture.detectChanges();
      expect(queries).toEqual(['c']);

      vi.advanceTimersByTime(300);
      expect(queries).toEqual(['c', 'cem']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('formats an amount only for hits that have one', () => {
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

  it("navigates to each result kind's page, including lands and specific expenses", () => {
    const component = render();
    const hit = { id: 'x1', title: 'A', detail: '', project_id: 'p1' };

    expect(component.heading(group('lands', [hit]))).toBe('Land · 1');

    component.open(group('projects', [hit]), hit);
    component.open(group('lands', [hit]), hit);
    component.open(group('expenses', [hit]), hit);
    component.open(group('vendors', [hit]), hit);
    component.open(group('people', [hit]), hit);
    component.open(group('items', [hit]), hit);

    expect(navigations).toEqual([
      [['/projects', 'x1']],
      [['/lands', 'x1']],
      [['/projects', 'p1', 'expenses'], { queryParams: { expense: 'x1' } }],
      [['/vendors', 'x1']],
      [['/people', 'x1']],
      [['/items', 'x1']],
    ]);
  });
});
