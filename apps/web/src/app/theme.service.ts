import { Injectable, computed, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
export type ThemeChoice = Theme | 'system';

const STORAGE_KEY = 'setout-theme';

function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

// index.html treats any stored value other than light or dark as the system theme.
function storedChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

function darkQuery(): MediaQueryList | null {
  try {
    return window.matchMedia(DARK_QUERY);
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return darkQuery()?.matches ? 'dark' : 'light';
}

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly state = signal<Theme>(currentTheme());
  private readonly choiceState = signal<ThemeChoice>(storedChoice());

  readonly theme = this.state.asReadonly();
  readonly choice = this.choiceState.asReadonly();
  readonly followsSystem = computed(() => this.choiceState() === 'system');

  constructor() {
    darkQuery()?.addEventListener('change', () => {
      if (this.followsSystem()) {
        this.apply(systemTheme());
      }
    });
  }

  choose(choice: ThemeChoice): void {
    this.choiceState.set(choice);
    this.apply(choice === 'system' ? systemTheme() : choice);
    try {
      if (choice === 'system') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, choice);
      }
    } catch {
      // localStorage is unavailable in private mode; the theme applies to this session only.
    }
  }

  toggle(): void {
    this.choose(this.state() === 'dark' ? 'light' : 'dark');
  }

  private apply(theme: Theme): void {
    this.state.set(theme);
    document.documentElement.setAttribute('data-theme', theme);
  }
}
