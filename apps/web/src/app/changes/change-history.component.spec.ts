import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ChangeRead } from '@setout/api-client';
import { ChangeList, ChangeService, ChangeTarget } from './change.service';
import { ChangeHistoryComponent } from './change-history.component';

function change(over: Partial<ChangeRead> = {}): ChangeRead {
  return {
    id: 'c1',
    entity: 'expense',
    entity_id: 'e1',
    entity_name: 'Cement',
    project_id: 'p1',
    action: 'update',
    fields: [{ name: 'amount', before: 100_00, after: 150_00 }],
    user_name: 'Admin',
    created_at: '2026-10-25T09:30:00Z',
    ...over,
  } as ChangeRead;
}

describe('ChangeHistoryComponent', () => {
  let list: ReturnType<typeof signal<ChangeList>>;
  let loads: ChangeTarget[];

  function render(target: ChangeTarget = { entity: 'expense', id: 'e1' }) {
    list = signal<ChangeList>({ rows: [], total: 0, loading: false });
    loads = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ChangeHistoryComponent],
      providers: [
        {
          provide: ChangeService,
          useValue: {
            error: () => null,
            forTarget: () => list(),
            load: async (requested: ChangeTarget) => void loads.push(requested),
            loadMore: async () => undefined,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ChangeHistoryComponent);
    fixture.componentRef.setInput('target', target);
    fixture.componentRef.setInput('exponent', 2);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the change history of its target once', () => {
    const fixture = render();
    list.set({ rows: [change()], total: 1, loading: false });
    fixture.detectChanges();

    expect(loads).toEqual([{ entity: 'expense', id: 'e1' }]);
  });

  it('shows No changes recorded when there are none', () => {
    const element = render().nativeElement as HTMLElement;
    expect(element.textContent).toContain('No changes recorded.');
  });

  it('formats amounts with the currency exponent and labels fields', () => {
    const fixture = render();
    list.set({ rows: [change()], total: 1, loading: false });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Updated');
    expect(text).toContain('Amount');
    expect(text).toContain('100.00 → 150.00');
  });

  it('names Setout when no user made the change', () => {
    const component = render().componentInstance;
    expect(component.who(change({ user_name: null }))).toBe('Setout');
  });

  it('shows Not set for an empty value and no field lines for an archive', () => {
    const component = render().componentInstance;
    const created = change({
      action: 'create',
      fields: [{ name: 'notes', before: null, after: null }],
    });

    expect(component.lines(created)).toEqual([{ label: 'Notes', before: null, after: 'Not set' }]);
    expect(component.lines(change({ action: 'archive' }))).toEqual([]);
  });

  it('names the record in the project list only', () => {
    const fixture = render({ projectId: 'p1' });
    list.set({
      rows: [change({ entity: 'budget_item', entity_name: 'Blocks' })],
      total: 1,
      loading: false,
    });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Budget item: Blocks');
  });
});
