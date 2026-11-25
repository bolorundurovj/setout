import { Injectable, inject, signal } from '@angular/core';
import {
  Api,
  PersonCreate,
  PersonRead,
  PersonExpenseSummary,
  PersonUpdate,
  archivePerson,
  createPerson,
  deletePerson,
  getPerson,
  getPersonExpenseSummary,
  listPeople,
  restorePerson,
  updatePerson,
} from '@setout/api-client';
import { CountsService } from '../counts.service';
import { ChoiceStore } from '../ui/choice-store';
import { LoadTracker } from '../ui/request-status';
import { PAGE_SIZE, offsetOf } from '../ui/paging';
import { detailOf } from '../api-error';

@Injectable({
  providedIn: 'root',
})
export class PersonService {
  private readonly api = inject(Api);
  private readonly counts = inject(CountsService);

  private readonly peopleState = signal<PersonRead[]>([]);
  private readonly totalState = signal(0);
  private readonly pageState = signal(1);
  private readonly searchState = signal('');
  private readonly archivedState = signal(false);
  private readonly choiceStore = new ChoiceStore<PersonRead>((params) =>
    this.api.invoke(listPeople, params),
  );

  private readonly tracker = new LoadTracker();

  readonly people = this.peopleState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly status = this.tracker.status;
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly page = this.pageState.asReadonly();
  readonly choices = this.choiceStore.items;
  readonly choicesTotal = this.choiceStore.total;
  readonly choicesHasMore = this.choiceStore.hasMore;
  readonly choicesLoading = this.choiceStore.loading;

  async load(search?: string, includeArchived = false): Promise<void> {
    this.searchState.set(search ?? '');
    this.archivedState.set(includeArchived);
    await this.goTo(1);
  }

  async loadChoices(search = ''): Promise<void> {
    await this.choiceStore.load(search);
  }

  async loadMoreChoices(): Promise<void> {
    await this.choiceStore.loadMore();
  }

  async goTo(page: number, quiet = false): Promise<void> {
    const requestId = this.tracker.start(quiet);
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.api.invoke(listPeople, {
        search: this.searchState() || undefined,
        include_archived: this.archivedState(),
        limit: PAGE_SIZE,
        offset: offsetOf(page),
      });
      if (!this.tracker.settle(requestId, 'ready')) {
        return;
      }
      this.peopleState.set(rows.items);
      this.totalState.set(rows.total);
      this.pageState.set(page);
    } catch {
      if (!this.tracker.settle(requestId, 'error')) {
        return;
      }
      this.error.set('Could not load the people.');
    } finally {
      if (this.tracker.isCurrent(requestId)) {
        this.loading.set(false);
      }
    }
  }

  private async refresh(): Promise<void> {
    const currentPage = this.pageState();
    await this.goTo(currentPage, true);
    if (this.peopleState().length === 0 && currentPage > 1) {
      await this.goTo(currentPage - 1, true);
    }
  }

  async add(body: PersonCreate): Promise<PersonRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(createPerson, { body });
      await this.goTo(this.pageState());
      this.choiceStore.prepend(created);
      void this.counts.load();
      return created;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not create the person.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async edit(personId: string, body: PersonUpdate): Promise<PersonRead | null> {
    if (this.saving()) return null;
    this.saving.set(true);
    this.error.set(null);
    try {
      const updated = await this.api.invoke(updatePerson, { person_id: personId, body });
      this.peopleState.update((rows) => rows.map((row) => (row.id === personId ? updated : row)));
      return updated;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save the person.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async archive(personId: string): Promise<void> {
    await this.api.invoke(archivePerson, { person_id: personId });
    await this.refresh();
    void this.counts.load();
  }

  async restore(personId: string): Promise<void> {
    await this.api.invoke(restorePerson, { person_id: personId });
    await this.refresh();
    void this.counts.load();
  }

  async delete(personId: string): Promise<void> {
    await this.api.invoke(deletePerson, { person_id: personId });
    await this.refresh();
    void this.counts.load();
  }

  async get(personId: string): Promise<PersonRead | null> {
    try {
      return await this.api.invoke(getPerson, { person_id: personId });
    } catch {
      this.error.set('Could not load the person.');
      return null;
    }
  }

  async expenseSummary(personId: string): Promise<PersonExpenseSummary | null> {
    try {
      return await this.api.invoke(getPersonExpenseSummary, { person_id: personId });
    } catch {
      return null;
    }
  }
}
