import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.setAttribute('data-theme', 'light');
    TestBed.resetTestingModule();
  });

  it('reads the theme index.html already applied', () => {
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

  it('remembers the choice', () => {
    TestBed.inject(ThemeService).set('dark');
    expect(localStorage.getItem('setout-theme')).toBe('dark');
  });

  it('still applies the theme when storage throws', () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('private mode');
    };
    try {
      const service = TestBed.inject(ThemeService);
      service.set('dark');
      expect(service.theme()).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });
  it('follows the device until a choice is made', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.choice()).toBe('system');
    expect(service.followsDevice()).toBe(true);
  });

  it('remembers a choice as the choice, not as the outcome', () => {
    const service = TestBed.inject(ThemeService);
    service.choose('dark');
    expect(service.choice()).toBe('dark');
    expect(service.followsDevice()).toBe(false);
    expect(localStorage.getItem('setout-theme')).toBe('dark');
  });

  it('forgets the choice when handed back to the device', () => {
    const service = TestBed.inject(ThemeService);
    service.choose('dark');
    service.choose('system');
    expect(localStorage.getItem('setout-theme')).toBeNull();
    expect(service.followsDevice()).toBe(true);
    expect(['light', 'dark']).toContain(service.theme());
  });

  it('reads a stored choice back on the next visit', () => {
    localStorage.setItem('setout-theme', 'dark');
    TestBed.resetTestingModule();
    expect(TestBed.inject(ThemeService).choice()).toBe('dark');
  });
});
