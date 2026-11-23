import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DeleteConfirmDirective, isDeleteConfirmed } from './delete-confirm.directive';

@Component({
  imports: [DeleteConfirmDirective],
  template: `<input appDeleteConfirm class="delete-input" />`,
})
class HostComponent {}

describe('DeleteConfirmDirective', () => {
  it('accepts the word DELETE in any letter case, ignoring surrounding spaces', () => {
    expect(isDeleteConfirmed('DELETE')).toBe(true);
    expect(isDeleteConfirmed('delete')).toBe(true);
    expect(isDeleteConfirmed(' Delete ')).toBe(true);
  });

  it('refuses anything else', () => {
    expect(isDeleteConfirmed('')).toBe(false);
    expect(isDeleteConfirmed('delet')).toBe(false);
    expect(isDeleteConfirmed('DELETE IT')).toBe(false);
  });

  it('gives the box a label and turns off autocomplete', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');

    expect(input.getAttribute('aria-label')).toBe('Type DELETE to confirm');
    expect(input.placeholder).toBe('DELETE');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.type).toBe('text');
  });
});
