import { TestBed } from '@angular/core/testing';
import { ChipGroupComponent, type Chip } from './chip-group.component';

function chips(count: number): Chip[] {
  return Array.from({ length: count }, (_, i) => ({ value: `c${i}`, label: `Choice ${i}` }));
}

describe('ChipGroupComponent', () => {
  async function render(list: Chip[], value = '', clearable = false) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [ChipGroupComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ChipGroupComponent);
    fixture.componentRef.setInput('chips', list);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('label', 'Choices');
    fixture.componentRef.setInput('clearable', clearable);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const picked: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => picked.push(v));

    return {
      fixture,
      element,
      picked,
      chips: () => Array.from(element.querySelectorAll('.chip')) as HTMLButtonElement[],
      picker: () => element.querySelector('app-option-picker'),
    };
  }

  it('shows up to eight options as chips', async () => {
    const view = await render(chips(8));
    expect(view.chips().length).toBe(8);
    expect(view.picker()).toBeNull();
  });

  it('shows more than eight options in an option picker', async () => {
    const view = await render(chips(9));
    expect(view.chips().length).toBe(0);
    expect(view.picker()).not.toBeNull();
  });

  it('marks the selected chip as pressed', async () => {
    const view = await render(chips(3), 'c1');
    expect(view.chips()[1].getAttribute('aria-pressed')).toBe('true');
    expect(view.chips()[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('emits the value of the clicked chip', async () => {
    const view = await render(chips(3));
    view.chips()[2].click();
    expect(view.picked).toEqual(['c2']);
  });

  it('emits an empty value when the selected chip is clicked and clearable is set', async () => {
    const view = await render(chips(3), 'c2', true);
    view.chips()[2].click();
    expect(view.picked).toEqual(['']);
  });

  it('re-emits the value when the selected chip is clicked and clearable is not set', async () => {
    const view = await render(chips(3), 'c2');
    view.chips()[2].click();
    expect(view.picked).toEqual(['c2']);
  });

  it('emits a value selected in the option picker', async () => {
    const view = await render(chips(9));
    const trigger = view.element.querySelector('.trigger') as HTMLButtonElement;
    trigger.click();
    view.fixture.detectChanges();

    const options = view.element.querySelectorAll('.option');
    options[4].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    view.fixture.detectChanges();

    expect(view.picked).toEqual(['c4']);
  });
});
