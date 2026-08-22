import { TestBed } from '@angular/core/testing';
import { CurrencyPillComponent, currencySymbol } from './currency-pill.component';

describe('CurrencyPillComponent', () => {
  async function render(code: string) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [CurrencyPillComponent] }).compileComponents();
    const fixture = TestBed.createComponent(CurrencyPillComponent);
    fixture.componentRef.setInput('code', code);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent?.trim();
  }

  it('shows the symbol next to the code', async () => {
    expect(await render('NGN')).toBe('₦ NGN');
  });

  it('shows the symbol for a second currency', async () => {
    expect(await render('USD')).toBe('$ USD');
  });

  it('shows the code alone when there is no distinct symbol', async () => {
    expect(await render('KWD')).toBe('KWD');
  });

  it('falls back to the code for an unknown currency', () => {
    expect(currencySymbol('ZZZ')).toBe('ZZZ');
  });
});
