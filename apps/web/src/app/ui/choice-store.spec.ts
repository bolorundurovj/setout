import { ChoiceStore } from './choice-store';

interface Row {
  id: string;
  name: string;
}

describe('ChoiceStore', () => {
  it('loads the first page with search and appends subsequent pages', async () => {
    const calls: { search?: string; limit: number; offset: number }[] = [];
    const store = new ChoiceStore<Row>(async (params) => {
      calls.push(params);
      return params.offset === 0
        ? {
            items: [
              { id: '1', name: 'Alpha' },
              { id: '2', name: 'Beta' },
            ],
            total: 3,
          }
        : { items: [{ id: '3', name: 'Gamma' }], total: 3 };
    });

    await store.load('al');
    expect(store.items().map((row) => row.id)).toEqual(['1', '2']);
    expect(store.total()).toBe(3);
    expect(store.hasMore()).toBe(true);
    expect(calls[0]).toEqual({ search: 'al', limit: 100, offset: 0 });

    await store.loadMore();
    expect(store.items().map((row) => row.id)).toEqual(['1', '2', '3']);
    expect(store.hasMore()).toBe(false);
    expect(calls[1]).toEqual({ search: 'al', limit: 100, offset: 2 });
  });

  it('drops stale responses when a newer search finishes first', async () => {
    let releaseSlow!: () => void;
    const store = new ChoiceStore<Row>((params) => {
      if (params.search === 'slow') {
        return new Promise((resolve) => {
          releaseSlow = () => resolve({ items: [{ id: 'stale', name: 'Stale' }], total: 1 });
        });
      }
      return Promise.resolve({ items: [{ id: 'fresh', name: 'Fresh' }], total: 1 });
    });

    const slow = store.load('slow');
    await store.load('fast');
    releaseSlow();
    await slow;

    expect(store.items().map((row) => row.id)).toEqual(['fresh']);
    expect(store.loading()).toBe(false);
  });

  it('prepends newly created items without duplicating existing ids', async () => {
    const store = new ChoiceStore<Row>(async () => ({
      items: [{ id: '1', name: 'One' }],
      total: 1,
    }));
    await store.load();

    store.prepend({ id: '2', name: 'Two' });
    store.prepend({ id: '2', name: 'Two' });

    expect(store.items().map((row) => row.id)).toEqual(['2', '1']);
    expect(store.total()).toBe(2);
  });
});
