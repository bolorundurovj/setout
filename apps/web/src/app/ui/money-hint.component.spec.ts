import { TestBed } from '@angular/core/testing';

import { MoneyHintComponent } from './money-hint.component';

describe('MoneyHintComponent', () => {
  function render(value: string): HTMLElement {
    const fixture = TestBed.createComponent(MoneyHintComponent);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('code', 'NGN');
    fixture.componentRef.setInput('exponent', 2);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('.hint');
  }

  it('shows nothing for an empty field', () => {
    expect(render('').textContent?.trim()).toBe('');
  });

  it('shows the amount that will be saved', () => {
    const hint = render('1,250.5');

    expect(hint.textContent).toContain('Will be saved as');
    expect(hint.textContent).toContain('1,250.50');
    expect(hint.classList.contains('invalid')).toBe(false);
  });

  it('flags a decimal comma instead of reading it as thousands', () => {
    const hint = render('12,50');

    expect(hint.textContent).toContain('commas only to separate thousands');
    expect(hint.classList.contains('invalid')).toBe(true);
  });
});
