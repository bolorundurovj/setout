import { TestBed } from '@angular/core/testing';
import { ComboboxComponent } from './combobox.component';

describe('ComboboxComponent', () => {
  async function render(options: string[], value = '') {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [ComboboxComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ComboboxComponent);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('value', value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      element,
      input: element.querySelector('input') as HTMLInputElement,
      chevron: element.querySelector('.chevron') as HTMLButtonElement,
      options: () =>
        Array.from(element.querySelectorAll('.option')).map((o) => o.textContent?.trim()),
    };
  }

  it('hides the list until it is asked for', async () => {
    const view = await render(['Interior work']);
    expect(view.options().length).toBe(0);
    expect(view.input.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows every option when the chevron is pressed', async () => {
    const view = await render(['Interior work', 'Roofing']);
    view.chevron.click();
    view.fixture.detectChanges();
    expect(view.options()).toEqual(['Interior work', 'Roofing']);
    expect(view.input.getAttribute('aria-expanded')).toBe('true');
  });

  it('narrows the list to what was typed', async () => {
    const view = await render(['Interior work', 'Roofing', 'Tiling'], 'ing');
    view.chevron.click();
    view.fixture.detectChanges();
    expect(view.options()).toEqual(['Roofing', 'Tiling']);
  });

  it('emits the option that was picked', async () => {
    const view = await render(['Interior work', 'Roofing']);
    let picked = '';
    view.fixture.componentInstance.valueChange.subscribe((v) => (picked = v));
    view.chevron.click();
    view.fixture.detectChanges();

    const option = view.element.querySelector('.option') as HTMLElement;
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(picked).toBe('Interior work');
  });

  it('emits whatever was typed, preset or not', async () => {
    const view = await render(['Interior work']);
    let emitted = '';
    view.fixture.componentInstance.valueChange.subscribe((v) => (emitted = v));
    view.input.value = 'Borehole and water tank';
    view.input.dispatchEvent(new Event('input'));
    expect(emitted).toBe('Borehole and water tank');
  });

  it('submits on enter when the list is closed', async () => {
    const view = await render(['Interior work']);
    let submitted = 0;
    view.fixture.componentInstance.submitted.subscribe(() => (submitted += 1));
    view.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(submitted).toBe(1);
  });
});
