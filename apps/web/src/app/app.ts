import { Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
      name: 'All Projects',
      path: '/projects',
      badge: () => this.count(this.counts.projects()),
    },
    {
      key: 'lands',
      icon: 'land',
      name: 'Land',
      path: '/lands',
      badge: () => this.count(this.counts.lands()),
    },
    {
      key: 'vendors',
      icon: 'vendors',
      name: 'Vendors',
      path: '/vendors',
      badge: () => this.count(this.counts.vendors()),
    },
    {
      key: 'items',
      icon: 'items',
      name: 'Items',
      path: '/items',
      badge: () => this.count(this.counts.items()),
    },
    {
      key: 'people',
      icon: 'people',
      name: 'People',
      path: '/people',
      badge: () => this.count(this.counts.people()),
    },
    { key: 'settings', name: 'Settings', icon: 'settings', path: '/settings', badge: () => '' },
  ];

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.counts.load();
      }
    });
  }

  private count(total: number): string {
    return total > 0 ? String(total) : '';
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  onSearch(): void {
    const wanted = this.query().trim();
    void this.router.navigate(wanted ? ['/search'] : ['/'], {
      queryParams: wanted ? { q: wanted } : {},
    });
  }

  toggleNav(): void {
    this.navOpen.update((open) => !open);
  }

  closeNav(): void {
    this.navOpen.set(false);
  }

  logout(): void {
    void this.auth.logout();
  }
}
