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
import { CHOICE_LIMIT, PAGE_SIZE, offsetOf } from '../ui/paging';
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
  private readonly choiceState = signal<PersonRead[]>([]);
  private readonly searchState = signal('');
  private readonly archivedState = signal(false);

  readonly people = this.peopleState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly page = this.pageState.asReadonly();
  // Up to CHOICE_LIMIT rows for the pickers, independent of the paged list.
  readonly choices = this.choiceState.asReadonly();

  private requestSeq = 0;

  async load(search?: string, includeArchived = false): Promise<void> {
    this.searchState.set(search ?? '');
    this.archivedState.set(includeArchived);
    await this.goTo(1);
  }

  async loadChoices(): Promise<void> {
    try {
      const rows = await this.api.invoke(listPeople, { limit: CHOICE_LIMIT });
      this.choiceState.set(rows.items);
    } catch {
      this.choiceState.set([]);
    }
  }

  async goTo(page: number): Promise<void> {
    const requestId = ++this.requestSeq;
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.api.invoke(listPeople, {
        search: this.searchState() || undefined,
        include_archived: this.archivedState(),
        limit: PAGE_SIZE,
        offset: offsetOf(page),
      });
      if (requestId !== this.requestSeq) {
        return;
      }
      this.peopleState.set(rows.items);
      this.totalState.set(rows.total);
      this.pageState.set(page);
    } catch {
      if (requestId !== this.requestSeq) {
        return;
      }
      this.error.set('Could not load the people.');
    } finally {
      if (requestId === this.requestSeq) {
        this.loading.set(false);
      }
    }
  }

  private async refresh(): Promise<void> {
    const currentPage = this.pageState();
    await this.goTo(currentPage);
    if (this.peopleState().length === 0 && currentPage > 1) {
      await this.goTo(currentPage - 1);
    }
  }

  async add(body: PersonCreate): Promise<PersonRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(createPerson, { body });
      await this.goTo(this.pageState());
      this.choiceState.update((rows) => [created, ...rows]);
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
    this.error.set(null);
    try {
      const updated = await this.api.invoke(updatePerson, { person_id: personId, body });
      this.peopleState.update((rows) => rows.map((row) => (row.id === personId ? updated : row)));
      return updated;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save the person.');
      return null;
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
