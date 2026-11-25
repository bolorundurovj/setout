import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  afterRenderEffect,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { CountsService } from './counts.service';
import { ToastService } from './toast.service';
import { debounce } from './ui/debounce';
import { IconComponent, type IconName } from './ui/icon.component';
import { LogoComponent } from './ui/logo.component';
import { ToastComponent } from './ui/toast.component';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]';

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
  imports: [
    IconComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    LogoComponent,
    ToastComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  toast = inject(ToastService);
  auth = inject(AuthService);
  private readonly counts = inject(CountsService);

  readonly navOpen = signal(false);
  private readonly sidebar = viewChild<ElementRef<HTMLElement>>('sidebar');
  private returnFocus: HTMLElement | null = null;
  private focusedOpen = false;
  readonly query = signal('');
  private readonly router = inject(Router);
  readonly host = location.host;
  private readonly debouncedSearch = debounce<string>((term) => {
    const cleaned = term.trim();
    if (!cleaned && !this.router.url.startsWith('/search')) {
      return;
    }
    void this.router.navigate(cleaned ? ['/search'] : ['/'], {
      queryParams: cleaned ? { q: cleaned } : {},
    });
  });

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

    afterRenderEffect(() => {
      const open = this.navOpen();
      if (open === this.focusedOpen) {
        return;
      }
      this.focusedOpen = open;
      if (open) {
        this.returnFocus = document.activeElement as HTMLElement | null;
        this.sidebarFocusables()[0]?.focus();
        return;
      }
      const target = this.returnFocus;
      this.returnFocus = null;
      if (target?.isConnected) {
        target.focus();
      }
    });

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeNav());

    inject(DestroyRef).onDestroy(() => this.debouncedSearch.cancel());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeNav();
  }

  private badgeLabel(total: number): string {
    return total > 0 ? String(total) : '';
  }

  onQuery(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.debouncedSearch.call(value);
  }

  onSearch(): void {
    this.debouncedSearch.cancel();
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

  @HostListener('keydown', ['$event'])
  onSidebarKey(event: KeyboardEvent): void {
    if (!this.navOpen() || event.key !== 'Tab') {
      return;
    }
    const focusables = this.sidebarFocusables();
    const first = focusables[0];
    const last = focusables.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  private sidebarFocusables(): HTMLElement[] {
    const sidebar = this.sidebar()?.nativeElement;
    return sidebar ? Array.from(sidebar.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
  }

  async signOut(): Promise<void> {
    if (await this.auth.logout()) {
      await this.router.navigate(['/login']);
    }
  }
}
