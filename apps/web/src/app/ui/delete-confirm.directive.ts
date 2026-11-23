import { Directive } from '@angular/core';

/** True when the confirmation box holds the word DELETE in any letter case, as it is shown in capitals. */
export function isDeleteConfirmed(text: string): boolean {
  return text.trim().toUpperCase() === 'DELETE';
}

/** The box a person types DELETE into before something is removed for good. */
@Directive({
  selector: 'input[appDeleteConfirm]',
  host: {
    type: 'text',
    placeholder: 'DELETE',
    'aria-label': 'Type DELETE to confirm',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
  },
})
export class DeleteConfirmDirective {}
