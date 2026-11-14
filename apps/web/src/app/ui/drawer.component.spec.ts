import { TestBed } from '@angular/core/testing';
import { DrawerComponent } from './drawer.component';

describe('DrawerComponent', () => {
  async function render() {
    await TestBed.configureTestingModule({ imports: [DrawerComponent] }).compileComponents();
    const fixture = TestBed.createComponent(DrawerComponent);
    fixture.componentRef.setInput('title', 'New Expense');
    fixture.detectChanges();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    return { fixture, dialog };
  }

  it('uses a named native dialog and requests closure on Escape', async () => {
    const { fixture, dialog } = await render();
    expect(dialog.getAttribute('aria-label')).toBe('New Expense');
    const close = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(close);
    const event = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(close).toHaveBeenCalledOnce();
  });

  it('opens modally and closes when the input changes', async () => {
    const { fixture, dialog } = await render();
    const show = vi.spyOn(dialog, 'showModal').mockImplementation(() => {
      dialog.setAttribute('open', '');
    });
    const close = vi.spyOn(dialog, 'close').mockImplementation(() => {
      dialog.removeAttribute('open');
    });
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(show).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(close).toHaveBeenCalledOnce();
  });

  it('requests closure when the browser closes an open dialog', async () => {
    const { fixture, dialog } = await render();
    const show = vi.spyOn(dialog, 'showModal').mockImplementation(() => {
      dialog.setAttribute('open', '');
    });
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    expect(show).toHaveBeenCalledOnce();

    const close = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(close);
    dialog.dispatchEvent(new Event('close'));

    expect(close).toHaveBeenCalledOnce();
  });

  it('does not request closure after the parent closes the dialog', async () => {
    const { fixture, dialog } = await render();
    const closeDialog = vi.spyOn(dialog, 'close').mockImplementation(() => {
      dialog.removeAttribute('open');
    });
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const close = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(close);

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    dialog.dispatchEvent(new Event('close'));

    expect(closeDialog).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
  });
});
