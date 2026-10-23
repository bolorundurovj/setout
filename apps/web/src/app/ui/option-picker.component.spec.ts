import { TestBed } from '@angular/core/testing';
import { OptionPickerComponent, type Option } from './option-picker.component';

const VENDORS: Option[] = [
  { value: '', label: 'No vendor' },
  { value: 'v1', label: 'Corner Depot', detail: 'cement' },
  { value: 'v2', label: 'Riverside Sawmill', detail: 'timber' },
  { value: 'v3', label: 'Ajayi Electrical', detail: 'wiring' },
];

describe('OptionPickerComponent', () => {
  async function render(options: Option[] = VENDORS, value = '') {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [OptionPickerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(OptionPickerComponent);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('label', 'Vendor');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const trigger = element.querySelector('.trigger') as HTMLButtonElement;
    const picked: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => picked.push(v));

    const view = {
      fixture,
      element,
      trigger,
      picked,
      filter: () => element.querySelector('.filter') as HTMLInputElement | null,
      options: () =>
        Array.from(element.querySelectorAll('.option-label')).map((o) => o.textContent?.trim()),
      activeOption: () =>
        element.querySelector('.option.active .option-label')?.textContent?.trim(),
      type(text: string) {
        const box = view.filter() as HTMLInputElement;
        box.value = text;
        box.dispatchEvent(new Event('input'));
        fixture.detectChanges();
      },
      key(key: string) {
        (view.filter() as HTMLInputElement).dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true }),
        );
        fixture.detectChanges();
      },
    };
    return view;
  }

  it('shows the selected option on the trigger', async () => {
    const view = await render(VENDORS, 'v2');
    expect(view.trigger.textContent).toContain('Riverside Sawmill');
    expect(view.trigger.textContent).toContain('timber');
  });

  it('keeps the list closed until the trigger is clicked', async () => {
    const view = await render();
    expect(view.options().length).toBe(0);
    expect(view.trigger.getAttribute('aria-expanded')).toBe('false');

    view.trigger.click();
    view.fixture.detectChanges();

    expect(view.options()).toEqual([
      'No vendor',
      'Corner Depot',
      'Riverside Sawmill',
      'Ajayi Electrical',
    ]);
    expect(view.trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('focuses the filter box on open', async () => {
    const view = await render();
    view.trigger.click();
    view.fixture.detectChanges();
    expect(document.activeElement).toBe(view.filter());
  });

  it('filters the list by label', async () => {
    const view = await render();
    view.trigger.click();
    view.fixture.detectChanges();
    view.type('river');
    expect(view.options()).toEqual(['Riverside Sawmill']);
  });

  it('filters the list by detail as well as label', async () => {
    const view = await render();
    view.trigger.click();
    view.fixture.detectChanges();
    view.type('wiring');
    expect(view.options()).toEqual(['Ajayi Electrical']);
  });

  it('shows a message when nothing matches', async () => {
    const view = await render();
    view.trigger.click();
    view.fixture.detectChanges();
    view.type('plumbing');
    expect(view.options().length).toBe(0);
    expect(view.element.querySelector('.empty')?.textContent).toContain('No matches');
  });

  it('moves through the list with the arrow keys and wraps', async () => {
    const view = await render();
    view.trigger.click();
    view.fixture.detectChanges();
    expect(view.activeOption()).toBe('No vendor');

    view.key('ArrowDown');
    expect(view.activeOption()).toBe('Corner Depot');

    view.key('ArrowUp');
    view.key('ArrowUp');
    expect(view.activeOption()).toBe('Ajayi Electrical');
  });

  it('moves to the first and last options with Home and End', async () => {
    const view = await render();
    view.trigger.click();
    view.fixture.detectChanges();
    view.key('End');
    expect(view.activeOption()).toBe('Ajayi Electrical');
    view.key('Home');
    expect(view.activeOption()).toBe('No vendor');
  });

  it('opens with the selected option active', async () => {
    const view = await render(VENDORS, 'v3');
    view.trigger.click();
    view.fixture.detectChanges();
    expect(view.activeOption()).toBe('Ajayi Electrical');
  });

  it('emits the value of the clicked option', async () => {
    const view = await render();
    view.trigger.click();
    view.fixture.detectChanges();
    const options = view.element.querySelectorAll('.option');
    options[2].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    view.fixture.detectChanges();

    expect(view.picked).toEqual(['v2']);
    expect(view.options().length).toBe(0);
  });

  it('emits an empty value like any other option', async () => {
    const view = await render(VENDORS, 'v1');
    view.trigger.click();
    view.fixture.detectChanges();
    const options = view.element.querySelectorAll('.option');
    options[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    view.fixture.detectChanges();

    expect(view.picked).toEqual(['']);
  });

  it('selects the active option on Enter', async () => {
    const view = await render();
    view.trigger.click();
    view.fixture.detectChanges();
    view.type('sawmill');
    view.key('Enter');

    expect(view.picked).toEqual(['v2']);
  });

  it('closes on Escape without selecting', async () => {
    const view = await render();
    view.trigger.click();
    view.fixture.detectChanges();
    view.key('Escape');

    expect(view.options().length).toBe(0);
    expect(view.picked).toEqual([]);
  });

  it('closes on an outside click', async () => {
    const view = await render();
    view.trigger.click();
    view.fixture.detectChanges();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    view.fixture.detectChanges();

    expect(view.options().length).toBe(0);
  });

  it('clears the filter on reopen', async () => {
    const view = await render();
    view.trigger.click();
    view.fixture.detectChanges();
    view.type('river');
    view.key('Escape');

    view.trigger.click();
    view.fixture.detectChanges();

    expect(view.filter()?.value).toBe('');
    expect(view.options().length).toBe(4);
  });
});
