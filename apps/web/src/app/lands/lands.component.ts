import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { LandRead } from '@setout/api-client';
import { ButtonComponent } from '../ui/button.component';
import { debounce } from '../ui/debounce';
import { PaginationComponent } from '../ui/pagination.component';
import { ToggleComponent } from '../ui/toggle.component';
import { TopbarComponent } from '../ui/topbar.component';
import { LandService } from './land.service';
import { kindName, sizeLabel, whereLabel, worthLabel } from './land-labels';

@Component({
  selector: 'app-lands',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, PaginationComponent, ToggleComponent, TopbarComponent],
  templateUrl: './lands.component.html',
  styleUrl: './lands.component.scss',
})
export class LandsComponent {
  readonly lands = inject(LandService);
  private readonly router = inject(Router);

  readonly notSet = '—';

  readonly search = signal('');
  readonly includeArchived = signal(false);
  private readonly typing = debounce<string>(
    (text) => void this.lands.load(text, this.includeArchived()),
  );

  constructor() {
    void this.lands.load();
    inject(DestroyRef).onDestroy(() => this.typing.cancel());
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  onSearch(event: Event): void {
    this.search.set(this.value(event));
    this.typing.call(this.search());
  }

  async setIncludeArchived(on: boolean): Promise<void> {
    this.typing.cancel();
    this.includeArchived.set(on);
    await this.lands.load(this.search(), on);
  }

  async goTo(page: number): Promise<void> {
    await this.lands.goTo(page);
  }

  open(landId: string): void {
    void this.router.navigate(['/lands', landId]);
  }

  newLand(): void {
    void this.router.navigate(['/lands/new']);
  }

  countLabel(): string {
    const total = this.lands.total();
    return `${total} ${total === 1 ? 'land record' : 'land records'}`;
  }

  archivedLabel(): string {
    return this.includeArchived() ? 'Hide Archived' : 'Show Archived';
  }

  where(land: LandRead): string {
    return whereLabel(land) || this.notSet;
  }

  worth(land: LandRead): string {
    return worthLabel(land) || this.notSet;
  }

  size(land: LandRead): string {
    return sizeLabel(land) || this.notSet;
  }

  papersLabel(land: LandRead): string {
    if (land.missing_kinds.length === 0) {
      return 'All present';
    }
    return `Missing: ${land.missing_kinds.map(kindName).join(', ')}`;
  }

  documentsLabel(land: LandRead): string {
    const count = land.document_count;
    return `${count} ${count === 1 ? 'document' : 'documents'}`;
  }

  projectsLabel(land: LandRead): string {
    const count = land.projects.length;
    if (count === 0) {
      return 'No projects';
    }
    return `${count} ${count === 1 ? 'project' : 'projects'}`;
  }
}
