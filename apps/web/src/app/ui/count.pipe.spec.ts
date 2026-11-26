import { CountPipe, counted } from './count.pipe';

describe('counted', () => {
  it('uses the singular for one and the plural otherwise', () => {
    expect(counted(1, 'category', 'categories')).toBe('1 category');
    expect(counted(0, 'category', 'categories')).toBe('0 categories');
    expect(counted(3, 'row')).toBe('3 rows');
  });

  it('is available as a pipe', () => {
    expect(new CountPipe().transform(1, 'budget item')).toBe('1 budget item');
  });
});
