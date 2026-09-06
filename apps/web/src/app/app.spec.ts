import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
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

  describe('the menu on a narrow screen', () => {
    function render() {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [App],
        providers: [
          provideRouter([{ path: 'vendors', children: [] }]),
          { provide: AuthService, useValue: { isAuthenticated: () => true } },
          {
            provide: CountsService,
            useValue: {
              projects: () => 0,
              vendors: () => 0,
              items: () => 0,
              people: () => 0,
              lands: () => 0,
              load: () => Promise.resolve(),
            },
          },
        ],
      });
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      return fixture;
    }

    afterEach(() => {
      document.body.classList.remove('nav-locked');
    });

    it('names the toggle for a reader rather than spelling it on screen', () => {
      const element = render().nativeElement as HTMLElement;
      const toggle = element.querySelector('.sidebar-toggle');

      expect(toggle?.getAttribute('aria-label')).toBe('Menu');
      expect(toggle?.querySelector('app-icon svg')).toBeTruthy();
      expect(toggle?.textContent?.trim()).toBe('');
    });

    it('seats the toggle in a bar with the brand rather than floating it alone', () => {
      const element = render().nativeElement as HTMLElement;
      const bar = element.querySelector('.mobile-bar');

      expect(bar?.querySelector('.sidebar-toggle')).toBeTruthy();
      expect(bar?.querySelector('.mobile-brand')).toBeTruthy();
      expect(element.querySelector('.shell > .sidebar-toggle')).toBeNull();

      const inBar = [...(bar?.children ?? [])].map((child) => child.className);
      expect(inBar).toEqual(['mobile-brand', 'sidebar-toggle']);
    });

    it('lays nothing over the page until the menu is opened', () => {
      const fixture = render();
      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelector('.nav-backdrop')).toBeNull();
      expect(document.body.classList.contains('nav-locked')).toBe(false);

      fixture.componentInstance.toggleNav();
      fixture.detectChanges();

      expect(element.querySelector('.nav-backdrop')).toBeTruthy();
      expect(document.body.classList.contains('nav-locked')).toBe(true);
    });

    it('closes when the page behind it is pressed', () => {
      const fixture = render();
      const element = fixture.nativeElement as HTMLElement;
      fixture.componentInstance.toggleNav();
      fixture.detectChanges();

      element.querySelector<HTMLButtonElement>('.nav-backdrop')?.click();
      fixture.detectChanges();

      expect(fixture.componentInstance.navOpen()).toBe(false);
      expect(document.body.classList.contains('nav-locked')).toBe(false);
    });

    it('closes on Escape', () => {
      const fixture = render();
      fixture.componentInstance.toggleNav();
      fixture.detectChanges();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();

      expect(fixture.componentInstance.navOpen()).toBe(false);
    });

    it('closes itself once a destination is reached', async () => {
      const fixture = render();
      fixture.componentInstance.toggleNav();
      fixture.detectChanges();

      await TestBed.inject(Router).navigate(['/vendors']);
      fixture.detectChanges();

      expect(fixture.componentInstance.navOpen()).toBe(false);
      expect(document.body.classList.contains('nav-locked')).toBe(false);
    });
  });
});
