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
      pills: () => Array.from(element.querySelectorAll('.chip')) as HTMLButtonElement[],
      picker: () => element.querySelector('app-option-picker'),
    };
  }

  it('shows a short list as pills', async () => {
    const view = await render(chips(8));
    expect(view.pills().length).toBe(8);
    expect(view.picker()).toBeNull();
  });

  it('hands a long list to the picker instead', async () => {
    const view = await render(chips(9));
    expect(view.pills().length).toBe(0);
    expect(view.picker()).not.toBeNull();
  });

  it('marks the chosen pill', async () => {
    const view = await render(chips(3), 'c1');
    expect(view.pills()[1].getAttribute('aria-pressed')).toBe('true');
    expect(view.pills()[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('emits the value of the pill that was pressed', async () => {
    const view = await render(chips(3));
    view.pills()[2].click();
    expect(view.picked).toEqual(['c2']);
  });

  it('clears when a chosen pill is pressed again and clearing is allowed', async () => {
    const view = await render(chips(3), 'c2', true);
    view.pills()[2].click();
    expect(view.picked).toEqual(['']);
  });

  it('keeps the value when clearing is not allowed', async () => {
    const view = await render(chips(3), 'c2');
    view.pills()[2].click();
    expect(view.picked).toEqual(['c2']);
  });

  it('passes a choice made in the picker up to the parent', async () => {
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
