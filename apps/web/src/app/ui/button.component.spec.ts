import { TestBed } from '@angular/core/testing';
import { ButtonComponent } from './button.component';

describe('ButtonComponent', () => {
  async function render(inputs: Record<string, unknown> = {}) {
    await TestBed.configureTestingModule({ imports: [ButtonComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ButtonComponent);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector('button');
    return { fixture, button: button as HTMLButtonElement };
  }

  it('defaults to the primary variant', async () => {
    const { button } = await render();
    expect(button.className).toContain('btn-primary');
    expect(button.type).toBe('button');
  });

  it('applies the requested variant', async () => {
    const { button } = await render({ variant: 'danger' });
    expect(button.className).toContain('btn-danger');
  });

  it('is disabled while loading', async () => {
    const { button } = await render({ loading: true });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
  });

  it('does not emit when disabled', async () => {
    const { fixture, button } = await render({ disabled: true });
    let pressed = 0;
    fixture.componentInstance.pressed.subscribe(() => (pressed += 1));
    button.click();
    expect(pressed).toBe(0);
  });

  it('emits when pressed', async () => {
    const { fixture, button } = await render();
    let pressed = 0;
    fixture.componentInstance.pressed.subscribe(() => (pressed += 1));
    button.click();
    expect(pressed).toBe(1);
  });
});
