import { TestBed } from '@angular/core/testing';
import { ToggleComponent } from './toggle.component';

describe('ToggleComponent', () => {
  async function render(checked: boolean) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [ToggleComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ToggleComponent);
    fixture.componentRef.setInput('checked', checked);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    return { fixture, button: button as HTMLButtonElement };
  }

  it('reports its state to assistive tech', async () => {
    const { button } = await render(true);
    expect(button.getAttribute('role')).toBe('switch');
    expect(button.getAttribute('aria-checked')).toBe('true');
  });

  it('emits the opposite of its current state', async () => {
    const { fixture, button } = await render(false);
    let emitted: boolean | undefined;
    fixture.componentInstance.toggled.subscribe((value) => (emitted = value));
    button.click();
    expect(emitted).toBe(true);
  });

  it('marks the track as on when checked', async () => {
    const { fixture } = await render(true);
    const track = (fixture.nativeElement as HTMLElement).querySelector('.track');
    expect(track?.classList.contains('on')).toBe(true);
  });
});
