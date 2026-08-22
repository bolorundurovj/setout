import { Injectable, computed, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
export type ThemeChoice = Theme | 'system';

const STORAGE_KEY = 'setout-theme';

function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

// index.html reads anything that is not light or dark as follow the device, so
// storing the choice rather than the outcome needs nothing of it.
function storedChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function deviceTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly state = signal<Theme>(currentTheme());
  private readonly choiceState = signal<ThemeChoice>(storedChoice());

  readonly theme = this.state.asReadonly();
  readonly choice = this.choiceState.asReadonly();
  readonly followsDevice = computed(() => this.choiceState() === 'system');

  set(theme: Theme): void {
    this.choose(theme);
  }

  choose(choice: ThemeChoice): void {
    const resolved = choice === 'system' ? deviceTheme() : choice;
    this.choiceState.set(choice);
    this.state.set(resolved);
    document.documentElement.setAttribute('data-theme', resolved);
    try {
      if (choice === 'system') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, choice);
      }
    } catch {
      // Private mode. The theme applies for this session but is not remembered.
    }
  }

  toggle(): void {
    this.choose(this.state() === 'dark' ? 'light' : 'dark');
  }
}
