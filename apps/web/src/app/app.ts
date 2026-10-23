import { Component, HostListener, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { CountsService } from './counts.service';
import { ToastService } from './toast.service';
import { IconComponent, type IconName } from './ui/icon.component';
import { LogoComponent } from './ui/logo.component';

interface NavItem {
  key: string;
  name: string;
  icon: IconName;
  path?: string;
  badge: () => string;
  exact?: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IconComponent, RouterLink, RouterLinkActive, RouterOutlet, LogoComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  toast = inject(ToastService);
  auth = inject(AuthService);
  private readonly counts = inject(CountsService);

  readonly navOpen = signal(false);
  readonly query = signal('');
  private readonly router = inject(Router);
  readonly host = location.host;

  readonly appNav: NavItem[] = [
    { key: 'home', name: 'Home', icon: 'home', path: '/', badge: () => '', exact: true },
    {
      key: 'projects',
      icon: 'projects',
      name: 'Projects',
      path: '/projects',
      badge: () => this.badgeLabel(this.counts.projects()),
    },
    {
      key: 'lands',
      icon: 'land',
      name: 'Land',
      path: '/lands',
      badge: () => this.badgeLabel(this.counts.lands()),
    },
    {
      key: 'vendors',
      icon: 'vendors',
      name: 'Vendors',
      path: '/vendors',
      badge: () => this.badgeLabel(this.counts.vendors()),
    },
    {
      key: 'items',
      icon: 'items',
      name: 'Items',
      path: '/items',
      badge: () => this.badgeLabel(this.counts.items()),
    },
    {
      key: 'people',
      icon: 'people',
      name: 'People',
      path: '/people',
      badge: () => this.badgeLabel(this.counts.people()),
    },
    { key: 'settings', name: 'Settings', icon: 'settings', path: '/settings', badge: () => '' },
  ];

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.counts.load();
      }
    });

    // Locks body scroll while the navigation drawer overlays the page.
    effect(() => {
      document.body.classList.toggle('nav-locked', this.navOpen());
    });

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeNav());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeNav();
  }

  private badgeLabel(total: number): string {
    return total > 0 ? String(total) : '';
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  onSearch(): void {
    const term = this.query().trim();
    void this.router.navigate(term ? ['/search'] : ['/'], {
      queryParams: term ? { q: term } : {},
    });
  }

  toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  closeNav(): void {
    this.navOpen.set(false);
  }

  signOut(): void {
    void this.auth.logout();
  }
}
