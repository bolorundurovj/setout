import { TestBed } from '@angular/core/testing';

import { ToastService } from '../toast.service';
import { DrawerStack } from './drawer-stack.service';
import { ToastComponent } from './toast.component';

describe('ToastComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(ToastComponent);
    fixture.detectChanges();
    return { fixture, toast: TestBed.inject(ToastService), host: fixture.nativeElement };
  }

  it('is a popover so the browser draws it above an open drawer', () => {
    const { host } = render();

    expect(host.getAttribute('popover')).toBe('manual');
    expect(host.getAttribute('aria-live')).toBe('polite');
  });

  it('shows a success message as a status and an error as an alert', () => {
    const { fixture, toast, host } = render();

    toast.show('Saved.');
    fixture.detectChanges();
    expect(host.querySelector('.toast')?.getAttribute('role')).toBe('status');
    expect(host.textContent).toContain('Saved.');

    toast.show('Could not save.', 'error');
    fixture.detectChanges();
    expect(host.querySelector('.toast')?.getAttribute('role')).toBe('alert');

    toast.dismiss();
  });

  it('dismisses from its close button', () => {
    const { fixture, toast, host } = render();
    toast.show('Could not save.', 'error');
    fixture.detectChanges();

    host.querySelector('button')?.click();
    fixture.detectChanges();

    expect(toast.message()).toBe('');
    expect(host.querySelector('.toast')).toBeNull();
  });

  it('moves into the drawer opened last, where it is not inert, and back once it closes', () => {
    const page = document.createElement('div');
    const first = document.createElement('dialog');
    const second = document.createElement('dialog');
    document.body.append(page, first, second);
    const fixture = TestBed.createComponent(ToastComponent);
    page.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const drawers = TestBed.inject(DrawerStack);

    drawers.enter(first);
    drawers.enter(second);
    fixture.detectChanges();
    expect(fixture.nativeElement.parentElement).toBe(second);

    drawers.leave(second);
    fixture.detectChanges();
    expect(fixture.nativeElement.parentElement).toBe(first);

    drawers.leave(first);
    fixture.detectChanges();
    expect(fixture.nativeElement.parentElement).toBe(page);
    page.remove();
    first.remove();
    second.remove();
  });

  it('keeps the live region in the page while it is empty', () => {
    const { host } = render();

    expect(host.isConnected).toBe(true);
    expect(host.querySelector('.toast')).toBeNull();
  });
});
