import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute('data-theme', 'light');
    TestBed.resetTestingModule();
  });

  it('reads the theme index.html applied before load', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
  });

  it('toggles between light and dark', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('light');

    service.toggle();
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    service.toggle();
    expect(service.theme()).toBe('light');
  });

  it('stores the chosen theme', () => {
    TestBed.inject(ThemeService).choose('dark');
    expect(localStorage.getItem('setout-theme')).toBe('dark');
  });

  it('applies the theme when storage throws', () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('private mode');
    };
    try {
      const service = TestBed.inject(ThemeService);
      service.choose('dark');
      expect(service.theme()).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
  it('uses the system theme until a choice is stored', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.choice()).toBe('system');
    expect(service.followsSystem()).toBe(true);
  });

  it('stores the choice, not the resolved theme', () => {
    const service = TestBed.inject(ThemeService);
    service.choose('dark');
    expect(service.choice()).toBe('dark');
    expect(service.followsSystem()).toBe(false);
    expect(localStorage.getItem('setout-theme')).toBe('dark');
  });

  it('clears the stored choice when set to system', () => {
    const service = TestBed.inject(ThemeService);
    service.choose('dark');
    service.choose('system');
    expect(localStorage.getItem('setout-theme')).toBeNull();
    expect(service.followsSystem()).toBe(true);
    expect(['light', 'dark']).toContain(service.theme());
  });

  it('reads the stored choice on load', () => {
    localStorage.setItem('setout-theme', 'dark');
    TestBed.resetTestingModule();
    expect(TestBed.inject(ThemeService).choice()).toBe('dark');
  });
});
