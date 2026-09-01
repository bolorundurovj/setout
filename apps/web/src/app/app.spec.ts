import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Counts } from '@setout/api-client';
import { App } from './app';
import { AuthService } from './auth/auth.service';
import { CountsService } from './counts.service';

describe('App', () => {
  it('creates the application wrapper', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('router-outlet')).toBeTruthy();
  });

  describe('navigation badges', () => {
    let loads: number;
    let element: HTMLElement;

    function render(counts: Counts | null) {
      loads = 0;
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [App],
        providers: [
          provideRouter([]),
          { provide: AuthService, useValue: { isAuthenticated: () => true } },
          {
            provide: CountsService,
            useValue: {
              projects: () => counts?.projects ?? 0,
              vendors: () => counts?.vendors ?? 0,
              items: () => counts?.items ?? 0,
              people: () => counts?.people ?? 0,
              lands: () => counts?.lands ?? 0,
              load: async () => {
                loads += 1;
              },
            },
          },
        ],
      });
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      element = fixture.nativeElement as HTMLElement;
      return fixture.componentInstance;
    }

    it('asks for the counts once the server is unlocked', () => {
      render({ projects: 1, vendors: 0, items: 0, people: 0, lands: 0 });
      expect(loads).toBe(1);
    });

    it('badges every list from the one count', () => {
      const app = render({ projects: 2, vendors: 6, items: 4, people: 3, lands: 5 });
      const badges = new Map(app.appNav.map((item) => [item.key, item.badge()]));
      expect(badges.get('projects')).toBe('2');
      expect(badges.get('vendors')).toBe('6');
      expect(badges.get('items')).toBe('4');
      expect(badges.get('people')).toBe('3');
      expect(badges.get('lands')).toBe('5');
    });

    it('leaves a badge blank rather than showing a nought', () => {
      const app = render(null);
      expect(app.appNav.map((item) => item.badge())).toEqual(['', '', '', '', '', '', '']);
    });

    it('draws an icon beside every name in the nav', () => {
      const app = render(null);

      expect(element.querySelectorAll('.nav-item app-icon svg').length).toBe(app.appNav.length);
      expect(new Set(app.appNav.map((item) => item.icon)).size).toBe(app.appNav.length);
    });

    it('does not head the nav with a label naming itself', () => {
      render(null);

      expect(element.querySelector('.nav-label')).toBeNull();
      expect(element.querySelector('.nav-items')).toBeTruthy();
    });

    it('marks home active only on home, not on every route beneath it', () => {
      const app = render(null);
      const home = app.appNav.find((item) => item.key === 'home');
      expect(home?.path).toBe('/');
      expect(home?.exact).toBe(true);
      expect(app.appNav.filter((item) => item.exact).length).toBe(1);
    });
  });
});
